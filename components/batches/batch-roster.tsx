"use client";

// Batch roster (issue #49, Phase 4): enrolled students with balances + per-row
// "Record payment". Enrolment itself lives on the dedicated full-page screen
// (/dashboard/batches/[id]/enrol) so it scales to thousands of students and
// supports multi-select. Talks to /api/admin/enrollments/[id]/payments.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, IndianRupee, Loader2, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rupeesToPaise } from "@/lib/course-query";
import {
  CONCESSION_LABEL,
  formatINR,
  MODE_LABELS,
  MODE_REFERENCE_LABEL,
  type PaymentMode,
} from "@/lib/fee-receipt";
import type { BatchFee, RosterRow } from "@/lib/enrollment-query";

const MODES: PaymentMode[] = ["cash", "upi", "card", "online"];
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending approval",
  active: "Active",
  completed: "Paid",
  cancelled: "Cancelled",
};

export function BatchRoster({
  batchId,
  batch,
  roster,
}: {
  batchId: string;
  batch: BatchFee;
  roster: RosterRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState("");
  const [rejectFor, setRejectFor] = useState<RosterRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectErr, setRejectErr] = useState("");
  const [payFor, setPayFor] = useState<RosterRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<PaymentMode>("cash");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payErr, setPayErr] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  async function setEnrollmentStatus(id: string, status: "active" | "cancelled", reason?: string): Promise<boolean> {
    setBusyId(id);
    setRowErr("");
    try {
      const res = await fetch(`/api/admin/enrollments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      router.refresh();
      return true;
    } catch (e) {
      setRowErr((e as Error).message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function openReject(row: RosterRow) {
    setRejectFor(row);
    setRejectReason("");
    setRejectErr("");
  }
  async function submitReject() {
    if (!rejectFor) return;
    if (!rejectReason.trim()) return setRejectErr("Please enter a reason for rejection.");
    setRejectBusy(true);
    const ok = await setEnrollmentStatus(rejectFor.enrollmentId, "cancelled", rejectReason.trim());
    setRejectBusy(false);
    if (ok) setRejectFor(null);
  }

  function openPay(row: RosterRow) {
    setPayFor(row);
    setPayAmount("");
    setPayMode("cash");
    setPayRef("");
    setPayDate("");
    setPayErr("");
  }

  async function submitPay() {
    if (!payFor) return;
    setPayErr("");
    const amountPaise = rupeesToPaise(payAmount);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) return setPayErr("Enter a valid amount.");
    setPayBusy(true);
    try {
      const res = await fetch(`/api/admin/enrollments/${payFor.enrollmentId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPaise,
          mode: payMode,
          referenceNo: payMode === "cash" ? null : payRef.trim() || null,
          paidOn: payDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not record payment");
      router.push(`/dashboard/payments/${json.receiptId}`);
    } catch (e) {
      setPayErr((e as Error).message);
      setPayBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {roster.length} enrolled · batch fee {formatINR(batch.grossPaise)}
        </p>
        <Button asChild>
          <Link href={`/dashboard/batches/${batchId}/enrol`}>
            <UserPlus /> Enrol students
          </Link>
        </Button>
      </div>

      {rowErr && <p className="text-destructive text-sm">{rowErr}</p>}

      {roster.length === 0 ? (
        <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No students enrolled yet. Enrol students to start recording payments.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Net fee</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((r) => (
                <TableRow key={r.enrollmentId}>
                  <TableCell>
                    <div className="font-medium">{r.studentName}</div>
                    {r.concessionType !== "none" && (
                      <div className="text-muted-foreground text-xs">{CONCESSION_LABEL[r.concessionType]}</div>
                    )}
                    {r.status === "cancelled" && r.rejectionReason && (
                      <div className="text-destructive/80 text-xs">Rejected: {r.rejectionReason}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(r.netFeePaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(r.paidPaise)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatINR(r.balancePaise)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "completed" ? "default" : "secondary"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" disabled={busyId === r.enrollmentId} onClick={() => setEnrollmentStatus(r.enrollmentId, "active")}>
                          <Check /> Approve
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busyId === r.enrollmentId} onClick={() => openReject(r)} className="text-muted-foreground hover:text-destructive">
                          <X /> Reject
                        </Button>
                      </div>
                    ) : r.status === "cancelled" ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <Button variant="outline" size="sm" disabled={r.balancePaise <= 0} onClick={() => openPay(r)}>
                        <IndianRupee /> Record payment
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reject dialog — reason required */}
      <Dialog open={Boolean(rejectFor)} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject enrolment</DialogTitle>
          </DialogHeader>
          {rejectFor && (
            <div className="grid gap-3">
              <p className="text-muted-foreground text-sm">
                Rejecting {rejectFor.studentName}&apos;s enrolment. The reason is shared with the
                student under My fees.
              </p>
              <div className="grid gap-1.5">
                <Label>Reason / remarks</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Seats full for this batch; please apply to the next one."
                />
              </div>
              {rejectErr && <p className="text-destructive text-sm">{rejectErr}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReject} disabled={rejectBusy}>
              {rejectBusy ? <Loader2 className="animate-spin" /> : <X />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment dialog */}
      <Dialog open={Boolean(payFor)} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {payFor && (
            <div className="grid gap-4">
              <div className="text-muted-foreground text-sm">
                {payFor.studentName} · balance <span className="text-foreground font-medium">{formatINR(payFor.balancePaise)}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Amount (₹)</Label>
                  <Input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Mode</Label>
                  <Select value={payMode} onValueChange={(v) => setPayMode(v as PaymentMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {payMode !== "cash" && (
                <div className="grid gap-1.5">
                  <Label>{MODE_REFERENCE_LABEL[payMode]}</Label>
                  <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Payment date</Label>
                <DatePicker value={payDate} onChange={setPayDate} placeholder="Today" clearable />
              </div>
              {payErr && <p className="text-destructive text-sm">{payErr}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={payBusy}>
              {payBusy ? <Loader2 className="animate-spin" /> : <IndianRupee />} Record &amp; get receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
