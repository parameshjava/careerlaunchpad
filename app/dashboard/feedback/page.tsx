import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthContext, can } from "@/lib/auth";
import { PageContainer } from "@/components/app-shell/page-container";
import { TriageInbox } from "@/components/feedback/triage-inbox";

export const metadata: Metadata = { title: "Feedback triage" };

// Cross-batch chapter-feedback triage (issue #84, §4.8). The batch tab answers
// "how is this batch doing?"; this page answers "what needs me today?" across every
// batch the caller may see — which is the question the trip rules were written for.
//
// Three permissions, three panels: feedback.view.identified opens the queue,
// feedback.action.manage the cross-batch action list, feedback.form.manage the
// instrument itself. Holding any one of them gets you in, and you see only its tab.
export default async function FeedbackTriagePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const owner = ctx.permissions.has("*");
  const canView = owner || can(ctx, "feedback.view.identified");
  const canManageActions = owner || can(ctx, "feedback.action.manage");
  const canManageForm = owner || can(ctx, "feedback.form.manage");
  // Not a gate on the page — only on the "ask them to add it" button (O-11).
  const canReviewStudents = owner || can(ctx, "student.review");
  if (!canView && !canManageActions && !canManageForm) redirect("/dashboard");

  return (
    <PageContainer variant="full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Feedback triage</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every chapter whose feedback tripped a threshold, across all your batches — one rating of
          1–2, an item averaging under 3.0, any written remark, or turnout under 40% once the window
          closed. Names stay on the batch&apos;s own Feedback tab.
        </p>
      </header>
      <TriageInbox
        canView={canView}
        canManageActions={canManageActions}
        canManageForm={canManageForm}
        canReviewStudents={canReviewStudents}
      />
    </PageContainer>
  );
}
