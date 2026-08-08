import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/app-shell/page-container";
import { StudentPerformance } from "@/components/analytics/student-performance";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student progress" };

/**
 * One student's academic progress, for staff (#111) — chapter scores, the
 * mastery grid, the trend and the study plan. The SAME component the student
 * sees on /student/insights, pointed at them via `studentId`; there is no staff
 * copy of those charts to drift.
 *
 * Authorization has two layers and only the second one matters:
 *   • this page checks the caller may look at student records at all;
 *   • perf_target() (migration 176) checks they may look at THIS student, by
 *     that student's own college, and RAISES otherwise.
 * So a college A staff member opening a college B student sees an error, never a
 * blank progress view that reads as "this student has done nothing".
 *
 * The student's identity is read here rather than in the client so the page 404s
 * on an id the caller can't see (RLS on student_profile), instead of rendering a
 * header for a student they aren't allowed to know exists.
 */
export default async function StudentProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const mayViewStudents =
    ctx.permissions.has("*") ||
    can(ctx, "user.manage") ||
    can(ctx, "student.profile.view") ||
    can(ctx, "student.profile.search") ||
    can(ctx, "college.students.view");
  if (!mayViewStudents) redirect(ctx.homePath);

  const { id } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("student_profile")
    .select("full_name, roll_number, college:college_id ( name ), app_user:user_id ( email )")
    .eq("user_id", id)
    .maybeSingle();
  if (!row) notFound();

  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const college = one(row.college as { name?: string }[] | { name?: string } | null)?.name ?? null;
  const email = one(row.app_user as { email?: string }[] | { email?: string } | null)?.email ?? null;
  const name = (row.full_name as string | null) || email || "Student";

  return (
    <PageContainer variant="full" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={`/dashboard/students/${id}`} className="text-muted-foreground text-sm hover:underline">
            ← Back to profile
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">{name}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {[college, row.roll_number as string | null].filter(Boolean).join(" · ") || "Progress"}
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href={`/dashboard/students/${id}`}>Open profile</Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        Chapter assessment results, where the gaps are, and what would move this student&rsquo;s
        average most — the same view they see of themselves.
      </p>

      <StudentPerformance studentId={id} />
    </PageContainer>
  );
}
