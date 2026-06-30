import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { AddStudentWizard } from "@/components/students/add-student-wizard";

// Add a single student (same profile wizard as self-registration), staged +
// invited via the intake flow. Owner / Support / College Admin.
export default async function AddStudentPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "student.intake.import")) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Add a student</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Fill the same details a student would on sign-up. They’re staged and invited by email;
          their details become their editable profile when they sign in. Only need a few? Just fill
          what you have — the student completes the rest.
        </p>
      </header>
      <AddStudentWizard />
    </div>
  );
}
