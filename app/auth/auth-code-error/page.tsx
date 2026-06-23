import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown when the OAuth code exchange fails (expired/invalid/denied). */
export default function AuthCodeErrorPage() {
  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign-in didn’t complete</CardTitle>
          <CardDescription>
            We couldn’t finish signing you in. The link may have expired or the request was
            cancelled. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
