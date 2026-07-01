import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { TaxonomyClient } from "../taxonomy-client";

// Subjects & Chapters — the GLOBAL question-bank taxonomy (subjects, chapters,
// passages). Curating it needs exam.subject.manage. Question authoring lives on
// the sibling Questions page (/dashboard/questions).
export default async function SubjectsChaptersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.subject.manage"))) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Subjects &amp; Chapters</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The shared question-bank structure — subjects, their chapters, and reading passages.
          Questions are authored under <b>Questions</b>.
        </p>
      </header>
      <TaxonomyClient />
    </div>
  );
}
