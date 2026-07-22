import { redirect } from "next/navigation";
import type { AuthContext } from "@/lib/auth";
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
 * Fails CLOSED: on a query error or a MISSING profile row, the student is treated
 * as NOT approved. This keeps the app-layer gate consistent with the DB gate
 * (is_student_of_college, migration 123), which requires an existing approved
 * row — so an errored/rowless student is routed to /student/pending rather than
 * shown an exams surface that would render empty.
 */
export async function isStudentApproved(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_profile")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.status === "approved";
}

/** Server-component guard: send unapproved students to the pending screen. Call
 * after the base auth guard on any exam surface. */
export async function requireApprovedStudent(userId: string): Promise<void> {
  if (!(await isStudentApproved(userId))) redirect("/student/pending");
}

/** Approval flag for buildNav on NON-student surfaces (mentor / dashboard /
 * employer): a dual-role student must still be approval-gated there. Skips the
 * query (returns true) for users who aren't students. */
export async function navStudentApproved(ctx: AuthContext): Promise<boolean> {
  return ctx.roles.includes("student") ? isStudentApproved(ctx.userId) : true;
}
