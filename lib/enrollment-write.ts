// Server-only write helpers for enrolment + payments (issue #49, Phase 4).
// Enrol snapshots the batch fee onto the enrolment (so later fee edits never
// change what a student owes) and optionally lays out an even installment
// schedule. Recording a payment mints a receipt number and advances the
// enrolment status. Gated by RLS (finance.manage) at the DB.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConcessionType, PaymentMode } from "@/lib/fee-receipt";
import { fetchBatchFee } from "@/lib/enrollment-query";

export type EnrolInput = {
  studentId: string;
  collegeId?: string | null;
  concessionType: ConcessionType;
  concessionPaise: number;
  concessionReason?: string | null;
  paymentOption: "full" | "installments";
  /** For installments: number of equal installments to schedule (>= 2). */
  installmentCount?: number;
};

export type RecordPaymentInput = {
  amountPaise: number;
  mode: PaymentMode;
  referenceNo?: string | null;
  paidOn?: string | null;
  notes?: string | null;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

// The platform operates in India; receipts, installment due dates, and paid-on
// dates use the IST (UTC+5:30) calendar day, not the server's UTC day (which is
// a day behind between midnight and 05:30 IST). `istDate()` returns today's IST
// date as YYYY-MM-DD; `istMonthsFromToday(n)` shifts by whole months.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istToday(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
function istDate(): string {
  return istToday().toISOString().slice(0, 10);
}
function istMonthsFromToday(base: Date, months: number): string {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Enrol a student into a batch (+ optional installment schedule). */
export async function enrolStudent(
  supabase: SupabaseClient,
  batchId: string,
  input: EnrolInput,
  userId: string
): Promise<Result<{ enrollmentId: string }>> {
  const batch = await fetchBatchFee(supabase, batchId);
  if (!batch) return { ok: false, error: "Batch not found", status: 404 };

  const gross = batch.grossPaise;
  const type = input.concessionType;
  // Normalise the concession against the type so net is always consistent.
  let concession = Math.max(0, Math.round(input.concessionPaise || 0));
  if (type === "none") concession = 0;
  else if (type === "full_waiver") concession = gross;
  if (concession > gross) return { ok: false, error: "Concession can't exceed the fee.", status: 422 };
  const net = gross - concession;

  const { data: enr, error } = await supabase
    .from("student_enrollment")
    .insert({
      student_id: input.studentId,
      batch_id: batchId,
      college_id: input.collegeId ?? null,
      gross_fee_paise: gross,
      concession_type: type,
      concession_paise: concession,
      concession_reason: input.concessionReason ?? null,
      payment_option: input.paymentOption,
      // A fully-waived (net 0) enrolment is settled on enrolment — no payment
      // will ever be recorded to advance it, so mark it completed now.
      status: net === 0 ? "completed" : "active",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "This student is already enrolled in this batch.", status: 409 };
    return { ok: false, error: error.message, status: 500 };
  }

  // Even installment schedule (monthly from today, IST), only when asked and owed.
  const count = input.installmentCount ?? 0;
  if (input.paymentOption === "installments" && count >= 2 && net > 0) {
    const base = Math.floor(net / count);
    const today = istToday();
    const rows = Array.from({ length: count }, (_, i) => ({
      enrollment_id: enr.id,
      seq: i + 1,
      due_on: istMonthsFromToday(today, i),
      amount_paise: i === count - 1 ? net - base * (count - 1) : base,
      status: "pending",
    }));
    const { error: ie } = await supabase.from("installment").insert(rows);
    if (ie) {
      await supabase.from("student_enrollment").delete().eq("id", enr.id);
      return { ok: false, error: `installments: ${ie.message}`, status: 500 };
    }
  }

  return { ok: true, value: { enrollmentId: enr.id } };
}

export type BulkEnrolItem = {
  studentId: string;
  collegeId?: string | null;
  concessionType: ConcessionType;
  concessionPaise: number;
  concessionReason?: string | null;
  paymentOption: "full" | "installments";
  installmentCount?: number;
};

/** Enrol many students into a batch at once (each with its own concession).
 * Fetches the batch fee once; skips (rather than fails) students already
 * enrolled, reporting them back. */
export async function enrolStudentsBulk(
  supabase: SupabaseClient,
  batchId: string,
  items: BulkEnrolItem[],
  userId: string
): Promise<Result<{ enrolled: number; skipped: { studentId: string; reason: string }[] }>> {
  const batch = await fetchBatchFee(supabase, batchId);
  if (!batch) return { ok: false, error: "Batch not found", status: 404 };
  const gross = batch.grossPaise;

  let enrolled = 0;
  const skipped: { studentId: string; reason: string }[] = [];

  for (const item of items) {
    let concession = Math.max(0, Math.round(item.concessionPaise || 0));
    if (item.concessionType === "none") concession = 0;
    else if (item.concessionType === "full_waiver") concession = gross;
    if (concession > gross) concession = gross;
    const net = gross - concession;

    const { data: enr, error } = await supabase
      .from("student_enrollment")
      .insert({
        student_id: item.studentId,
        batch_id: batchId,
        college_id: item.collegeId ?? null,
        gross_fee_paise: gross,
        concession_type: item.concessionType,
        concession_paise: concession,
        concession_reason: item.concessionReason ?? null,
        payment_option: item.paymentOption,
        // Fully-waived (net 0) enrolments are settled at enrolment (see enrolStudent).
        status: net === 0 ? "completed" : "active",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      skipped.push({
        studentId: item.studentId,
        reason: error.code === "23505" ? "already enrolled" : error.message,
      });
      continue;
    }

    const count = item.installmentCount ?? 0;
    if (item.paymentOption === "installments" && count >= 2 && net > 0) {
      const base = Math.floor(net / count);
      const today = istToday();
      const rows = Array.from({ length: count }, (_, i) => ({
        enrollment_id: enr.id,
        seq: i + 1,
        due_on: istMonthsFromToday(today, i),
        amount_paise: i === count - 1 ? net - base * (count - 1) : base,
        status: "pending",
      }));
      const { error: ie } = await supabase.from("installment").insert(rows);
      if (ie) {
        // Don't leave an enrolment with a missing schedule — undo it and report.
        await supabase.from("student_enrollment").delete().eq("id", enr.id);
        skipped.push({ studentId: item.studentId, reason: `installments: ${ie.message}` });
        continue;
      }
    }
    enrolled += 1;
  }

  return { ok: true, value: { enrolled, skipped } };
}

// Postgres SQLSTATE → HTTP status for record_payment's raised exceptions.
const PG_ERR_STATUS: Record<string, number> = {
  "42501": 403, // insufficient_privilege (finance.manage check)
  "22023": 422, // invalid_parameter_value (bad amount/mode/status/over-balance)
  P0002: 404, // no_data_found (enrolment not found)
};

/** Record a payment against an enrolment. Delegates to the record_payment RPC
 * (migration 131), which mints the receipt number, advances status, and — under
 * a row lock — checks the balance atomically so concurrent payments can't race
 * past it. `userId` is unused here (the RPC stamps created_by from auth.uid()). */
export async function recordPayment(
  supabase: SupabaseClient,
  enrollmentId: string,
  input: RecordPaymentInput,
  _userId: string
): Promise<Result<{ paymentId: string; receiptNo: string }>> {
  const amount = Math.round(input.amountPaise || 0);
  if (!Number.isInteger(amount) || amount <= 0)
    return { ok: false, error: "Enter a valid payment amount.", status: 422 };

  const { data, error } = await supabase.rpc("record_payment", {
    p_enrollment_id: enrollmentId,
    p_amount_paise: amount,
    p_mode: input.mode,
    p_reference_no: input.referenceNo ?? null,
    // Default to the IST calendar day (never the DB's UTC current_date).
    p_paid_on: input.paidOn || istDate(),
    p_notes: input.notes ?? null,
  });
  if (error) {
    return { ok: false, error: error.message, status: PG_ERR_STATUS[error.code ?? ""] ?? 500 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { payment_id: string; receipt_no: string }
    | undefined;
  if (!row) return { ok: false, error: "Payment could not be recorded.", status: 500 };
  return { ok: true, value: { paymentId: row.payment_id, receiptNo: row.receipt_no } };
}
