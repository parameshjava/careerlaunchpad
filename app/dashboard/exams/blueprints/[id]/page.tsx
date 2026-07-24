import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBlueprint, fetchPaperForPrint } from "@/lib/exam-query";
import { type College } from "@/components/colleges/college-picker";
import { BlueprintEditor } from "../blueprint-editor";
import { PageContainer } from "@/components/app-shell/page-container";

export default async function EditBlueprintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.blueprint.manage"))) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const blueprint = await fetchBlueprint(supabase, id);
  if (!blueprint) notFound();

  // The exam's college is fixed once created — pass it (locked) so the College
  // step renders read-only and the wizard is the same 4 steps as in create.
  const { data: exam } = await supabase
    .from("exam")
    .select(
      "college:college_id(id, name, place, state, district, pincode, address, established_in, ownership_type, status)",
    )
    .eq("id", id)
    .maybeSingle();
  const raw = exam?.college as College | College[] | null | undefined;
  const college: College | null = (Array.isArray(raw) ? raw[0] : raw) ?? null;

  // The sitting (created at publish) carries the scheduled window + the generated
  // paper — pass them so the wizard can prefill the schedule and preview the paper.
  const { data: session } = await supabase
    .from("exam_session")
    .select("id, opens_at")
    .eq("exam_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const paper = session ? await fetchPaperForPrint(supabase, session.id) : null;

  return (
    <PageContainer variant="wide">
      <Link
        href="/dashboard/exams/papers"
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
      >
        ← Exam papers
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{blueprint.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">Status: {blueprint.status}</p>
        </div>
        <Link
          href={`/dashboard/exams/blueprints/${id}/consolidated`}
          className="border-input hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium"
        >
          Consolidated results
        </Link>
      </header>
      <BlueprintEditor
        blueprint={blueprint}
        initialCollege={college}
        collegeLocked
        initialOpensAt={session?.opens_at ?? null}
        paper={paper}
      />
    </PageContainer>
  );
}
