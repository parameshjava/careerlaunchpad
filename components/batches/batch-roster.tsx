"use client";

// Batch roster (issue #49, Phase 4): enrolled students with balances + per-row
// "Record payment" and a money summary. Enrolment opens in a right-side drawer
// (EnrolStudents in embedded mode) so staff stay in the Students tab; it scales
// to thousands via server-side search. Talks to /api/admin/enrollments/[id]/payments.
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, IndianRupee, Loader2, Receipt, UserPlus, X } from "lucide-react";

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
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/course-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EnrolStudents } from "@/components/batches/enrol-students";
import {
  CONCESSION_LABEL,
  type FeeReceipt,
  formatINR,
  MODE_LABELS,
  MODE_REFERENCE_LABEL,
  type PaymentMode,
} from "@/lib/fee-receipt";
import { FeeReceiptView } from "@/components/students/fee-receipt";
import type { BatchFee, EnrollmentLedger, RosterRow } from "@/lib/enrollment-query";

const MODES: PaymentMode[] = ["cash", "upi", "card", "online"];
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending approval",
  active: "Active",
  completed: "Paid",
  cancelled: "Cancelled",
};

const INSTALLMENT_BADGE: Record<EnrollmentLedger["installments"][number]["status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  overdue: "destructive",
  due: "secondary",
};

const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
};

export function BatchRoster({
  batchId,
  batch,
  roster,
  onChanged,
}: {
  batchId: string;
  batch: BatchFee;
  roster: RosterRow[];
  /** Called after a change (approve/reject, payment) so a client-fetched host
   * (the workspace) can invalidate its cache + refetch. The standalone page
   * relies on router.refresh() instead. */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState("");
  // Per-student master-detail: installment schedule + issued receipts, lazily
  // loaded on first expand and cached.
  const [openId, setOpenId] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, EnrollmentLedger>>({});
  const [ledgerBusy, setLedgerBusy] = useState<string | null>(null);
  const [ledgerErr, setLedgerErr] = useState("");

  async function toggleDetail(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLedgerErr("");
    if (ledgers[id]) return;
    setLedgerBusy(id);
    try {
      const res = await fetch(`/api/admin/enrollments/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load details");
      setLedgers((m) => ({ ...m, [id]: json as EnrollmentLedger }));
    } catch (e) {
      setLedgerErr((e as Error).message);
    } finally {
      setLedgerBusy(null);
    }
  }
  const [rejectFor, setRejectFor] = useState<RosterRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectErr, setRejectErr] = useState("");
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [payFor, setPayFor] = useState<RosterRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<PaymentMode>("cash");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payErr, setPayErr] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  // Receipt preview — shown in a modal so the admin stays on the roster.
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState<FeeReceipt | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptErr, setReceiptErr] = useState("");

  async function openReceipt(receiptId: string) {
    setReceiptOpen(true);
    setReceipt(null);
    setReceiptErr("");
    setReceiptBusy(true);
    try {
      const res = await fetch(`/api/admin/payments/${receiptId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load receipt");
      setReceipt(json.receipt as FeeReceipt);
    } catch (e) {
      setReceiptErr((e as Error).message);
    } finally {
      setReceiptBusy(false);
    }
  }

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
      onChanged?.();
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

  function openPay(row: RosterRow, full = false) {
    setPayFor(row);
    setPayAmount(full ? paiseToRupeeInput(row.balancePaise) : "");
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
      // Stay on the roster: refresh balances and show the new receipt in a modal.
      setPayFor(null);
      setPayBusy(false);
      router.refresh();
      onChanged?.();
      openReceipt(json.receiptId);
    } catch (e) {
      setPayErr((e as Error).message);
      setPayBusy(false);
    }
  }

  const active = roster.filter((r) => r.status !== "cancelled");
  const totals = active.reduce(
    (t, r) => ({ net: t.net + r.netFeePaise, paid: t.paid + r.paidPaise, bal: t.bal + r.balancePaise }),
    { net: 0, paid: 0, bal: 0 }
  );
  const enrolledIds = useMemo(
    () => roster.filter((r) => r.status !== "cancelled").map((r) => r.studentId),
    [roster]
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {active.length} enrolled · batch fee {formatINR(batch.grossPaise)} / student
        </p>
        <Sheet open={enrolOpen} onOpenChange={setEnrolOpen}>
          <Button onClick={() => setEnrolOpen(true)}>
            <UserPlus /> Enrol students
          </Button>
          <SheetContent side="right" className="w-full sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Enrol students</SheetTitle>
              <p className="text-muted-foreground text-sm">
                {batch.name} · fee {formatINR(batch.grossPaise)} / student
              </p>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <EnrolStudents
                batchId={batchId}
                batch={batch}
                enrolledIds={enrolledIds}
                embedded
                onClose={() => setEnrolOpen(false)}
                onDone={() => {
                  setEnrolOpen(false);
                  onChanged?.();
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Money summary */}
      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Net fee", value: totals.net },
            { label: "Collected", value: totals.paid },
            { label: "Outstanding", value: totals.bal },
          ].map((t) => (
            <div key={t.label} className="bg-card rounded-lg border p-3">
              <div className="text-muted-foreground text-xs">{t.label}</div>
              <div
                className={`mt-0.5 text-base font-semibold tabular-nums ${
                  t.label === "Outstanding" && t.value > 0 ? "text-destructive" : ""
                }`}
              >
                {formatINR(t.value)}
              </div>
            </div>
          ))}
        </div>
      )}

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
              {roster.map((r) => {
                const isOpen = openId === r.enrollmentId;
                const led = ledgers[r.enrollmentId];
                return (
                  <Fragment key={r.enrollmentId}>
                    <TableRow className="cursor-pointer" onClick={() => toggleDetail(r.enrollmentId)}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </span>
                          <div>
                            <div className="font-medium">{r.studentName}</div>
                            {r.concessionType !== "none" && (
                              <div className="text-muted-foreground text-xs">{CONCESSION_LABEL[r.concessionType]}</div>
                            )}
                            {r.status === "cancelled" && r.rejectionReason && (
                              <div className="text-destructive/80 text-xs">Rejected: {r.rejectionReason}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(r.netFeePaise)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(r.paidPaise)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatINR(r.balancePaise)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "default" : "secondary"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={r.balancePaise <= 0}
                              onClick={() => openPay(r, true)}
                              className="text-muted-foreground"
                            >
                              <Check /> Paid in full
                            </Button>
                            <Button variant="outline" size="sm" disabled={r.balancePaise <= 0} onClick={() => openPay(r)}>
                              <IndianRupee /> Record payment
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="grid gap-4 p-4">
                            {ledgerBusy === r.enrollmentId && (
                              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                                <Loader2 className="size-4 animate-spin" /> Loading details…
                              </div>
                            )}
                            {ledgerErr && !led && ledgerBusy !== r.enrollmentId && (
                              <p className="text-destructive text-sm">{ledgerErr}</p>
                            )}
                            {led && led.installments.length === 0 && led.payments.length === 0 && (
                              <p className="text-muted-foreground text-sm">
                                No installments scheduled and no receipts issued yet.
                              </p>
                            )}
                            {led && (led.installments.length > 0 || led.payments.length > 0) && (
                              <div className="grid gap-5 lg:grid-cols-2">
                                {led.installments.length > 0 && (
                                  <div className="grid content-start gap-2">
                                    <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                                      Installment plan
                                    </div>
                                    <div className="bg-background overflow-x-auto rounded-lg border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-10">#</TableHead>
                                            <TableHead>Due</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {led.installments.map((i) => (
                                            <TableRow key={i.seq}>
                                              <TableCell className="tabular-nums">{i.seq}</TableCell>
                                              <TableCell>{fmtDate(i.dueOn)}</TableCell>
                                              <TableCell className="text-right tabular-nums">{formatINR(i.amountPaise)}</TableCell>
                                              <TableCell>
                                                <Badge variant={INSTALLMENT_BADGE[i.status]} className="capitalize">{i.status}</Badge>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                )}
                                {led.payments.length > 0 && (
                                  <div className="grid content-start gap-2">
                                    <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                                      Payments &amp; receipts
                                    </div>
                                    <ul className="bg-background divide-y rounded-lg border">
                                      {led.payments.map((p) => (
                                        <li key={p.receiptId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                          <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                                              <Receipt className="size-4" />
                                            </span>
                                            <div className="min-w-0">
                                              <div className="text-sm font-semibold tabular-nums">{formatINR(p.amountPaise)}</div>
                                              <div className="text-muted-foreground truncate text-xs">
                                                {p.receiptNo} · {MODE_LABELS[p.mode]} · {fmtDate(p.paidOn)}
                                              </div>
                                            </div>
                                          </div>
                                          <Button variant="outline" size="sm" onClick={() => openReceipt(p.receiptId)}>
                                            <Receipt /> Receipt
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
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

      {/* Receipt preview dialog — keeps the admin on the roster */}
      <Dialog open={receiptOpen} onOpenChange={(o) => { setReceiptOpen(o); if (!o) setReceipt(null); }}>
        <DialogContent className="max-h-[92vh] overflow-auto p-4 sm:max-w-[880px]">
          <DialogHeader className="sr-only">
            <DialogTitle>Payment receipt</DialogTitle>
          </DialogHeader>
          {receiptBusy ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-20 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading receipt…
            </div>
          ) : receiptErr ? (
            <p className="text-destructive py-20 text-center text-sm">{receiptErr}</p>
          ) : receipt ? (
            <FeeReceiptView receipt={receipt} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
