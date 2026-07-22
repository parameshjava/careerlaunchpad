// Typed data-access for batches (issue #49, Phase 3; schema in
// supabase/migrations/125_fees.sql). A batch is a dated run of a course:
// associated college(s), its own (editable) fee lines copied from the course
// template, and a status lifecycle (draft → open → running → closed). Reads are
// bounded by the migration-125 RLS. Mirrors lib/course-query.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export type BatchStatus = "draft" | "open" | "running" | "closed" | "cancelled";
export const BATCH_STATUSES: BatchStatus[] = ["draft", "open", "running", "closed", "cancelled"];
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  draft: "Draft",
  open: "Open",
  running: "Running",
  closed: "Closed",
  cancelled: "Cancelled",
};

export type DeliveryMode = "online" | "offline" | "hybrid";

export type BatchListRow = {
  id: string;
  code: string;
  name: string;
  courseName: string | null;
  academicYear: string | null;
  deliveryMode: string | null;
  startDate: string | null;
  status: BatchStatus;
  collegeCount: number;
  studentCount: number;
  feeTotalPaise: number;
};

export type BatchDetail = {
  id: string;
  courseId: string;
  name: string;
  code: string;
  academicYear: string | null;
  deliveryMode: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  status: BatchStatus;
  /** Associated colleges (with names, for the editor's chips). */
  colleges: { id: string; name: string }[];
  feeLines: { label: string; amountPaise: number }[];
};

/** A course option for the batch editor, carrying its default fee lines to copy. */
export type CourseOption = {
  id: string;
  name: string;
  feeLines: { label: string; amountPaise: number }[];
};

// ---- Reads -----------------------------------------------------------------

export async function fetchBatches(supabase: SupabaseClient): Promise<BatchListRow[]> {
  const { data, error } = await supabase
    .from("batch")
    .select(
      "id, code, name, academic_year, delivery_mode, start_date, status, created_at, " +
        "course(name), batch_college(count), fee_component(amount_paise)"
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`batch: ${error.message}`);
  type CountRow = { count: number }[];

  // Student count = real enrolments only. Cancelled (rejected/withdrawn) and
  // pending (unapproved) rows must not inflate the batch's headcount, so tally
  // them separately with a status filter rather than an unfiltered embed count.
  const batchIds = (data ?? []).map((b) => (b as unknown as { id: string }).id);
  const studentCount = new Map<string, number>();
  if (batchIds.length) {
    const { data: enr, error: ee } = await supabase
      .from("student_enrollment")
      .select("batch_id")
      .in("batch_id", batchIds)
      .in("status", ["active", "completed"]);
    if (ee) throw new Error(`student_enrollment: ${ee.message}`);
    for (const r of (enr ?? []) as { batch_id: string }[]) {
      studentCount.set(r.batch_id, (studentCount.get(r.batch_id) ?? 0) + 1);
    }
  }

  return (data ?? []).map((b) => {
    const row = b as unknown as {
      id: string; code: string; name: string; academic_year: string | null;
      delivery_mode: string | null; start_date: string | null; status: BatchStatus;
      course: { name: string } | null;
      batch_college: CountRow;
      fee_component: { amount_paise: number }[];
    };
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      courseName: row.course?.name ?? null,
      academicYear: row.academic_year,
      deliveryMode: row.delivery_mode,
      startDate: row.start_date,
      status: row.status,
      collegeCount: row.batch_college?.[0]?.count ?? 0,
      studentCount: studentCount.get(row.id) ?? 0,
      feeTotalPaise: (row.fee_component ?? []).reduce((s, f) => s + f.amount_paise, 0),
    };
  });
}

export async function fetchBatch(supabase: SupabaseClient, id: string): Promise<BatchDetail | null> {
  const { data, error } = await supabase
    .from("batch")
    .select(
      "id, course_id, name, code, academic_year, delivery_mode, start_date, end_date, currency, status, " +
        "batch_college(college_id, college:college_id(name)), fee_component(label, amount_paise, sort_order)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`batch: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as {
    id: string; course_id: string; name: string; code: string;
    academic_year: string | null; delivery_mode: string | null;
    start_date: string | null; end_date: string | null; currency: string; status: BatchStatus;
    batch_college: { college_id: string; college: { name: string } | null }[];
    fee_component: { label: string; amount_paise: number; sort_order: number }[];
  };
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    code: row.code,
    academicYear: row.academic_year,
    deliveryMode: row.delivery_mode,
    startDate: row.start_date,
    endDate: row.end_date,
    currency: row.currency,
    status: row.status,
    colleges: row.batch_college.map((c) => ({ id: c.college_id, name: c.college?.name ?? "College" })),
    feeLines: [...row.fee_component]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ label: f.label, amountPaise: f.amount_paise })),
  };
}

/** Active courses (with their default fee lines) for the batch editor. Colleges
 * are NOT loaded here — the college table has ~10k rows, so the editor uses the
 * typeahead /api/colleges/search endpoint instead of shipping them all. */
export async function fetchBatchReference(
  supabase: SupabaseClient
): Promise<{ courses: CourseOption[] }> {
  const { data: courses, error: ce } = await supabase
    .from("course")
    .select("id, name, status, course_fee_line(label, amount_paise, sort_order)")
    .eq("status", "active")
    .order("name");
  if (ce) throw new Error(`course: ${ce.message}`);

  const courseOptions: CourseOption[] = (courses ?? []).map((c) => {
    const row = c as unknown as {
      id: string; name: string;
      course_fee_line: { label: string; amount_paise: number; sort_order: number }[];
    };
    return {
      id: row.id,
      name: row.name,
      feeLines: [...(row.course_fee_line ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((f) => ({ label: f.label, amountPaise: f.amount_paise })),
    };
  });

  return { courses: courseOptions };
}
