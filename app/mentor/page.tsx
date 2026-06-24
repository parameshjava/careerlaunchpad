import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mentor hub" };

// The mentor hub: the vetting state front-and-centre (a new mentor is
// 'pending_review' until an admin approves), with a link to edit the profile.
// Mentors who haven't finished the form yet are sent to it (it resumes).
const STATUS: Record<string, { emoji: string; title: string; body: string; tone: string }> = {
  pending_review: {
    emoji: "⏳",
    title: "Your mentor profile is under review",
    body: "Thanks for signing up to mentor. Our team is reviewing your details — you'll be notified once you're approved. You can keep editing your profile in the meantime.",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
  },
  approved: {
    emoji: "✅",
    title: "You're an approved mentor",
    body: "You're all set. Students matched to your skills and college will be able to connect with you.",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  suspended: {
    emoji: "⛔",
    title: "Your mentor profile is paused",
    body: "Your mentor profile is currently suspended. Please reach out to the CareerLaunchpad team if you think this is a mistake.",
    tone: "bg-rose-50 text-rose-800 border-rose-200",
  },
};

export default async function MentorHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const { data } = await supabase
    .from("mentor_profile")
    .select("registration_status, status, full_name")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  // Not finished registering yet → the form (it resumes at the last step).
  if (!data || data.registration_status !== "submitted") redirect("/mentor/register");

  const s = STATUS[data.status as string] ?? STATUS.pending_review;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{data.full_name ? `, ${data.full_name}` : ""} 👋
        </h1>
        <p className="text-muted-foreground text-sm">Your mentoring at a glance.</p>
      </div>

      <div className={`rounded-2xl border p-5 sm:p-6 ${s.tone}`}>
        <div className="text-3xl" aria-hidden>{s.emoji}</div>
        <h2 className="mt-2 text-lg font-semibold">{s.title}</h2>
        <p className="mt-1 text-sm">{s.body}</p>
      </div>

      <div className="bg-card flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h3 className="font-semibold">Your mentor profile</h3>
          <p className="text-muted-foreground text-sm">
            Keep your skills, availability and background up to date.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/mentor/register">View / edit profile</Link>
        </Button>
      </div>
    </div>
  );
}
