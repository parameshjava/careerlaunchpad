import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { AssessmentQuestionEditor } from "../assessment-question-editor";
import { PageContainer } from "@/components/app-shell/page-container";

export default async function NewAssessmentQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.question.manage"))) redirect("/dashboard");

  const { subject } = await searchParams;

  return (
    <PageContainer variant="form">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New assessment question</h1>
      </header>
      <AssessmentQuestionEditor mode="new" initialSubjectId={subject ?? ""} />
    </PageContainer>
  );
}
