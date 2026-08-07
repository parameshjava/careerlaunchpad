import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/app-shell/page-container";
import { CollegeNavPicker } from "@/components/analytics/college-nav-picker";
import { StaffHelp } from "@/components/college-staff/staff-help";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCollegeOverview } from "@/lib/college-overview-query";

export const metadata: Metadata = { title: "My college" };

/**
 * "My college" — the one screen that answers *what is going on here* for a
 * college's staff (#107: "see ... all the activity going on for their college").
 *
 * Composed from current state, not an event log: where the students are, how far
 * each batch has got, what is on next, and what is waiting on someone. Each tile
 * is a link into the page that can act on it, so this is a starting point rather
 * than a dead-end dashboard.
 */
export default async function CollegeOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ college?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const mayView =
    ctx.permissions.has("*") ||
    can(ctx, "college.students.view") ||
    can(ctx, "college.analytics.view") ||
    can(ctx, "user.manage");
  if (!mayView) redirect(ctx.homePath);

  // A scoped grant pins the college; an unscoped one picks.
  const isGlobal = ctx.permissions.has("*") || ctx.collegeScopes.length === 0;
  const { college: collegeParam } = await searchParams;
  const collegeId = isGlobal ? (collegeParam ?? null) : ctx.collegeScopes[0];

  const supabase = await createClient();
  const [overview, selected] = await Promise.all([
    fetchCollegeOverview(supabase, collegeId),
    collegeId
      ? supabase.from("college").select("id, name, place, state").eq("id", collegeId).maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const canSeeStaff = can(ctx, "college.staff.view");

  const tiles = [
    { label: "Approved students", value: overview.students.registered, href: "/dashboard", hint: "active on the platform" },
    { label: "Awaiting approval", value: overview.students.pendingApproval, href: "/dashboard?tab=pending", hint: "submitted, not yet reviewed" },
    { label: "Mid-registration", value: overview.students.drafts, href: "/dashboard", hint: "started, not submitted" },
    { label: "Yet to sign in", value: overview.students.awaitingSignup, href: "/dashboard", hint: "imported or invited" },
  ];

  return (
    <PageContainer variant="full" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {selected?.name ?? "My college"}
        </h1>
        <p className="text-muted-foreground text-sm">
          Your students, your batches and what&rsquo;s coming up — everything scoped to this college.
        </p>
      </div>

      {isGlobal && <CollegeNavPicker selected={selected ?? null} />}

      {!collegeId ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            Search and select a college above to see its overview.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href} className="group">
                <Card className="group-hover:border-primary/50 h-full transition-colors">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-semibold">{t.value}</div>
                    <p className="mt-0.5 text-sm font-medium">{t.label}</p>
                    <p className="text-muted-foreground text-xs">{t.hint}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {canSeeStaff && overview.staff.pending > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <span>
                <b>{overview.staff.pending}</b> staff{" "}
                {overview.staff.pending === 1 ? "registration is" : "registrations are"} waiting for
                your approval.
              </span>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/dashboard/college-staff?tab=pending">Review</Link>
              </Button>
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Batches</h2>
                <p className="text-muted-foreground text-sm">
                  How much of each batch&rsquo;s syllabus has been covered so far.
                </p>
              </div>
            </div>

            {overview.batches.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground py-10 text-center text-sm">
                  No batches are linked to this college yet.
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-3 [&>li]:min-w-0">
                {overview.batches.map((b) => {
                  const pct = b.chaptersTotal ? Math.round((100 * b.chaptersDone) / b.chaptersTotal) : 0;
                  return (
                    <li key={b.batchId} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold break-words">{b.name}</p>
                          <p className="text-muted-foreground mt-0.5 text-sm">
                            {b.enrolled} enrolled · {b.subjects} subject{b.subjects === 1 ? "" : "s"}
                            {b.chaptersTotal > 0 && ` · ${b.chaptersDone}/${b.chaptersTotal} chapters done`}
                          </p>
                        </div>
                        <span className="text-muted-foreground bg-muted shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {b.status}
                        </span>
                      </div>
                      {b.chaptersTotal > 0 && (
                        <div
                          className="bg-muted mt-3 h-2 overflow-hidden rounded-full"
                          role="img"
                          aria-label={`${pct}% of chapters completed`}
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Coming up</h2>
            {overview.upcoming.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground py-10 text-center text-sm">
                  No sessions are scheduled.
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-2 [&>li]:min-w-0">
                {overview.upcoming.map((s) => (
                  <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.title || s.subjectName || "Session"}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[s.batchName, s.subjectName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <time className="text-muted-foreground shrink-0 text-xs tabular-nums" dateTime={s.startsAt}>
                      {new Date(s.startsAt).toLocaleString(undefined, {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <StaffHelp canSeeStaff={canSeeStaff} />
        </>
      )}
    </PageContainer>
  );
}
