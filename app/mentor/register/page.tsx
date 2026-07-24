import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { MentorForm } from "./mentor-form";
import { PageContainer } from "@/components/app-shell/page-container";

// Mentor registration / profile editor. The form (client) loads reference data
// + the existing profile from the API and resumes where the mentor left off,
// pre-filled from their student profile when they converted from a student.
export default async function MentorRegisterPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!ctx.roles.includes("mentor") && !ctx.permissions.has("*")) redirect(ctx.homePath);

  return (
    <PageContainer variant="form">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">🤝 Mentor Registration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A few quick details about you and what you can teach — it saves as you go.
        </p>
      </header>
      <MentorForm />
    </PageContainer>
  );
}
