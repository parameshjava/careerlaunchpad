import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { AttemptReview } from "./attempt-review";

// Review one student's attempt and enter/adjust marks. Data + writes go through
// get_attempt_for_review / set_attempt_marks (SECURITY DEFINER, gated to exam
// staff/admins), so this page only needs to confirm the user is signed in.
export default async function AttemptReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const { attemptId } = await params;
  return <AttemptReview attemptId={attemptId} />;
}
