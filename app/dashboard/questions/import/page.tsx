import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchSubjects } from "@/lib/exam-query";
import { ImportQuestionsClient } from "./import-client";

// Bulk-import questions into the global bank from a JSON file. Admin-only
// (same gate as the single-question editor).
export default async function ImportQuestionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.question.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const subjects = await fetchSubjects(supabase);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Import questions</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bulk-add questions to the global bank from a JSON file. One subject per file;
          nothing is saved until every question passes validation.
        </p>
      </header>
      <ImportQuestionsClient subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
