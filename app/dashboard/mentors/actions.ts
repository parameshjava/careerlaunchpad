"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

/**
 * Let the signed-in owner / admin set up their OWN mentor profile (requirement
 * 2). Backed by `register_as_mentor()` (migration 017), which ADDS the mentor
 * role on top of their console role (mentor_kind = 'staff') and seeds a profile
 * that starts pending_review like any other. Then drops them into the form.
 */
export async function becomeMentor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.rpc("register_as_mentor");
  if (error) throw new Error(error.message);

  redirect("/mentor/register");
}

/**
 * Review action: approve / suspend / reset a mentor. The real authorization is
 * the `set_mentor_status()` RPC + RLS (it checks mentor.review, global or
 * college-scoped); requirePermission here is the UI-side guard so the action
 * fails fast for non-reviewers. Owner's '*' satisfies mentor.review.
 */
export async function setMentorStatus(userId: string, status: "approved" | "suspended" | "pending_review") {
  await requirePermission("mentor.review");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_mentor_status", { p_user: userId, p_status: status });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/mentors");
}
