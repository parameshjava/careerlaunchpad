import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

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
 * separately. 1-hour revalidate is plenty for seed data; if an admin edit path
 * for `ref_*` is ever added, wrap it with revalidateTag and add a `tags` entry.
 * ponytail: time-based revalidate only — no tag until a write path exists.
 */
export function getRefData(tables: Record<string, string>, cacheKey: string) {
  return unstable_cache(() => fetchRefTables(tables), ["ref-data", cacheKey], {
    revalidate: 3600,
  })();
}
