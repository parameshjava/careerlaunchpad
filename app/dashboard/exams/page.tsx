import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";

// Exams hub. Blueprints + sessions land here (Phases C–D). For now it routes to
// the question bank and states what's coming.
export default async function ExamsHubPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  // Central team (Owner / Platform Admin) build blueprints from the global bank.
  const canManageBlueprints = ctx.permissions.has("*") || can(ctx, "exam.blueprint.manage");
  const canAuthor =
    ctx.permissions.has("*") || can(ctx, "exam.subject.manage") || can(ctx, "exam.question.manage");
  // College Admins view & evaluate their own college's sittings/results.
  const canViewResults = ctx.permissions.has("*") || can(ctx, "exam.results.view_all");
  if (!canManageBlueprints && !canAuthor && !canViewResults) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {canManageBlueprints
            ? "Build exam blueprints, generate papers, and conduct sittings."
            : "Manage rosters and view results for your college's sittings."}
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {canAuthor && (
          <Link href="/dashboard/questions">
            <Card className="hover:border-primary/50 transition">
              <CardContent className="pt-6">
                <h2 className="font-semibold">Question bank</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Subjects, chapters, passages and questions (shared across all colleges).
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
        {canManageBlueprints && (
          <Link href="/dashboard/exams/blueprints">
            <Card className="hover:border-primary/50 transition">
              <CardContent className="pt-6">
                <h2 className="font-semibold">Blueprints</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Define subjects, question counts and difficulty mix.
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
        {canViewResults && (
          <Link href="/dashboard/exams/sittings">
            <Card className="hover:border-primary/50 transition">
              <CardContent className="pt-6">
                <h2 className="font-semibold">Sittings</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Your college&apos;s exam sittings — manage rosters and view results.
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
