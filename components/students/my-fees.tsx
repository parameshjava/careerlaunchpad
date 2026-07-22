// Student "My fees" (issue #49, Phase 5): the signed-in student's enrolments with
// balances, installment schedule, and downloadable receipts. Server component
// (read-only, no hooks); data comes from fetchStudentFees (RLS-scoped to them).
import Link from "next/link";
import { Receipt } from "lucide-react";

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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

export function MyFees({ enrollments }: { enrollments: MyFeeEnrollment[] }) {
  if (enrollments.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        You&apos;re not enrolled in any course yet. Once your college enrols you, your fees and
        receipts will show here.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {enrollments.map((e) => (
        <Card key={e.enrollmentId}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">{e.courseName}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {[e.batchName, e.academicYear].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Badge variant={e.status === "completed" ? "default" : "secondary"}>
              {e.status === "completed" ? "Paid" : e.status}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-5">
            {/* Money summary */}
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Stat label="Total fee" value={formatINR(e.netFeePaise)} />
              <Stat label="Paid" value={formatINR(e.paidPaise)} />
              <Stat label="Balance" value={formatINR(e.balancePaise)} accent={e.balancePaise > 0} />
              {e.concessionType !== "none" && (
                <Stat label={CONCESSION_LABEL[e.concessionType]} value={`− ${formatINR(e.concessionPaise)}`} />
              )}
            </div>

            {/* Installment schedule */}
            {e.installments.length > 0 && (
              <div className="grid gap-2">
                <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  Installment plan
                </div>
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
                            <Badge variant={INSTALLMENT_BADGE[i.status]} className="capitalize">
                              {i.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Payments / receipts */}
            <div className="grid gap-2">
              <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Payments &amp; receipts
              </div>
              {e.payments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No payments recorded yet.</p>
              ) : (
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
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
