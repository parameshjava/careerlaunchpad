import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AssessmentQuestionsClient } from "./assessment-questions-client";
import { PageContainer } from "@/components/app-shell/page-container";

// Assessment questions — the per-chapter quiz bank (migration 143). A SEPARATE
// global bank from the exam question bank, drawn on when a completed chapter's
// quiz is generated. Subjects/chapters are the shared taxonomy curated under
// "Subjects & Chapters".
export default async function AssessmentQuestionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.question.manage"))) redirect("/dashboard");

  return (
    <PageContainer variant="full">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessment questions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The per-chapter quiz bank. Author questions here; a chapter&apos;s quiz is generated from
            its active questions once the chapter is marked completed. Subjects &amp; chapters are
            curated under <b>Subjects &amp; Chapters</b>.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/dashboard/assessment-questions/import">Import JSON</Link>
        </Button>
      </header>
      <AssessmentQuestionsClient />
    </PageContainer>
  );
}
