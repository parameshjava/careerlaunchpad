import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Student landing. Students who have already submitted their registration land
// on their insights; everyone still completing it goes to the form (which
// resumes at the last completed step).
export default async function StudentHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_profile")
    .select("registration_status, status")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  // Submitted students go to insights once approved; otherwise they wait on the
  // pending screen. Anyone still completing the form goes to the form.
  if (data?.registration_status === "submitted") {
    if (data.status === "approved") redirect("/student/insights");
    redirect("/student/pending");
  }
  redirect("/student/register");
}
