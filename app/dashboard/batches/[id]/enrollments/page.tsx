import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchFee, fetchBatchRoster } from "@/lib/enrollment-query";
import { Button } from "@/components/ui/button";
import { BatchRoster } from "@/components/batches/batch-roster";

// Batch roster (issue #49, Phase 4): enrolments + payments for a batch.
export default async function BatchEnrollmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const [batch, roster] = await Promise.all([
    fetchBatchFee(supabase, id),
    fetchBatchRoster(supabase, id),
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

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{batch.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[batch.courseName, batch.code, batch.academicYear].filter(Boolean).join(" · ")} — enrolments &amp; payments
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/batches">
            <ArrowLeft /> Batches
          </Link>
        </Button>
      </header>
      <BatchRoster batchId={id} batch={batch} roster={roster} />
    </div>
  );
}
