// Shared authorization for the student progress-analytics API.
//
// Two callers, two shapes:
//   • a student reading their OWN progress — the original case: a provisioned,
//     approved student who can take quizzes.
//   • a staff member reading ONE of their students (#111) — a provisioned user
//     holding a permission that already means "you may look at student records".
//
// The route-level check is a filter, not the boundary. perf_target() (migration
// 176) is what confines a college-scoped grant to that college's students, and
// it raises rather than returning an empty set — so a bypass here surfaces as a
// 500 with "Not authorized", never as silently wrong data.
import { getAuthContext, can, type AuthContext } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";

/** True if `ctx` may look at student records at all (mirrors lib/nav.ts). */
function canViewStudentRecords(ctx: AuthContext): boolean {
  return (
    ctx.permissions.has("*") ||
    can(ctx, "user.manage") ||
    can(ctx, "student.profile.view") ||
    can(ctx, "student.profile.search") ||
    can(ctx, "college.students.view")
  );
}

/**
 * `targetStudent` is the `?student=` a staff drilldown sends. Absent, or equal to
 * the caller, means the self-view and keeps the original approved-student gate.
 */
export async function gateStudentAnalytics(
  targetStudent?: string | null,
): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended") return null;

  if (targetStudent && targetStudent !== ctx.userId) {
    return canViewStudentRecords(ctx) ? ctx : null;
  }

  if (!can(ctx, "chapter.quiz.take")) return null;
  if (!(await isStudentApproved(ctx.userId))) return null;
  return ctx;
}
