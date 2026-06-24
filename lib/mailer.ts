/**
 * Invite notifications.
 *
 * Accounts are provisioned by email-match on first social sign-in (see
 * supabase/migrations/005_handle_new_user.sql), so an "invite" is really a
 * notification telling the person to sign in with THIS email.
 *
 * Delivery uses Gmail SMTP (a personal Gmail account + App Password) when
 * GMAIL_USER and GMAIL_APP_PASSWORD are set; otherwise we fall back to a console
 * log so dev/test can follow the flow without email infra. Sending never throws
 * — a mail outage must not break the invite/import flow that calls us.
 */
import nodemailer, { type Transporter } from "nodemailer";

type InviteEmail = {
  to: string;
  roleName: string;
  invitedBy?: string | null;
  loginUrl: string;
};

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
// Friendly From name; the address is always GMAIL_USER (Gmail rewrites others).
const FROM_NAME = process.env.MAIL_FROM_NAME ?? "CareerLaunchPad";

let transporter: Transporter | null = null;

/** Lazily build a reusable Gmail SMTP transport, or null if creds are absent. */
function getTransporter(): Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS on 587
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

/**
 * Fire-and-forget delivery for transactional notifications. Falls back to a
 * console log when creds are absent, and NEVER throws — these are side effects
 * of a flow (invite, approval, submit) that must not fail because email failed.
 */
async function deliver(tag: string, to: string, subject: string, text: string, html: string): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[${tag}] would email ${to}: ${subject}`);
    return;
  }
  try {
    await mailer.sendMail({ from: `"${FROM_NAME}" <${GMAIL_USER}>`, to, subject, text, html });
  } catch (err) {
    console.error(`[${tag}] failed to email ${to}:`, err);
  }
}

export async function sendInviteEmail({ to, roleName, invitedBy, loginUrl }: InviteEmail): Promise<void> {
  const by = invitedBy ? ` by ${invitedBy}` : "";
  const subject = `You've been added to CareerLaunchPad as ${roleName}`;
  const text =
    `You've been added as "${roleName}"${by}.\n\n` +
    `Sign in with this email address (${to}) at:\n${loginUrl}\n`;
  const html =
    `<p>You've been added as <strong>${roleName}</strong>${by}.</p>` +
    `<p>Sign in with this email address (<strong>${to}</strong>) here:</p>` +
    `<p><a href="${loginUrl}">${loginUrl}</a></p>`;
  await deliver("invite", to, subject, text, html);
}

type ApprovalEmail = { to: string; name?: string | null; loginUrl: string };

/** Mentor profile approved by a reviewer — invite them back into the mentor hub. */
export async function sendMentorApprovedEmail({ to, name, loginUrl }: ApprovalEmail): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const subject = "Your CareerLaunchPad mentor profile is approved";
  const text =
    `${hi}\n\n` +
    `Good news — your mentor profile has been approved. You can now start mentoring.\n\n` +
    `Sign in here:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>Good news — your mentor profile has been <strong>approved</strong>. You can now start mentoring.</p>` +
    `<p><a href="${loginUrl}">Open the mentor hub</a></p>`;
  await deliver("mentor-approved", to, subject, text, html);
}

/** Student bulk-imported by their college — welcome them and point them to
 * sign in (the account is provisioned by email-match on first social sign-in)
 * so they can access and complete their profile. */
export async function sendStudentImportedEmail({ to, name, loginUrl }: ApprovalEmail): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const subject = "You're registered with CareerLaunchPad — access your profile";
  const text =
    `${hi}\n\n` +
    `You've been registered with CareerLaunchPad by your college.\n\n` +
    `Sign in with this email address (${to}) to access and complete your profile:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>You've been registered with <strong>CareerLaunchPad</strong> by your college.</p>` +
    `<p>Sign in with this email address (<strong>${to}</strong>) to access and complete your profile:</p>` +
    `<p><a href="${loginUrl}">Access your profile</a></p>`;
  await deliver("student-imported", to, subject, text, html);
}

/** Student finished registration — confirm we received their submission. */
export async function sendStudentSubmittedEmail({ to, name, loginUrl }: ApprovalEmail): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const subject = "We've received your CareerLaunchPad registration";
  const text =
    `${hi}\n\n` +
    `Thanks for registering with CareerLaunchPad — your registration has been submitted successfully.\n\n` +
    `You can sign in any time to view or update your profile:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>Thanks for registering with CareerLaunchPad — your registration has been <strong>submitted successfully</strong>.</p>` +
    `<p><a href="${loginUrl}">View your profile</a></p>`;
  await deliver("student-submitted", to, subject, text, html);
}

/** Whether real delivery is wired up, and the From address if so. For the
 * owner-facing integration-test screen (lib reads server-only env, the page
 * shows the address — never the password). */
export function mailerStatus(): { configured: boolean; from: string | null } {
  return { configured: Boolean(GMAIL_USER && GMAIL_APP_PASSWORD), from: GMAIL_USER ?? null };
}

export type TestResult = { ok: boolean; messageId?: string; error?: string };

/**
 * Send a one-off test email and SURFACE the outcome (unlike sendInviteEmail,
 * which swallows errors so an outage can't break the invite flow). Used by the
 * owner validation screen so a misconfigured App Password shows the real error.
 */
export async function sendTestEmail(to: string): Promise<TestResult> {
  const mailer = getTransporter();
  if (!mailer) {
    return { ok: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to .env and restart the server." };
  }
  try {
    const info = await mailer.sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to,
      subject: "CareerLaunchPad email test",
      text: "This is a test email confirming Gmail SMTP is configured correctly for CareerLaunchPad.",
      html: "<p>This is a <strong>test email</strong> confirming Gmail SMTP is configured correctly for CareerLaunchPad. 🎉</p>",
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
