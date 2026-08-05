import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { BranchRow, DegreeBranchRow, DegreeRow } from "@/lib/degree-branch";

/**
 * Cached reader for the public `ref_*` option-set tables (registration & mentor
 * forms). These are seed/admin-edited lookup tables that change rarely but are
 * re-read on every form load — and each form fires 7–10 parallel queries for
 * identical, user-independent data. We cache the whole set so a cold cache pays
 * the N reads once, then every page load is served from the Next.js data cache.
 *
 * A COOKIELESS anon client is used on purpose: `ref_*` are public-read
 * (migration 010: `for select using (true)`), and unstable_cache() callbacks
 * must not read cookies/headers. The route handler still does its own auth gate
 * before calling this — this only fetches non-sensitive option lists.
 */
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Cache tag every cached read here is stamped with. The admin Reference
 * Catalogue (/dashboard/reference, issue #99) calls revalidateTag(REF_DATA_TAG)
 * after EVERY mutation — without it the 1-hour revalidate would leave students
 * on a stale option list for up to an hour, and because Vercel's Data Cache
 * persists across instances it wouldn't even be stale consistently. Any new
 * cached ref_* reader must join the tag, and any new write path must bust it.
 */
export const REF_DATA_TAG = "ref-data";

type RefRow = {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  sort_order: number;
};

async function fetchRefTables(tables: Record<string, string>) {
  const entries = await Promise.all(
    Object.entries(tables).map(async ([key, table]) => {
      const { data, error } = await anon
        .from(table)
        .select("id, slug, label, category, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw new Error(`${table}: ${error.message}`);
      return [key, (data ?? []) as RefRow[]] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * `cacheKey` distinguishes the registration vs mentor option sets so they cache
 * separately. The sorted table-key set is folded into the cache key too, so that
 * ADDING or removing a `ref_*` table (e.g. the Step 6 "Tell Us" tables) changes
 * the key and busts the Vercel Data Cache on deploy — otherwise the persisted
 * pre-deploy payload (missing the new keys) would keep serving for up to an hour.
 * 1-hour revalidate is plenty for seed data; the admin edit path added in #99
 * busts it immediately via revalidateTag(REF_DATA_TAG) — see the tag comment above.
 */
export function getRefData(tables: Record<string, string>, cacheKey: string) {
  const tableSetKey = Object.keys(tables).sort().join(",");
  return unstable_cache(() => fetchRefTables(tables), ["ref-data", cacheKey, tableSetKey], {
    revalidate: 3600,
    tags: [REF_DATA_TAG],
  })();
}

/**
 * Preference categories (registration Step 3, #42). Richer than the flat ref_*
 * tables (category has guidance; exams + the category→skill coaching map are
 * separate relations), so they can't ride through fetchRefTables' fixed select.
 * Returns { preference_category, exam, preference_category_skill }; skills
 * themselves come via REF_TABLES.skill (grouped client-side by ref_skill.category).
 */
async function fetchPreference() {
  const [cats, exams, map] = await Promise.all([
    anon.from("ref_preference_category").select("slug, name, group_label, guidance, sort_order").eq("is_active", true).order("sort_order"),
    anon.from("ref_exam").select("slug, label, category_slug, sort_order").eq("is_active", true).order("sort_order"),
    anon.from("ref_preference_category_skill").select("category_slug, skill_slug, sort_order").order("sort_order"),
  ]);
  if (cats.error) throw new Error(`ref_preference_category: ${cats.error.message}`);
  if (exams.error) throw new Error(`ref_exam: ${exams.error.message}`);
  if (map.error) throw new Error(`ref_preference_category_skill: ${map.error.message}`);
  return {
    preference_category: cats.data ?? [],
    exam: exams.data ?? [],
    preference_category_skill: map.data ?? [],
  };
}

export function getPreferenceData() {
  return unstable_cache(fetchPreference, ["ref-data", "preference"], {
    revalidate: 3600,
    tags: [REF_DATA_TAG],
  })();
}

/**
 * Degree → Branch (issue #99). Like fetchPreference above, this cannot ride
 * through fetchRefTables' fixed `id, slug, label, category, sort_order` select:
 * the form needs ref_degree.branch_mode / level / duration_years, ref_branch.
 * family / search_terms, and the ref_degree_branch relation itself.
 *
 * The returned `degree` / `branch` keys are supersets of the ones fetchRefTables
 * produces for the same tables, so callers spread this LAST and it wins. The row
 * types and every rule derived from them live in lib/degree-branch.ts, which is
 * dependency-free so the client form shares them.
 */
async function fetchDegreeBranch() {
  const [degrees, branches, map] = await Promise.all([
    anon
      .from("ref_degree")
      .select("id, slug, label, category, sort_order, branch_mode, level, duration_years, search_terms")
      .eq("is_active", true)
      .order("sort_order"),
    anon
      .from("ref_branch")
      .select("id, slug, label, category, sort_order, family, search_terms")
      .eq("is_active", true)
      .order("sort_order"),
    anon
      .from("ref_degree_branch")
      .select("degree_slug, branch_slug, sort_order, group_label")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (degrees.error) throw new Error(`ref_degree: ${degrees.error.message}`);
  if (branches.error) throw new Error(`ref_branch: ${branches.error.message}`);
  if (map.error) throw new Error(`ref_degree_branch: ${map.error.message}`);

  // A mapping row pointing at a DEACTIVATED branch must not reach the form —
  // is_active on ref_branch is how an admin retires an option, and leaving the
  // pair in would keep offering it (and make the pair "valid" server-side).
  const live = new Set((branches.data ?? []).map((b) => b.slug as string));
  return {
    degree: (degrees.data ?? []) as unknown as DegreeRow[],
    branch: (branches.data ?? []) as unknown as BranchRow[],
    degree_branch: ((map.data ?? []) as unknown as DegreeBranchRow[]).filter((m) =>
      live.has(m.branch_slug),
    ),
  };
}

export function getDegreeBranchData() {
  return unstable_cache(fetchDegreeBranch, ["ref-data", "degree-branch"], {
    revalidate: 3600,
    tags: [REF_DATA_TAG],
  })();
}

/**
 * Just the slug → label maps for degree + branch, for DISPLAY (the admin grids
 * and enrollment views, which used to render raw slugs — `btech — cse`).
 *
 * Deliberately NOT filtered by is_active, unlike getDegreeBranchData above:
 * deactivating an option hides it from new PICKERS, but a student who already
 * holds that value must still see their label rather than a bare slug.
 */
async function fetchDegreeBranchLabels() {
  const [degrees, branches] = await Promise.all([
    anon.from("ref_degree").select("slug, label"),
    anon.from("ref_branch").select("slug, label"),
  ]);
  if (degrees.error) throw new Error(`ref_degree: ${degrees.error.message}`);
  if (branches.error) throw new Error(`ref_branch: ${branches.error.message}`);
  return {
    degree: (degrees.data ?? []) as { slug: string; label: string }[],
    branch: (branches.data ?? []) as { slug: string; label: string }[],
  };
}

export function getDegreeBranchLabels() {
  return unstable_cache(fetchDegreeBranchLabels, ["ref-data", "degree-branch-labels"], {
    revalidate: 3600,
    tags: [REF_DATA_TAG],
  })();
}
