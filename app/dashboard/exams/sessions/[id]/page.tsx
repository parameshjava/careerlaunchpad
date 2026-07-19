import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPaperForPrint, fetchRoster, fetchSession } from "@/lib/exam-query";
import { SessionDetailClient } from "./session-detail-client";
import { PaperPrint } from "./paper-print";

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
  const [roster, paper] = await Promise.all([
    fetchRoster(supabase, id),
    canExportPdf ? fetchPaperForPrint(supabase, id) : Promise.resolve(null),
  ]);

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
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{session.label}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {session.examTitle} · {session.mode} · {session.questionCount} questions
        </p>
      </header>
      <SessionDetailClient
        session={session}
        roster={roster}
        canPrintPaper={canExportPdf && !!paper && paper.questions.length > 0}
      />
      {/* Print-only question paper / answer key on the letterhead; the Print
          paper / Print key buttons in SessionDetailClient fire window.print(). */}
      {canExportPdf && paper && paper.questions.length > 0 && (
        <PaperPrint
          title={session.examTitle ?? "Exam"}
          label={session.label}
          collegeName={session.collegeName}
          durationMinutes={session.durationMinutes ?? 0}
          totalMarks={paper.totalMarks}
          questions={paper.questions}
        />
      )}
    </div>
  );
}
