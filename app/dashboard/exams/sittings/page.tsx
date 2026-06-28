import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCollegeSessions } from "@/lib/exam-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Sittings for a College Admin: every conduct event for their college, across
// all exams. From here they open a sitting to manage its roster and view results.
// Owners / platform admins (no college scope) see all sittings.
export default async function CollegeSittingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") || can(ctx, "exam.results.view_all") || can(ctx, "exam.assign");
  if (!allowed) redirect("/dashboard");

  const supabase = await createClient();
  // College admins are scoped to their own college; admins (no scope) see all.
  const collegeId = ctx.collegeScopes[0];
  const sessions = await fetchCollegeSessions(supabase, collegeId);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Sittings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Exam sittings for your college. Open one to manage its roster and view results.
        </p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No sittings yet. Sittings are created centrally; once one targets your college it appears here.
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
                        {s.examTitle ? `${s.examTitle} · ` : ""}
                        {s.mode} · {s.questionCount} questions · {s.rosterCount} assigned
                      </div>
                    </div>
                    <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
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
