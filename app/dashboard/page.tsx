import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/data-table";
import Link from "next/link";
import { columns } from "@/components/students/columns";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, can } from "@/lib/auth";
import { fetchStudents, type Student } from "@/lib/students-query";
import { PageContainer } from "@/components/app-shell/page-container";

// Folder-tab styling shared with the Team hub (docs/STYLE_GUIDE.md → Tabs):
// muted inactive tabs, active tab a solid brand fill sitting on the border.
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

// A registered student who hasn't pressed Submit is a DRAFT — they stay here
// until they finalize, regardless of review status (self-registered students are
// 'pending_review' from the moment their profile row is created, migration 020,
// but they shouldn't sit in "Pending approval" while the form is unfinished).
// Imported/invited rows carry registrationStatus 'in_progress' too, but their
// stage is Imported/Invited (no profile yet), so the stage check keeps them out.
const isDraft = (s: Student) =>
  s.stage === "Registered" && s.registrationStatus === "in_progress";

// "Pending approval" = a registered student in the pre-approval review loop:
// SUBMITTED and either awaiting review (pending_review) or sent back for
// corrections (changes_requested, issue #82 — awaiting the student's fix). Both
// are not-yet-approved, so neither belongs in Approved. Drafts are excluded (they
// submit first); imported/invited default to 'approved' with nothing to review.
const isPendingApproval = (s: Student) =>
  s.stage === "Registered" &&
  s.registrationStatus === "submitted" &&
  (s.reviewStatus === "pending_review" || s.reviewStatus === "changes_requested");

export const metadata: Metadata = {
  title: "Students Console",
};

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  const canImport = !!ctx && (ctx.permissions.has("*") || can(ctx, "student.intake.import"));
  const canDelete = !!ctx && (ctx.permissions.has("*") || can(ctx, "student.delete"));
  const canImpersonate =
    !!ctx && (ctx.permissions.has("*") || ctx.roles.includes("owner") || ctx.roles.includes("platform_admin"));

  const supabase = await createClient();
  const data = await fetchStudents(supabase);

  // Split the grid into three buckets: unfinished drafts, submitted-and-awaiting
  // review, and everyone else (approved registrations + imported/invited, which
  // have nothing to review). The three predicates are mutually exclusive.
  const draftStudents = data.filter(isDraft);
  const pendingStudents = data.filter(isPendingApproval);
  const approvedStudents = data.filter((s) => !isDraft(s) && !isPendingApproval(s));

  return (
    <PageContainer variant="full" className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-muted-foreground text-sm">
            Manage enrolled students, track progress, and assign mentors.
          </p>
        </div>
        {canImport && (
          <Button asChild>
            <Link href="/dashboard/students/new">+ Student</Link>
          </Button>
        )}
      </div>

      <Tabs defaultValue="approved">
        <TabsList
          variant="line"
          className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
        >
          <TabsTrigger value="approved" className={TAB_CLS}>
            Approved ({approvedStudents.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className={TAB_CLS}>
            Pending approval ({pendingStudents.length})
          </TabsTrigger>
          <TabsTrigger value="draft" className={TAB_CLS}>
            In progress ({draftStudents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approved" className="mt-4 min-w-0">
          <Card>
            <CardContent className="pt-6">
              <DataTable
                columns={columns}
                data={approvedStudents}
                searchKey="name"
                searchPlaceholder="Search students…"
                meta={{ canDelete, canImpersonate }}
                // Source (issue #83) is off by default here to keep the grid narrow
                // on phones — re-show it from the Columns menu. It stays visible on
                // the Pending tab, where "self or staff?" is the reviewer's question.
                initialColumnVisibility={{ source: false }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4 min-w-0">
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <p className="text-muted-foreground text-sm">
                Self-registered students in the review loop — <strong>submitted</strong> and awaiting
                review, or <strong>sent back</strong> for corrections (they’re emailed your remarks
                and re-appear here when they re-submit). Open a profile to approve or add remarks.
                Imported students are auto-approved and don’t appear here.
              </p>
              {pendingStudents.length === 0 ? (
                <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
                  No students are awaiting approval.
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={pendingStudents}
                  searchKey="name"
                  searchPlaceholder="Search students awaiting approval…"
                  meta={{ canDelete, canImpersonate }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="draft" className="mt-4 min-w-0">
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <p className="text-muted-foreground text-sm">
                Students who have started registering but haven’t pressed <strong>Submit</strong> yet
                — their profile is still incomplete (college is captured mid-way, so it may be blank).
                They move to <strong>Pending approval</strong> automatically once they submit.
              </p>
              {draftStudents.length === 0 ? (
                <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
                  No students are mid-registration.
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={draftStudents}
                  searchKey="name"
                  searchPlaceholder="Search in-progress students…"
                  meta={{ canDelete, canImpersonate }}
                  initialColumnVisibility={{ source: false }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
