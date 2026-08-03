// A student's own chapter-quiz attempt.
//
//   GET   -> { questions: [{ position, questionId, stem, stemImageUrl, answerType,
//                            source, sourceYear, options:[{id,label}],
//                            selected:[optionId] }] }
//   PATCH  body { answers: [{ position, option_ids:[uuid] }] } -> { ok }
//
// get_chapter_quiz_attempt returns a flat row-per-option shape (no is_correct);
// group it into questions here. Both RPCs enforce attempt ownership (auth.uid()).
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";

type Row = {
  q_position: number;
  question_id: string;
  stem: string;
  stem_image_url: string | null;
  answer_type: "single" | "multi";
  source: string | null;
  source_year: number | null;
  option_id: string;
  option_label: string;
  option_position: number;
  selected: boolean;
};

async function gate() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "chapter.quiz.take"))
    return null;
  if (!(await isStudentApproved(ctx.userId))) return null;
  return ctx;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  if (!(await gate())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { attemptId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_chapter_quiz_attempt", { p_attempt_id: attemptId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const byQ = new Map<
    number,
    {
      position: number;
      questionId: string;
      stem: string;
      stemImageUrl: string | null;
      answerType: "single" | "multi";
      source: string | null;
      sourceYear: number | null;
      options: { id: string; label: string }[];
      selected: string[];
    }
  >();
  for (const r of rows) {
    let q = byQ.get(r.q_position);
    if (!q) {
      q = {
        position: r.q_position,
        questionId: r.question_id,
        stem: r.stem,
        stemImageUrl: r.stem_image_url ?? null,
        answerType: r.answer_type,
        // Past paper the question came from (#87) — shown to the student in the runner.
        source: r.source ?? null,
        sourceYear: r.source_year ?? null,
        options: [],
        selected: [],
      };
      byQ.set(r.q_position, q);
    }
    q.options.push({ id: r.option_id, label: r.option_label });
    if (r.selected) q.selected.push(r.option_id);
  }
  const questions = [...byQ.values()].sort((a, b) => a.position - b.position);
  if (questions.length === 0)
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  // The attempt's start time + the chapter's time limit drive the runner's timer.
  // chapter_quiz_attempt is self-readable (RLS); duration defaults to 30 min.
  const { data: att } = await supabase
    .from("chapter_quiz_attempt")
    .select("started_at, chapter_id")
    .eq("id", attemptId)
    .maybeSingle();
  let durationMinutes = 30;
  if (att?.chapter_id) {
    const { data: cfg } = await supabase
      .from("chapter_quiz")
      .select("duration_minutes")
      .eq("chapter_id", att.chapter_id)
      .eq("status", "active")
      .maybeSingle();
    durationMinutes = (cfg?.duration_minutes as number | null) ?? 30;
  }
  return NextResponse.json({
    questions,
    startedAt: att?.started_at ?? null,
    durationMinutes,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  if (!(await gate())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { attemptId } = await params;

  let body: { answers?: { position: number; option_ids: string[] }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const answers = Array.isArray(body.answers) ? body.answers : [];

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_chapter_quiz_answers", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
