import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPaperForPrint,
  fetchRoster,
  fetchSession,
  fetchResultNotificationSummary,
  fetchSessionLiveProgress,
  fetchSubjectAverages,
  fetchSubjectMarksByStudent,
} from "@/lib/exam-query";
import { SessionConsole } from "./session-console";
import type { PaperDocumentProps } from "./paper-print";
import type { ResultsDocumentProps } from "./results-document";
import { PageContainer } from "@/components/app-shell/page-container";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") || can(ctx, "exam.assign") || can(ctx, "exam.results.view_all");
  if (!allowed) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const session = await fetchSession(supabase, id);
  if (!session) notFound();
  const canExportPdf = ctx.permissions.has("*") || can(ctx, "exam.paper.export_pdf");
  const canPublish = ctx.permissions.has("*") || can(ctx, "exam.assign");
  const [progress, paper, roster, subjectAvgs, subjectMarks, notifications] = await Promise.all([
    fetchSessionLiveProgress(supabase, id),
    canExportPdf ? fetchPaperForPrint(supabase, id) : Promise.resolve(null),
    fetchRoster(supabase, id),
    fetchSubjectAverages(supabase, id),
    fetchSubjectMarksByStudent(supabase, id),
    fetchResultNotificationSummary(supabase, id),
  ]);

  // Printable paper/key props — only when the caller can export and the paper
  // has questions; passed to the console for its top Print buttons + hidden preview.
  const paperProps: PaperDocumentProps | null =
    paper && paper.questions.length > 0
      ? {
          title: session.examTitle ?? "Exam",
          label: session.label,
          collegeName: session.collegeName,
          durationMinutes: session.durationMinutes ?? 0,
          totalMarks: paper.totalMarks,
          questions: paper.questions,
        }
      : null;

  // Statement-of-Results props for the console's "Print Result" button (no
  // separate results page any more — issue #78). Server-side date so the printed
  // sheet is stable (no hydration mismatch).
  const printedOn = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const resultsProps: ResultsDocumentProps = {
    collegeName: session.collegeName ?? null,
    examTitle: session.examTitle ?? "Exam",
    label: session.label,
    mode: session.mode,
    totalMarks: paper?.totalMarks ?? null,
    roster,
    subjects: subjectMarks.subjects,
    subjectMarks: subjectMarks.byStudent,
    subjectAvgs,
    printedOn,
  };

  return (
    <PageContainer variant="full">
      <Link
        href={`/dashboard/exams/papers?tab=${
          session.status === "closed" || session.status === "graded" ? "closed" : "active"
        }`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm print:hidden"
      >
        ← Exam papers
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{session.label}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {session.examTitle} · {session.mode} · {session.questionCount} questions
        </p>
      </header>
      <SessionConsole
        session={session}
        initialProgress={progress}
        initialGeneratedAt={new Date().toISOString()}
        paper={paperProps}
        results={resultsProps}
        resultsPublished={session.resultsPublished}
        canPublish={canPublish}
        notifications={notifications}
      />
    </PageContainer>
  );
}
