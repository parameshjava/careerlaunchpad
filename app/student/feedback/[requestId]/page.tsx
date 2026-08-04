import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthContext, can } from "@/lib/auth";
import { requireApprovedStudent } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";
import { toPending, type PendingFeedback } from "@/lib/feedback-query";
import { FeedbackPage } from "@/components/student/feedback-page";
import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Chapter feedback" };

// One chapter's feedback form on its own route (#84).
//
// WHY A PAGE AND NOT A DIALOG
//   Seven questions, a remark box, the contact opt-in and the visibility notice come
//   to roughly 1,700px on a phone. A centred dialog spends its life fighting the
//   viewport: it needs a max-height, its own scroll, and a footer pinned outside the
//   scroll area — and scrolling the padded box clips sideways when the OS shows
//   classic scrollbars. A page has no height ceiling and scrolls the way a phone
//   expects.
//
//   It is also LINKABLE, which the dialog never could be. Phase 2 of the spec sends a
//   reminder email; the middleware records `?next=<path>` and the auth callback
//   honours it (lib/next-path.ts), so this URL survives a logged-out student
//   clicking it from their inbox — the same route the #77 results email relies on.
//
// The form itself is rendered from the SAME <FeedbackForm> the assessments hub uses,
// so there is one implementation of the questions and one copy of the promise text.
export default async function ChapterFeedbackPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "feedback.submit")) redirect("/student");
  await requireApprovedStudent(ctx.userId);

  const supabase = await createClient();
  const { data } = await supabase.rpc("student_pending_feedback");
  const row = ((data ?? []) as { request_id: string }[]).find((r) => r.request_id === requestId);

  // student_pending_feedback only returns windows this student may answer, so a
  // missing row IS the authorization failure — closed, already-locked, or not theirs.
  if (!row)
    return (
      <PageContainer variant="form">
        <div className="py-10 text-center">
          <h1 className="text-lg font-semibold">This feedback form isn&apos;t open</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Either the window has closed, or you already answered it more than 24 hours ago.
            Thanks either way — your earlier answer still counts.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            <Link href="/student/batches">Back to my batches</Link>
          </Button>
        </div>
      </PageContainer>
    );

  const request: PendingFeedback = toPending(row as Record<string, unknown>);

  return (
    <PageContainer variant="form">
      <FeedbackPage request={request} />
    </PageContainer>
  );
}
