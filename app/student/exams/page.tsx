import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";

// My exams — UI reset to a blank canvas; to be rebuilt against the existing
// /api/exam/* endpoints. Access control preserved.
export default async function StudentExamsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "exam.attempt.take")) redirect("/student");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">This section is being rebuilt.</p>
      </header>
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-16 text-center text-sm">
        Nothing here yet.
      </p>
    </div>
  );
}
