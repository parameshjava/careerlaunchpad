/**
 * College domain shared between the management API (app/api/colleges/*) and the
 * console UI (components/colleges/CollegesManager). Mirrors the `public.college`
 * table (migration 002_domain_entities.sql). "API design first" (CLAUDE.md): the
 * field list, validation rules and the editable shape live here so the form, the
 * route handlers and the table never drift apart.
 */

/** Ownership values allowed by the table's CHECK constraint. */
export const OWNERSHIP_TYPES = ["GOVERNMENT", "PRIVATE"] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

/** Lifecycle: colleges are soft-archived (never hard-deleted — student_profile
 * and user_role reference college.id), so `status` flips active⇄archived. */
export const COLLEGE_STATUSES = ["active", "archived"] as const;
export type CollegeStatus = (typeof COLLEGE_STATUSES)[number];

/** A college row as the API returns it. */
export type College = {
  id: string;
  name: string;
  place: string | null;
  address: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  established_in: number | null;
  ownership_type: OwnershipType | null;
  status: CollegeStatus;
  /** Affiliating university (another college row). `=== id` means this row IS a
   * university (self-associated); null means unknown/unset. */
  university_id: string | null;
  /** Embedded {id,name} of the affiliating university, when reads request it. */
  university?: { id: string; name: string } | null;
  created_at?: string;
};

/** Base columns of a college (used for writes and as the root of every read). */
export const COLLEGE_COLUMNS =
  "id, name, place, address, district, state, pincode, established_in, ownership_type, status, university_id, created_at";

/** Read projection: base columns + the affiliating university's name, via a
 * self-join on university_id (PostgREST embedded resource). */
export const COLLEGE_SELECT = `${COLLEGE_COLUMNS}, university:university_id ( id, name )`;

/** Sentinel a write can send for `university_id` to mark the row as a university
 * itself (self-association). The server resolves it to the row's own id. */
export const SELF_UNIVERSITY = "self";

/** The editable fields a create/update accepts (server fills id/created_*). */
export type CollegeInput = {
  name: string;
  place: string | null;
  address: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  established_in: number | null;
  ownership_type: OwnershipType | null;
  status: CollegeStatus;
  /** A university's uuid, the SELF_UNIVERSITY sentinel, or null (none). */
  university_id: string | null;
};

const EARLIEST_YEAR = 1800;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalize a free-text field: trim, and treat "" as null (NULLs are distinct
 * in the (name, place, pincode) unique key, so empty must not become ""). */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Validate + normalize a create/update body. With `partial: false` (create) all
 * required fields must be present; with `partial: true` (PATCH) only the keys
 * present are validated and returned, so callers can send just what changed.
 * Returns the cleaned values, or a single human-readable error string.
 */
export function parseCollegeInput(
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
): { values: Partial<CollegeInput> } | { error: string } {
  const out: Partial<CollegeInput> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // name — required on create; if sent on update it must be non-empty.
  if (!partial || has("name")) {
    const name = text(body.name);
    if (!name) return { error: "name: required" };
    out.name = name;
  }

  if (!partial || has("place")) out.place = text(body.place);
  if (!partial || has("address")) out.address = text(body.address);
  if (!partial || has("district")) out.district = text(body.district);
  if (!partial || has("state")) out.state = text(body.state);

  if (!partial || has("pincode")) {
    const pin = text(body.pincode);
    if (pin && !/^\d{6}$/.test(pin)) return { error: "pincode: must be 6 digits" };
    out.pincode = pin;
  }

  if (!partial || has("established_in")) {
    const raw = body.established_in;
    if (raw == null || raw === "") {
      out.established_in = null;
    } else {
      const year = typeof raw === "number" ? raw : parseInt(String(raw), 10);
      const max = new Date().getFullYear() + 1;
      if (!Number.isInteger(year) || year < EARLIEST_YEAR || year > max)
        return { error: `established_in: must be a year between ${EARLIEST_YEAR} and ${max}` };
      out.established_in = year;
    }
  }

  if (!partial || has("ownership_type")) {
    const o = text(body.ownership_type);
    if (o && !OWNERSHIP_TYPES.includes(o as OwnershipType))
      return { error: "ownership_type: must be GOVERNMENT or PRIVATE" };
    out.ownership_type = (o as OwnershipType) ?? null;
  }

  if (!partial || has("status")) {
    const s = text(body.status) ?? "active";
    if (!COLLEGE_STATUSES.includes(s as CollegeStatus))
      return { error: "status: must be active or archived" };
    out.status = s as CollegeStatus;
  }

  // Affiliating university: a uuid, the SELF_UNIVERSITY sentinel (resolved by the
  // route to this row's own id), or null. The route does the self-resolution
  // because the id isn't known until insert.
  if (!partial || has("university_id")) {
    const u = text(body.university_id);
    if (u && u !== SELF_UNIVERSITY && !UUID_RE.test(u))
      return { error: "university_id: must be a university id or null" };
    out.university_id = u;
  }

  return { values: out };
}

/** Strip characters that would break a PostgREST `.or()` filter list. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[(),]/g, " ").trim();
}
