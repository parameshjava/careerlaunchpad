"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Self-register the signed-in (but unprovisioned) user as a STUDENT, then send
 * them into the registration form. Provisioning happens in the DB via the
 * security-definer `register_as_student()` RPC (migration 014) — it creates the
 * app_user, assigns the student role, and seeds a stub profile, but no-ops if
 * the user already has a role. RLS alone can't do this (an unprovisioned user
 * has no role and so can't insert), which is exactly why the RPC exists.
 */
export async function registerAsStudent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.rpc("register_as_student");
  if (error) throw new Error(error.message);

  redirect("/student/register");
}
