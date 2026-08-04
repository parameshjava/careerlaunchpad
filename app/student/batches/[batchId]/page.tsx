import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMyBatch, fetchMyBatchSessions } from "@/lib/student-batches-query";
import { fetchBatchProgress } from "@/lib/batch-progress-query";
import { BatchDetail, BatchDetailHeader } from "@/components/students/batch-detail";
import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Batch" };

// A student's read-only view of one of their batches: syllabus with per-chapter
// progress (and the feedback form on completed chapters), classes, and feedback.
//
// Authorization is the enrolment itself. fetchMyBatch reads through
// `enrollment_self_read`, so a guessed batchId simply isn't in the result and we
// render "not found" — there is no separate permission check to keep in sync.
// fetchBatchProgress is reused verbatim from the staff/mentor path: batch_chapter's
// student policy already scopes it to batches the caller is enrolled in.
export default async function StudentBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const batch = await fetchMyBatch(supabase, ctx.userId, batchId);

  if (!batch)
    return (
      <PageContainer variant="reading">
        <div className="py-10 text-center">
          <p className="text-muted-foreground text-sm">
            We couldn&apos;t find that batch among your enrolments.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            <Link href="/student/batches">Back to my batches</Link>
          </Button>
        </div>
      </PageContainer>
    );

  const [subjects, sessions] = await Promise.all([
    fetchBatchProgress(supabase, batchId),
    fetchMyBatchSessions(supabase, batchId),
  ]);

  return (
    <PageContainer variant="full">
      <BatchDetailHeader batch={batch} />
      <BatchDetail batch={batch} subjects={subjects} sessions={sessions} />
    </PageContainer>
  );
}
