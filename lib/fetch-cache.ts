// Tiny client-side GET cache for the batch workspace (issue #64 follow-up).
// Accordion sections unmount when collapsed, so re-expanding one would normally
// refetch. This caches a GET's parsed JSON by URL so a section loads once and
// reuses the result — until a mutation (PUT/PATCH/POST/DELETE) calls
// `invalidate()` for the affected URLs, after which the next load refetches.
//
// In-memory only (cleared on full page reload). Keys are full URLs, so different
// batches never collide. Client-only.

const store = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

/** GET `url` (JSON), returning the cached body when present. Errors are not
 * cached, so a failed load retries on the next call. Throws on !ok. */
export async function cachedGet<T = unknown>(url: string): Promise<T> {
  if (store.has(url)) return store.get(url) as T;
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed");
    store.set(url, json);
    return json as T;
  })().finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p as Promise<T>;
}

/** Drop cached entries. Pass a substring to match many URLs (e.g. a batch id or
 * a path segment), or a predicate for full control. */
export function invalidate(match: string | ((url: string) => boolean)): void {
  const pred = typeof match === "string" ? (u: string) => u.includes(match) : match;
  for (const key of [...store.keys()]) if (pred(key)) store.delete(key);
}
