"use server";

import { requirePermission } from "@/lib/auth";
import { sendTestEmail } from "@/lib/mailer";

export type TestEmailState = { ok?: boolean; error?: string; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Owner-only: send a one-off test email to validate the Gmail SMTP integration. */
export async function sendTestEmailAction(
  _prev: TestEmailState,
  formData: FormData,
): Promise<TestEmailState> {
  // "*" is the owner wildcard grant — restricts this to owners.
  await requirePermission("*");

  const to = String(formData.get("to") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return { error: "Enter a valid email address." };

  const res = await sendTestEmail(to);
  if (!res.ok) return { error: res.error ?? "Failed to send the test email." };

  return { ok: true, message: `Test email sent to ${to}. Check the inbox (and the spam folder).` };
}
