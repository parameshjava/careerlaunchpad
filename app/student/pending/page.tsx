import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StudentRemarksAlert } from "@/components/students/student-remarks-alert";

export const metadata: Metadata = { title: "Pending approval" };

// Shown to a self-registered student who has submitted but isn't approved yet.
// Approved students never land here (they're routed to insights); imported
// students are auto-approved, so this is only the self-signup review wait.
export default async function StudentPendingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_profile")
    .select("registration_status, status")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  // Not submitted yet → back to the form. Already approved → on to insights.
  if (data?.registration_status !== "submitted") redirect("/student/register");
  if (data?.status === "approved") redirect("/student/insights");

  const suspended = data?.status === "suspended";
  // Sent back for corrections — the reviewer left remarks and the student must
  // fix + re-submit. Surfaced as an actionable alert (with CTA) above the card.
  const changesRequested = data?.status === "changes_requested";

  return (
    <div className="mx-auto w-full max-w-lg">
      {changesRequested && <StudentRemarksAlert showCta />}
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 text-4xl">{suspended ? "⏸️" : changesRequested ? "✏️" : "⏳"}</div>
          <CardTitle className="text-xl">
            {suspended
              ? "Your account is on hold"
              : changesRequested
                ? "A few corrections needed"
                : "Your profile is awaiting approval"}
          </CardTitle>
          <CardDescription>
            {suspended
              ? "An administrator has paused your access. Please reach out to your college admin if you think this is a mistake."
              : changesRequested
                ? "Our team reviewed your registration and asked for some changes. Update your profile and re-submit — we'll review it again right away."
                : "Thanks for registering! An owner or admin will review your profile shortly. We'll email you as soon as it's approved — then you'll get your full insights."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant={changesRequested ? "default" : "outline"}>
            <Link href="/student/register">{changesRequested ? "Update my profile" : "Review my profile"}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
