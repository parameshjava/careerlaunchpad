import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/app-shell/page-container";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SubjectPick } from "@/components/college-staff/staff-fields";
import { InviteStaffWizard, type EditInvite } from "./invite-wizard";

export const metadata: Metadata = { title: "Invite staff" };

/**
 * Invite a member of college staff — or edit an invite that hasn't been signed
 * into yet (?invite=<id>).
 *
 * The college is resolved SERVER-side and passed down read-only: a College Admin
 * gets their own (from their scoped grant), a Platform Admin gets the one they
 * picked. The client never chooses it, and invite_college_staff() re-checks the
 * caller's authorization for whatever college does arrive — so a forged
 * college_id in the request body is refused by the database, not by this page.
 */
export default async function InviteStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ college?: string; invite?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "college.staff.invite")) redirect(ctx.homePath);

  const { college: collegeParam, invite: inviteId } = await searchParams;
  const supabase = await createClient();

  // Editing: the college comes from the invite itself, never the query string.
  let editInvite: EditInvite | null = null;
  let collegeId: string | undefined;

  if (inviteId) {
    const { data } = await supabase.rpc("college_staff_invites");
    const row = ((data ?? []) as Record<string, unknown>[]).find((r) => r.id === inviteId);
    if (!row) redirect("/dashboard/college-staff?tab=invited");
    const staged = (row.staged_profile ?? {}) as Record<string, unknown>;
    const { subjects, ...profile } = staged;
    editInvite = {
      id: row.id as string,
      email: row.email as string,
      profile,
      subjects: (Array.isArray(subjects) ? subjects : []) as SubjectPick[],
    };
    collegeId = row.scope_college_id as string;
  } else {
    const scoped = ctx.permissions.has("*") ? undefined : ctx.collegeScopes[0];
    collegeId = scoped ?? collegeParam;
  }

  // A platform admin who hasn't chosen a college yet can't invite into one.
  if (!collegeId) {
    return (
      <PageContainer variant="form">
        <div className="bg-card rounded-3xl border p-8 text-center">
          <h1 className="text-xl font-bold">Which college?</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick a college on the staff page first — an invite is always scoped to one college.
          </p>
          <Button asChild className="mt-5">
            <Link href="/dashboard/college-staff">Choose a college</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const { data: college } = await supabase
    .from("college")
    .select("id, name, place, state")
    .eq("id", collegeId)
    .maybeSingle();
  if (!college) redirect("/dashboard/college-staff");

  return (
    <PageContainer variant="form">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {editInvite ? "✏️ Edit staff invite" : "🏫 Invite college staff"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {college.name}
          {college.place ? ` — ${college.place}` : ""}
        </p>
        {!editInvite && (
          <p className="text-muted-foreground mt-2 text-sm">
            Fill in what you know — they can complete the rest themselves. Because you&rsquo;re
            inviting them, they&rsquo;re approved automatically.
          </p>
        )}
      </header>
      <InviteStaffWizard college={college} editInvite={editInvite} />
    </PageContainer>
  );
}
