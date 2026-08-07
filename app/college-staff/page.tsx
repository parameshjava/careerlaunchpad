import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app-shell/page-container";

export const metadata: Metadata = { title: "Your staff registration" };

/**
 * Where a College Staff member lands while their registration is NOT yet
 * approved. Once approved they hold the scoped role, so computeHomePath sends
 * them to /dashboard instead and this page just forwards them there.
 *
 * The whole point is to answer "what happens next, and who do I ask?" without a
 * support email — which is the #107 requirement that staff "need not connect the
 * platform team for any doubts". So every state names the college admin as the
 * person holding the decision, and a send-back shows their actual words.
 */
const STATUS: Record<string, { emoji: string; title: string; body: string; tone: string; cta?: string }> = {
  pending_review: {
    emoji: "⏳",
    title: "Your registration is with your college admin",
    body:
      "Thanks for registering. Your college admin reviews staff access for your college — they'll be notified, " +
      "and you'll get an email the moment they approve. You can keep editing your details in the meantime.",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    cta: "Review my details",
  },
  changes_requested: {
    emoji: "✏️",
    title: "Your college admin asked for a correction",
    body:
      "They've left a note on your registration. Open it, make the change, and submit again — it goes straight " +
      "back to them, no need to contact anyone else.",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    cta: "Open my registration",
  },
  suspended: {
    emoji: "⛔",
    title: "Your staff access is paused",
    body:
      "Your college admin has paused your access. If you think that's a mistake, speak to them — they can " +
      "restore it themselves.",
    tone: "bg-rose-50 text-rose-800 border-rose-200",
  },
  rejected: {
    emoji: "⛔",
    title: "Your registration wasn't approved",
    body:
      "Your college admin wasn't able to approve this registration. If you believe the details were wrong, " +
      "update them and submit again, or speak to your college admin.",
    tone: "bg-rose-50 text-rose-800 border-rose-200",
    cta: "Review my details",
  },
};

export default async function CollegeStaffHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  // Approved staff hold the scoped role and belong in the console.
  if (ctx.roles.includes("college_staff")) redirect("/dashboard");

  const staff = ctx.collegeStaff;
  // Signed in, no registration, no role → they haven't started. Send them to the
  // form, which opens with the "which college?" question.
  if (!staff) redirect("/college-staff/register");
  // Started but never submitted → straight back into the wizard, which resumes.
  if (staff.registrationStatus !== "submitted") redirect("/college-staff/register");

  const s = STATUS[staff.status] ?? STATUS.pending_review;

  const supabase = await createClient();
  const [{ data: profile }, { data: notes }] = await Promise.all([
    supabase
      .from("college_staff_profile")
      .select("full_name, college:college_id ( name, place )")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    supabase
      .from("college_staff_review_note")
      .select("body, kind, created_at")
      .eq("staff_user_id", ctx.userId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const collegeRow = profile?.college as { name?: string; place?: string } | { name?: string; place?: string }[] | null;
  const college = Array.isArray(collegeRow) ? collegeRow[0] : collegeRow;
  const note = notes?.[0];

  return (
    <PageContainer variant="reading" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""} 👋
        </h1>
        {college?.name && (
          <p className="text-muted-foreground mt-1 text-sm">
            {college.name}{college.place ? ` — ${college.place}` : ""}
          </p>
        )}
      </div>

      <div className={`rounded-2xl border p-5 ${s.tone}`}>
        <p className="text-lg font-semibold">
          <span aria-hidden>{s.emoji}</span> {s.title}
        </p>
        <p className="mt-1.5 text-sm">{s.body}</p>

        {note && (
          <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3 text-sm">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
              What your college admin said
            </p>
            <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
          </div>
        )}

        {s.cta && (
          <Button asChild className="mt-4 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white">
            <Link href="/college-staff/register">{s.cta}</Link>
          </Button>
        )}
      </div>

      <section className="bg-card rounded-2xl border p-5">
        <h2 className="text-sm font-semibold">What you&rsquo;ll get once you&rsquo;re approved</h2>
        <ul className="text-muted-foreground mt-2 space-y-1.5 text-sm">
          <li>• Your college&rsquo;s students — who has registered, and where each one is up to.</li>
          <li>• Batch progress — which subjects and chapters have been covered.</li>
          <li>• Exam results and chapter feedback for your college.</li>
        </ul>
        <p className="text-muted-foreground mt-3 text-xs">
          You&rsquo;ll only ever see your own college&rsquo;s data.
        </p>
      </section>
    </PageContainer>
  );
}
