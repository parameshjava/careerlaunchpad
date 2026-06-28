"use client";

// Author or edit a question. Submits through /api/exam/questions (API-first).
// A live <RichContent> preview shows exactly what the student/PDF will render
// (Markdown + LaTeX + code). Editing a question that is already used by a paper
// returns 409 — the bank then asks the author to archive + recreate.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RichContent } from "@/components/exam/RichContent";
import { SearchableSelect } from "@/components/exam/SearchableSelect";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type AnswerType,
  type Chapter,
  type Difficulty,
  type Passage,
  type QuestionKind,
  type Subject,
} from "@/lib/exam-query";

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";
const areaClass =
  "border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

const KINDS: { value: QuestionKind; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "passage", label: "Passage-based" },
  { value: "data_sufficiency", label: "Data sufficiency" },
];

// Convenience prefill for ICET-style data-sufficiency questions.
const DS_OPTIONS = [
  "Statement I alone is sufficient, but statement II alone is not sufficient.",
  "Statement II alone is sufficient, but statement I alone is not sufficient.",
  "Both statements together are sufficient, but neither alone is sufficient.",
  "Each statement alone is sufficient.",
];

type OptionRow = { label: string; is_correct: boolean };
const EMPTY_OPTIONS: OptionRow[] = [
  { label: "", is_correct: false },
  { label: "", is_correct: false },
  { label: "", is_correct: false },
  { label: "", is_correct: false },
];

export function QuestionEditor({
  mode,
  questionId,
  initialSubjectId = "",
}: {
  mode: "new" | "edit";
  questionId?: string;
  initialSubjectId?: string;
}) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);

  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [chapterId, setChapterId] = useState("");
  const [passageId, setPassageId] = useState("");
  const [kind, setKind] = useState<QuestionKind>("standard");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [answerType, setAnswerType] = useState<AnswerType>("single");
  const [stem, setStem] = useState("");
  const [stemImageUrl, setStemImageUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState<OptionRow[]>(EMPTY_OPTIONS);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reference data.
  useEffect(() => {
    fetch("/api/exam/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => {});
  }, []);

  const loadSubjectRefs = useCallback(async (sid: string) => {
    if (!sid) {
      setChapters([]);
      setPassages([]);
      return;
    }
    const [c, p] = await Promise.all([
      fetch(`/api/exam/chapters?subject_id=${sid}`).then((r) => r.json()),
      fetch(`/api/exam/passages?subject_id=${sid}`).then((r) => r.json()),
    ]);
    setChapters(c.chapters ?? []);
    setPassages(p.passages ?? []);
  }, []);

  useEffect(() => {
    loadSubjectRefs(subjectId);
  }, [subjectId, loadSubjectRefs]);

  // On edit, hydrate from the existing question.
  useEffect(() => {
    if (mode !== "edit" || !questionId) return;
    fetch(`/api/exam/questions/${questionId}`)
      .then((r) => r.json())
      .then((d) => {
        const q = d.question;
        if (!q) {
          setError("Question not found");
          return;
        }
        setSubjectId(q.subjectId);
        setChapterId(q.chapterId);
        setPassageId(q.passageId ?? "");
        setKind(q.kind);
        setDifficulty(q.difficulty);
        setAnswerType(q.answerType);
        setStem(q.stem);
        setStemImageUrl(q.stemImageUrl ?? "");
        setExplanation(q.explanation ?? "");
        const opts: OptionRow[] = (q.options ?? []).map((o: { label: string; isCorrect: boolean }) => ({
          label: o.label,
          is_correct: o.isCorrect,
        }));
        while (opts.length < 4) opts.push({ label: "", is_correct: false });
        setOptions(opts.slice(0, 5));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [mode, questionId]);

  function setOptionLabel(i: number, label: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, label } : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length >= 5 ? prev : [...prev, { label: "", is_correct: false }]));
  }

  function removeOption(i: number) {
    setOptions((prev) => (prev.length <= 4 ? prev : prev.filter((_, j) => j !== i)));
  }

  function toggleCorrect(i: number) {
    setOptions((prev) =>
      prev.map((o, j) => {
        if (j === i) return { ...o, is_correct: !o.is_correct };
        // Single-answer: selecting one clears the others.
        if (answerType === "single") return { ...o, is_correct: false };
        return o;
      }),
    );
  }

  function chooseKind(k: QuestionKind) {
    setKind(k);
    if (k === "data_sufficiency" && options.every((o) => !o.label.trim())) {
      setOptions(DS_OPTIONS.map((label) => ({ label, is_correct: false })));
    }
  }

  async function save() {
    setError("");
    setSaving(true);
    const body = {
      chapter_id: chapterId,
      passage_id: passageId || null,
      kind,
      difficulty,
      answer_type: answerType,
      stem,
      stem_image_url: stemImageUrl || null,
      explanation: explanation || null,
      options,
    };
    const url = mode === "edit" ? `/api/exam/questions/${questionId}` : "/api/exam/questions";
    const res = await fetch(url, {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError((data.errors as string[])?.join("; ") || data.error || "Could not save");
      return;
    }
    router.push("/dashboard/questions");
    router.refresh();
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const passagesForKind = kind === "passage" ? passages : [];

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <select
              id="subject"
              className={selectClass}
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setChapterId("");
                setPassageId("");
              }}
            >
              <option value="">Select…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="chapter">Chapter</Label>
            <SearchableSelect
              id="chapter"
              options={chapters.map((c) => ({ value: c.id, label: c.name }))}
              value={chapterId}
              onChange={setChapterId}
              placeholder="Select…"
              searchPlaceholder="Search chapters…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kind">Kind</Label>
            <select
              id="kind"
              className={selectClass}
              value={kind}
              onChange={(e) => chooseKind(e.target.value as QuestionKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="difficulty">Difficulty</Label>
            <select
              id="difficulty"
              className={selectClass}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="answer-type">Answer type</Label>
            <select
              id="answer-type"
              className={selectClass}
              value={answerType}
              onChange={(e) => setAnswerType(e.target.value as AnswerType)}
            >
              <option value="single">Single correct</option>
              <option value="multi">Multiple correct</option>
            </select>
          </div>
          {kind === "passage" && (
            <div className="grid gap-1.5">
              <Label htmlFor="passage">Passage</Label>
              <select
                id="passage"
                className={selectClass}
                value={passageId}
                onChange={(e) => setPassageId(e.target.value)}
              >
                <option value="">Select a passage…</option>
                {passagesForKind.map((p) => (
                  <option key={p.id} value={p.id}>{p.title ?? p.body.slice(0, 40)}</option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stem + live preview */}
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="stem">Question (Markdown · LaTeX with $…$ · code)</Label>
            <textarea
              id="stem"
              className={areaClass}
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              placeholder="What is the value of $\\frac{1}{2} + \\frac{1}{3}$?"
            />
            <Label htmlFor="stem-image" className="mt-2 text-xs">Image URL (optional)</Label>
            <Input
              id="stem-image"
              value={stemImageUrl}
              onChange={(e) => setStemImageUrl(e.target.value)}
              placeholder="R2 object key or URL"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Preview</Label>
            <div className="bg-muted/30 min-h-24 rounded-md border p-3">
              {stem.trim() ? (
                <RichContent content={stem} />
              ) : (
                <span className="text-muted-foreground text-sm">Nothing to preview yet.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <div>
            <h2 className="text-sm font-semibold">Options</h2>
            <p className="text-muted-foreground text-xs">
              4 or 5 options. Tick the correct one{answerType === "multi" ? "(s)" : ""}.
            </p>
          </div>
          {options.map((o, i) => (
            <div key={i} className="flex items-start gap-3">
              <label className="mt-2 flex shrink-0 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={o.is_correct}
                  onChange={() => toggleCorrect(i)}
                />
                <span className="text-muted-foreground">{String.fromCharCode(65 + i)}</span>
              </label>
              <div className="grid flex-1 gap-1">
                <Input
                  value={o.label}
                  onChange={(e) => setOptionLabel(i, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                />
                {o.label.trim() && (
                  <div className="text-muted-foreground px-1 text-xs">
                    <RichContent content={o.label} inline />
                  </div>
                )}
              </div>
              {options.length > 4 && (
                <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => removeOption(i)}>
                  ✕
                </Button>
              )}
            </div>
          ))}
          {options.length < 5 && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                Add 5th option
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Explanation */}
      <Card>
        <CardContent className="grid gap-1.5 pt-6">
          <Label htmlFor="explanation">Explanation (optional)</Label>
          <textarea
            id="explanation"
            className={areaClass}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create question"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/dashboard/questions")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
