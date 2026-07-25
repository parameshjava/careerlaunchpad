import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_SELECT, REF_TABLES } from "@/lib/registration";
import { EMPTY, type Form, type RefData, type College } from "@/components/students/registration-fields";
import { ProfileSummary, RegistrationForm } from "@/app/student/register/registration-form";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/app-shell/page-container";
import { RemarksPanel, type ReviewNote } from "@/components/students/remarks-panel";
import { setStudentStatus } from "../actions";

type ReviewStatus = "pending_review" | "changes_requested" | "approved" | "suspended";

// Console-side student profile. Platform staff (student.profile.manage) get the
// registration wizard pointed at the admin API, which does its own load → summary
// → Edit → per-step save loop; everyone else gets the read-only ProfileSummary
// (same layout the student sees after submitting). Fetched by id (= user_id).
// RLS bounds both; intake rows (not yet a profile) show a note.
export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const { id } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("student_profile")
    .select(
      `${PROFILE_SELECT}, registration_status, status,
       college:college_id ( id, name, place, state ),
       app_user:user_id ( email )`,
    )
    .eq("user_id", id)
    .maybeSingle();

  // Reviewers see an Approve/Suspend bar above the profile while the student is
  // still awaiting review (moved off the dashboard list so the decision is made
  // after seeing the full profile).
  const canReview = can(ctx, "student.review") || ctx.permissions.has("*");
  const reviewRow = row as { status?: string | null; full_name?: string | null } | null;
  const reviewStatus = (reviewRow?.status ?? "approved") as ReviewStatus;
  const awaitingReview = canReview && reviewStatus === "pending_review";

  // Review-note thread for the Remarks panel (issue #82). RLS returns rows only to
  // reviewers, so this is empty for anyone else; we still gate the panel on canReview.
  let notes: ReviewNote[] = [];
  if (canReview && row) {
    const { data: noteRows } = await supabase
      .from("student_review_note")
      .select("id, body, kind, created_at, resolved_at, author:author_user_id ( full_name, email )")
      .eq("student_user_id", id)
      .order("created_at", { ascending: false });
    notes = (noteRows ?? []).map((n) => {
      const a = Array.isArray(n.author) ? n.author[0] : n.author;
      const author = a as { full_name?: string | null; email?: string | null } | null;
      return {
        id: n.id as string,
        body: n.body as string,
        kind: (n.kind as "changes_requested" | "note") ?? "note",
        created_at: n.created_at as string,
        resolved_at: (n.resolved_at as string | null) ?? null,
        authorName: author?.full_name ?? author?.email ?? null,
      };
    });
  }
  const remarks = canReview && row ? (
    <RemarksPanel studentId={id} status={reviewStatus} notes={notes} />
  ) : null;

  if (!row) {
    return (
      <PageContainer variant="reading">
        <BackLink />
        <p className="text-muted-foreground py-20 text-center text-sm">
          This student hasn’t started registration yet — no profile to show.
        </p>
      </PageContainer>
    );
  }

  // Staff (student.profile.manage): reuse the wizard, but land on the read-only
  // summary first (reviewFirst) — review the whole profile, then Edit to open the
  // wizard. It self-loads from the admin API, so no need to map the row we just
  // fetched (that was the existence gate).
  if (can(ctx, "student.profile.manage")) {
    return (
      <PageContainer variant="full">
        <BackLink />
        {awaitingReview && <ApprovalBar id={id} name={reviewRow?.full_name ?? ""} />}
        <RegistrationForm
          reviewFirst
          endpoints={{
            profile: `/api/students/${id}/profile`,
            submit: `/api/students/${id}/profile/submit`,
          }}
        />
        {remarks}
      </PageContainer>
    );
  }

  const r = row as unknown as Record<string, unknown>;
  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : ((v as T) ?? null));
  const college = one<College>(r.college);
  const email = one<{ email: string | null }>(r.app_user)?.email ?? null;

  // Same DB-row → Form mapping the wizard does on load: nulls to "", numbers to
  // strings, arrays/objects defaulted so ProfileSummary can map slugs → labels.
  const f: Form = {
    ...EMPTY,
    full_name: (r.full_name as string) ?? "",
    phone: (r.phone as string) ?? "",
    gender: (r.gender as string) ?? "",
    city_village: (r.city_village as string) ?? "",
    district: (r.district as string) ?? "",
    state: (r.state as string) ?? "",
    college_id: (r.college_id as string) ?? "",
    degree: (r.degree as string) ?? "",
    branch: (r.branch as string) ?? "",
    year_of_study: (r.year_of_study as string) ?? "",
    graduation_year: r.graduation_year != null ? String(r.graduation_year) : "",
    cgpa: r.cgpa != null ? String(r.cgpa) : "",
    career_goal_ids: (r.career_goal_ids as string[]) ?? [],
    primary_career_goal_id: (r.primary_career_goal_id as string) ?? "",
    skill_assessment: (r.skill_assessment as Record<string, number>) ?? {},
    skills: (r.skills as string[]) ?? [],
    interests: (r.interests as string[]) ?? [],
    // Step 6 "Tell Us"
    is_first_generation: r.is_first_generation == null ? "" : (r.is_first_generation ? "yes" : "no"),
    date_of_birth: (r.date_of_birth as string) ?? "",
    languages: (r.languages as string[]) ?? [],
    caste_certificate_status: (r.caste_certificate_status as string) ?? "",
    reservation_category: (r.reservation_category as string) ?? "",
    income_band: (r.income_band as string) ?? "",
    family_members: (r.family_members as { relation: string; occupation: string }[]) ?? [],
    hobbies: (r.hobbies as string[]) ?? [],
    custom_hobbies: (r.custom_hobbies as string[]) ?? [],
    biggest_challenge: (r.biggest_challenge as string) ?? "",
  };

  // Reference option sets (same ref_* tables the registration form reads) so
  // stored slugs/ids render as human labels.
  const refEntries = await Promise.all(
    Object.entries(REF_TABLES).map(async ([key, table]) => {
      const { data } = await supabase
        .from(table)
        .select("id, slug, label, category, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      return [key, data ?? []] as const;
    }),
  );
  const refs = Object.fromEntries(refEntries) as RefData;

  const status = r.registration_status === "submitted" ? "submitted" : "in_progress";

  return (
    <PageContainer variant="full">
      <BackLink />
      {awaitingReview && <ApprovalBar id={id} name={f.full_name} />}
      <ProfileSummary f={f} refs={refs} email={email} college={college} status={status} />
      {remarks}
    </PageContainer>
  );
}

// Reviewer action bar for a student still awaiting approval. Approve/Suspend go
// through setStudentStatus (RLS-enforced) which redirects back to the list.
function ApprovalBar({ id, name }: { id: string; name: string }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="min-w-0">
        <p className="font-medium text-amber-900 dark:text-amber-200">Awaiting your approval</p>
        <p className="text-sm text-amber-700 dark:text-amber-300/80">
          Review {name || "this student"}’s details below, then approve to grant full access.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={setStudentStatus}>
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="status" value="approved" />
          <Button type="submit" size="sm">Approve</Button>
        </form>
        <form action={setStudentStatus}>
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="status" value="suspended" />
          <Button type="submit" size="sm" variant="outline">Suspend</Button>
        </form>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
      ← Back to students
    </Link>
  );
}
