import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/students/columns";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, can } from "@/lib/auth";
import { fetchStudents } from "@/lib/students-query";
import { setStudentStatus } from "./students/actions";

export const metadata: Metadata = {
  title: "Students Console",
};

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  const canReview = !!ctx && (ctx.permissions.has("*") || can(ctx, "student.review"));

  const supabase = await createClient();
  const data = await fetchStudents(supabase);

  // Self-registered students who submitted and are still awaiting approval.
  const awaitingApproval = data.filter(
    (s) => s.stage === "Registered" && s.registrationStatus === "submitted" && s.reviewStatus === "pending_review",
  );

  const registered = data.filter((s) => s.stage === "Registered").length;
  const awaiting = data.filter((s) => s.stage !== "Registered").length;
  const colleges = new Set(data.map((s) => s.college).filter(Boolean)).size;

  const stats = [
    { label: "Total Students", value: String(data.length), hint: "imported + registered" },
    { label: "Registered", value: String(registered), hint: "signed in & provisioned" },
    { label: "Awaiting Sign-up", value: String(awaiting), hint: "imported / invited" },
    { label: "Colleges", value: String(colleges), hint: "represented" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-muted-foreground text-sm">
          Manage enrolled students, track progress, and assign mentors.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
              <p className="text-muted-foreground text-xs">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {canReview && awaitingApproval.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting approval ({awaitingApproval.length})</CardTitle>
            <CardDescription>
              Self-registered students who’ve submitted their profile. Approve to grant full access
              (they’re emailed); imported students are auto-approved and don’t appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {awaitingApproval.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.name ?? s.email}</div>
                  <div className="text-muted-foreground truncate text-sm">
                    {[s.email, s.college, s.course].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={setStudentStatus}>
                    <input type="hidden" name="user_id" value={s.id} />
                    <input type="hidden" name="status" value="approved" />
                    <Button type="submit" size="sm">Approve</Button>
                  </form>
                  <form action={setStudentStatus}>
                    <input type="hidden" name="user_id" value={s.id} />
                    <input type="hidden" name="status" value="suspended" />
                    <Button type="submit" size="sm" variant="outline">Suspend</Button>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data}
            searchKey="name"
            searchPlaceholder="Search students…"
          />
        </CardContent>
      </Card>
    </div>
  );
}
