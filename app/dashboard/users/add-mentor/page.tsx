import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { AddMentorWizard } from "./add-mentor-wizard";

// Add a mentor with their full profile (same wizard as mentor self-registration),
// staged + invited in one shot. Owner / Admin (user.invite).
export default async function AddMentorPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "user.invite")) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Add a mentor</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Fill the same details a mentor would on sign-up — skills, mentoring areas, experience.
          They’re emailed a login link and show as Pending until they sign in; their profile is
          already filled in.
        </p>
      </header>
      <AddMentorWizard />
    </div>
  );
}
