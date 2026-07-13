import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AttemptRunner } from "./attempt-runner";
import type { SessionPrintMeta } from "./paper-print";

// The exam-taking screen. Hydration + answering + grading all go through the
// SECURITY DEFINER RPCs (022) called from the client, so this server page only
// gates access and hands off the session id (plus the session/exam metadata
// the printable paper's cover needs).
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
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_my_exam_sessions");
  const meta =
    ((data ?? []) as SessionPrintMeta[]).find((s) => s.session_id === sessionId) ?? null;

  return <AttemptRunner sessionId={sessionId} meta={meta} />;
}
