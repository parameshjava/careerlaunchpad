import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmployersManager, type Employer } from "./employers-manager";

// Employer (organization) management. Owner / Admin (user.manage).
export default async function EmployersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "user.manage")) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("employer")
    .select("id, name, website, logo_url, status")
    .order("name");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Employer organizations. Add and manage them here; invite Employer users to an
          organization from the Platform users page.
        </p>
      </header>
      <EmployersManager employers={(data ?? []) as Employer[]} />
    </div>
  );
}
