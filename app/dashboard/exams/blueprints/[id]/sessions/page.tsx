import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBlueprint, fetchSessions } from "@/lib/exam-query";
import { SessionsClient } from "./sessions-client";

// Sittings of a blueprint — create a new conduct event (which generates its
// paper) and list existing ones.
export default async function BlueprintSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.assign"))) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const blueprint = await fetchBlueprint(supabase, id);
  if (!blueprint) notFound();
  const sessions = await fetchSessions(supabase, id);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Sittings — {blueprint.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Each sitting generates its own paper. {blueprint.status !== "published" && "Publish the blueprint to create sittings."}
        </p>
      </header>
      <SessionsClient
        blueprintId={id}
        published={blueprint.status === "published"}
        initialSessions={sessions}
      />
    </div>
  );
}
