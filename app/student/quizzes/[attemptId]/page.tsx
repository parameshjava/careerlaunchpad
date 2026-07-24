import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { requireApprovedStudent } from "@/lib/student-approval";
import { PageContainer } from "@/components/app-shell/page-container";
import { QuizRunner } from "@/components/student/quiz-runner";

export const metadata: Metadata = { title: "Assessment" };

export default async function QuizRunnerPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "chapter.quiz.take")) redirect("/student");
  await requireApprovedStudent(ctx.userId);

  const { attemptId } = await params;

  return (
    <PageContainer variant="reading" className="space-y-6">
      <QuizRunner attemptId={attemptId} />
    </PageContainer>
  );
}
