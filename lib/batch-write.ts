// Server-only helpers for writing a batch and its nested rows (associated
// colleges, fee lines). Shared by the create (POST) and update (PATCH) batch API
// routes. Same non-transactional approach as lib/course-write.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchStatus, BatchEnrollmentStatus, DeliveryMode } from "@/lib/batch-query";

export type BatchPayload = {
  courseId: string;
  name: string;
  code: string;
  academicYear: string | null;
  deliveryMode: DeliveryMode | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  status: BatchStatus;
  enrollmentStatus: BatchEnrollmentStatus;
  collegeIds: string[];
  feeLines: { label: string; amountPaise: number }[];
};

const STATUSES: BatchStatus[] = ["draft", "open", "running", "closed", "cancelled"];
const ENROLLMENT_STATUSES: BatchEnrollmentStatus[] = ["not_open", "open", "closed"];
const MODES: DeliveryMode[] = ["online", "offline", "hybrid"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function parseBatchPayload(
  body: unknown
): { ok: true; value: BatchPayload } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const courseId = str(b.courseId);
  if (!courseId) return { ok: false, error: "Pick a course for this batch." };

  const name = str(b.name);
  if (!name) return { ok: false, error: "Batch name is required." };

  const code = str(b.code);
  if (!code) return { ok: false, error: "A batch code is required." };

  const status = (str(b.status) ?? "draft") as BatchStatus;
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid batch status." };

  const enrollmentStatus = (str(b.enrollmentStatus) ?? "not_open") as BatchEnrollmentStatus;
  if (!ENROLLMENT_STATUSES.includes(enrollmentStatus))
    return { ok: false, error: "Invalid enrolment status." };

  const deliveryMode = str(b.deliveryMode) as DeliveryMode | null;
  if (deliveryMode && !MODES.includes(deliveryMode))
    return { ok: false, error: "Delivery mode must be online, offline, or hybrid." };

  const startDate = str(b.startDate);
  if (startDate && !DATE_RE.test(startDate))
    return { ok: false, error: "Start date must be a valid date." };
  const endDate = str(b.endDate);
  if (endDate && !DATE_RE.test(endDate))
    return { ok: false, error: "End date must be a valid date." };
  if (startDate && endDate && endDate < startDate)
    return { ok: false, error: "End date cannot be before the start date." };

  const collegeIds = Array.isArray(b.collegeIds)
    ? b.collegeIds.filter((x): x is string => typeof x === "string")
    : [];

  const feeLinesIn = Array.isArray(b.feeLines) ? b.feeLines : [];
  const feeLines: BatchPayload["feeLines"] = [];
  for (const f of feeLinesIn) {
    const label = str((f as Record<string, unknown>)?.label);
    const amount = Number((f as Record<string, unknown>)?.amountPaise);
    if (!label) return { ok: false, error: "Each fee line needs a label." };
    if (!Number.isInteger(amount) || amount < 0)
      return { ok: false, error: `Fee amount for "${label}" is not a valid number.` };
    feeLines.push({ label, amountPaise: amount });
  }

  return {
    ok: true,
    value: {
      courseId,
      name,
      code,
      academicYear: str(b.academicYear),
      deliveryMode,
      startDate,
      endDate,
      currency: str(b.currency) ?? "INR",
      status,
      enrollmentStatus,
      collegeIds,
      feeLines,
    },
  };
}

export async function writeBatchChildren(
  supabase: SupabaseClient,
  batchId: string,
  p: BatchPayload
): Promise<{ error?: string }> {
  if (p.collegeIds.length) {
    const rows = p.collegeIds.map((college_id) => ({ batch_id: batchId, college_id }));
    const { error } = await supabase.from("batch_college").insert(rows);
    if (error) return { error: `colleges: ${error.message}` };
  }
  if (p.feeLines.length) {
    const rows = p.feeLines.map((f, i) => ({
      batch_id: batchId,
      label: f.label,
      amount_paise: f.amountPaise,
      sort_order: i,
    }));
    const { error } = await supabase.from("fee_component").insert(rows);
    if (error) return { error: `fee lines: ${error.message}` };
  }
  return {};
}
// NOTE: batch UPDATE no longer deletes children in JS — it calls the atomic
// `replace_batch_children` RPC (migration 130) so a failed reinsert rolls back.
