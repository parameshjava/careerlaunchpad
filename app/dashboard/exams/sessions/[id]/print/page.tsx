import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPaperForPrint, fetchSession } from "@/lib/exam-query";
import { PaperPrint } from "./paper-print";

// Print-optimized paper for offline conduct (docs/EXAM_MODULE_SPEC.md §7). The
// admin uses the browser's Save-as-PDF. Renders the manifest hydrated server-side
// (incl. the answer key). Gated by exam.paper.export_pdf.
export default async function PaperPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.paper.export_pdf"))) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const session = await fetchSession(supabase, id);
  if (!session) notFound();
  const paper = await fetchPaperForPrint(supabase, id);
  if (!paper) notFound();

  return (
    <PaperPrint
      title={session.examTitle ?? "Exam"}
      label={session.label}
      durationMinutes={session.durationMinutes ?? 0}
      totalMarks={paper.totalMarks}
      questions={paper.questions}
    />
  );
}
