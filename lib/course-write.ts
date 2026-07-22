// Server-only helpers for writing a course template and its nested rows
// (subjects, per-subject chapters, competitive exams, default fee lines). Shared by
// the create (POST) and update (PATCH) course API routes. supabase-js has no
// multi-statement transaction, so a create cleans up the course row on child
// failure, and an update deletes-then-reinserts children — good enough for an
// admin catalog gated by finance.manage.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseStatus } from "@/lib/course-query";

export type CoursePayload = {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  status: CourseStatus;
  competitiveExamIds: string[];
  feeLines: { label: string; amountPaise: number }[];
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Validate a course request body into a normalised payload, or a user message. */
export function parseCoursePayload(
  body: unknown
): { ok: true; value: CoursePayload } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = str(b.name);
  if (!name) return { ok: false, error: "Course name is required." };

  const slug = (str(b.slug) ?? "").toLowerCase();
  if (!slug) return { ok: false, error: "A slug is required." };
  if (!SLUG_RE.test(slug))
    return { ok: false, error: "Slug may use only lowercase letters, numbers, and hyphens." };

  const status = (str(b.status) ?? "active") as CourseStatus;
  if (status !== "active" && status !== "archived")
    return { ok: false, error: "Status must be active or archived." };

  const competitiveExamIds = Array.isArray(b.competitiveExamIds)
    ? b.competitiveExamIds.filter((x): x is string => typeof x === "string")
    : [];

  const feeLinesIn = Array.isArray(b.feeLines) ? b.feeLines : [];
  const feeLines: CoursePayload["feeLines"] = [];
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
      slug,
      name,
      description: str(b.description),
      category: str(b.category),
      status,
      competitiveExamIds,
      feeLines,
    },
  };
}

/** Insert all nested rows for a course. Returns a message on first failure. */
export async function writeCourseChildren(
  supabase: SupabaseClient,
  courseId: string,
  p: CoursePayload
): Promise<{ error?: string }> {
  if (p.competitiveExamIds.length) {
    const rows = p.competitiveExamIds.map((competitive_exam_id) => ({ course_id: courseId, competitive_exam_id }));
    const { error } = await supabase.from("course_competitive_exam").insert(rows);
    if (error) return { error: `competitive exams: ${error.message}` };
  }

  if (p.feeLines.length) {
    const rows = p.feeLines.map((f, i) => ({
      course_id: courseId,
      label: f.label,
      amount_paise: f.amountPaise,
      sort_order: i,
    }));
    const { error } = await supabase.from("course_fee_line").insert(rows);
    if (error) return { error: `fee lines: ${error.message}` };
  }

  return {};
}

/** Remove all nested rows for a course (chapters first, then the rest). */
export async function deleteCourseChildren(
  supabase: SupabaseClient,
  courseId: string
): Promise<{ error?: string }> {
  for (const table of ["course_competitive_exam", "course_fee_line"]) {
    const { error } = await supabase.from(table).delete().eq("course_id", courseId);
    if (error) return { error: `${table}: ${error.message}` };
  }
  return {};
}
