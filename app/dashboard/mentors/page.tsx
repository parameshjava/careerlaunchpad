import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMentors } from "@/lib/mentors-query";
import { MentorReviewTable } from "@/components/mentors/MentorReviewTable";
import { becomeMentor } from "./actions";

export const metadata: Metadata = { title: "Mentors" };

// Console surface for reviewing mentor registrations. Mentors self-register
// (external pros) or convert from students/staff and land here as
// 'pending_review'; a reviewer approves or suspends them. Gated to
// mentor.review (Owner '*' / CareerLaunchpad Admin).
export default async function MentorsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const canReview = ctx.permissions.has("*") || can(ctx, "mentor.review");
  const canSee = canReview || can(ctx, "user.manage");
  if (!canSee) redirect(ctx.homePath);

  const supabase = await createClient();
  const mentors = await fetchMentors(supabase);
  const isMentor = ctx.roles.includes("mentor");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mentors</h1>
          <p className="text-muted-foreground text-sm">
            Review and approve people who’ve signed up to mentor students.
          </p>
        </div>
        {/* Owner / admin can also mentor students themselves (requirement 2). */}
        {isMentor ? (
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/mentor">My mentor profile</Link>
          </Button>
        ) : (
          <form action={becomeMentor}>
            <Button
              type="submit"
              className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
            >
              Become a mentor
            </Button>
          </form>
        )}
      </div>
      <MentorReviewTable mentors={mentors} canReview={canReview} />
    </div>
  );
}
