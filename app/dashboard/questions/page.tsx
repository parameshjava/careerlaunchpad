import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { BankClient } from "./bank-client";

// Question bank — the GLOBAL CareerLaunchPad asset (migration 021). Subjects,
// chapters, passages and questions are shared across all colleges and curated by
// the central team. No college is involved here; only exams are per-college.
export default async function QuestionBankPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const canManageSubjects = ctx.permissions.has("*") || can(ctx, "exam.subject.manage");
  const canManageQuestions = ctx.permissions.has("*") || can(ctx, "exam.question.manage");
  if (!canManageSubjects && !canManageQuestions) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Question bank</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Shared across all colleges. Exams draw from this bank by subject, chapter and difficulty.
        </p>
      </header>
      <BankClient canManageSubjects={canManageSubjects} canManageQuestions={canManageQuestions} />
    </div>
  );
}
