import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMyBatches } from "@/lib/student-batches-query";
import { MyBatches } from "@/components/students/my-batches";
import { PageContainer } from "@/components/app-shell/page-container";

export const metadata: Metadata = { title: "My batches" };

// The one screen that answers "which batches am I in?". Until now a student could
// only infer it — from My fees (framed as money), from the batch heading on the
// assessments hub, or from an "Enrolled" tick while browsing courses.
//
// Deliberately NOT gated on an approved student profile: a pending enrolment is
// exactly the state where a student most wants to see where they stand, and the
// card says so rather than hiding the batch. RLS already limits the rows to their
// own enrolments, so there is nothing to leak.
export default async function MyBatchesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const batches = await fetchMyBatches(supabase, ctx.userId);

  return (
    <PageContainer variant="wide">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My batches</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What you&apos;re studying now, how far the syllabus has come, and what&apos;s next.
        </p>
      </header>
      <MyBatches batches={batches} />
    </PageContainer>
  );
}
