import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBlueprint, fetchSessions } from "@/lib/exam-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/app-shell/page-container";

// Sittings of a blueprint. The sitting and its paper are created AUTOMATICALLY
// when the blueprint is published (see api/exam/blueprints/[id]/publish) — one
// sitting per exam — so this screen only lists it and links in to manage the
// roster / open / close. No manual "create sitting" step.
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
    <PageContainer variant="full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Sittings — {blueprint.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The sitting and its question paper are generated automatically when you publish the
          blueprint. Open or close it and manage the roster from here.
        </p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No sitting yet — publish the blueprint to generate the paper and its sitting.
        </p>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/dashboard/exams/sessions/${s.id}`}>
                <Card className="hover:border-primary/50 transition">
                  <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {s.mode} · {s.questionCount} questions · {s.rosterCount} assigned
                      </div>
                    </div>
                    <Badge variant={s.status === "open" ? "default" : "secondary"}>
                      {s.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
