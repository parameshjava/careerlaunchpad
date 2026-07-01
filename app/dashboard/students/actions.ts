"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { sendStudentApprovedEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Review action for a self-registered student: approve / suspend / reset.
 * The real authorization is `set_student_status()` + RLS (student.review, global
 * or college-scoped); requirePermission here is the UI-side guard so the action
 * fails fast for non-reviewers. Owner's '*' satisfies student.review.
 */
export async function setStudentStatus(formData: FormData): Promise<void> {
  await requirePermission("student.review");
  const supabase = await createClient();

  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || !["approved", "suspended", "pending_review"].includes(status)) return;

  const { error } = await supabase.rpc("set_student_status", { p_user: userId, p_status: status });
  if (error) throw new Error(error.message);

  // Welcome the student in once approved. Best-effort — sendStudentApprovedEmail
  // never throws, so a mail hiccup can't fail the approval just made.
  if (status === "approved") {
    const { data: profile } = await supabase
      .from("student_profile")
      .select("full_name, app_user:user_id(email)")
      .eq("user_id", userId)
      .single();
    const appUser = profile?.app_user as { email?: string | null } | { email?: string | null }[] | null;
    const email = Array.isArray(appUser) ? appUser[0]?.email : appUser?.email;
    if (email) {
      await sendStudentApprovedEmail({ to: email, name: profile?.full_name, loginUrl: `${SITE_URL}/student` });
    }
  }

  revalidatePath("/dashboard");
}

/**
 * Soft-delete a student (hide from the console). `kind` distinguishes the two
 * grid sources: 'registered' (app_user, must be student-only) vs 'intake'
 * (imported/invited). Authorized by student.delete via soft_delete_student().
 */
export async function deleteStudent(
  id: string,
  kind: "registered" | "intake",
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requirePermission("student.delete");
  } catch {
    return { error: "You don't have permission to delete students." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_student", { p_id: id, p_kind: kind });
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
