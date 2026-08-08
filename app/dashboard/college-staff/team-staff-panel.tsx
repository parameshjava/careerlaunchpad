/**
 * The "College staff" tab in the Team hub — the platform-side view of #107.
 *
 * Deliberately NOT the whole StaffConsole: that has five tabs of its own, and
 * tabs inside a tab is a bad place to make an approval decision. This shows the
 * two things a platform admin needs from the Team hub — how many are waiting,
 * and who — and hands off to /dashboard/college-staff for everything else. The
 * roster itself is not duplicated.
 *
 * A server component: it only renders what the page already fetched.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { StaffRow, StaffInviteRow } from "@/lib/college-staff-list";

export function TeamStaffPanel({
  rows,
  invites,
}: {
  rows: StaffRow[];
  invites: StaffInviteRow[];
}) {
  const pending = rows.filter((r) => r.status === "pending_review" || r.status === "changes_requested");
  const counts = [
    { label: "Awaiting approval", value: pending.length },
    { label: "Approved", value: rows.filter((r) => r.status === "approved").length },
    { label: "Invited", value: invites.length },
    { label: "Suspended", value: rows.filter((r) => r.status === "suspended").length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Faculty and staff across every college. Each college&rsquo;s own admin approves their
          people; you can approve for any college.
        </p>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/dashboard/college-staff">Open college staff</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border p-4">
            <p className="text-2xl font-semibold">{c.value}</p>
            <p className="text-muted-foreground text-xs">{c.label}</p>
          </div>
        ))}
      </div>

      {pending.length === 0 ? (
        <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          Nobody is waiting for approval.
        </div>
      ) : (
        <ul className="grid gap-2 [&>li]:min-w-0">
          {pending.map((r) => (
            <li key={r.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/college-staff/${r.userId}`} className="font-medium hover:underline">
                  {r.name || r.email}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {[r.college, r.designation].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={`/dashboard/college-staff/${r.userId}`}>Review</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
