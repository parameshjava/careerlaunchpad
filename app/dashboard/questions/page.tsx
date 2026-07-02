import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { QuestionsClient } from "./questions-client";

// Questions — browse & author the GLOBAL question bank (migration 021). Shared
// across all colleges. Subjects/chapters/passages are curated on the separate
// "Subjects & Chapters" page (/dashboard/subjects).
export default async function QuestionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.question.manage"))) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Questions</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Author and manage questions. They draw on subjects &amp; chapters curated under
          <b> Subjects &amp; Chapters</b>.
        </p>
      </header>
      <QuestionsClient />
    </div>
  );
}
