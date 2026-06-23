import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/students/columns";
import { createClient } from "@/lib/supabase/server";
import { fetchStudents } from "@/lib/students-query";

export const metadata: Metadata = {
  title: "Students Console",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const data = await fetchStudents(supabase);

  const registered = data.filter((s) => s.stage === "Registered").length;
  const awaiting = data.filter((s) => s.stage !== "Registered").length;
  const colleges = new Set(data.map((s) => s.college).filter(Boolean)).size;

  const stats = [
    { label: "Total Students", value: String(data.length), hint: "imported + registered" },
    { label: "Registered", value: String(registered), hint: "signed in & provisioned" },
    { label: "Awaiting Sign-up", value: String(awaiting), hint: "imported / invited" },
    { label: "Colleges", value: String(colleges), hint: "represented" },
  ];

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
