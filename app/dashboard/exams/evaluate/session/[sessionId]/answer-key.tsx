"use client";

// Collapsible answer key for a sitting, loaded on demand via the get_exam_answer_key
// RPC (gated to exam staff/admins). Shows each question's stem and which options
// are correct.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RichContent } from "@/components/exam/RichContent";

const LETTERS = ["A", "B", "C", "D", "E"];
type Q = {
  position: number;
  stem: string;
  options: { label: string; is_correct: boolean }[];
};

export function AnswerKey({ sessionId }: { sessionId: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (questions) return;
    const { data, error: e } = await supabase.rpc("get_exam_answer_key", { p_session_id: sessionId });
    if (e) return setError(e.message);
    setQuestions((data?.questions ?? []) as Q[]);
  }

  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Answer key</h2>
          <Button variant="outline" size="sm" onClick={toggle}>
            {open ? "Hide" : "Show answer key"}
          </Button>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {open && questions && (
          <ol className="grid gap-3">
            {questions.map((q) => (
              <li key={q.position} className="text-sm">
                <div className="flex gap-2 font-medium">
                  <span>{q.position + 1}.</span>
                  <RichContent content={q.stem} inline />
                </div>
                <ul className="mt-1 grid gap-0.5 pl-6">
                  {q.options.map((o, i) => (
                    <li
                      key={i}
                      className={o.is_correct ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}
                    >
                      ({LETTERS[i]}) <RichContent content={o.label} inline />
                      {o.is_correct && " ✓"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
