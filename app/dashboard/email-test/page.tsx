import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth";
import { mailerStatus } from "@/lib/mailer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TestEmailForm } from "./test-form";

export default async function EmailTestPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  // Owner-only — the "*" wildcard grant is what owners hold.
  if (!ctx.permissions.has("*")) redirect("/dashboard");

  const { configured, from } = mailerStatus();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email integration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Validate that invite notifications can actually be delivered via Gmail SMTP.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Delivery status</CardTitle>
            <Badge variant={configured ? "default" : "secondary"}>
              {configured ? "Configured" : "Not configured"}
            </Badge>
          </div>
          <CardDescription>
            {configured ? (
              <>
                Emails are sent from <span className="font-medium">{from}</span>. Send a test below to
                confirm the App Password works end-to-end.
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">GMAIL_USER</span> and{" "}
                <span className="text-foreground font-medium">GMAIL_APP_PASSWORD</span> are not set, so
                invites are only logged to the server console. Add them to{" "}
                <span className="font-medium">.env</span> and restart to enable real delivery.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestEmailForm defaultTo={ctx.email} disabled={!configured} />
        </CardContent>
      </Card>
    </div>
  );
}
