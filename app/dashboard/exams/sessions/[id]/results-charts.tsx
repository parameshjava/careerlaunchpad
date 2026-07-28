"use client";

// Results analytics for a sitting (issue #78) — the summary stats + subject-
// average chart that used to live on the standalone /results page, now the
// "Results" tab of the session console. Score-based, so it fills in once attempts
// are graded (on close/submit); before then it shows an empty state.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import type { RosterEntry, SubjectAvg } from "@/lib/exam-query";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-muted-foreground text-sm font-medium">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function ResultsCharts({
  roster,
  subjectAvgs,
}: {
  roster: RosterEntry[];
  subjectAvgs: SubjectAvg[];
}) {
  const graded = roster.filter((r) => r.score != null);
  const scores = graded.map((r) => r.score as number);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const max = scores.length ? Math.max(...scores).toString() : "—";

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Assigned" value={String(roster.length)} />
        <Stat label="Graded" value={String(graded.length)} />
        <Stat label="Average" value={avg} />
        <Stat label="Highest" value={max} />
      </div>

      {subjectAvgs.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-2 text-sm font-medium">Average score by subject</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={subjectAvgs} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="subject" fontSize={12} />
                <YAxis
                  fontSize={12}
                  domain={[0, Math.max(...subjectAvgs.map((s) => s.max))]}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${value} / ${(item.payload as SubjectAvg).max} marks (avg)`,
                    (item.payload as SubjectAvg).subject,
                  ]}
                />
                <Bar dataKey="avg" fill="var(--brand-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Subject-wise averages appear here once attempts are graded (when the sitting closes or
            students submit).
          </CardContent>
        </Card>
      )}
    </div>
  );
}
