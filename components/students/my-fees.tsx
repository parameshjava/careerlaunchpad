// Student "My fees" (issue #49, Phase 5): the signed-in student's enrolments with
// balances, installment schedule, and downloadable receipts. Server component
// (read-only, no hooks); data comes from fetchStudentFees (RLS-scoped to them).
import Link from "next/link";
import { CheckCircle2, Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function MyFees({ enrollments }: { enrollments: MyFeeEnrollment[] }) {
  if (enrollments.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        You&apos;re not enrolled in any course yet. Browse{" "}
        <Link href="/student/courses" className="text-primary hover:underline">Courses</Link> to join one.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {enrollments.map((e) => {
        const paidInFull = e.balancePaise <= 0 && e.status !== "pending";
        const pct = e.netFeePaise > 0 ? Math.min(100, Math.round((e.paidPaise / e.netFeePaise) * 100)) : 100;
        return (
          <Card key={e.enrollmentId} className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{e.courseName}</CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  {[e.batchName, e.academicYear].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Badge variant={e.status === "completed" ? "default" : "secondary"}>
                {STATUS_LABEL[e.status] ?? e.status}
              </Badge>
            </CardHeader>

            <CardContent className="grid gap-5">
              {e.status === "pending" && (
                <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-2 text-sm">
                  Your enrolment is awaiting approval from your college. Once approved, you can pay the fee.
                </p>
              )}
              {e.status === "cancelled" && e.rejectionReason && (
                <p className="text-destructive bg-destructive/5 border-destructive/20 rounded-lg border px-3 py-2 text-sm">
                  Enrolment not approved: {e.rejectionReason}
                </p>
              )}

              {/* Fee summary: a balance panel with progress + a gross→payable breakdown */}
              {e.status !== "cancelled" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="bg-muted/40 grid content-start gap-2 rounded-lg border p-4">
                    <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                      {paidInFull ? "Status" : "Balance due"}
                    </div>
                    {paidInFull ? (
                      <div className="flex items-center gap-1.5 text-lg font-bold text-emerald-600">
                        <CheckCircle2 className="size-5" /> Fully paid
                      </div>
                    ) : (
                      <div className="text-primary text-2xl font-bold tabular-nums">{formatINR(e.balancePaise)}</div>
                    )}
                    <div className="bg-background mt-1 h-2 w-full overflow-hidden rounded-full">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      Paid {formatINR(e.paidPaise)} of {formatINR(e.netFeePaise)} · {pct}%
                    </div>
                  </div>

                  <dl className="grid grid-cols-[1fr_auto] content-start gap-x-6 gap-y-2 self-center text-sm">
                    <dt className="text-muted-foreground">Total fee</dt>
                    <dd className="text-right tabular-nums">{formatINR(e.grossFeePaise)}</dd>
                    {e.concessionPaise > 0 && (
                      <>
                        <dt className="text-muted-foreground">{CONCESSION_LABEL[e.concessionType]}</dt>
                        <dd className="text-right tabular-nums text-emerald-600">− {formatINR(e.concessionPaise)}</dd>
                      </>
                    )}
                    <dt className="border-t pt-2 font-semibold">Payable</dt>
                    <dd className="border-t pt-2 text-right font-semibold tabular-nums">{formatINR(e.netFeePaise)}</dd>
                    <dt className="text-muted-foreground">Paid to date</dt>
                    <dd className="text-right tabular-nums">{formatINR(e.paidPaise)}</dd>
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
                        <div className="min-w-0">
                          <div className="text-sm font-medium tabular-nums">{formatINR(p.amountPaise)}</div>
                          <div className="text-muted-foreground text-xs">
                            {p.receiptNo} · {MODE_LABELS[p.mode]} · {fmtDate(p.paidOn)}
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
