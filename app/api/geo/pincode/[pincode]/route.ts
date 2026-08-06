/**
 * GET /api/geo/pincode/:pincode — resolve a PIN code to its district, state and
 * locality suggestions (issue #101).
 *
 * The PRIMARY path of the address feature: a student types six digits and Step 1 fills
 * itself. Resolved by Google (see lib/geo-provider.ts — it takes two calls, for
 * measured reasons), cached 30 days, and with no local catalogue behind it.
 *
 * Read-only. It never writes to student_profile — the form fills its inputs, the
 * student reviews them, and the existing PATCH /api/registration/profile saves.
 * That keeps the round-trip property and means a crafted response to this
 * endpoint can't rewrite anyone's address.
 *
 * See docs/GEO_ADDRESS.md.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PINCODE_RE } from "@/lib/geo";
import { providerConfigured, providerPincode, sweepProviderCache } from "@/lib/geo-provider";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pincode: string }> },
) {
  const supabase = await createClient();
  // Auth-gated: an open endpoint would be a free PIN-lookup service for the whole
  // internet, billed to us.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { pincode } = await params;
  const pin = (pincode ?? "").trim();
  if (!PINCODE_RE.test(pin)) {
    return NextResponse.json({ error: "A PIN code is 6 digits." }, { status: 400 });
  }

  // Google is the only source (#101 follow-up). There is deliberately no local
  // catalogue to fall back to: a wrong district served from data nobody maintains is
  // worse than asking the student to type four fields.
  // See the note in /api/geo/reverse: never let a provider fault reach the student as a
  // 500 — they are mid-registration and the fields are editable by hand.
  try {
    sweepProviderCache(supabase);
    const result = await providerPincode(supabase, pin);
    if (result) return NextResponse.json({ result, source: "provider" });
  } catch (e) {
    console.error(`[geo] PIN lookup failed for ${pin}`, e);
  }

  return NextResponse.json(
    {
      error: providerConfigured()
        ? "We couldn't look up that PIN code. Please type your district and state."
        : "Address lookup isn't configured. Please type your address.",
    },
    { status: 404 },
  );
}
