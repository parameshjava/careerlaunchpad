import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchRoster, fetchSession, fetchPaperForPrint, fetchSubjectMarksByStudent } from "@/lib/exam-query";
import { ResultsPrint } from "./results-print";

// Print-optimized result sheet for a sitting (enterprise "statement of results"
// format). Admin uses the browser's Save-as-PDF. Gated like the results page.
export default async function ResultsPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") || can(ctx, "exam.results.view_all") || can(ctx, "exam.assign");
  if (!allowed) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const session = await fetchSession(supabase, id);
  if (!session) notFound();
  const [roster, paper, subjectMarks] = await Promise.all([
    fetchRoster(supabase, id),
    fetchPaperForPrint(supabase, id),
    fetchSubjectMarksByStudent(supabase, id),
  ]);

  // Server-side date so the printed sheet is stable (no hydration mismatch).
  const printedOn = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <ResultsPrint
      collegeName={session.collegeName ?? null}
      examTitle={session.examTitle ?? "Exam"}
      label={session.label}
      mode={session.mode}
      totalMarks={paper?.totalMarks ?? null}
      roster={roster}
      subjects={subjectMarks.subjects}
      subjectMarks={subjectMarks.byStudent}
      printedOn={printedOn}
    />
  );
}
