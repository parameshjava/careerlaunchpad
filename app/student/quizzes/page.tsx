import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { requireApprovedStudent } from "@/lib/student-approval";
import { PageContainer } from "@/components/app-shell/page-container";
import { QuizzesHub } from "@/components/student/quizzes-hub";
import { FeedbackPrompt } from "@/components/student/feedback-prompt";

export const metadata: Metadata = { title: "Assessments" };

// The student's per-chapter assessments. A quiz appears once its mentor marks the
// chapter completed; the student self-serves up to 3 attempts.
export default async function StudentQuizzesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "chapter.quiz.take")) redirect("/student");
  await requireApprovedStudent(ctx.userId);

  return (
    <PageContainer variant="full" className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Take a chapter&apos;s assessment once your mentor marks it completed — up to 3 attempts each.
        </p>
      </header>
      {/* Feedback on a finished chapter sits above the assessments (#84): the student
          is already here, and it must never gate the assessment below it. */}
      <FeedbackPrompt />
      <QuizzesHub />
    </PageContainer>
  );
}
