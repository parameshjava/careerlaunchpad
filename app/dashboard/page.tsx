import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/students/columns";
import { getStudents } from "@/lib/students-data";

export const metadata: Metadata = {
  title: "Students Console",
};

const stats = [
  { label: "Total Students", value: "60", hint: "+8 this month" },
  { label: "In Training", value: "18", hint: "active cohorts" },
  { label: "Placed", value: "21", hint: "35% placement rate" },
  { label: "Mentors", value: "5", hint: "avg 12 students each" },
];

export default function DashboardPage() {
  const data = getStudents(60);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-muted-foreground text-sm">
          Manage enrolled students, track progress, and assign mentors.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
              <p className="text-muted-foreground text-xs">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data}
            searchKey="name"
            searchPlaceholder="Search students…"
          />
        </CardContent>
      </Card>
    </div>
  );
}
