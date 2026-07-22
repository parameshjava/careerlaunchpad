import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatches } from "@/lib/batch-query";
import { BatchesList } from "@/components/batches/batches-list";

// Batches (issue #49). Dated runs of courses. Gated on finance.manage.
export default async function BatchesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const batches = await fetchBatches(supabase);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Batches</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Each batch is a dated run of a course for one or more colleges. Enrol students into a
          batch and record their payments.
        </p>
      </header>
      <BatchesList batches={batches} />
    </div>
  );
}
