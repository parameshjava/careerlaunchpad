import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchRoster, fetchSession } from "@/lib/exam-query";
import { ResultsClient } from "./results-client";

export default async function SessionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") || can(ctx, "exam.results.view_all") || can(ctx, "exam.assign");
  if (!allowed) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const session = await fetchSession(supabase, id);
  if (!session) notFound();
  const roster = await fetchRoster(supabase, id);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Results — {session.label}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{session.examTitle}</p>
      </header>
      <ResultsClient
        sessionId={id}
        resultsPublished={session.resultsPublished}
        roster={roster}
        canPublish={ctx.permissions.has("*") || can(ctx, "exam.assign")}
      />
    </div>
  );
}
