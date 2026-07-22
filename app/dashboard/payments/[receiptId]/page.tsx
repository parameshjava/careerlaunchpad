import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFeeReceipt } from "@/lib/enrollment-query";
import { Button } from "@/components/ui/button";
import { FeeReceiptView } from "@/components/students/fee-receipt";

// Printable fee receipt for a payment (issue #49, Phase 4). Built from the real
// ledger (getFeeReceipt). Gated on finance.manage; RLS bounds the read too.
export default async function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const receipt = await getFeeReceipt(supabase, receiptId);

  if (!receipt) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <p className="text-muted-foreground text-sm">Receipt not found.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/batches">Back to batches</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <FeeReceiptView receipt={receipt} backHref="/dashboard/batches" backLabel="Back to batches" />
    </div>
  );
}
