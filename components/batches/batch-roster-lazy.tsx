"use client";

// Lazy loader for the batch roster inside the workspace's Students accordion.
// It mounts only when that section is expanded (Radix unmounts closed content),
// so the batch page load never pulls the roster. Fetches /roster on mount, then
// renders the existing BatchRoster.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BatchRoster } from "@/components/batches/batch-roster";
import type { BatchFee, RosterRow } from "@/lib/enrollment-query";

export function BatchRosterLazy({ batchId }: { batchId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{ batch: BatchFee; roster: RosterRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/batches/${batchId}/roster`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load the roster");
        if (!cancelled) setData({ batch: json.batch, roster: json.roster ?? [] });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading students…
      </div>
    );
  if (error) return <p className="text-destructive py-4 text-sm">{error}</p>;
  if (!data) return null;
  return <BatchRoster batchId={batchId} batch={data.batch} roster={data.roster} />;
}
