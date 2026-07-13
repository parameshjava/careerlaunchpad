import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Author and manage questions. They draw on subjects &amp; chapters curated under
            <b> Subjects &amp; Chapters</b>.
          </p>
        </div>
        {/* Import is always available — it doesn't need a subject picked here
            (the import page has its own subject picker). */}
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/dashboard/questions/import">Import JSON</Link>
        </Button>
      </header>
      <QuestionsClient />
    </div>
  );
}
