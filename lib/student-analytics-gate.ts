// Shared authorization for the student progress-analytics API. Analytics are
// self-only (the RPCs filter on auth.uid()), so we just require a provisioned,
// approved student who can take quizzes. Returns the context, or null to 403.
import { getAuthContext, can, type AuthContext } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";

export async function gateStudentAnalytics(): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "chapter.quiz.take"))
    return null;
  if (!(await isStudentApproved(ctx.userId))) return null;
  return ctx;
}
