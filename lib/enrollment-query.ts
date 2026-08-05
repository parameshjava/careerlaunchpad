// Typed data-access for enrolments + payments (issue #49, Phase 4; schema in
// 125_fees.sql). A student is enrolled into a batch (student_enrollment), pays in
// full or by installments (payment), and the enrollment_balance view gives the
// remaining balance. Reads are RLS-bound. Queries avoid PostgREST embeds across
// tables without a direct FK — they fetch and join in JS.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  academicYearEnd,
  courseLabel,
  currentYearOfStudy,
  degreesByDuration,
  durationOf,
  parseYearInput,
} from "@/lib/degree-branch";
import { getDegreeBranchData, getDegreeBranchLabels } from "@/lib/ref-cache";
import type {
  ConcessionType,
  FeeReceipt,
  PaymentMode,
  ReceiptLineItem,
} from "@/lib/fee-receipt";

export type EnrollableStudent = {
  userId: string;
  name: string;
  email: string | null;
  collegeId: string | null;
  collegeName: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  apaarId: string | null;
  course: string | null;
  yearOfStudy: string | null;
};

export type RosterRow = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  concessionType: ConcessionType;
  paymentOption: "full" | "installments";
  status: string;
  rejectionReason: string | null;
  netFeePaise: number;
  paidPaise: number;
  balancePaise: number;
};

export type BatchFee = {
  batchId: string;
  name: string;
  code: string;
  academicYear: string | null;
  courseName: string | null;
  lineItems: ReceiptLineItem[];
  grossPaise: number;
};

function money(rows: { amount_paise: number }[]): number {
  return rows.reduce((s, r) => s + r.amount_paise, 0);
}

// Today's date on the IST (UTC+5:30) calendar as YYYY-MM-DD. The server runs in
// UTC, whose date lags IST between midnight and 05:30 — using it would flag an
// installment due today as "overdue" hours early. Matches lib/enrollment-write.ts.
function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** "B.Tech · Computer Science & Engineering (CSE)" from the stored slugs. Labels
 * come from the cached, is_active-agnostic ref maps (#99) — printing `btech · cse`
 * on a fee receipt was never acceptable, and the #99 catalogue makes it worse. */
async function courseOf(degree: string | null, branch: string | null): Promise<string | null> {
  const labels = await getDegreeBranchLabels();
  return courseLabel(degree, branch, labels.degree, labels.branch, " · ");
}

// ---- reads -----------------------------------------------------------------

/** Search registered students (they have accounts, so can be enrolled). Scales
 * to thousands: server-side filter by name/roll/registration, college, and year,
 * capped by `limit`. */
export async function searchEnrollableStudents(
  supabase: SupabaseClient,
  opts: { q?: string; collegeId?: string; year?: string; limit?: number } = {}
): Promise<EnrollableStudent[]> {
  let query = supabase
    .from("student_profile")
    .select(
      "user_id, full_name, roll_number, registration_number, apaar_id, degree, branch, year_of_study, " +
        "entry_academic_year, college_id, college:college_id(name), app_user:user_id(email)"
    )
    .order("full_name")
    .limit(opts.limit ?? 25);

  if (opts.collegeId) query = query.eq("college_id", opts.collegeId);
  // "Which year?" used to be `ilike(year_of_study, …)` against a STORED snapshot, so
  // enrolling "the 3rd years" into a batch pulled a stale cohort — including students
  // who had already graduated (#99 follow-up).
  //
  // The current year is DERIVED, and a derived value can't be matched in SQL. So the
  // request is inverted: a student in year N during the academic year ending `ayEnd`
  // has entry_academic_year = ayEnd − N — an equality on an indexed int, so this still
  // scales to thousands rather than filtering in JS after the fact.
  //
  // The input is FREE TEXT (the enrol screen's box says 'Year (e.g. 4th)'), so it is
  // parsed first: an earlier cut compared it to the internal `year_4` slug and
  // therefore matched nothing for every value a human would actually type.
  const yearFilter = opts.year ? parseYearInput(opts.year) : null;
  if (yearFilter) {
    const ayEnd = academicYearEnd();
    const lengths = degreesByDuration((await getDegreeBranchData()).degree);
    const clauses: string[] = [];
    if (yearFilter.n != null) {
      clauses.push(`entry_academic_year.eq.${ayEnd - yearFilter.n}`);
      // Un-anchored rows (degree 'other', or never answered through a writer that
      // anchors) can only be matched on the stored slug — the same fallback the read
      // path uses.
      clauses.push(`and(entry_academic_year.is.null,year_of_study.eq.year_${yearFilter.n})`);
    } else {
      // 'final year' / 'passed out' are not ONE anchor: they depend on the degree's
      // length, so build a clause per distinct length.
      for (const { duration, slugs } of lengths) {
        const list = slugs.join(",");
        clauses.push(
          yearFilter.slug === "final_year"
            ? `and(entry_academic_year.eq.${ayEnd - duration},degree.in.(${list}))`
            : `and(entry_academic_year.lt.${ayEnd - duration},degree.in.(${list}))`,
        );
      }
      clauses.push(`and(entry_academic_year.is.null,year_of_study.eq.${yearFilter.slug})`);
    }
    query = query.or(clauses.join(","));
  }
  const term = (opts.q ?? "").replace(/[(),*%]/g, "").trim();
  if (term) {
    query = query.or(
      `full_name.ilike.*${term}*,roll_number.ilike.*${term}*,registration_number.ilike.*${term}*`
    );
  }

  const [{ data, error }, labels, degreeBranch] = await Promise.all([
    query,
    getDegreeBranchLabels(),
    getDegreeBranchData(),
  ]);
  if (error) throw new Error(`student_profile: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      user_id: string; full_name: string | null; roll_number: string | null;
      registration_number: string | null; apaar_id: string | null;
      degree: string | null; branch: string | null; year_of_study: string | null;
      entry_academic_year: number | null;
      college_id: string | null; college: { name: string } | null;
      app_user: { email: string | null } | null;
    };
    return {
      userId: row.user_id,
      name: row.full_name ?? "(unnamed)",
      email: row.app_user?.email ?? null,
      collegeId: row.college_id,
      collegeName: row.college?.name ?? null,
      rollNumber: row.roll_number,
      registrationNumber: row.registration_number,
      apaarId: row.apaar_id,
      course: courseLabel(row.degree, row.branch, labels.degree, labels.branch, " · "),
      // Derived, so the picker shows the year the student is actually in.
      yearOfStudy: currentYearOfStudy(
        row.entry_academic_year,
        row.year_of_study,
        durationOf(row.degree, degreeBranch.degree),
      ),
    };
  });
}

/** The batch's fee lines + total (snapshotted onto an enrolment at enrol time). */
export async function fetchBatchFee(supabase: SupabaseClient, batchId: string): Promise<BatchFee | null> {
  const { data, error } = await supabase
    .from("batch")
    .select("id, name, code, academic_year, course:course_id(name), fee_component(label, amount_paise, sort_order)")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(`batch: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as {
    id: string; name: string; code: string; academic_year: string | null;
    course: { name: string } | null;
    fee_component: { label: string; amount_paise: number; sort_order: number }[];
  };
  const lines = [...(row.fee_component ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return {
    batchId: row.id,
    name: row.name,
    code: row.code,
    academicYear: row.academic_year,
    courseName: row.course?.name ?? null,
    lineItems: lines.map((f) => ({ description: f.label, amountPaise: f.amount_paise })),
    grossPaise: money(lines),
  };
}

export async function fetchBatchRoster(supabase: SupabaseClient, batchId: string): Promise<RosterRow[]> {
  const { data: enr, error } = await supabase
    .from("student_enrollment")
    .select("id, student_id, concession_type, payment_option, status, rejection_reason, net_fee_paise")
    .eq("batch_id", batchId)
    .order("enrolled_on", { ascending: false });
  if (error) throw new Error(`student_enrollment: ${error.message}`);
  const rows = (enr ?? []) as {
    id: string; student_id: string; concession_type: ConcessionType;
    payment_option: "full" | "installments"; status: string; rejection_reason: string | null; net_fee_paise: number;
  }[];
  if (rows.length === 0) return [];

  const enrollmentIds = rows.map((r) => r.id);
  const studentIds = [...new Set(rows.map((r) => r.student_id))];

  const [{ data: bal }, { data: names }] = await Promise.all([
    supabase.from("enrollment_balance").select("enrollment_id, paid_to_date_paise, balance_paise").in("enrollment_id", enrollmentIds),
    supabase.from("student_profile").select("user_id, full_name").in("user_id", studentIds),
  ]);
  const balById = new Map(
    ((bal ?? []) as { enrollment_id: string; paid_to_date_paise: number; balance_paise: number }[])
      .map((b) => [b.enrollment_id, b])
  );
  const nameById = new Map(
    ((names ?? []) as { user_id: string; full_name: string | null }[]).map((n) => [n.user_id, n.full_name])
  );

  return rows.map((r) => ({
    enrollmentId: r.id,
    studentId: r.student_id,
    studentName: nameById.get(r.student_id) ?? "(unnamed)",
    concessionType: r.concession_type,
    paymentOption: r.payment_option,
    status: r.status,
    rejectionReason: r.rejection_reason,
    netFeePaise: r.net_fee_paise,
    paidPaise: balById.get(r.id)?.paid_to_date_paise ?? 0,
    balancePaise: balById.get(r.id)?.balance_paise ?? r.net_fee_paise,
  }));
}

// ---- receipt ---------------------------------------------------------------

/** Build a printable FeeReceipt from a payment id (joins enrolment/batch/student). */
export async function getFeeReceipt(supabase: SupabaseClient, receiptId: string): Promise<FeeReceipt | null> {
  const { data: pay, error: pe } = await supabase
    .from("payment")
    .select("id, enrollment_id, receipt_no, amount_paise, mode, reference_no, paid_on, issued_on, created_at")
    .eq("id", receiptId)
    .maybeSingle();
  if (pe) throw new Error(`payment: ${pe.message}`);
  if (!pay) return null;
  const p = pay as unknown as {
    id: string; enrollment_id: string; receipt_no: string; amount_paise: number; mode: PaymentMode;
    reference_no: string | null; paid_on: string; issued_on: string; created_at: string;
  };
  const receiptNo = p.receipt_no;

  const { data: enr, error: enrErr } = await supabase
    .from("student_enrollment")
    .select("id, student_id, batch_id, gross_fee_paise, concession_type, concession_paise, net_fee_paise")
    .eq("id", p.enrollment_id)
    .maybeSingle();
  if (enrErr) throw new Error(`student_enrollment: ${enrErr.message}`);
  if (!enr) return null;
  const e = enr as unknown as {
    id: string; student_id: string; batch_id: string; gross_fee_paise: number;
    concession_type: ConcessionType; concession_paise: number; net_fee_paise: number;
  };

  const batch = await fetchBatchFee(supabase, e.batch_id);

  // Previously paid = payments on this enrolment ordered before this one. Order
  // by (created_at, id) so payments sharing an identical timestamp are still
  // counted deterministically — a strict `created_at <` would silently drop
  // them and overstate the printed balance.
  const { data: prior, error: priErr } = await supabase
    .from("payment")
    .select("id, amount_paise, created_at")
    .eq("enrollment_id", e.id);
  if (priErr) throw new Error(`payment: ${priErr.message}`);
  const previouslyPaidPaise = ((prior ?? []) as { id: string; amount_paise: number; created_at: string }[])
    .filter((q) => q.created_at < p.created_at || (q.created_at === p.created_at && q.id < p.id))
    .reduce((s, q) => s + q.amount_paise, 0);

  const { data: sp, error: spErr } = await supabase
    .from("student_profile")
    .select(
      "full_name, roll_number, registration_number, apaar_id, degree, branch, year_of_study, " +
      "entry_academic_year, " +
        "college:college_id(name, place, district, state)"
    )
    .eq("user_id", e.student_id)
    .maybeSingle();
  if (spErr) throw new Error(`student_profile: ${spErr.message}`);
  const s = (sp ?? {}) as {
    full_name?: string | null; roll_number?: string | null; registration_number?: string | null;
    apaar_id?: string | null; degree?: string | null; branch?: string | null; year_of_study?: string | null;
    entry_academic_year?: number | null;
    college?: { name: string | null; place: string | null; district: string | null; state: string | null } | null;
  };
  const collegeAddress = [s.college?.place, s.college?.district, s.college?.state].filter(Boolean).join(", ") || null;
  // Needed to derive the year of study below (durations are per degree).
  const { degree: receiptDegrees } = await getDegreeBranchData();

  const academicYear = batch?.academicYear ?? null;
  return {
    receiptNo,
    issueDate: p.issued_on,
    paidOn: p.paid_on,
    academicYear,
    student: {
      fullName: s.full_name ?? "(unnamed)",
      rollNumber: s.roll_number ?? null,
      registrationNumber: s.registration_number ?? null,
      apaarId: s.apaar_id ?? null,
      course: await courseOf(s.degree ?? null, s.branch ?? null),
      // DERIVED, like every other surface (#99 review). A receipt is a paper record —
      // it was the one output still printing the stale snapshot, so a student anchored
      // in 2024 got a 2027 receipt that said "3rd Year".
      yearOfStudy: currentYearOfStudy(
        s.entry_academic_year ?? null,
        s.year_of_study ?? null,
        durationOf(s.degree ?? null, receiptDegrees),
      ),
      collegeName: s.college?.name ?? null,
      collegeAddress,
    },
    courseName: batch?.courseName ?? "Course",
    batchName: batch?.name ?? null,
    lineItems: batch?.lineItems ?? [],
    grossFeePaise: e.gross_fee_paise,
    concessionType: e.concession_type,
    concessionPaise: e.concession_paise,
    totalFeePaise: e.net_fee_paise,
    previouslyPaidPaise,
    thisPaymentPaise: p.amount_paise,
    balancePaise: Math.max(0, e.net_fee_paise - previouslyPaidPaise - p.amount_paise),
    mode: p.mode,
    referenceNo: p.reference_no,
  };
}

// ---- admin: one enrolment's ledger (installments + receipts) ---------------

export type EnrollmentLedger = {
  installments: MyFeeInstallment[];
  payments: MyFeePayment[];
};

/** The installment schedule + issued receipts for a single enrolment, for the
 * admin batch roster's per-student detail. Same shape the student sees under My
 * fees; RLS lets finance staff read any enrolment's rows. */
export async function fetchEnrollmentLedger(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<EnrollmentLedger> {
  const [balRes, payRes, instRes] = await Promise.all([
    supabase.from("enrollment_balance").select("paid_to_date_paise").eq("enrollment_id", enrollmentId).maybeSingle(),
    supabase.from("payment").select("id, receipt_no, amount_paise, mode, paid_on").eq("enrollment_id", enrollmentId).order("created_at"),
    supabase.from("installment").select("seq, due_on, amount_paise").eq("enrollment_id", enrollmentId).order("seq"),
  ]);
  if (balRes.error) throw new Error(`enrollment_balance: ${balRes.error.message}`);
  if (payRes.error) throw new Error(`payment: ${payRes.error.message}`);
  if (instRes.error) throw new Error(`installment: ${instRes.error.message}`);

  const paid = (balRes.data as { paid_to_date_paise?: number } | null)?.paid_to_date_paise ?? 0;
  const payments: MyFeePayment[] = ((payRes.data ?? []) as {
    id: string; receipt_no: string; amount_paise: number; mode: MyFeePayment["mode"]; paid_on: string;
  }[]).map((p) => ({ receiptId: p.id, receiptNo: p.receipt_no, amountPaise: p.amount_paise, mode: p.mode, paidOn: p.paid_on }));

  const today = istToday();
  let cum = 0;
  const installments: MyFeeInstallment[] = ((instRes.data ?? []) as { seq: number; due_on: string; amount_paise: number }[])
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      cum += i.amount_paise;
      const status: MyFeeInstallment["status"] = paid >= cum ? "paid" : i.due_on < today ? "overdue" : "due";
      return { seq: i.seq, dueOn: i.due_on, amountPaise: i.amount_paise, status };
    });

  return { installments, payments };
}

// ---- student "My fees" -----------------------------------------------------

export type MyFeeInstallment = {
  seq: number;
  dueOn: string;
  amountPaise: number;
  status: "paid" | "overdue" | "due";
};
export type MyFeePayment = {
  receiptId: string;
  receiptNo: string;
  amountPaise: number;
  mode: import("@/lib/fee-receipt").PaymentMode;
  paidOn: string;
};
export type MyFeeEnrollment = {
  enrollmentId: string;
  courseName: string;
  batchName: string;
  academicYear: string | null;
  status: string;
  rejectionReason: string | null;
  grossFeePaise: number;
  concessionType: import("@/lib/fee-receipt").ConcessionType;
  concessionPaise: number;
  netFeePaise: number;
  paidPaise: number;
  balancePaise: number;
  paymentOption: "full" | "installments";
  payments: MyFeePayment[];
  installments: MyFeeInstallment[];
};

/** The signed-in student's enrolments with balances, payment history (receipts),
 * and any installment schedule. RLS scopes everything to `studentId`. */
export async function fetchStudentFees(
  supabase: SupabaseClient,
  studentId: string
): Promise<MyFeeEnrollment[]> {
  const { data: enr, error } = await supabase
    .from("student_enrollment")
    .select("id, batch_id, gross_fee_paise, concession_type, concession_paise, net_fee_paise, status, rejection_reason, payment_option")
    .eq("student_id", studentId)
    .order("enrolled_on", { ascending: false });
  if (error) throw new Error(`student_enrollment: ${error.message}`);
  const rows = (enr ?? []) as {
    id: string; batch_id: string; gross_fee_paise: number; concession_type: MyFeeEnrollment["concessionType"];
    concession_paise: number; net_fee_paise: number; status: string; rejection_reason: string | null; payment_option: "full" | "installments";
  }[];
  if (rows.length === 0) return [];

  const enrIds = rows.map((r) => r.id);
  const batchIds = [...new Set(rows.map((r) => r.batch_id))];

  const [balRes, batchRes, payRes, instRes] = await Promise.all([
    supabase.from("enrollment_balance").select("enrollment_id, paid_to_date_paise, balance_paise").in("enrollment_id", enrIds),
    supabase.from("batch").select("id, name, academic_year, course:course_id(name)").in("id", batchIds),
    supabase.from("payment").select("id, enrollment_id, receipt_no, amount_paise, mode, paid_on, created_at").in("enrollment_id", enrIds).order("created_at"),
    supabase.from("installment").select("enrollment_id, seq, due_on, amount_paise").in("enrollment_id", enrIds).order("seq"),
  ]);
  if (balRes.error) throw new Error(`enrollment_balance: ${balRes.error.message}`);
  if (batchRes.error) throw new Error(`batch: ${batchRes.error.message}`);
  if (payRes.error) throw new Error(`payment: ${payRes.error.message}`);
  if (instRes.error) throw new Error(`installment: ${instRes.error.message}`);

  const balById = new Map(
    ((balRes.data ?? []) as { enrollment_id: string; paid_to_date_paise: number; balance_paise: number }[]).map((b) => [b.enrollment_id, b])
  );
  const batchById = new Map(
    ((batchRes.data ?? []) as unknown as { id: string; name: string; academic_year: string | null; course: { name: string } | null }[]).map((b) => [b.id, b])
  );
  const paysByEnr = new Map<string, MyFeePayment[]>();
  for (const p of (payRes.data ?? []) as { id: string; enrollment_id: string; receipt_no: string; amount_paise: number; mode: MyFeePayment["mode"]; paid_on: string }[]) {
    const list = paysByEnr.get(p.enrollment_id) ?? [];
    list.push({ receiptId: p.id, receiptNo: p.receipt_no, amountPaise: p.amount_paise, mode: p.mode, paidOn: p.paid_on });
    paysByEnr.set(p.enrollment_id, list);
  }
  const instByEnr = new Map<string, { seq: number; due_on: string; amount_paise: number }[]>();
  for (const i of (instRes.data ?? []) as { enrollment_id: string; seq: number; due_on: string; amount_paise: number }[]) {
    const list = instByEnr.get(i.enrollment_id) ?? [];
    list.push({ seq: i.seq, due_on: i.due_on, amount_paise: i.amount_paise });
    instByEnr.set(i.enrollment_id, list);
  }

  const today = istToday();
  return rows.map((r) => {
    const paid = balById.get(r.id)?.paid_to_date_paise ?? 0;
    const balance = balById.get(r.id)?.balance_paise ?? r.net_fee_paise;
    const batch = batchById.get(r.batch_id);
    let cum = 0;
    const installments: MyFeeInstallment[] = [...(instByEnr.get(r.id) ?? [])]
      .sort((a, b) => a.seq - b.seq)
      .map((i) => {
        cum += i.amount_paise;
        const status: MyFeeInstallment["status"] = paid >= cum ? "paid" : i.due_on < today ? "overdue" : "due";
        return { seq: i.seq, dueOn: i.due_on, amountPaise: i.amount_paise, status };
      });
    return {
      enrollmentId: r.id,
      courseName: batch?.course?.name ?? "Course",
      batchName: batch?.name ?? "",
      academicYear: batch?.academic_year ?? null,
      status: r.status,
      rejectionReason: r.rejection_reason,
      grossFeePaise: r.gross_fee_paise,
      concessionType: r.concession_type,
      concessionPaise: r.concession_paise,
      netFeePaise: r.net_fee_paise,
      paidPaise: paid,
      balancePaise: balance,
      paymentOption: r.payment_option,
      payments: paysByEnr.get(r.id) ?? [],
      installments,
    };
  });
}

// ---- student self-enrolment ------------------------------------------------
// The student's Courses catalogue + course-details reads live in
// lib/course-query.ts (fetchOpenCoursesForStudent / fetchStudentCourseWithBatches),
// which group batches under their course. The old per-batch OpenBatch listing was
// removed when the surface moved from "batches as courses" to course → batches.
