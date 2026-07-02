"use client";

// Review a student's answers and enter/adjust per-question marks. Loads via
// get_attempt_for_review; saves via set_attempt_marks (both gated to exam
// staff/admins). The correct option(s) and the student's choice are highlighted.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const LETTERS = ["A", "B", "C", "D", "E"];

type Option = { id: string; label: string; is_correct: boolean };
type Question = {
  position: number;
  stem: string;
  explanation: string | null;
  kind: string;
  marks: number;
  awarded_marks: number | null;
  selected_option_ids: string[];
  options: Option[];
};
type Review = {
  attempt_id: string;
  status: string;
  score: number | null;
  name: string | null;
  email: string | null;
  questions: Question[];
};

export function AttemptReview({ attemptId }: { attemptId: string }) {
  const supabase = createClient();
  const [review, setReview] = useState<Review | null>(null);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("get_attempt_for_review", { p_attempt_id: attemptId });
    if (e) return setError(e.message);
    const r = data as Review;
    setReview(r);
    const m: Record<number, string> = {};
    for (const q of r.questions) m[q.position] = q.awarded_marks == null ? "" : String(q.awarded_marks);
    setMarks(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!review) return;
    setError("");
    setSaved(false);
    setSaving(true);
    const payload = review.questions.map((q) => ({
      position: q.position,
      marks: Number(marks[q.position] || 0),
    }));
    const { error: e } = await supabase.rpc("set_attempt_marks", {
      p_attempt_id: attemptId,
      p_marks: payload,
    });
    setSaving(false);
    if (e) return setError(e.message);
    setSaved(true);
    load();
  }

  if (error)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/exams/evaluate">Back</Link>
        </Button>
      </div>
    );
  if (!review) return <p className="text-muted-foreground px-4 py-6 text-sm">Loading…</p>;

  const total = review.questions.reduce((s, q) => s + (Number(marks[q.position]) || 0), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{review.name ?? review.email ?? "Attempt"}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {review.email} · status {review.status} · current total {total}
        </p>
      </header>

      <ol className="grid gap-4">
        {review.questions.map((q) => (
          <li key={q.position}>
            <Card>
              <CardContent className="grid gap-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">
                    <span className="mr-1">{q.position + 1}.</span>
                    <RichContent content={q.stem} inline />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={q.marks}
                      step="0.25"
                      className="w-20"
                      value={marks[q.position] ?? ""}
                      onChange={(e) => setMarks((m) => ({ ...m, [q.position]: e.target.value }))}
                    />
                    <span className="text-muted-foreground text-xs">/ {q.marks}</span>
                  </div>
                </div>
                <ul className="grid gap-1">
                  {q.options.map((o, i) => {
                    const chosen = q.selected_option_ids.includes(o.id);
                    const cls = o.is_correct
                      ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
                      : chosen
                        ? "border-rose-300 bg-rose-50 dark:bg-rose-950/40"
                        : "";
                    return (
                      <li key={o.id} className={`flex items-center gap-2 rounded border p-2 text-sm ${cls}`}>
                        <span className="text-muted-foreground">({LETTERS[i]})</span>
                        <RichContent content={o.label} inline />
                        {o.is_correct && <span className="text-xs text-emerald-700">✓ correct</span>}
                        {chosen && <span className="text-xs">· chosen</span>}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation && (
                  <div className="bg-muted/50 text-muted-foreground rounded border p-3 text-sm">
                    <p className="text-foreground mb-1 text-xs font-semibold">Explanation</p>
                    <RichContent content={q.explanation} />
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save marks"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved · total {review.score}</span>}
        <Button variant="outline" asChild>
          <Link href="/dashboard/exams/evaluate">Back</Link>
        </Button>
      </div>
    </div>
  );
}
