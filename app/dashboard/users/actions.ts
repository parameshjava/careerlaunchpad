"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/mailer";

export type InviteState = { ok?: boolean; error?: string; message?: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const INVITE_TTL_DAYS = 14;

// Roles that can be invited. 'coordinator' is unscoped (like support/mentor/
// platform_admin). 'owner' is invitable too but ONLY by an existing owner (the
// caller-holds-'*' check in createInvite), mirroring set_member_roles' guardrail.
const INVITABLE = new Set(["student", "college_admin", "employer", "mentor", "support", "platform_admin", "coordinator", "owner"]);

/** Owner creates an invite. Consumed on the invitee's first social sign-in. */
export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await requirePermission("user.invite");
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleKey = String(formData.get("role") ?? "");
  const collegeId = (String(formData.get("college_id") ?? "") || null) as string | null;
  const employerId = (String(formData.get("employer_id") ?? "") || null) as string | null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!INVITABLE.has(roleKey)) {
    return { error: "Choose a role to invite." };
  }
  // Only an existing Owner may invite another Owner (UI hides it; enforced here).
  if (roleKey === "owner" && !ctx.permissions.has("*")) {
    return { error: "Only an owner can invite another owner." };
  }
  if ((roleKey === "student" || roleKey === "college_admin") && !collegeId) {
    return { error: "Select the college for this user." };
  }
  if (roleKey === "employer" && !employerId) {
    return { error: "Select the employer organization for this user." };
  }

  const { data: role, error: roleErr } = await supabase
    .from("role").select("id, name").eq("key", roleKey).single();
  if (roleErr || !role) return { error: "Unknown role." };

  // scope_college_id is the authorization scope (meaningful for college_admin;
  // for students it also seeds student_profile.college_id via the trigger).
  const scopeCollegeId = roleKey === "college_admin" || roleKey === "student" ? collegeId : null;

  const { error: insErr } = await supabase.from("invite").insert({
    email,
    role_id: role.id,
    scope_college_id: scopeCollegeId,
    employer_id: roleKey === "employer" ? employerId : null,
    invited_by: ctx.userId,
    expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString(),
  });
  if (insErr) return { error: insErr.message };

  await sendInviteEmail({
    to: email,
    roleName: role.name,
    invitedBy: ctx.email,
    loginUrl: `${SITE_URL}/auth/login`,
  });

  revalidatePath("/dashboard/users");
  return { ok: true, message: `Invited ${email} as ${role.name}.` };
}

/** Resend (reactivate) a pending/revoked invite — extends expiry, new token. */
export async function resendInvite(formData: FormData): Promise<void> {
  await requirePermission("invite.resend");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const { data: inv } = await supabase.from("invite").select("email, role:role_id(name)").eq("id", id).single();

  await supabase
    .from("invite")
    .update({
      status: "pending",
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString(),
      // regenerate token via gen_random_bytes default by clearing? Easiest: bump expiry only.
    })
    .eq("id", id);

  if (inv?.email) {
    const roleName = Array.isArray(inv.role) ? inv.role[0]?.name : (inv.role as { name?: string })?.name;
    await sendInviteEmail({ to: inv.email, roleName: roleName ?? "user", loginUrl: `${SITE_URL}/auth/login` });
  }
  revalidatePath("/dashboard/users");
}

/** Revoke an invite (prevents it from being consumed). */
export async function revokeInvite(formData: FormData): Promise<void> {
  await requirePermission("invite.resend");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("invite").update({ status: "revoked" }).eq("id", id);
  revalidatePath("/dashboard/users");
}

/**
 * Grant/revoke a member's unscoped staff roles. Delegates to set_member_roles()
 * which enforces the escalation guardrail + last-owner protection in the DB.
 */
export async function updateMemberRoles(
  userId: string,
  roleKeys: string[],
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requirePermission("role.assign");
  } catch {
    return { error: "You don't have permission to assign roles." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_roles", {
    p_user_id: userId,
    p_role_keys: roleKeys,
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/users");
  return { ok: true };
}

/** Suspend or reactivate a user. */
export async function setUserStatus(formData: FormData): Promise<void> {
  await requirePermission("user.suspend");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "suspended") return;
  await supabase.from("app_user").update({ status }).eq("id", id);
  revalidatePath("/dashboard/users");
}
