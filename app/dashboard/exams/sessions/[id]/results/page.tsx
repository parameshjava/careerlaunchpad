import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChartColumnIncreasing } from "lucide-react";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPaperForPrint,
  fetchRoster,
  fetchSession,
  fetchSubjectAverages,
  fetchSubjectMarksByStudent,
} from "@/lib/exam-query";
import { ResultsClient } from "./results-client";
import { ResultsPrint } from "./results-print";

export default async function SessionResultsPage({
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
  const [roster, subjectAvgs, paper, subjectMarks] = await Promise.all([
    fetchRoster(supabase, id),
    fetchSubjectAverages(supabase, id),
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
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/dashboard/exams/papers?tab=${
          session.status === "closed" || session.status === "graded" ? "closed" : "active"
        }`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm print:hidden"
      >
        ← Exam papers
      </Link>
      <header className="mb-6 flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white print:hidden">
          <ChartColumnIncreasing className="size-6" />
        </span>
        <div className="min-w-0">
          {session.collegeName && (
            <p className="text-sm font-semibold tracking-tight">{session.collegeName}</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight">Results — {session.label}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{session.examTitle}</p>
        </div>
      </header>
      <ResultsClient
        sessionId={id}
        resultsPublished={session.resultsPublished}
        roster={roster}
        subjectAvgs={subjectAvgs}
        canPublish={ctx.permissions.has("*") || can(ctx, "exam.assign")}
      />
      {/* Print-only statement of marks on the letterhead; the Print button in
          ResultsClient fires window.print() and only this block prints. */}
      <ResultsPrint
        collegeName={session.collegeName ?? null}
        examTitle={session.examTitle ?? "Exam"}
        label={session.label}
        mode={session.mode}
        totalMarks={paper?.totalMarks ?? null}
        roster={roster}
        subjects={subjectMarks.subjects}
        subjectMarks={subjectMarks.byStudent}
        subjectAvgs={subjectAvgs}
        printedOn={printedOn}
      />
    </div>
  );
}
