/**
 * Server-side plumbing for the admin Reference Catalogue (/dashboard/reference,
 * issue #99): the permission gate, the audit write, and the cache bust. Every
 * mutation route in /api/admin/reference/* goes through all three, in that order.
 *
 * WHY THE CACHE BUST IS NOT OPTIONAL
 *   lib/ref-cache.ts serves the student/mentor forms from unstable_cache with a
 *   1-hour revalidate. Without an explicit revalidateTag, an admin who adds a
 *   branch would watch the student form keep the OLD list for up to an hour — and
 *   because Vercel's Data Cache persists across instances, not even consistently.
 *   The screen would look broken while being correct. So: bustRefCache() after
 *   every successful write, no exceptions.
 *
 * WHY THE ROUTE NEVER SETS THE ACTOR
 *   Reference data feeds student-facing forms, mentor matching and every
 *   branch-keyed report, so a silent edit is dangerous. The actor is stamped by a
 *   BEFORE INSERT trigger on ref_data_audit (migration 161), which resolves
 *   acting_user() — during a "View as" session that is the real admin, not the
 *   impersonated user, the same trap migration 160 documents for registration
 *   audit. The route only says WHAT changed.
 */
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REF_DATA_TAG } from "@/lib/ref-cache";
import { can, getAuthContext, type AuthContext } from "@/lib/auth";

/** The capability that gates the whole screen (seeded in migration 161 and
 * granted to owner via '*' and to platform_admin explicitly). */
export const REFDATA_PERMISSION = "refdata.manage";

/** True if this context may edit the catalogue. Used by the page guard and nav. */
export const canManageRefData = (ctx: AuthContext | null) => can(ctx, REFDATA_PERMISSION);

/** Route-handler gate. Returns null when allowed, or the 403 body to return. */
export async function refdataGate(): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  return canManageRefData(ctx) ? null : { error: "Forbidden" };
}

export type RefTable = "ref_degree" | "ref_branch" | "ref_degree_branch";
export type RefAction = "create" | "update" | "deactivate" | "activate" | "map" | "unmap" | "reorder" | "copy";

/**
 * Record one catalogue change. Best-effort by design: a lost audit row must not
 * fail (or worse, half-fail) an edit the admin already saw succeed — the write
 * itself is the source of truth and RLS already gated it. Failures surface in the
 * server log rather than as a broken save.
 */
export async function auditRefChange(
  supabase: SupabaseClient,
  entry: {
    table: RefTable;
    /** A degree/branch slug, or `degree:branch` for a mapping row. */
    rowKey: string;
    action: RefAction;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  // actor_id is DELIBERATELY absent from this payload: the trigger overwrites it
  // regardless, so sending one could only ever be wrong (and, during a "View as"
  // session, a lie).
  const { error } = await supabase.from("ref_data_audit").insert({
    table_name: entry.table,
    row_key: entry.rowKey,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) console.error("ref_data_audit insert failed:", error.message);
}

/** Drop every cached ref_* read so the next form load sees the edit. */
export function bustRefCache(): void {
  revalidateTag(REF_DATA_TAG);
}

/**
 * Slugs are the IDENTITY of a catalogue row — student_profile.degree / .branch
 * store the slug with no FK, so a slug is effectively immutable once used. The
 * API therefore accepts a slug only on CREATE, and this is the only place it is
 * shaped: lowercase, ASCII, `_`-separated, so it stays readable in a DB column
 * and safe in a URL path.
 */
export function normalizeSlug(raw: unknown): string | null {
  const collapsed = String(raw ?? "")
    .trim()
    .toLowerCase()
    // Greedy, so every run of non-alphanumerics becomes exactly ONE underscore.
    .replace(/[^a-z0-9]+/g, "_");
  // Trimmed by index rather than `/^_+|_+$/`. That regex is quadratic on a long run
  // of underscores (CodeQL js/polynomial-redos), and while the collapse above means
  // no run longer than one can actually reach it, that safety lives in the ORDER of
  // two statements — swap them and it becomes a real hot loop on an authenticated
  // request path. This is linear regardless, so the invariant is local.
  let a = 0;
  let b = collapsed.length;
  while (a < b && collapsed[a] === "_") a += 1;
  while (b > a && collapsed[b - 1] === "_") b -= 1;
  const s = collapsed.slice(a, b);
  // Bounded repetition, so this one can't backtrack.
  return /^[a-z][a-z0-9_]{1,48}$/.test(s) ? s : null;
}

/** Trim to null, with a length bound, for the free-text catalogue fields. */
export function text(raw: unknown, max = 120): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Search aliases (`search_terms`) arrive either as an array or as the
 * comma-separated string the editor's single text input produces. Normalized to
 * lowercase and de-duplicated, because that's how matchesQuery() compares them —
 * storing "CSC" and "csc" as two aliases would just be noise.
 */
export function parseTerms(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(",");
  return Array.from(new Set(parts.map((s) => s.trim().toLowerCase()).filter(Boolean))).slice(0, 40);
}
