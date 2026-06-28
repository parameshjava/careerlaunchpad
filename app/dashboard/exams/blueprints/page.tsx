import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBlueprints } from "@/lib/exam-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// List of exam blueprints (templates) for the caller's college.
export default async function BlueprintsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.blueprint.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const blueprints = await fetchBlueprints(supabase);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exam blueprints</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Reusable templates — subjects, question counts and difficulty mix. Run a blueprint as
            many sittings as you need.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/exams/blueprints/new">New blueprint</Link>
        </Button>
      </header>

      {blueprints.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No blueprints yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {blueprints.map((b) => (
            <li key={b.id}>
              <Link href={`/dashboard/exams/blueprints/${b.id}`}>
                <Card className="hover:border-primary/50 transition">
                  <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{b.title}</div>
                      <div className="text-muted-foreground text-xs">
                        {b.sectionCount} section{b.sectionCount === 1 ? "" : "s"} · {b.totalQuestions}{" "}
                        questions · {b.durationMinutes} min
                      </div>
                    </div>
                    <Badge variant={b.status === "published" ? "default" : "secondary"}>
                      {b.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
