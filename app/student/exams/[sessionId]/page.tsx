import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { AttemptRunner } from "./attempt-runner";

// The exam-taking screen. Hydration + answering + grading all go through the
// SECURITY DEFINER RPCs (022) called from the client, so this server page only
// gates access and hands off the session id.
export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "exam.attempt.take")) redirect("/student");

  const { sessionId } = await params;
  return <AttemptRunner sessionId={sessionId} />;
}
