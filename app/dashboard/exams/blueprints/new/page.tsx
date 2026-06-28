import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CollegePicker } from "@/components/analytics/CollegePicker";
import { BlueprintEditor } from "../blueprint-editor";

// A new blueprint is per-college: a College Admin is locked to their college;
// an Owner / platform admin picks one (?college=<id>) before building it.
export default async function NewBlueprintPage({
  searchParams,
}: {
  searchParams: Promise<{ college?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.blueprint.manage"))) redirect("/dashboard");

  const sp = await searchParams;
  const locked = ctx.collegeScopes.length === 1;
  const collegeId = locked ? ctx.collegeScopes[0] : (sp.college ?? null);

  const supabase = await createClient();
  let college = null;
  if (collegeId) {
    const { data } = await supabase
      .from("college")
      .select(
        "id, name, place, state, district, pincode, address, established_in, ownership_type, status",
      )
      .eq("id", collegeId)
      .maybeSingle();
    college = data;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New blueprint</h1>
      </header>

      <div className="mb-6">
        <Suspense fallback={null}>
          <CollegePicker selected={college} disabled={locked} />
        </Suspense>
      </div>

      {collegeId ? (
        <BlueprintEditor collegeId={collegeId} />
      ) : (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          Select a college above to build a blueprint for it.
        </p>
      )}
    </div>
  );
}
