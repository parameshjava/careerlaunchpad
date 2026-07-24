import { redirect } from "next/navigation";
import { getAuthContext, can, scopedCollege } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCollegeSessions } from "@/lib/exam-query";
import { ResultsBrowser } from "./results-browser";
import { PageContainer } from "@/components/app-shell/page-container";

// Exam results home: every finished sitting (closed or graded) the admin may
// see, in one flat list. Each row links to the sitting's results sheet and the
// exam's consolidated statement. College admins are RLS/scope-bound to their
// college; owners and platform admins see all.
export default async function ExamResultsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed = ctx.permissions.has("*") || can(ctx, "exam.results.view_all");
  if (!allowed) redirect("/dashboard");

  const supabase = await createClient();
  const sessions = await fetchCollegeSessions(supabase, scopedCollege(ctx));
  const finished = sessions.filter((s) => s.status === "closed" || s.status === "graded");

  return (
    <PageContainer variant="full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Exam results</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Results of every finished sitting. Open one for the marks sheet, or view the
          consolidated statement across an exam&apos;s batches.
        </p>
      </header>
      <ResultsBrowser sessions={finished} />
    </PageContainer>
  );
}
