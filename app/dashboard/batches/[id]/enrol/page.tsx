import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchFee, fetchBatchRoster } from "@/lib/enrollment-query";
import { Button } from "@/components/ui/button";
import { EnrolStudents } from "@/components/batches/enrol-students";

// Full-page enrol screen (issue #49, Phase 4).
export default async function EnrolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const [batch, roster] = await Promise.all([fetchBatchFee(supabase, id), fetchBatchRoster(supabase, id)]);

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

  return (
    <div className="p-1 sm:p-2">
      <EnrolStudents batchId={id} batch={batch} enrolledIds={roster.map((r) => r.studentId)} />
    </div>
  );
}
