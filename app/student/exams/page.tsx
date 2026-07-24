import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { requireApprovedStudent } from "@/lib/student-approval";
import { ExamsList } from "./exams-list";
import { PageContainer } from "@/components/app-shell/page-container";

// A student's assigned sittings. The list itself is a client component that
// polls list_my_exam_sessions() every 5s (see exams-list.tsx).
export default async function StudentExamsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "exam.attempt.take")) redirect("/student");
  await requireApprovedStudent(ctx.userId);

  return (
    <PageContainer variant="full" className="py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">Exams assigned to you.</p>
      </header>
      <ExamsList />
    </PageContainer>
  );
}
