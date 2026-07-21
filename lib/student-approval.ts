import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Student approval gate — reads student_profile.status, the review state
 * ('pending_review' | 'approved' | 'suspended', migration 020).
 *
 * IMPORTANT: this is NOT the same as ctx.status in lib/auth.ts — that's the
 * app_user *account* status ('active' | 'suspended'), which stays 'active' for a
 * student still awaiting review. Exam surfaces must gate on APPROVAL, so they use
 * these helpers. Imported/invited students are auto-approved (020), so this only
 * ever stops a self-registered student who hasn't been reviewed yet.
 *
 * A missing profile row is treated as "not blocked" (matches the insights page):
 * such a caller has no exams anyway, so there's nothing to hide.
 */
export async function isStudentApproved(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_profile")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return !data || data.status === "approved";
}

/** Server-component guard: send unapproved students to the pending screen. Call
 * after the base auth guard on any exam surface. */
export async function requireApprovedStudent(userId: string): Promise<void> {
  if (!(await isStudentApproved(userId))) redirect("/student/pending");
}
