import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { QuestionEditor } from "../../question-editor";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.question.manage"))) redirect("/dashboard");

  const { questionId } = await params;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Edit question</h1>
      </header>
      <QuestionEditor mode="edit" questionId={questionId} />
    </div>
  );
}
