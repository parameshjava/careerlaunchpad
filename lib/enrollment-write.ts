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
      status: "active",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "This student is already enrolled in this batch.", status: 409 };
    return { ok: false, error: error.message, status: 500 };
  }

  // Even installment schedule (monthly from today), only when asked and owed.
  const count = input.installmentCount ?? 0;
  if (input.paymentOption === "installments" && count >= 2 && net > 0) {
    const base = Math.floor(net / count);
    const today = new Date();
    const rows = Array.from({ length: count }, (_, i) => {
      const d = new Date(today);
      d.setMonth(d.getMonth() + i);
      return {
        enrollment_id: enr.id,
        seq: i + 1,
        due_on: d.toISOString().slice(0, 10),
        amount_paise: i === count - 1 ? net - base * (count - 1) : base,
        status: "pending",
      };
    });
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
        status: "active",
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
      const today = new Date();
      const rows = Array.from({ length: count }, (_, i) => {
        const d = new Date(today);
        d.setMonth(d.getMonth() + i);
        return {
          enrollment_id: enr.id,
          seq: i + 1,
          due_on: d.toISOString().slice(0, 10),
          amount_paise: i === count - 1 ? net - base * (count - 1) : base,
          status: "pending",
        };
      });
      await supabase.from("installment").insert(rows);
    }
    enrolled += 1;
  }

  return { ok: true, value: { enrolled, skipped } };
}

/** Record a payment against an enrolment; mints a receipt number, advances status. */
export async function recordPayment(
  supabase: SupabaseClient,
  enrollmentId: string,
  input: RecordPaymentInput,
  userId: string
): Promise<Result<{ paymentId: string; receiptNo: string }>> {
  const amount = Math.round(input.amountPaise || 0);
  if (!Number.isInteger(amount) || amount <= 0)
    return { ok: false, error: "Enter a valid payment amount.", status: 422 };

  const { data: enr, error: ee } = await supabase
    .from("student_enrollment")
    .select("id, student_id, batch_id, college_id, net_fee_paise")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (ee) return { ok: false, error: ee.message, status: 500 };
  if (!enr) return { ok: false, error: "Enrolment not found", status: 404 };
  const e = enr as { id: string; student_id: string; batch_id: string; college_id: string | null; net_fee_paise: number };

  const { data: bal, error: be } = await supabase
    .from("enrollment_balance")
    .select("paid_to_date_paise, balance_paise")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (be) return { ok: false, error: be.message, status: 500 };
  const paidToDate = (bal as { paid_to_date_paise?: number } | null)?.paid_to_date_paise ?? 0;
  const balance = (bal as { balance_paise?: number } | null)?.balance_paise ?? e.net_fee_paise;
  if (amount > balance)
    return { ok: false, error: `Amount exceeds the outstanding balance.`, status: 422 };

  const { data: batch, error: bErr } = await supabase
    .from("batch")
    .select("academic_year")
    .eq("id", e.batch_id)
    .maybeSingle();
  if (bErr) return { ok: false, error: bErr.message, status: 500 };
  const academicYear = (batch as { academic_year?: string | null } | null)?.academic_year ?? null;

  const { data: receiptNo, error: rErr } = await supabase.rpc("next_fee_receipt_no", {
    p_academic_year: academicYear,
  });
  if (rErr) return { ok: false, error: `receipt no: ${rErr.message}`, status: 500 };

  const { data: pay, error: pErr } = await supabase
    .from("payment")
    .insert({
      enrollment_id: enrollmentId,
      student_id: e.student_id,
      college_id: e.college_id,
      receipt_no: receiptNo as string,
      amount_paise: amount,
      mode: input.mode,
      reference_no: input.referenceNo ?? null,
      paid_on: input.paidOn || new Date().toISOString().slice(0, 10),
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (pErr) return { ok: false, error: pErr.message, status: 500 };

  // Advance status: fully paid → completed, else active.
  const nextStatus = paidToDate + amount >= e.net_fee_paise ? "completed" : "active";
  await supabase
    .from("student_enrollment")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", enrollmentId);

  return { ok: true, value: { paymentId: pay.id, receiptNo: receiptNo as string } };
}
