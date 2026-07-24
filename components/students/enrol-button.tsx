"use client";

// Enrol action for a single batch, used on the student course-details page
// (issue #49) for each batch row. It calls the enroll_self() RPC (SECURITY
// DEFINER, enforces the college/duplicate rules server-side) and, on success,
// routes to My fees where the request shows up.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Lock, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/fee-receipt";

export function EnrolButton({
  batchId,
  courseName,
  batchName,
  feePaise,
  enrolled,
  enrollmentStatus = "open",
  className,
}: {
  batchId: string;
  courseName: string;
  batchName: string;
  feePaise: number;
  enrolled: boolean;
  /** batch.enrollment_status — when not "open" and not yet enrolled, the batch is
   * shown but the Enrol action is disabled ("Opening soon" / "Enrolment closed"). */
  enrollmentStatus?: "not_open" | "open" | "closed";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("enroll_self", { p_batch_id: batchId });
      if (rpcErr) throw new Error(rpcErr.message);
      setOpen(false);
      router.push("/student/fees");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Enrolled → a compact, content-width status chip (never a full-width button,
  // which would hog the row). The `className` (e.g. w-full) is intentionally not
  // applied here so the chip only ever takes the space it needs.
  if (enrolled) {
    return (
      <span className="border-primary/30 bg-primary/10 text-primary inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium">
        <Check className="size-4" /> Enrolled
      </span>
    );
  }

  // Enrolment not open for this batch → visible but not joinable (the RPC also
  // refuses server-side; this is the matching client affordance).
  if (enrollmentStatus !== "open") {
    return (
      <Button variant="outline" disabled className={className}>
        {enrollmentStatus === "not_open" ? (
          <>
            <Clock /> Opening soon
          </>
        ) : (
          <>
            <Lock /> Enrolment closed
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Button className={className} onClick={() => { setError(""); setOpen(true); }}>
        <UserPlus /> Enrol
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enrol in this course?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <p>
              By continuing, your request to enrol in <span className="font-medium">{courseName}</span>
              {" "}({batchName}) will be sent for <b>review</b>. Once approved, the{" "}
              <span className="font-semibold">{formatINR(feePaise)}</span> course fee will become payable
              under <b>My fees</b>.
            </p>
            {error && <p className="text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={join} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Confirm &amp; submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
