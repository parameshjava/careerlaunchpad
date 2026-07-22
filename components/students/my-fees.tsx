// Student "My fees" (issue #49, Phase 5): the signed-in student's enrolments with
// balances, installment schedule, and downloadable receipts. Server component
// (read-only, no hooks); data comes from fetchStudentFees (RLS-scoped to them).
import Link from "next/link";
import { CheckCircle2, GraduationCap, Receipt, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONCESSION_LABEL, formatINR, MODE_LABELS } from "@/lib/fee-receipt";
import type { MyFeeEnrollment } from "@/lib/enrollment-query";

// Brand gradient tint (matches the registration SectionCard); reserved for accents.
const BAND = "bg-gradient-to-r from-[#2563eb]/[0.06] to-[#7c3aed]/[0.06]";
const BAR = "bg-gradient-to-r from-[#2563eb] to-[#7c3aed]";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
};

const INSTALLMENT_BADGE: Record<MyFeeEnrollment["installments"][number]["status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  overdue: "destructive",
  due: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending approval",
  active: "Active",
  completed: "Paid",
  cancelled: "Cancelled",
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  active: "bg-primary/10 text-primary",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive",
};

export function MyFees({ enrollments }: { enrollments: MyFeeEnrollment[] }) {
  if (enrollments.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        You&apos;re not enrolled in any course yet. Browse{" "}
        <Link href="/student/courses" className="text-primary hover:underline">Courses</Link> to join one.
      </div>
    );
  }

  const active = enrollments.filter((e) => e.status !== "cancelled");
  // Only approved enrolments are payable — a 'pending' one isn't owed until the
  // college accepts it (and payment is refused until then), so it doesn't count
  // toward Outstanding.
  const outstanding = enrollments
    .filter((e) => e.status === "active" || e.status === "completed")
    .reduce((s, e) => s + Math.max(0, e.balancePaise), 0);
  const paid = enrollments.reduce((s, e) => s + e.paidPaise, 0);

  return (
    <div className="grid gap-5">
      {/* At-a-glance summary across all courses */}
      <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 ${BAND}`}>
        <SummaryTile label="Outstanding" value={formatINR(outstanding)} accent />
        <SummaryTile label="Paid so far" value={formatINR(paid)} />
        <SummaryTile label="Courses" value={String(active.length)} className="col-span-2 sm:col-span-1" />
      </div>

      {enrollments.map((e) => {
        const paidInFull = e.balancePaise <= 0 && e.status !== "pending";
        const pct = e.netFeePaise > 0 ? Math.min(100, Math.round((e.paidPaise / e.netFeePaise) * 100)) : 100;
        const cancelled = e.status === "cancelled";
        return (
          <Card key={e.enrollmentId} className="overflow-hidden py-0">
            {/* Header band */}
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${BAND}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="bg-background flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-sm">
                  <GraduationCap className="text-primary size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{e.courseName}</h3>
                  <p className="text-muted-foreground truncate text-sm">
                    {[e.batchName, e.academicYear].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[e.status] ?? "bg-muted text-muted-foreground"}`}>
                {STATUS_LABEL[e.status] ?? e.status}
              </span>
            </div>

            <CardContent className="grid gap-5 p-5">
              {e.status === "pending" && (
                <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-2 text-sm">
                  Your enrolment is awaiting approval from your college. Once approved, you can pay the fee.
                </p>
              )}
              {cancelled && e.rejectionReason && (
                <p className="text-destructive bg-destructive/5 border-destructive/20 rounded-lg border px-3 py-2 text-sm">
                  Enrolment not approved: {e.rejectionReason}
                </p>
              )}

              {!cancelled && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {/* Balance + progress */}
                  <div className="bg-muted/40 grid content-start gap-2.5 rounded-xl border p-4">
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                      <Wallet className="size-3.5" /> {paidInFull ? "Status" : "Balance due"}
                    </div>
                    {paidInFull ? (
                      <div className="flex items-center gap-1.5 text-xl font-bold text-emerald-600">
                        <CheckCircle2 className="size-5" /> Fully paid
                      </div>
                    ) : (
                      <div className="text-primary text-3xl font-bold tabular-nums">{formatINR(e.balancePaise)}</div>
                    )}
                    <div className="bg-background mt-1 h-2.5 w-full overflow-hidden rounded-full">
                      <div className={`h-full rounded-full ${BAR}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      Paid {formatINR(e.paidPaise)} of {formatINR(e.netFeePaise)} · {pct}%
                    </div>
                  </div>

                  {/* Breakdown */}
                  <dl className="grid grid-cols-[1fr_auto] content-center gap-x-6 gap-y-2.5 text-sm">
                    <dt className="text-muted-foreground">Total fee</dt>
                    <dd className="text-right tabular-nums">{formatINR(e.grossFeePaise)}</dd>
                    {e.concessionPaise > 0 && (
                      <>
                        <dt className="text-muted-foreground">{CONCESSION_LABEL[e.concessionType]}</dt>
                        <dd className="text-right tabular-nums text-emerald-600">− {formatINR(e.concessionPaise)}</dd>
                      </>
                    )}
                    <dt className="border-t pt-2.5 font-semibold">Payable</dt>
                    <dd className="border-t pt-2.5 text-right font-semibold tabular-nums">{formatINR(e.netFeePaise)}</dd>
                    <dt className="text-muted-foreground">Paid to date</dt>
                    <dd className="text-right tabular-nums text-emerald-600">{formatINR(e.paidPaise)}</dd>
                  </dl>
                </div>
              )}

              {/* Installment schedule */}
              {e.installments.length > 0 && (
                <div className="grid gap-2">
                  <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Installment plan</div>
                  <div className="overflow-x-auto rounded-lg border">
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
                        {e.installments.map((i) => (
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

              {/* Payments / receipts */}
              {e.payments.length > 0 && (
                <div className="grid gap-2">
                  <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Payments &amp; receipts</div>
                  <ul className="divide-y rounded-lg border">
                    {e.payments.map((p) => (
                      <li key={p.receiptId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 flex size-9 shrink-0 items-center justify-center rounded-full">
                            <Receipt className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold tabular-nums">{formatINR(p.amountPaise)}</div>
                            <div className="text-muted-foreground truncate text-xs">
                              {p.receiptNo} · {MODE_LABELS[p.mode]} · {fmtDate(p.paidOn)}
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/student/fees/receipt/${p.receiptId}`}>
                            <Receipt /> Receipt
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`bg-background/60 px-4 py-3 ${className ?? ""}`}>
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
