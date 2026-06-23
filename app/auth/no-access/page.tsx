import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shown to a user who signed in successfully but has no provisioned account
 * (no invite matched their email). Access is invite-only, so they land here.
 */
export default function NoAccessPage() {
  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Account not provisioned</CardTitle>
          <CardDescription>
            Your sign-in worked, but this email hasn’t been added to CareerLaunchpad yet.
            Access is invite-only — ask your administrator to invite you, then sign in again
            with the same email.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
          <Link href="/" className="text-muted-foreground text-sm hover:underline">
            Back to home
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
