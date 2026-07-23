"use client";

// Lazy loader for the batch roster inside the workspace's Students accordion.
// It mounts only when that section is expanded (Radix unmounts closed content),
// so the batch page load never pulls the roster. The roster GET is cached
// (lib/fetch-cache) so re-expanding reuses it; recording a payment invalidates
// the cache and refetches.
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BatchRoster } from "@/components/batches/batch-roster";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import type { BatchFee, RosterRow } from "@/lib/enrollment-query";

export function BatchRosterLazy({ batchId }: { batchId: string }) {
  const url = `/api/admin/batches/${batchId}/roster`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{ batch: BatchFee; roster: RosterRow[] } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const json = await cachedGet<{ batch: BatchFee; roster: RosterRow[] }>(url);
      setData({ batch: json.batch, roster: json.roster ?? [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onChanged = useCallback(() => {
    invalidate(url);
    setLoading(true);
    load();
  }, [url, load]);

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading students…
      </div>
    );
  if (error) return <p className="text-destructive py-4 text-sm">{error}</p>;
  if (!data) return null;
  return <BatchRoster batchId={batchId} batch={data.batch} roster={data.roster} onChanged={onChanged} />;
}
