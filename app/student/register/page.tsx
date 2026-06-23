import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { RegistrationForm } from "./registration-form";

// Student registration / profile editor. The form (client) loads reference data
// + the existing profile from the API and resumes where the student left off,
// so this also serves as the "edit later" surface for imported students.
export default async function StudentRegisterPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">🎓 Student Registration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Build your career-ready profile — it saves as you go, so you can finish anytime.
        </p>
      </header>
      <RegistrationForm />
    </div>
  );
}
