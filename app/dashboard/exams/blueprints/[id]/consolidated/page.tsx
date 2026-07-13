import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBlueprint, fetchRoster, fetchSessions, fetchSubjectMarksByStudent } from "@/lib/exam-query";
import { ConsolidatedResults } from "./consolidated-results";

// Consolidated result gazette for ONE exam (blueprint) across all its sittings/
// batches. Gated by exam.results.view_all (RLS bounds college admins to their
// own college's attempts; owners see all).
export default async function ConsolidatedResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.results.view_all"))) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const blueprint = await fetchBlueprint(supabase, id);
  if (!blueprint) notFound();

  const { data: examRow } = await supabase
    .from("exam")
    .select("title, college:college_id(name)")
    .eq("id", id)
    .maybeSingle();
  const collegeRel = (examRow as { college?: { name: string } | { name: string }[] } | null)?.college;
  const collegeName = Array.isArray(collegeRel) ? (collegeRel[0]?.name ?? "") : (collegeRel?.name ?? "");

  const totalMarks = blueprint.sections.reduce((s, sec) => s + sec.numQuestions * sec.marksPerQuestion, 0);

  const sittings = await fetchSessions(supabase, id);
  const [rosters, marks] = await Promise.all([
    Promise.all(sittings.map((s) => fetchRoster(supabase, s.id))),
    Promise.all(sittings.map((s) => fetchSubjectMarksByStudent(supabase, s.id))),
  ]);

  // All batches share the exam's sections, so union the subject columns (keep
  // first-seen order/max) — resilient if a batch has no graded attempts yet.
  const subjMap = new Map<string, number>();
  for (const m of marks) for (const c of m.subjects) if (!subjMap.has(c.subject)) subjMap.set(c.subject, c.max);
  const subjects = Array.from(subjMap, ([subject, max]) => ({ subject, max }));

  const rows = sittings.flatMap((s, i) =>
    rosters[i].map((r) => ({
      key: `${r.studentId}:${s.id}`,
      name: r.name ?? r.email ?? "—",
      rollNumber: r.rollNumber,
      batch: s.label,
      score: r.score,
      subjects: marks[i].byStudent[r.studentId] ?? {},
    })),
  );

  const printedOn = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <ConsolidatedResults
      collegeName={collegeName}
      examTitle={blueprint.title}
      totalMarks={totalMarks}
      batchCount={sittings.length}
      subjects={subjects}
      rows={rows}
      printedOn={printedOn}
    />
  );
}
