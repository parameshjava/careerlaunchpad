import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BlueprintEditor } from "../blueprint-editor";

// A new blueprint is per-college. College selection is the wizard's first step:
// a College Admin is locked to their own college (prefilled); an Owner /
// platform admin picks one inside the wizard.
export default async function NewBlueprintPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.blueprint.manage"))) redirect("/dashboard");

  const locked = ctx.collegeScopes.length === 1;
  const lockedCollegeId = locked ? ctx.collegeScopes[0] : null;

  const supabase = await createClient();
  let college = null;
  if (lockedCollegeId) {
    const { data } = await supabase
      .from("college")
      .select(
        "id, name, place, state, district, pincode, address, established_in, ownership_type, status",
      )
      .eq("id", lockedCollegeId)
      .maybeSingle();
    college = data;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/exams/papers"
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
      >
        ← Exam papers
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New exam</h1>
      </header>
      <BlueprintEditor initialCollege={college} collegeLocked={locked} />
    </div>
  );
}
