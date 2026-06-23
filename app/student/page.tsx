import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder student surface — role-routing target. The full profile builder
// (Groups 1–4 of student_profile, photo/resume upload to R2) comes later.
export default async function StudentHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome, {ctx.email}</CardTitle>
          <CardDescription>Your student profile workspace is coming soon.</CardDescription>
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
