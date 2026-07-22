"use client";

// Student self-enrolment (issue #49): open batches for the student's college with
// a "Join" action that calls the enroll_self() RPC (SECURITY DEFINER, enforces
// the rules server-side). On success the enrolment shows up under My fees.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/fee-receipt";
import type { OpenBatch } from "@/lib/enrollment-query";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : null);

export function AvailableBatches({ batches }: { batches: OpenBatch[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<OpenBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    if (!confirm) return;
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("enroll_self", { p_batch_id: confirm.batchId });
      if (rpcErr) throw new Error(rpcErr.message);
      setConfirm(null);
      router.push("/student/fees");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (batches.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No courses are open for enrolment at your college right now. Check back later.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {batches.map((b) => {
        const start = fmtDate(b.startDate);
        return (
          <Card key={b.batchId}>
            <CardHeader>
              <CardTitle className="text-base">{b.courseName}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {[b.name, b.academicYear].filter(Boolean).join(" · ")}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-muted-foreground text-xs">Course fee</div>
                  <div className="text-lg font-semibold tabular-nums">{formatINR(b.feePaise)}</div>
                </div>
                {start && <div className="text-muted-foreground text-xs">Starts {start}</div>}
              </div>
              {b.enrolled ? (
                <Button variant="outline" disabled className="w-full">
                  <Check /> Already enrolled
                </Button>
              ) : (
                <Button className="w-full" onClick={() => { setError(""); setConfirm(b); }}>
                  <UserPlus /> Enrol
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enrol in this course?</DialogTitle>
          </DialogHeader>
          {confirm && (
            <div className="grid gap-3 text-sm">
              <p>
                You&apos;re about to enrol in <span className="font-medium">{confirm.courseName}</span>
                {" "}({confirm.name}). The course fee is{" "}
                <span className="font-semibold">{formatINR(confirm.feePaise)}</span>, payable as per your
                college&apos;s process. Your balance will appear under <b>My fees</b>.
              </p>
              {error && <p className="text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={join} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Confirm enrolment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
