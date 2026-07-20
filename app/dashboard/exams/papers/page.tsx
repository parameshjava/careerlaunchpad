import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can, scopedCollege } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchExamCards } from "@/lib/exam-query";
import { Button } from "@/components/ui/button";
import { ExamsBrowser } from "./exams-browser";

// Exam papers. Lists the college's exams (blueprints) — INCLUDING drafts — with
// search / college filter / sort and Open / Closed / Drafts tabs (in ExamsBrowser).
// Data via fetchExamCards (RLS bounds the rows; college admins see their college,
// global admins see all — scopedCollege keeps additive college roles from
// narrowing an owner's view).
const TABS = ["draft", "active", "closed"] as const;

export default async function ExamPapersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = (TABS as readonly string[]).includes(tab ?? "")
    ? (tab as "draft" | "active" | "closed")
    : "active";
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const allowed =
    ctx.permissions.has("*") ||
    can(ctx, "exam.blueprint.manage") ||
    can(ctx, "exam.assign") ||
    can(ctx, "exam.results.view_all");
  if (!allowed) redirect("/dashboard");

  const canCreate = ctx.permissions.has("*") || can(ctx, "exam.blueprint.manage");

  const supabase = await createClient();
  const exams = await fetchExamCards(supabase, scopedCollege(ctx));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exam papers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Exams across your colleges — drafts included.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/dashboard/exams/blueprints/new">+ Exam</Link>
          </Button>
        )}
      </header>

      <ExamsBrowser exams={exams} initialTab={initialTab} />
    </div>
  );
}
