import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder employer surface — role-routing target. Talent search + job
// posting + applicant review come later. Sign out lives in the navbar avatar menu.
export default async function EmployerHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome, {ctx.name ?? ctx.email}</CardTitle>
          <CardDescription>Your employer workspace is coming soon.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
