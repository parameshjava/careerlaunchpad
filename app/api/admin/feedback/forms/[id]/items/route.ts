// The questions on one DRAFT version of the instrument (issue #84 §F9, migration 170).
//
//   PUT body { items: [{ dimension_key, prompt, short_label?, item_group,
//                        response_type, choices?, required?, allow_na? }] } -> { items }
//
// REPLACE, not patch. The array's order IS sort_order, so a reorder is the same call as
// an edit and no two items can end up claiming one slot. Writes go through the table
// under RLS (feedback.form.manage) — the *invariant* that matters here isn't a
// permission, it's that a published version can never be touched, and migration 170
// enforces that with a trigger no route can bypass.
//
// Answers reference item ids, so replacing a draft's items cannot corrupt history:
// a draft has no answers, and a published version cannot reach this endpoint.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toFormItem, toItemRow, type FormItemDraft } from "@/lib/feedback-forms";

const GROUPS = ["teaching", "content", "logistics", "screening"];
const TYPES = ["rating5", "choice"];
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
const PROMPT_MAX = 300;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.form.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { items?: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.items))
    return NextResponse.json({ error: "items must be an array" }, { status: 422 });

  const items: FormItemDraft[] = body.items.map(toFormItem);
  const seen = new Set<string>();
  for (const [n, i] of items.entries()) {
    const where = `Question ${n + 1}`;
    // dimension_key is what a score is reported under and what a future version is
    // compared against, so it is a slug, not prose.
    if (!KEY_RE.test(i.dimensionKey))
      return NextResponse.json(
        { error: `${where}: key must be lowercase letters, digits and underscores (e.g. "pace")` },
        { status: 422 },
      );
    if (seen.has(i.dimensionKey))
      return NextResponse.json({ error: `Duplicate key "${i.dimensionKey}"` }, { status: 422 });
    seen.add(i.dimensionKey);
    if (!i.prompt.trim() || i.prompt.length > PROMPT_MAX)
      return NextResponse.json(
        { error: `${where}: a prompt is required (up to ${PROMPT_MAX} characters)` },
        { status: 422 },
      );
    if (!GROUPS.includes(i.itemGroup))
      return NextResponse.json({ error: `${where}: unknown group` }, { status: 422 });
    if (!TYPES.includes(i.responseType))
      return NextResponse.json({ error: `${where}: unknown response type` }, { status: 422 });
    if (i.responseType === "choice" && (i.choices ?? []).filter((c) => c.trim()).length < 2)
      return NextResponse.json(
        { error: `${where}: a choice question needs at least two options` },
        { status: 422 },
      );
  }
  // §F8/§4.2: six items plus the screener is the shape that takes ~45 seconds. The cap
  // is generous rather than exact — the reason to keep it short is response rate, and
  // that argument stops being about a number somewhere past a dozen.
  if (items.length > 12)
    return NextResponse.json(
      { error: "Keep it to 12 questions or fewer — a long form is an unanswered form" },
      { status: 422 },
    );

  const supabase = await createClient();

  // Delete-then-insert. Not a transaction: PostgREST has no multi-statement call, so a
  // failed insert would leave the draft empty. Acceptable precisely because this is a
  // DRAFT — nothing depends on it, and the screen re-fetches and shows what landed.
  const { error: dErr } = await supabase.from("feedback_form_item").delete().eq("form_id", id);
  if (dErr) return fail(dErr.message);

  if (items.length === 0) return NextResponse.json({ items: [] });

  const { data, error } = await supabase
    .from("feedback_form_item")
    .insert(items.map((i, n) => toItemRow(i, id, n)))
    .select(
      "id, dimension_key, prompt, short_label, item_group, sort_order, response_type, choices, required, allow_na",
    );
  if (error) return fail(error.message);
  return NextResponse.json({ items: (data ?? []).map(toFormItem) });
}

function fail(message: string) {
  const msg = message.replace(/^.*?:\s*/, "");
  return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 422 });
}
