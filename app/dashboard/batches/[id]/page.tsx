import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchFee } from "@/lib/enrollment-query";
import { type BatchStatus } from "@/lib/batch-query";
import { Button } from "@/components/ui/button";
import { BatchWorkspace } from "@/components/batches/batch-workspace";

// One screen for everything about a batch — details, subjects & mentors,
// schedule, and students — each in a collapsible section (see BatchWorkspace).
export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  // Only the lightweight header on load — each section fetches its own data when
  // its accordion is expanded (see BatchWorkspace).
  const [batch, statusRow] = await Promise.all([
    fetchBatchFee(supabase, id),
    supabase.from("batch").select("status").eq("id", id).maybeSingle(),
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

  const subtitle = [batch.courseName, batch.code, batch.academicYear].filter(Boolean).join(" · ");
  const status = ((statusRow.data as { status: BatchStatus } | null)?.status ?? "draft") as BatchStatus;

  return <BatchWorkspace batchId={id} name={batch.name} subtitle={subtitle} status={status} />;
}
