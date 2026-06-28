import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllEvaluatorExams, fetchEvaluatorExams } from "@/lib/exam-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Evaluator landing. Blanket evaluators (mentors/employers with exam.evaluate)
// and admins see every exam; per-exam assignees see only their assigned exams.
export default async function EvaluateHomePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const blanket =
    ctx.permissions.has("*") || ctx.roles.includes("platform_admin") || can(ctx, "exam.evaluate");
  if (!blanket && !ctx.examEvaluator) redirect("/dashboard");

  const supabase = await createClient();
  const exams = blanket
    ? await fetchAllEvaluatorExams(supabase)
    : await fetchEvaluatorExams(supabase, ctx.userId);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Exam evaluation</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Exams you can evaluate. Open a sitting to view the answer key, results, and enter marks.
        </p>
      </header>

      {exams.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          You haven&apos;t been assigned to any exams yet.
        </p>
      ) : (
        <div className="grid gap-5">
          {exams.map((e) => (
            <Card key={e.examId}>
              <CardContent className="grid gap-3 pt-6">
                <h2 className="font-semibold">{e.title}</h2>
                {e.sittings.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No sittings yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {e.sittings.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/dashboard/exams/evaluate/session/${s.id}`}
                          className="hover:border-primary/50 flex items-center justify-between rounded-md border p-3 text-sm transition"
                        >
                          <span className="min-w-0 truncate">
                            {s.label} <span className="text-muted-foreground">· {s.mode}</span>
                          </span>
                          <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
