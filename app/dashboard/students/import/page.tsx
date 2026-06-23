import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { ImportClient } from "./import-client";

// Bulk-import students from an Excel file (Owner / Support / College Admin).
export default async function ImportStudentsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "student.intake.import")) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Import students</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Collect student details in Excel, then upload to stage and invite them. When a student
          signs in, their imported details become their editable profile.
        </p>
      </header>
      <ImportClient />
    </div>
  );
}
