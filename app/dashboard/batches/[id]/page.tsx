import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchFee } from "@/lib/enrollment-query";
import { type BatchStatus } from "@/lib/batch-query";
import { Button } from "@/components/ui/button";
import { BatchWorkspace } from "@/components/batches/batch-workspace";

// One screen for everything about a batch — a summary header + tabs for Details,
// Subjects & mentors, Schedule, and Students (see BatchWorkspace). Only the
// lightweight header/counts load here; each tab fetches its own data on demand.
export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const [batch, statusRow, colleges, students] = await Promise.all([
    fetchBatchFee(supabase, id),
    supabase.from("batch").select("status").eq("id", id).maybeSingle(),
    supabase.from("batch_college").select("college_id", { count: "exact", head: true }).eq("batch_id", id),
    supabase
      .from("student_enrollment")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", id)
      .in("status", ["active", "completed"]),
  ]);

  if (!batch) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <p className="text-muted-foreground text-sm">Batch not found.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/batches">Back to batches</Link>
        </Button>
      </div>
    );
  }

  const status = ((statusRow.data as { status: BatchStatus } | null)?.status ?? "draft") as BatchStatus;

  return (
    <BatchWorkspace
      batchId={id}
      name={batch.name}
      status={status}
      showProgress={ctx.permissions.has("*") || can(ctx, "batch.progress.manage")}
      facts={{
        courseName: batch.courseName,
        academicYear: batch.academicYear,
        code: batch.code,
        collegeCount: colleges.count ?? 0,
        studentCount: students.count ?? 0,
        grossPaise: batch.grossPaise,
      }}
    />
  );
}
