/**
 * Shared model for PIN-code / geo-location address resolution (issue #101).
 *
 * Dependency-free on purpose (no supabase, no `next/*`), so the SAME rules run in
 * the browser (the address fields), in the three /api/geo route handlers, in the
 * registration PATCH validator and in the Excel intake normalizer — the "one
 * source of truth" discipline lib/degree-branch.ts established for #99.
 *
 * WHAT THIS FILE IS *NOT*
 *   It holds no provider logic and no geodata. Resolution lives in lib/geo-provider.ts
 *   (Google Maps Platform, server-only); the local PIN catalogue that #101 originally
 *   shipped is retired. What remains here is the shared vocabulary:
 *   the PIN format, India's bounding box, the GPS accuracy ceiling, and the shapes the
 *   API and the form agree on.
 */

// ---------------------------------------------------------------------------
// PIN codes
// ---------------------------------------------------------------------------
/** Indian PIN: 6 digits, never leading zero. Mirrors the CHECK on
 * student_profile.pincode (migration 163). */
export const PINCODE_RE = /^[1-9][0-9]{5}$/;

export const isPincode = (value: unknown): boolean =>
  typeof value === "string" && PINCODE_RE.test(value.trim());

/** Keep only digits and clip to 6, so a pasted "522 201" or "PIN-522201"
 * still lands. Used by the input's onChange, not as validation. */
export const normalizePincodeInput = (raw: string): string =>
  raw.replace(/\D/g, "").slice(0, 6);

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------
/** India's bounding box (incl. Andaman & Nicobar and Ladakh). Used to reject a fix
 * from a student who is abroad before spending a geocoding call on it. */
export const INDIA_BBOX = { latMin: 6.0, latMax: 37.6, lngMin: 68.0, lngMax: 97.5 };

export function isInIndia(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= INDIA_BBOX.latMin && lat <= INDIA_BBOX.latMax &&
    lng >= INDIA_BBOX.lngMin && lng <= INDIA_BBOX.lngMax
  );
}

/**
 * The accuracy ceiling for using a fix at all, in metres.
 *
 * A phone that answers with `accuracy: 30000` has not used GPS — that is a
 * wifi/IP-derived guess that can be a whole city out, and prefilling from it
 * would quietly write the wrong district into the field this feature exists to
 * clean up. Above this we refuse the fix and point the student at the PIN box.
 */
export const MAX_ACCURACY_M = 5000;

/** "1.2 km" / "450 m" — for showing how far the guess is from the student. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

// ---------------------------------------------------------------------------
// Shapes shared by the API and the form
// ---------------------------------------------------------------------------
/** A resolved address, as the /api/geo/* endpoints return it. */
export type PincodeRecord = {
  pincode: string;
  district: string;
  state: string;
  /** Place names to offer under "Village / Mandal / City". Google returns the one
   * nearest the point; the retired local catalogue used to supply every post office
   * in the PIN, which is why this stays an array. */
  localities: string[];
  /** The geocoder's formatted_address, VERBATIM — "8-19-110, Chenchupet, Tenali,
   * Andhra Pradesh 522202, India". Not trimmed: a student should never have to edit an
   * address that is already correct, and the flat/building they DO have to supply has
   * its own field (migration 163). */
  address?: string | null;
};

/** A candidate returned by /api/geo/reverse. `distanceKm` survives from the retired
 * nearest-centroid implementation and is 0 for a provider answer — the geocoder
 * resolves the point itself rather than the centre of a postal area. */
export type GeoCandidate = PincodeRecord & {
  distanceKm: number;
  confidence: "high" | "low";
};

/** Max length of the `address` field. Mirrors the CHECK in migration 163; the
 * input carries the same maxLength so the limit is felt while typing rather than
 * reported after a save. */
export const ADDRESS_LINE_MAX = 400;

/** Max length of `flat_building`. Mirrors the CHECK in migration 163. */
export const FLAT_BUILDING_MAX = 200;

/** What the form writes into Step 1 once the student accepts a suggestion. */
export type AddressPatch = {
  pincode: string;
  city_village: string;
  district: string;
  state: string;
};

/** How the address reached the profile. Mirrors the CHECK in migration 163.
 * A self-reported data-quality hint — see the note on the column. */
export const ADDRESS_SOURCES = ["manual", "pincode", "search", "gps", "map"] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

export const isAddressSource = (v: unknown): v is AddressSource =>
  typeof v === "string" && (ADDRESS_SOURCES as readonly string[]).includes(v);

// ---------------------------------------------------------------------------
// District cross-check
// ---------------------------------------------------------------------------
/**
 * Does a typed district/state agree with what the PIN says?
 *
 * Compared loosely (case, punctuation and spacing folded) because the provider may say
 * "Y.S.R. Kadapa" where a student types "YSR Kadapa", and neither is wrong.
 *
 * A mismatch is ALWAYS a warning, never a rejection — see the caller in
 * lib/registration.ts for why blocking here would lock real students out.
 */
const fold = (s: string) =>
  s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");       // and every separator, so "Y.S.R." === "ysr"

export function districtMatches(typed: string | null | undefined, official: string): boolean {
  if (!typed || !typed.trim()) return true; // nothing typed yet is not a conflict
  const a = fold(typed);
  const b = fold(official);
  if (!a || !b) return true;
  // Containment, not equality: "Guntur District" and "Guntur" are the same
  // answer, and so are "Kadapa" and "YSRKadapa".
  return a === b || a.includes(b) || b.includes(a);
}
