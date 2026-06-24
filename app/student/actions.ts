"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Convert the signed-in student into a mentor (requirement 1: a placed student
 * pays it forward). Backed by `register_as_mentor()` (migration 017), which
 * ADDS the mentor role on top of `student` (keeping their student profile and
 * insights intact) and seeds a mentor_profile pre-filled from their student
 * data — college, graduation year, degree, branch, skills, goals — so they only
 * fill in the mentoring-specific bits. The mentor profile starts pending review.
 */
export async function becomeMentor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.rpc("register_as_mentor");
  if (error) throw new Error(error.message);

  redirect("/mentor/register");
}
