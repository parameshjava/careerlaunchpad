import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchOpenBatchesForStudent } from "@/lib/enrollment-query";
import { AvailableBatches } from "@/components/students/available-batches";

// Student self-enrolment (issue #49): browse open batches for your college and
// join them yourself. RLS scopes reads; the enroll_self() RPC enforces the rules.
export default async function StudentCoursesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const supabase = await createClient();
  const batches = await fetchOpenBatchesForStudent(supabase, ctx.userId);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Courses open for enrolment at your college. Once you join, the fee shows under{" "}
          <Link href="/student/fees" className="text-primary hover:underline">My fees</Link>.
        </p>
      </header>
      <AvailableBatches batches={batches} />
    </div>
  );
}
