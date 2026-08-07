"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

/**
 * Revoke a pending College Staff invite. Goes through
 * revoke_college_staff_invite() rather than a direct update because `invite`
 * RLS gates writes on user.invite / invite.resend (009) and a College Admin
 * holds neither — see the note on invite_college_staff (migration 175 §10b) for
 * why they must not.
 */
export async function revokeStaffInvite(inviteId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requirePermission("college.staff.invite");
  } catch {
    return { error: "You don't have permission to manage staff invites." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_college_staff_invite", { p_invite: inviteId });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/college-staff");
  return { ok: true };
}

/**
 * Remove a STAFF member's access to this college. Refuses another college admin —
 * a college admin may bring in a peer but not unseat one, so removing an admin
 * stays a platform action. Both rules live in remove_college_member (178); this
 * only surfaces the message.
 */
export async function removeCollegeMember(
  userId: string,
  collegeId: string,
  note?: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requirePermission("college.staff.review");
  } catch {
    return { error: "You don't have permission to manage people for this college." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_college_member", {
    p_user: userId,
    p_college: collegeId,
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/college-staff");
  return { ok: true };
}
