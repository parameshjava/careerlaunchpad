import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchStudentFees } from "@/lib/enrollment-query";
import { MyFees } from "@/components/students/my-fees";

// Student "My fees" (issue #49, Phase 5). RLS scopes everything to the signed-in
// student, so this simply reads their own enrolments/payments.
export default async function MyFeesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const supabase = await createClient();
  const enrollments = await fetchStudentFees(supabase, ctx.userId);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My fees</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your course fees, balances, installment schedule, and payment receipts.
        </p>
      </header>
      <MyFees enrollments={enrollments} />
    </div>
  );
}
