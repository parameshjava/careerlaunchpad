import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { MentorForm } from "@/app/mentor/register/mentor-form";
import { PageContainer } from "@/components/app-shell/page-container";

// Console mentor editor: reviewers (mentor.review) get the mentor registration
// wizard pointed at the admin API, landing on the read-only summary first
// (reviewFirst) then Edit → per-step save. Vetting status stays a separate
// action on the Mentors tab. RLS re-checks the permission.
export default async function EditMentorPage({ params }: { params: Promise<{ userId: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const canEdit = ctx.permissions.has("*") || can(ctx, "mentor.review");
  if (!canEdit) redirect("/dashboard/team?tab=mentors");

  const { userId } = await params;

  return (
    <PageContainer variant="reading">
      <Link
        href="/dashboard/team?tab=mentors"
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
      >
        ← Back to team
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Edit mentor</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review the profile below, then Edit to change any details. Approval is managed separately
          from the Mentors tab.
        </p>
      </header>
      <MentorForm
        reviewFirst
        endpoints={{
          profile: `/api/admin/mentor/${userId}/profile`,
          submit: `/api/admin/mentor/${userId}/profile/submit`,
        }}
      />
    </PageContainer>
  );
}
