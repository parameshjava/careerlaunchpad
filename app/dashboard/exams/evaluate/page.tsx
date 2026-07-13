import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";

// Exam evaluation — UI reset to a blank canvas; to be rebuilt against the
// existing /api/exam/* endpoints. Access control preserved.
export default async function EvaluateHomePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const blanket =
    ctx.permissions.has("*") || ctx.roles.includes("platform_admin") || can(ctx, "exam.evaluate");
  if (!blanket && !ctx.examEvaluator) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Exam evaluation</h1>
        <p className="text-muted-foreground mt-1 text-sm">This section is being rebuilt.</p>
      </header>
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-16 text-center text-sm">
        Nothing here yet.
      </p>
    </div>
  );
}
