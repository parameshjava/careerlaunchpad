"use client";

// Wires the (clickable) college charts to the drilldown students table: clicking
// a Skills / Primary-goal / All-goals segment filters the table below to the
// matching students (preview-requirements). Filtering is client-side over the
// students already loaded for the college — instant, no refetch. Clicking the
// same segment again clears the filter.
import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/students/columns";
import { AnalyticsView, type ChartFilter } from "@/components/analytics/AnalyticsView";
import type { CollegeAnalytics } from "@/lib/analytics-query";
import type { Student } from "@/lib/students-query";

const TYPE_LABEL: Record<ChartFilter["type"], string> = {
  skill: "Skill",
  primaryGoal: "Primary goal",
  goal: "Career goal",
};

function matches(student: Student, filter: ChartFilter): boolean {
  switch (filter.type) {
    case "skill":
      return student.skills.includes(filter.key);
    case "primaryGoal":
      return student.primaryGoalId === filter.key;
    case "goal":
      return student.goalIds.includes(filter.key);
  }
}

export function InteractiveAnalytics({
  analytics,
  students,
}: {
  analytics: CollegeAnalytics;
  students: Student[];
}) {
  const [filter, setFilter] = useState<ChartFilter | null>(null);

  const filtered = useMemo(
    () => (filter ? students.filter((s) => matches(s, filter)) : students),
    [students, filter],
  );

  // Toggle: re-clicking the active segment clears it.
  function onSelect(f: ChartFilter) {
    setFilter((cur) => (cur && cur.type === f.type && cur.key === f.key ? null : f));
  }

  return (
    <div className="space-y-6">
      <AnalyticsView data={analytics} mode="aggregate" active={filter} onSelect={onSelect} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            Students <span className="text-muted-foreground font-normal">· {filtered.length}</span>
          </CardTitle>
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              {TYPE_LABEL[filter.type]}: {filter.label}
              <X className="size-3.5" />
            </button>
          ) : (
            <span className="text-muted-foreground text-xs">Tip: click a chart segment to filter</span>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            searchKey="name"
            searchPlaceholder="Search students…"
          />
        </CardContent>
      </Card>
    </div>
  );
}
