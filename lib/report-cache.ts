/**
 * A tiny stale-while-revalidate cache for the report payloads, in localStorage.
 *
 * Why persist at all: a report is five RPCs over every attempt in a window, so a
 * revisit stares at an empty page for a second or two. With this, the last copy
 * paints immediately and is replaced the moment the fresh read lands — the reader
 * never waits, and never sees a number that isn't real, because a cached copy is
 * labelled as saved with its timestamp until the refresh completes.
 *
 * Rules this cache follows, and why each matters:
 *
 *   • keyed by USER id as well as query, so a shared browser can never paint one
 *     account's students into another account's page. Switching accounts misses
 *     the cache rather than showing the previous person's data.
 *   • a version prefix, so changing a payload's shape can't resurrect a copy the
 *     new code would misread.
 *   • a TTL, after which the copy is dropped rather than shown — an hours-old
 *     ranking presented as current would be worse than a spinner.
 *   • pruned to a bounded number of entries, since every distinct period and
 *     college is its own key and the relative windows change key every day.
 *   • best-effort throughout: localStorage can be full, disabled, or throw in
 *     private mode. A cache that breaks the page it is meant to speed up is a
 *     bad trade, so every operation swallows its own failure.
 *
 * It holds the same student names and scores the page is already displaying to
 * this signed-in user, in the same place their Supabase session already lives.
 * It is cleared on sign-out (see clearReportCache's callers).
 */
const PREFIX = "cl-report-cache:v1:";
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 24;

type Entry<T> = { at: number; data: T };

function store(): Storage | null {
  try {
    // Touch it: Safari's private mode has the API but throws on write.
    const s = window.localStorage;
    const probe = `${PREFIX}probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function reportCacheKey(userId: string | null, endpoint: string, qs: string): string {
  return `${PREFIX}${userId ?? "anon"}|${endpoint}${qs}`;
}

/** The saved copy and when it was saved, or null if absent, expired or unreadable. */
export function readReportCache<T>(key: string): { data: T; at: number } | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (!e || typeof e.at !== "number") return null;
    if (Date.now() - e.at > TTL_MS) {
      s.removeItem(key);
      return null;
    }
    return { data: e.data, at: e.at };
  } catch {
    return null;
  }
}

export function writeReportCache<T>(key: string, data: T): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify({ at: Date.now(), data } satisfies Entry<T>));
    prune(s);
  } catch {
    // Quota — drop everything of ours and keep the newest entry only. Better an
    // empty cache than a page that throws while trying to be fast.
    try {
      clearReportCache();
      s.setItem(key, JSON.stringify({ at: Date.now(), data } satisfies Entry<T>));
    } catch {
      /* give up silently */
    }
  }
}

function prune(s: Storage): void {
  const ours: { key: string; at: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    let at = 0;
    try {
      at = (JSON.parse(s.getItem(k) ?? "{}") as Entry<unknown>).at ?? 0;
    } catch {
      at = 0;
    }
    ours.push({ key: k, at });
  }
  if (ours.length <= MAX_ENTRIES) return;
  ours
    .sort((a, b) => b.at - a.at)
    .slice(MAX_ENTRIES)
    .forEach((e) => {
      try {
        s.removeItem(e.key);
      } catch {
        /* ignore */
      }
    });
}

/** Drops every cached report. Call on sign-out, and on a shape change. */
export function clearReportCache(): void {
  const s = store();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** "just now" / "6 min ago" / "2 hours ago" — for labelling a saved copy. */
export function savedAgo(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
