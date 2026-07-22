import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCompetitiveExams } from "@/lib/competitive-exam-query";
import { CompetitiveExamsList } from "@/components/competitive-exams/competitive-exams-list";

// Competitive exams (ICET, MAT, Bank PO…) and their syllabi. Gated on finance.manage.
export default async function CompetitiveExamsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const exams = await fetchCompetitiveExams(supabase);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Competitive exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The exams your courses prepare students for (ICET, MAT, Bank PO…), each with its own
          syllabus. Courses inherit the syllabus of the exams they target.
        </p>
      </header>
      <CompetitiveExamsList exams={exams} />
    </div>
  );
}
