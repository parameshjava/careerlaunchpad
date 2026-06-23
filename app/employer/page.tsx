import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder employer surface — role-routing target. Talent search + job
// posting + applicant review come later.
export default async function EmployerHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome, {ctx.email}</CardTitle>
          <CardDescription>Your employer workspace is coming soon.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
