"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import {
  assertDevAuth, isAllowedTestEmail, TEST_EMAIL_HINT, SEED_ROLES, SCOPED_SEED_ROLES,
} from "@/lib/dev-auth";

/**
 * Local-only test-account tooling. Every action re-checks assertDevAuth() — see
 * the note in lib/dev-auth.ts on why the guard is per-entry-point rather than
 * upstream.
 */

export type DevResult = { ok?: boolean; error?: string; message?: string };

/**
 * Sign in as `email` without a password, an OAuth round-trip, or a real inbox.
 *
 * Same mechanism as platform-admin impersonation: generateLink() only GENERATES
 * a magic-link token (Supabase sends no email for it), and verifyOtp() on the
 * cookie-bound client swaps the browser to that identity. The resulting session
 * is indistinguishable from a real sign-in, which is the whole point.
 *
 * Deliberately does NOT set the impersonation cookies: this is not an admin
 * viewing a user, it is you *being* that user, and an Exit banner offering to
 * restore a session that never existed would be a lie.
 */
export async function devSignInAs(email: string): Promise<DevResult> {
  try {
    assertDevAuth();
  } catch {
    return { error: "Dev sign-in is disabled." };
  }

  const target = email.trim().toLowerCase();
  if (!target) return { error: "Pick a user." };

  const admin = createAdminClient();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target,
  });
  const props = link?.properties as { hashed_token?: string; verification_type?: string } | undefined;
  const tokenHash = props?.hashed_token;
  if (linkErr || !tokenHash) {
    return { error: linkErr?.message ?? "Could not mint a session for that user." };
  }

  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: (props?.verification_type ?? "email") as EmailOtpType,
  });
  if (otpErr) return { error: otpErr.message };

  // Land where this user actually belongs, so the shortcut also tells you what
  // the role resolves to — an unprovisioned account goes to /auth/no-access, a
  // pending staff member to /college-staff, an approved one to /dashboard.
  const ctx = await getAuthContext();
  redirect(ctx?.homePath ?? "/auth/no-access");
}

/**
 * Create a confirmed test account (no email is sent, no inbox needed) and
 * optionally provision a role.
 *
 * Provisioning is done with the admin client rather than through
 * set_member_roles / set_college_admin / set_college_staff: those RPCs check
 * has_permission() against auth.uid(), and a seeder has no session. Writing the
 * rows directly is honest about what this is — a fixture loader, not a
 * privilege-escalation path that exists in production.
 */
export async function devCreateUser(_prev: DevResult, formData: FormData): Promise<DevResult> {
  try {
    assertDevAuth();
  } catch {
    return { error: "Dev sign-in is disabled." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleKey = String(formData.get("role") ?? "none");
  const collegeId = String(formData.get("college_id") ?? "") || null;
  const fullName = String(formData.get("full_name") ?? "").trim() || null;

  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!isAllowedTestEmail(email)) {
    return { error: `That looks like a real address. ${TEST_EMAIL_HINT}` };
  }
  if (!SEED_ROLES.some((r) => r.key === roleKey)) {
    return { error: "Unknown role." };
  }
  if (SCOPED_SEED_ROLES.has(roleKey) && !collegeId) {
    return { error: "That role is scoped to a college — pick one." };
  }

  const admin = createAdminClient();

  // email_confirm so a later sign-in (dev or real) links to this account.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  let userId = created?.user?.id;
  if (createErr) {
    const exists =
      (createErr as { code?: string }).code === "email_exists" ||
      /already.*registered|already exists/i.test(createErr.message);
    if (!exists) return { error: createErr.message };
    // Already there — reuse it so the form is idempotent, which is what you want
    // when re-seeding after a reset.
    const { data: found } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    userId = found?.user?.id;
    if (!userId) return { error: "That account exists but could not be read back." };
  }
  if (!userId) return { error: "Could not create the account." };

  if (roleKey === "none") {
    // No app_user row either: an account that has never been provisioned is
    // exactly what the self-registration paths expect to meet.
    revalidatePath("/dev/auth");
    return { ok: true, message: `Created ${email} with no role — sign in and self-register.` };
  }

  const { error: userErr } = await admin
    .from("app_user")
    .upsert({ id: userId, email, full_name: fullName }, { onConflict: "id" });
  if (userErr) return { error: userErr.message };

  const { data: role } = await admin.from("role").select("id").eq("key", roleKey).maybeSingle();
  if (!role) return { error: `Role ${roleKey} not found — are migrations applied?` };

  // A plain INSERT, not an upsert: user_role's uniqueness comes from two PARTIAL
  // indexes (001_rbac_core.sql:58-65 — one for scoped grants, one for unscoped),
  // and ON CONFLICT cannot infer a partial index without repeating its predicate,
  // which PostgREST has no way to express. So insert and treat a duplicate as
  // success, which is what re-seeding wants anyway.
  const { error: roleErr } = await admin.from("user_role").insert({
    user_id: userId,
    role_id: role.id,
    scope_college_id: SCOPED_SEED_ROLES.has(roleKey) ? collegeId : null,
  });
  if (roleErr && !/duplicate|unique/i.test(roleErr.message)) return { error: roleErr.message };

  // The profile rows the app expects a provisioned user of each kind to have.
  if (roleKey === "student") {
    await admin
      .from("student_profile")
      .upsert({ user_id: userId, college_id: collegeId, full_name: fullName }, { onConflict: "user_id" });
  }
  if (roleKey === "college_staff") {
    await admin.from("college_staff_profile").upsert(
      {
        user_id: userId,
        college_id: collegeId,
        full_name: fullName,
        staff_source: "invited",
        status: "approved",
        registration_status: "submitted",
        last_completed_step: 3,
      },
      { onConflict: "user_id" },
    );
  }

  revalidatePath("/dev/auth");
  return { ok: true, message: `Created ${email} as ${roleKey}.` };
}

/** Sign out, so you can pick a different user. */
export async function devSignOut(): Promise<void> {
  assertDevAuth();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/dev/auth");
}

/**
 * Delete a test account outright — the seeder's undo. Cascades through
 * auth.users, so app_user and every profile/role row keyed to it go too. Refuses
 * anything that isn't on a reserved test domain, so it can never be pointed at a
 * real user even by hand-editing the form.
 */
export async function devDeleteUser(email: string): Promise<DevResult> {
  try {
    assertDevAuth();
  } catch {
    return { error: "Dev sign-in is disabled." };
  }
  const target = email.trim().toLowerCase();
  if (!isAllowedTestEmail(target)) {
    return { error: "Only accounts on a reserved test domain can be deleted here." };
  }

  const admin = createAdminClient();
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: target });
  const id = link?.user?.id;
  if (!id) return { error: "No such account." };

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message };
  await admin.from("invite").delete().ilike("email", target);

  revalidatePath("/dev/auth");
  return { ok: true, message: `Deleted ${target}.` };
}
