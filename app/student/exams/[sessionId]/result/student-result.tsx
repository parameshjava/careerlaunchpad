"use client";

// The student's own result, fetched via get_exam_result (SECURITY DEFINER RPC,
// gated on results_published). Shows the score and a per-question breakdown with
// the correct answer revealed and the student's choice marked.
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ResultOption = { id: string; label: string; is_correct: boolean };
type ResultQuestion = {
  position: number;
  stem: string;
  awarded_marks: number | null;
  selected_option_ids: string[];
  options: ResultOption[];
};
type Result =
  | { published: false }
  | { published: true; score: number; status: string; questions: ResultQuestion[] };

export function StudentResult({ sessionId }: { sessionId: string }) {
  const supabase = createClient();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .rpc("get_exam_result", { p_session_id: sessionId })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) setError(rpcErr.message);
        else setResult(data as Result);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (error)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/student/exams">Back to my exams</Link>
        </Button>
      </div>
    );

  if (!result) return <p className="text-muted-foreground px-4 py-6 text-sm">Loading…</p>;

  if (!result.published)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm">Your exam has been submitted. Results aren&apos;t published yet.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/student/exams">Back to my exams</Link>
        </Button>
      </div>
    );

  const total = result.questions.reduce((sum, q) => sum + (q.awarded_marks ?? 0), 0);
  const correctCount = result.questions.filter((q) => (q.awarded_marks ?? 0) > 0).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Your result</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Score {total} · {correctCount} / {result.questions.length} correct
        </p>
      </header>

      <ol className="grid gap-4">
        {result.questions.map((q) => {
          const got = (q.awarded_marks ?? 0) > 0;
          return (
            <li key={q.position}>
              <Card>
                <CardContent className="grid gap-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">
                      <span className="mr-1">{q.position + 1}.</span>
                      <RichContent content={q.stem} inline />
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${got ? "text-emerald-600" : "text-destructive"}`}>
                      {got ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                  <ul className="grid gap-1">
                    {q.options.map((o) => {
                      const chosen = q.selected_option_ids.includes(o.id);
                      const cls = o.is_correct
                        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
                        : chosen
                          ? "border-rose-300 bg-rose-50 dark:bg-rose-950/40"
                          : "";
                      return (
                        <li key={o.id} className={`flex items-center gap-2 rounded border p-2 text-sm ${cls}`}>
                          <RichContent content={o.label} inline />
                          {o.is_correct && <span className="text-xs text-emerald-700">✓ correct</span>}
                          {chosen && !o.is_correct && <span className="text-xs text-rose-700">your choice</span>}
                          {chosen && o.is_correct && <span className="text-xs text-emerald-700">your choice</span>}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <Button className="mt-6" variant="outline" asChild>
        <Link href="/student/exams">Back to my exams</Link>
      </Button>
    </div>
  );
}
