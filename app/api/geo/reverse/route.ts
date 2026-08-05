/**
 * GET /api/geo/reverse?lat=&lng=&accuracy= — turn a GPS fix or a dropped map pin into
 * address candidates (issue #101).
 *
 * GOOGLE IS THE ONLY SOURCE. The earlier nearest-centroid implementation over a local
 * PIN catalogue is retired because it could not be made right: it put
 * a student standing in Varthur into Bellandur, since 560087's centroid was dragged
 * 9.6 km away by one mislocated post office. Google resolves the actual point.
 *
 * IT RETURNS CANDIDATES, NOT AN ANSWER — but for a different reason than before. The
 * geocoder is confident about WHERE the point is; what it cannot know is whether that
 * point is the student's HOME. A phone in a hostel or a coaching centre is not.
 *
 * Coordinates are used and discarded. Nothing here logs or stores a lat/lng. The only
 * coordinates persisted anywhere are a pin the student deliberately placed
 * (student_profile.latitude/longitude, migration 163) — their own data, not Google's.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_ACCURACY_M, isInIndia } from "@/lib/geo";
import { providerConfigured, providerReverse, sweepProviderCache } from "@/lib/geo-provider";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const accuracyRaw = sp.get("accuracy");
  const accuracyM = accuracyRaw == null || accuracyRaw === "" ? null : Number(accuracyRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required numbers." }, { status: 400 });
  }
  if (!isInIndia(lat, lng)) {
    // Not an error the student caused — they may genuinely be abroad.
    return NextResponse.json(
      { error: "out_of_range", message: "That location is outside India, so we can't match a PIN code." },
      { status: 422 },
    );
  }
  // A wifi/IP-derived fix, not GPS: it can be a whole city out, and prefilling from it
  // would write the wrong district into the field this feature exists to clean up.
  // Only applies to a GPS reading — a map pin sends no accuracy, because the student
  // placed it deliberately on a map they could see.
  if (accuracyM != null && Number.isFinite(accuracyM) && accuracyM > MAX_ACCURACY_M) {
    return NextResponse.json(
      {
        error: "accuracy_too_low",
        message: "Your location isn't precise enough to fill in an address. Please enter your PIN code.",
        accuracyM,
      },
      { status: 422 },
    );
  }

  sweepProviderCache(supabase);
  const candidates = await providerReverse(supabase, lat, lng);
  if (!candidates || candidates.length === 0) {
    return NextResponse.json(
      {
        error: providerConfigured() ? "no_match" : "not_configured",
        message: providerConfigured()
          ? "We couldn't work out the address for that spot. Please enter your PIN code."
          : "Address lookup isn't configured. Please enter your address.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    source: "provider",
    // The geocoder resolved the point itself rather than the centre of a postal area,
    // so distance is not a source of doubt here — hence 0 and "high". The UI still
    // asks, because "where the phone is" and "where the student lives" differ.
    confidence: "high",
    candidates: candidates.map((c) => ({ ...c, distanceKm: 0, confidence: "high" as const })),
  });
}
