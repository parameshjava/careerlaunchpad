"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Start a College Staff self-registration for `collegeId`.
 *
 * Unlike registerAsStudent / registerAsMentor (app/auth/no-access/actions.ts),
 * this cannot be a bare "click to become X" action: the college has to be chosen
 * FIRST, because it decides who reviews the registration and it is pinned once
 * approved (migration 175 §6). So the no-access card links to the register page,
 * which asks the question and calls this.
 *
 * Provisioning happens in the DB via register_as_college_staff() — it creates the
 * app_user and a pending_review profile but grants NO role, which is the whole
 * point: access starts at approval, not at registration (#107 §3.2). RLS alone
 * can't do this (an unprovisioned user has no role and so cannot insert), and
 * there is deliberately no self-INSERT policy on the table.
 */
export async function startStaffRegistration(
  collegeId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  if (!collegeId) return { error: "Choose the college you work at." };

  const { error } = await supabase.rpc("register_as_college_staff", { p_college: collegeId });
  if (error) return { error: error.message };

  revalidatePath("/college-staff");
  revalidatePath("/college-staff/register");
  return { ok: true };
}
