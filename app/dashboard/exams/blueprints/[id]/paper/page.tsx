import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPaperForPrint } from "@/lib/exam-query";
import { RichContent } from "@/components/exam/RichContent";
import { PageContainer } from "@/components/app-shell/page-container";

const LETTERS = ["A", "B", "C", "D", "E"];

// Read-only view of an exam's generated paper (the fixed question set students
// sit). Reachable from the Exam papers list. RLS bounds who can read the paper.
export default async function ExamPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") ||
    can(ctx, "exam.blueprint.manage") ||
    can(ctx, "exam.results.view_all") ||
    can(ctx, "exam.paper.export_pdf") ||
    can(ctx, "exam.evaluate");
  if (!allowed) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exam").select("title").eq("id", id).maybeSingle();
  const { data: session } = await supabase
    .from("exam_session")
    .select("id")
    .eq("exam_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const paper = session ? await fetchPaperForPrint(supabase, session.id) : null;

  return (
    <PageContainer variant="reading">
      <Link
        href="/dashboard/exams/papers"
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
      >
        ← Exam papers
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{exam?.title ?? "Exam"} — paper</h1>
        {paper && paper.questions.length > 0 && (
          <p className="text-muted-foreground mt-1 text-sm">
            {paper.questions.length} question{paper.questions.length === 1 ? "" : "s"} ·{" "}
            {paper.totalMarks} marks · correct answer marked ✓
          </p>
        )}
      </header>

      {!paper ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No paper yet — publish the exam (Review &amp; publish step) to generate its paper.
        </p>
      ) : paper.questions.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          The paper is generated, but its questions aren&apos;t visible to your account — viewing
          the questions needs question-bank access (platform admin / owner).
        </p>
      ) : (
        <ol className="grid gap-3">
          {paper.questions.map((q, i) => (
            <li key={q.position} className="bg-card rounded-lg border p-4 shadow-sm">
              {q.passageBody && (
                <div className="bg-muted/30 mb-3 rounded-md border p-3 text-sm">
                  {q.passageTitle && <p className="mb-1 font-medium">{q.passageTitle}</p>}
                  <RichContent content={q.passageBody} />
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 tabular-nums">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <RichContent content={q.stem} />
                  <ul className="mt-2 grid gap-1 text-sm">
                    {q.options.map((o, i) => (
                      <li
                        key={i}
                        className={
                          o.isCorrect ? "font-medium text-emerald-700 dark:text-emerald-400" : ""
                        }
                      >
                        {LETTERS[i]}. <RichContent content={o.label} inline />
                        {o.isCorrect ? " ✓" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {q.marks} mark{q.marks === 1 ? "" : "s"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PageContainer>
  );
}
