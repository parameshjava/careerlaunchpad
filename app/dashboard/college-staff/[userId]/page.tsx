import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/app-shell/page-container";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StaffStatus } from "@/lib/college-staff-list";
import { StaffDetail } from "./staff-detail";

export const metadata: Metadata = { title: "Staff member" };

/**
 * One staff member: the record, the review history, and the approve / send-back
 * / suspend actions.
 *
 * There is no explicit "is this my college?" check here on purpose. The read
 * below runs as the caller, so RLS (college_staff_profile_college_read) returns
 * nothing for another college's staff and this 404s — the same answer as a
 * non-existent id, which is the right one: a 403 would confirm the record
 * exists.
 */
export default async function StaffMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const canView = can(ctx, "college.staff.view");
  const canReview = can(ctx, "college.staff.review");
  if (!canView && !canReview) redirect(ctx.homePath);

  const { userId } = await params;
  const supabase = await createClient();

  const [{ data: row }, { data: notes }, { data: designations }] = await Promise.all([
    supabase
      .from("college_staff_profile")
      .select(
        `full_name, status, staff_source, employee_code, designation_id, designation_other,
         college:college_id ( name ),
         app_user:app_user!college_staff_profile_user_id_fkey ( email )`,
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("college_staff_review_note")
      .select("body, kind, created_at, resolved_at")
      .eq("staff_user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("ref_staff_designation").select("id, label"),
  ]);

  if (!row) notFound();

  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const designationMap = new Map(((designations ?? []) as { id: string; label: string }[]).map((d) => [d.id, d.label]));
  const designationLabel = designationMap.get(row.designation_id as string) ?? null;
  const designation =
    designationLabel?.toLowerCase() === "other" && row.designation_other
      ? (row.designation_other as string)
      : designationLabel;

  return (
    <PageContainer variant="form">
      <StaffDetail
        userId={userId}
        name={(row.full_name as string | null) ?? null}
        email={one(row.app_user as { email?: string }[] | { email?: string } | null)?.email ?? null}
        status={(row.status as StaffStatus) ?? "pending_review"}
        source={(row.staff_source as "self" | "invited") ?? "self"}
        collegeName={one(row.college as { name?: string }[] | { name?: string } | null)?.name ?? null}
        employeeCode={(row.employee_code as string | null) ?? null}
        designation={designation}
        canReview={canReview}
        notes={(notes ?? []) as { body: string; kind: string; created_at: string; resolved_at: string | null }[]}
      />
    </PageContainer>
  );
}
