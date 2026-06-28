import { notFound, redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBlueprint } from "@/lib/exam-query";
import { BlueprintEditor } from "../blueprint-editor";

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

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{blueprint.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Status: {blueprint.status}</p>
      </header>
      <BlueprintEditor blueprint={blueprint} />
    </div>
  );
}
