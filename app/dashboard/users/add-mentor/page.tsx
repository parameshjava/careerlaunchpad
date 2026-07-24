import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddMentorWizard, type EditInvite } from "./add-mentor-wizard";
import { PageContainer } from "@/components/app-shell/page-container";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// Add a mentor with their full profile (same wizard as mentor self-registration),
// staged + invited in one shot. With ?invite=<id> it instead EDITS that pending
// invite's staged profile (before the mentor signs in). Owner / Admin (user.invite).
export default async function AddMentorPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "user.invite")) redirect("/dashboard");

  const { invite } = await searchParams;
  let editInvite: EditInvite | null = null;
  if (invite) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("invite")
      .select("id, email, status, staged_profile, role:role_id(key), college:scope_college_id(id, name, place, state)")
      .eq("id", invite)
      .maybeSingle();
    const roleKey = one(data?.role as { key?: string } | { key?: string }[] | null)?.key;
    if (data && data.status === "pending" && roleKey === "mentor") {
      editInvite = {
        id: data.id as string,
        email: (data.email as string) ?? "",
        profile: (data.staged_profile as Record<string, unknown>) ?? {},
        college: one(data.college as never),
      };
    }
  }

  const editing = !!editInvite;

  return (
    <PageContainer variant="form">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{editing ? "Edit mentor invite" : "Add a mentor"}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {editing ? (
            <>Update this invited mentor’s details before they sign in. Changes are saved to the pending invite and applied when they first log in.</>
          ) : (
            <>Fill the same details a mentor would on sign-up — skills, subjects, mentoring areas, experience.
            They’re emailed a login link and show as Pending until they sign in; their profile is already filled in.</>
          )}
        </p>
      </header>
      <AddMentorWizard editInvite={editInvite} />
    </PageContainer>
  );
}
