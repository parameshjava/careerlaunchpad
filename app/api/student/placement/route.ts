/**
 * The current student's employment / placement status — the "I got a job" record
 * behind the student -> mentor conversion (migration 018). Self-service: rides
 * student_profile's self-RLS (own row only), so no extra permission is needed.
 *
 *   GET   -> { employment_status, placement }
 *   PATCH -> body { employment_status?, placement? }. placement is a small blob
 *            { company, title, location, type, offer_date }. Lenient validation.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["seeking", "placed", "higher_studies", "other"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("student_profile")
    .select("employment_status, placement")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    employment_status: data?.employment_status ?? "seeking",
    placement: data?.placement ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { employment_status?: string; placement?: Record<string, unknown> | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.employment_status !== undefined) {
    if (!STATUSES.includes(body.employment_status)) {
      return NextResponse.json({ error: "invalid employment_status" }, { status: 422 });
    }
    patch.employment_status = body.employment_status;
  }

  if (body.placement !== undefined) {
    if (body.placement === null) {
      patch.placement = null;
    } else if (typeof body.placement !== "object" || Array.isArray(body.placement)) {
      return NextResponse.json({ error: "placement must be an object" }, { status: 422 });
    } else {
      const p = body.placement as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "") || null;
      const type = str(p.type);
      patch.placement = {
        company: str(p.company),
        title: str(p.title),
        location: str(p.location),
        type: type === "internship" || type === "full_time" ? type : null,
        offer_date: str(p.offer_date),
      };
    }
  }

  const { error } = await supabase
    .from("student_profile")
    .update(patch)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
