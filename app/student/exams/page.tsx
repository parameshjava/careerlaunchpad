import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchStudentSessions } from "@/lib/exam-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// A student's assigned sittings: start/resume open exams, view published results.
export default async function StudentExamsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "exam.attempt.take")) redirect("/student");

  const supabase = await createClient();
  const sessions = await fetchStudentSessions(supabase, ctx.userId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">Exams assigned to you.</p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No exams assigned yet.
        </p>
      ) : (
        <ul className="grid gap-3">
          {sessions.map((s) => {
            const done = s.rosterStatus === "submitted";
            const canStart = s.sessionStatus === "open" && !done;
            return (
              <li key={s.sessionId}>
                <Card>
                  <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {done
                          ? s.resultsPublished
                            ? "Completed — results available"
                            : "Submitted — results pending"
                          : s.sessionStatus === "open"
                            ? "Open now"
                            : `Status: ${s.sessionStatus}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canStart && (
                        <Button asChild>
                          <Link href={`/student/exams/${s.sessionId}`}>
                            {s.rosterStatus === "started" ? "Resume" : "Start"}
                          </Link>
                        </Button>
                      )}
                      {done && s.resultsPublished && (
                        <Button variant="outline" asChild>
                          <Link href={`/student/exams/${s.sessionId}/result`}>View result</Link>
                        </Button>
                      )}
                      {done && !s.resultsPublished && <Badge variant="secondary">Submitted</Badge>}
                      {!canStart && !done && <Badge variant="outline">{s.sessionStatus}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
