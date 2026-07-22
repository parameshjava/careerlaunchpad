import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFeeReceipt } from "@/lib/enrollment-query";
import { Button } from "@/components/ui/button";
import { FeeReceiptView } from "@/components/students/fee-receipt";

// A student's own printable fee receipt (issue #49, Phase 5). RLS on `payment`
// (self-read) ensures getFeeReceipt only resolves the student's own receipts.
export default async function StudentReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const supabase = await createClient();
  const receipt = await getFeeReceipt(supabase, receiptId);

  if (!receipt) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <p className="text-muted-foreground text-sm">Receipt not found.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/student/fees">Back to my fees</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-2">
      <FeeReceiptView receipt={receipt} backHref="/student/fees" backLabel="Back to my fees" />
    </div>
  );
}
