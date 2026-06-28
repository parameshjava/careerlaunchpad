import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnswerKey } from "./answer-key";

type Result = {
  student_id: string;
  name: string | null;
  email: string | null;
  roster_status: string;
  attempt_id: string | null;
  attempt_status: string | null;
  score: number | null;
};

// Evaluator view of one sitting: roster + scores, an answer-key viewer, and a
// link into each attempt to review answers and adjust marks. Data comes from
// get_exam_session_results (SECURITY DEFINER, gated to exam staff/admins).
export default async function EvaluateSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const { sessionId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_exam_session_results", { p_session_id: sessionId });
  if (error) {
    // Forbidden (not staff for this exam) or missing.
    if (/forbidden/i.test(error.message)) redirect("/dashboard/exams/evaluate");
    notFound();
  }
  const results = (data?.results ?? []) as Result[];
  const submitted = results.filter((r) => r.roster_status === "submitted").length;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Sitting results</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {results.length} assigned · {submitted} submitted
        </p>
      </header>

      <div className="mb-6">
        <AnswerKey sessionId={sessionId} />
      </div>

      <Card>
        <CardContent className="grid gap-2 pt-6">
          <h2 className="text-sm font-semibold">Participants</h2>
          {results.length === 0 ? (
            <p className="text-muted-foreground text-sm">No participants assigned.</p>
          ) : (
            <ul className="grid gap-2">
              {results.map((r) => {
                const inner = (
                  <div className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{r.name ?? r.email ?? r.student_id}</div>
                      <div className="text-muted-foreground text-xs">{r.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{r.attempt_status ?? r.roster_status}</Badge>
                      <span className="tabular-nums font-medium">{r.score ?? "—"}</span>
                    </div>
                  </div>
                );
                return (
                  <li key={r.student_id}>
                    {r.attempt_id ? (
                      <Link href={`/dashboard/exams/evaluate/attempt/${r.attempt_id}`} className="block hover:opacity-80">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
