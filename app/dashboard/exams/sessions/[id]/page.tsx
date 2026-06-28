import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchRoster, fetchSession } from "@/lib/exam-query";
import { SessionDetailClient } from "./session-detail-client";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") || can(ctx, "exam.assign") || can(ctx, "exam.results.view_all");
  if (!allowed) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const session = await fetchSession(supabase, id);
  if (!session) notFound();
  const roster = await fetchRoster(supabase, id);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{session.label}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {session.examTitle} · {session.mode} · {session.questionCount} questions
        </p>
      </header>
      <SessionDetailClient
        session={session}
        roster={roster}
        canExportPdf={ctx.permissions.has("*") || can(ctx, "exam.paper.export_pdf")}
        canGenerate={ctx.permissions.has("*") || can(ctx, "exam.paper.generate")}
      />
    </div>
  );
}
