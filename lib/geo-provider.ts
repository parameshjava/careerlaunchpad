/**
 * Address resolution via Google Maps Platform — the ONLY source (issue #101
 * follow-up). SERVER ONLY: importing this into a client component would ship the API
 * key to the browser.
 *
 * NO LOCAL PIN CATALOGUE, deliberately. We are not in the business of curating Indian
 * geodata, and an earlier cut of this feature proved why — see docs/GEO_ADDRESS.md §6.
 * A failure here degrades to the student typing their address, never to stale data.
 *
 * WHY A PROVIDER AT ALL, AFTER #101 BUILT THE OPPOSITE
 *   The self-hosted catalogue works but does not converge. India Post spells
 *   Varthur "Vartur", 9.5% of its coordinates are wrong, 390 PINs had to lose
 *   their coordinates entirely, and AP keeps redrawing districts — measured
 *   ceiling 91% district / 65% exact PIN. Indexing individual post offices fixed
 *   one reported case and made the average worse (65% → 56%). Curating geodata is
 *   not our business.
 *
 * THE SHAPE THAT MADE THIS SWAP CHEAP
 *   The form only ever talks to /api/geo/{pincode,search,reverse}. Those three
 *   handlers are the seam, so the provider changes here and NO UI changes at all —
 *   which is the whole payoff of CLAUDE.md's "design the API contract first".
 *
 * THREE THINGS THE LICENCE DICTATES, not preference
 *   1. Geocoded lat/lng may be cached at most 30 consecutive days (Service
 *      Specific Terms). geo_provider_cache enforces it; do not raise the TTL.
 *   2. Geocoding Content must NOT be shown alongside a non-Google map. That is
 *      why the pin-drop map is Google Maps and the MapLibre/OSM basemap from the
 *      first cut is gone.
 *   3. Coordinates Google returns are never written to student_profile. The
 *      lat/lng stored there is a pin the STUDENT placed — their own data.
 *
 * THE CACHE IS REACHED WITH THE ADMIN CLIENT, DELIBERATELY
 *   geo_provider_cache and geo_provider_usage are server infrastructure, not user
 *   data — cached provider responses and a spend counter. They carry RLS with no
 *   policies and grants to service_role only (migration 163), because granting
 *   `authenticated` would let any signed-in student read our provider responses
 *   and, worse, forge the counter to unlock unlimited billable calls. The callers
 *   callers pass their own RLS-bound client for auth, but everything cache- and
 *   budget-related here uses the admin client instead.
 *
 * EVERY FAILURE DEGRADES TO TYPING, NEVER BLOCKS
 *   No key, quota exhausted, provider down, malformed response → the endpoint says so
 *   and the student types their address by hand. There is deliberately no stale local
 *   copy to fall back to: serving a wrong district from data nobody maintains is worse
 *   than asking for four fields. A student is never blocked from registering.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PincodeRecord } from "@/lib/geo";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
// Places API (NEW) hosts, not maps.googleapis.com/maps/api/place/*. The legacy
// endpoints CANNOT BE ENABLED ON A NEW GOOGLE CLOUD PROJECT at all (legacy Places
// went closed to new customers on 1 March 2025), so a first-time setup would have
// got REQUEST_DENIED from the old URLs no matter how the key was configured.
// Geocoding is unaffected — maps/api/geocode/json is current and is an Essentials SKU.
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

/**
 * Monthly call ceiling per SKU. Default 9,500 against Google's 10,000 free
 * Essentials allowance — deliberately under, so the free tier is never breached
 * by our own traffic and a surprise invoice is impossible.
 *
 * This is the SECOND line of defence. The first is a hard quota cap set in the
 * Google Cloud console, which is the only control that can actually stop billing;
 * a counter in our database cannot stop a request we never make.
 */
const MONTHLY_CAP = Number(process.env.GEO_PROVIDER_MONTHLY_CAP ?? 9500);

/** Server-only key. Note the absence of NEXT_PUBLIC_ — that is the point. */
const KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? "";

export const providerConfigured = () => KEY !== "";

type Kind = "pincode" | "reverse" | "autocomplete" | "details";

/** Lazily built, and only when a provider key exists — so a deployment with no
 * Google key never requires SUPABASE_SECRET_KEY just to serve the fallback. */
let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  adminClient ??= createAdminClient();
  return adminClient;
}

/** One Google address_components array, reduced to the fields we store. */
type Parsed = {
  pincode: string | null;
  district: string | null;
  state: string | null;
  /** Village / mandal / city — the settlement name. */
  locality: string | null;
  /** The whole human-ordered address line, from Google's formatted_address — what the
   * single Address field is prefilled with. */
  address: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * An address component from EITHER API. Geocoding returns snake_case
 * (`long_name`); Places API (New) returns camelCase (`longText`). Same data, two
 * spellings, and a parser that only knew one silently produced blank districts.
 */
type Component = {
  long_name?: string;
  short_name?: string;
  longText?: string;
  shortText?: string;
  types: string[];
};

/**
 * Map Google's address_components onto our fields.
 *
 * INDIA'S ADMIN LEVELS ARE NOT WHAT THE DOCS' EUROPEAN EXAMPLES SUGGEST.
 * Measured against the live API rather than assumed — the first version of this
 * function preferred level_2 and produced a district of "Bangalore Division" for a
 * student in Varthur:
 *
 *   Varthur, Karnataka      level_1 Karnataka
 *                           level_2 "Bangalore Division"   ← a REVENUE DIVISION,
 *                                                            a group of districts
 *                           level_3 "Bengaluru Urban"      ← the actual district
 *   Tenali, Andhra Pradesh  level_1 Andhra Pradesh
 *                           level_2  (absent)
 *                           level_3 "Guntur"               ← the actual district
 *
 * So **level_3 is the district** and level_2 is either a division or missing. We
 * prefer level_3, and only fall back to level_2 when it is not obviously a division.
 *
 * For the village/city field we want the name a student would recognise and write.
 * At Varthur, `locality` is "Bengaluru" (the whole city) while `neighborhood` is
 * "Varthur" — so the more specific components come first.
 */
function parseComponents(components: Component[], geometry?: { lat: number; lng: number }): Parsed {
  const pick = (type: string) => {
    const c = components.find((x) => x.types.includes(type));
    return c ? (c.long_name ?? c.longText ?? null) : null;
  };

  const level2 = pick("administrative_area_level_2");
  // "Bangalore Division", "Belgaum Division"… are groupings of districts, never a
  // district. Using one would put every Bengaluru student in the same "district" and
  // silently break the district-keyed matching and analytics this data feeds.
  const level2IsDivision = !!level2 && /\bdivision\b/i.test(level2);

  return {
    pincode: pick("postal_code"),
    district:
      pick("administrative_area_level_3") ??
      (level2IsDivision ? null : level2) ??
      pick("locality"),
    state: pick("administrative_area_level_1"),
    // The settlement a student would name: "Varthur" (a neighborhood of Bengaluru),
    // or "Tenali" (a locality in its own right).
    locality: pick("neighborhood") ?? pick("locality") ?? pick("administrative_area_level_3"),
    // Filled by the callers from formatted_address, not from components — see
    // formatAddressLine().
    address: null,
    lat: geometry?.lat ?? null,
    lng: geometry?.lng ?? null,
  };
}

/**
 * Flatten the components of EVERY result into one list, closest result first.
 *
 * ONLY SAFE FOR THE COARSE FIELDS — district and state. Reverse geocoding returns
 * several results describing the same point at different granularities, and while the
 * administrative ones agree across all of them, THE FINE NAMES DO NOT:
 *
 *   Tenali  result[0]  sublocality "Chenchupet", locality "Tenali"   ← the real answer
 *           result[2]  postal_code 522202, neighborhood "Kancherlapalem"
 *
 * Merging and taking the first `neighborhood` therefore yields "Kancherlapalem" — a
 * different settlement — as the student's village. Measured, after it happened.
 *
 * So: coarse fields from the merge (result[0] often omits them), fine fields from
 * result[0] alone (it is the closest match). See fetchReverse.
 */
function mergeComponents(results: { address_components: Component[] }[]): Component[] {
  return results.flatMap((r) => r.address_components ?? []);
}

/** A cache hit, or null. Expired rows are ignored (and swept opportunistically). */
async function fromCache<T>(_supabase: SupabaseClient, key: string): Promise<T | null> {
  const { data } = await admin()
    .from("geo_provider_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data?.payload as T) ?? null;
}

async function toCache(_supabase: SupabaseClient, key: string, kind: Kind, payload: unknown) {
  // Errors here are deliberately ignored: a cache write failing must not fail the
  // request the student is waiting on.
  await admin().from("geo_provider_cache").upsert(
    {
      cache_key: key,
      kind,
      payload,
      // Recomputed on every write so a refreshed value gets a fresh 30 days rather
      // than inheriting the original row's expiry.
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    { onConflict: "cache_key" },
  );
}

/** Claim one call against the monthly budget. False → caller must fall back. */
async function budgetAllows(_supabase: SupabaseClient, kind: Kind): Promise<boolean> {
  const { data, error } = await admin().rpc("geo_provider_take", {
    p_kind: kind,
    p_cap: MONTHLY_CAP,
  });
  // A broken counter must not silently unlock unlimited spend, so failure is
  // treated as "no budget" rather than "carry on".
  if (error) return false;
  return data === true;
}

async function getJson(
  url: string,
  headers?: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers,
      // Registration is interactive; a slow geocoder should fall back rather than
      // hold the student on a spinner.
      signal: AbortSignal.timeout(4000),
      // Never let Next cache a keyed provider URL into the build output.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function postJson(
  url: string,
  payload: unknown,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * PIN code → district / state / locality.
 *
 * TWO CALLS, AND THE SECOND ONE IS THE POINT.
 * A `components=postal_code:X` geocode is nearly useless on its own — measured
 * against the live API:
 *
 *   522201 (Tenali)  → locality "Tenali", state AP.  NO DISTRICT AT ALL.
 *   560087 (Varthur) → locality "Bengaluru", level_2 "Bangalore Division". No district.
 *
 * But it DOES return a `geometry.location`, and a reverse lookup at that point returns
 * the full detail. Chained, Google alone gets every case right, including one our own
 * catalogue had 300 km out:
 *
 *   522201 → Guntur, Andhra Pradesh        560087 → Bengaluru Urban, Karnataka
 *   583286 → Koppal, Karnataka
 *
 * Both legs are cached for 30 days under this PIN's key, so the second call is paid
 * once per PIN per month, not once per student.
 */
export async function providerPincode(
  supabase: SupabaseClient,
  pin: string,
): Promise<PincodeRecord | null> {
  if (!KEY) return null;
  const key = `pincode:${pin}`;
  const cached = await fromCache<PincodeRecord>(supabase, key);
  if (cached) return cached;
  if (!(await budgetAllows(supabase, "pincode"))) return null;

  const url = `${GEOCODE_URL}?components=postal_code:${encodeURIComponent(pin)}|country:IN&key=${KEY}`;
  const body = await getJson(url);
  const results = (body?.results ?? []) as {
    address_components: Component[];
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  }[];
  if (body?.status !== "OK" || results.length === 0) return null;

  const thin = parseComponents(results[0].address_components);
  const loc = results[0].geometry?.location;

  let record: PincodeRecord | null = null;
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    const hit = await fetchReverse(supabase, loc.lat, loc.lng);
    // Only trust the point lookup if it landed on the PIN we asked about — a postal
    // code centroid can sit just outside its own area, and silently returning the
    // neighbour's district would be the exact class of bug this replaced.
    if (hit && (hit.pins.includes(pin) || hit.pins.length === 0)) {
      record = recordFrom(hit.merged, pin);
    }
  }
  // Fall back to the thin result rather than nothing: a state and a locality still
  // save the student typing, and the fields are editable.
  record ??= recordFrom(
    { ...thin, address: stripPlusCode(results[0].formatted_address) },
    thin.pincode ?? pin,
  );
  if (!record.district && !record.state) return null;

  await toCache(supabase, key, "pincode", record);
  return record;
}

async function fetchReverse(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
): Promise<{ merged: Parsed; pins: string[] } | null> {
  if (!(await budgetAllows(supabase, "reverse"))) return null;

  // NO result_type FILTER, deliberately — this is what fixes the "Address field only
  // says Bengaluru" bug. The filter excluded `street_address` and `premise`, which are
  // exactly the results carrying the detail a single free-text address field wants.
  // Measured at the same coordinates, filtered vs unfiltered:
  //
  //   a field near Varthur : "Bengaluru"
  //                        → "124/4, beside Vagdevi Vilas School, Bengaluru"
  //   Tenali               : "Chenchupet, Tenali"
  //                        → "8-19-110, Chenchupet, Tenali"
  //
  // Same single call, same cost; ~14 results instead of ~4. The filter was there to
  // keep out one anomalous foreign result, which the state check below handles far more
  // precisely.
  const url = `${GEOCODE_URL}?latlng=${lat},${lng}&key=${KEY}`;
  const body = await getJson(url);
  const results = (body?.results ?? []) as {
    address_components: Component[];
    formatted_address?: string;
  }[];
  if (body?.status !== "OK" || results.length === 0) return null;

  // Google returns reverse-geocode results MOST SPECIFIC FIRST, so with the filter gone
  // results[0] is the actual nearest address — house number, landmark and all.
  const best = results[0];
  const nearest = parseComponents(best.address_components ?? []);

  // Coarse (district/state) from the other results, because results[0] often omits
  // them — but ONLY from results in the same state.
  //
  // That guard is not theoretical: an unfiltered lookup at a Bengaluru point returned
  // a MUMBAI street address among its results (Google data, not our bug). Merging it in
  // would have written Maharashtra over Karnataka. Comparing against results[0]'s state
  // is a cheap, precise way to drop it — and it is why removing the result_type filter
  // is safe.
  const sameState = (r: { address_components: Component[] }) => {
    const st = parseComponents(r.address_components ?? []).state;
    return !st || !nearest.state || st === nearest.state;
  };
  const consistent = results.filter(sameState);
  const coarse = parseComponents(mergeComponents(consistent));

  const merged: Parsed = {
    pincode: nearest.pincode ?? coarse.pincode,
    district: coarse.district,
    state: coarse.state,
    locality: nearest.locality ?? coarse.locality,
    // The closest result's own prose — the single field is prefilled from this rather
    // than from components, which is what stops us having to decide which component
    // belongs in which of several address boxes.
    // Verbatim apart from the Plus Code — see stripPlusCode. The ", Karnataka 560087,
    // India" tail is deliberately KEPT even though state and PIN have their own columns:
    // the point of the separate flat_building field is that a student never has to edit
    // an address that is already correct.
    address: stripPlusCode(best.formatted_address),
    lat: null,
    lng: null,
  };

  // Every distinct postal code near the point, nearest first — a boundary genuinely
  // has two, and that is what makes the UI offer a choice rather than one guess.
  const pins: string[] = [];
  if (merged.pincode) pins.push(merged.pincode);
  for (const r of consistent) {
    const pin = parseComponents(r.address_components).pincode;
    if (pin && !pins.includes(pin)) pins.push(pin);
  }
  return { merged, pins };
}

/**
 * Remove Google Plus Codes from a formatted address, leaving everything else EXACTLY as
 * Google wrote it.
 *
 * A Plus Code ("WPQR+WHQ", "464C+22") is an encoded coordinate that Google substitutes
 * when it has no street name for a point. It is machine output: it means nothing to a
 * student and nothing to a courier, and it was appearing at the head of the Address
 * field. This is the ONLY thing we strip — the state/PIN/country tail is deliberately
 * kept, because an address we have rewritten is one the student feels obliged to check.
 *
 * TWO SHAPES, and a per-segment match only catches the first:
 *   "WPQR+WHQ, Varthur, Devasthanagalu, Bengaluru, …"   → its own comma segment
 *   "464C+22 Kukkapallevaripalem, Andhra Pradesh, …"    → SPACE-separated, same segment
 * The second is the common one in villages — precisely where Google lacks street names
 * — so missing it would leave the junk for exactly the students most affected.
 *
 * The character class is the real Open Location Code alphabet rather than [A-Z0-9], and
 * a code always contains a literal '+', which no place name does. So this cannot eat a
 * legitimate segment.
 */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}(?=\s|$)/i;

function stripPlusCode(formatted: string | null | undefined): string | null {
  if (!formatted) return null;
  const kept = formatted
    .split(",")
    .map((seg) => seg.trim().replace(PLUS_CODE, "").trim())
    .filter(Boolean);
  return kept.length > 0 ? kept.join(", ") : null;
}

/** Build the record we return to the form from a merged point lookup. */
function recordFrom(merged: Parsed, pincode: string): PincodeRecord {
  return {
    pincode,
    district: merged.district ?? "",
    state: merged.state ?? "",
    localities: merged.locality ? [merged.locality] : [],
    address: merged.address,
  };
}

/**
 * lat/lng → address candidates.
 *
 * The path Google is dramatically better at: it resolves a Varthur pin to 560087,
 * which the retired nearest-centroid approach could not — 560087's centroid was
 * dragged 9.6 km away by a single mislocated post office, so a neighbouring PIN won.
 */
export async function providerReverse(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
): Promise<PincodeRecord[] | null> {
  if (!KEY) return null;
  // 4dp ≈ 11 m: precise enough that two lookups from the same doorstep share a cache
  // row, coarse enough that the key isn't a unique fingerprint of a person.
  const key = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = await fromCache<PincodeRecord[]>(supabase, key);
  if (cached) return cached;

  const hit = await fetchReverse(supabase, lat, lng);
  if (!hit || hit.pins.length === 0) return null;

  const out = hit.pins.slice(0, 3).map((pin) => recordFrom(hit.merged, pin));
  await toCache(supabase, key, "reverse", out);
  return out;
}

export type Prediction = { placeId: string; label: string; secondary: string };

/**
 * Typeahead over Indian places. `components=country:in` keeps results in India;
 * `types=geocode` keeps them to addresses and localities rather than restaurants.
 *
 * This is the path that fixes the reported bug: Google resolves "Varthur" because
 * it is not limited to the postal department's spelling ("Vartur S.O"), which our
 * substring search over India Post's spellings could never match.
 */
export async function providerAutocomplete(
  supabase: SupabaseClient,
  q: string,
  sessionToken?: string,
): Promise<Prediction[] | null> {
  if (!KEY) return null;
  const key = `autocomplete:${q.toLowerCase()}`;
  const cached = await fromCache<Prediction[]>(supabase, key);
  if (cached) return cached;
  if (!(await budgetAllows(supabase, "autocomplete"))) return null;

  // Places (New) is POST with a JSON body and the key in a header — not a GET with
  // ?key=. The key never appears in a URL, which also keeps it out of any request
  // logging along the way.
  const body = await postJson(AUTOCOMPLETE_URL, {
    input: q,
    // India only, and addresses/localities rather than businesses — a student
    // searching "Varthur" wants the place, not a restaurant in it.
    includedRegionCodes: ["in"],
    includedPrimaryTypes: ["geocode"],
    ...(sessionToken ? { sessionToken } : {}),
  });
  if (!body) return null;

  const suggestions = (body.suggestions ?? []) as {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
  const out: Prediction[] = suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .slice(0, 8)
    .map((p) => ({
      placeId: p.placeId as string,
      label: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
  if (out.length === 0) return null;
  await toCache(supabase, key, "autocomplete", out);
  return out;
}

/** A chosen prediction → the actual address fields. */
export async function providerDetails(
  supabase: SupabaseClient,
  placeId: string,
): Promise<PincodeRecord | null> {
  if (!KEY) return null;
  const key = `details:${placeId}`;
  const cached = await fromCache<PincodeRecord>(supabase, key);
  if (cached) return cached;
  if (!(await budgetAllows(supabase, "details"))) return null;

  // X-Goog-FieldMask is MANDATORY on Places (New) — a request without it is rejected
  // outright — and it is also what bounds the bill, since Places charges by the fields
  // returned. Two fields, both of which we use.
  const body = await getJson(`${DETAILS_URL}/${encodeURIComponent(placeId)}`, {
    "X-Goog-Api-Key": KEY,
    // formattedAddress joins the mask so the single Address field can be prefilled
    // with Google's own prose rather than re-assembled from components.
    "X-Goog-FieldMask": "addressComponents,formattedAddress",
  });
  const components = (body?.addressComponents ?? []) as Component[];
  if (components.length === 0) return null;

  const p = parseComponents(components);
  const record: PincodeRecord = {
    pincode: p.pincode ?? "",
    district: p.district ?? "",
    state: p.state ?? "",
    localities: p.locality ? [p.locality] : [],
    // Places (New) returns camelCase `formattedAddress`, unlike Geocoding's
    // `formatted_address`. Same Plus Code strip, same verbatim-otherwise rule.
    address: stripPlusCode(body?.formattedAddress as string | undefined),
  };
  await toCache(supabase, key, "details", record);
  return record;
}

/** Best-effort deletion of expired rows — a licence obligation, so it is not
 * left to a cron job someone might never configure. Fire-and-forget. */
export function sweepProviderCache(_supabase: SupabaseClient) {
  // No key means nothing was ever cached, so there is nothing to sweep — and
  // building the admin client would demand SUPABASE_SECRET_KEY from a deployment
  // that only needs the offline fallback.
  if (!KEY) return;
  // 1-in-50 requests, so the sweep costs nothing on the hot path but still runs
  // many times a day at any real traffic level.
  if (Math.random() > 0.02) return;
  void admin().rpc("geo_provider_sweep");
}
