/**
 * Invite notifications.
 *
 * Accounts are provisioned by email-match on first social sign-in (see
 * supabase/migrations/005_handle_new_user.sql), so an "invite" is really a
 * notification telling the person to sign in with THIS email.
 *
 * Delivery uses generic SMTP — configured for Zoho Mail (smtppro.zoho.in) with the
 * noreply@careerlaunchpad.ai mailbox — when SMTP_HOST / SMTP_USER / SMTP_PASSWORD are
 * set; otherwise we fall back to a console log so dev/test can follow the flow without
 * email infra. Sending never throws — a mail outage must not break the invite/import
 * flow that calls us.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { markdownToEmailHtml } from "./markdown-email";
import {
  EXAM_PASS_PCT,
  examGrade,
  examPassed,
  examPercentage,
  examVerdict,
} from "./exam-grading";

type InviteEmail = {
  to: string;
  roleName: string;
  invitedBy?: string | null;
  loginUrl: string;
};

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
// The visible From: a friendly name + the sending address. The address must be a
// mailbox/alias the SMTP account is allowed to send as (Zoho rewrites others), so it
// defaults to SMTP_USER when MAIL_FROM_ADDRESS isn't set explicitly.
const FROM_NAME = process.env.MAIL_FROM_NAME ?? "CareerLaunchpad";
const FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS ?? SMTP_USER;

let transporter: Transporter | null = null;

/** Lazily build a reusable SMTP transport, or null if creds are absent. */
function getTransporter(): Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit SSL; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
  }
  return transporter;
}

/** Escape user/free-text before interpolating into email HTML. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


/**
 * Responsive, mobile-first email shell. Email clients strip <head><style> and
 * don't support flexbox/grid, so this is a SINGLE fluid column (max-width 600px,
 * 100% on phones), TABLE-based, with all CSS inlined — the combination that
 * renders correctly in Gmail, Apple Mail, and Outlook (Word engine) alike.
 *
 *   • viewport meta + x-apple-disable-message-reformatting → no iOS auto-zoom.
 *   • bgcolor beside every gradient → Outlook falls back to solid brand blue.
 *   • 16px body / 20px heading, 44px+ tap-target button → readable + tappable.
 *   • hidden preheader → controls the inbox preview line.
 *
 * `contentHtml` is the inner body-cell markup (headings/paragraphs/callouts).
 * Build buttons with `emailButton()` so they stay bulletproof. `footerHtml`
 * overrides the default footer line for senders that need to say more (e.g. the
 * results email, which is a no-reply mass send).
 */
function emailShell({
  preheader,
  contentHtml,
  footerHtml,
}: {
  preheader: string;
  contentHtml: string;
  footerHtml?: string;
}): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:#f6f8fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:${font};">
<tr><td bgcolor="#2563eb" style="background:linear-gradient(90deg,#2563eb,#7c3aed);padding:20px 28px;">
<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">CareerLaunchpad</span>
</td></tr>
<tr><td style="padding:28px;color:#0f172a;font-size:16px;line-height:1.6;">
${contentHtml}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #eef2f7;color:#64748b;font-size:13px;line-height:1.5;">
${footerHtml ?? "You're receiving this because you registered at CareerLaunchpad."}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Bulletproof (table-based) CTA button — large tap target, Outlook-safe. */
function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="#2563eb" style="border-radius:10px;background:linear-gradient(90deg,#2563eb,#7c3aed);">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
</td></tr></table>`;
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
    await mailer.sendMail({ from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, to, subject, text, html });
  } catch (err) {
    console.error(`[${tag}] failed to email ${to}:`, err);
  }
}

export async function sendInviteEmail({ to, roleName, invitedBy, loginUrl }: InviteEmail): Promise<void> {
  const by = invitedBy ? ` by ${invitedBy}` : "";
  const subject = `You've been added to CareerLaunchpad as ${roleName}`;
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
  const subject = "Your CareerLaunchpad mentor profile is approved";
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
  const subject = "You're registered with CareerLaunchpad — access your profile";
  const text =
    `${hi}\n\n` +
    `You've been registered with CareerLaunchpad by your college.\n\n` +
    `Sign in with this email address (${to}) to access and complete your profile:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>You've been registered with <strong>CareerLaunchpad</strong> by your college.</p>` +
    `<p>Sign in with this email address (<strong>${to}</strong>) to access and complete your profile:</p>` +
    `<p><a href="${loginUrl}">Access your profile</a></p>`;
  await deliver("student-imported", to, subject, text, html);
}

/** Student finished registration — confirm we received it and it's pending approval. */
export async function sendStudentSubmittedEmail({ to, name, loginUrl }: ApprovalEmail): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const subject = "We've received your CareerLaunchpad registration — pending approval";
  const text =
    `${hi}\n\n` +
    `Thanks for registering with CareerLaunchpad — your registration has been submitted and is now pending approval.\n\n` +
    `We'll email you as soon as it's approved. You can sign in any time to view or update your profile:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>Thanks for registering with CareerLaunchpad — your registration has been <strong>submitted and is now pending approval</strong>.</p>` +
    `<p>We'll email you as soon as it's approved.</p>` +
    `<p><a href="${loginUrl}">View your profile</a></p>`;
  await deliver("student-submitted", to, subject, text, html);
}

/** Mentor finished registration — confirm we received it and it's pending approval. */
export async function sendMentorSubmittedEmail({ to, name, loginUrl }: ApprovalEmail): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const subject = "We've received your CareerLaunchpad mentor registration — pending approval";
  const text =
    `${hi}\n\n` +
    `Thanks for registering as a mentor with CareerLaunchpad — your registration has been submitted and is now pending approval.\n\n` +
    `We'll email you as soon as it's approved. You can sign in any time to view or update your profile:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>Thanks for registering as a mentor with CareerLaunchpad — your registration has been <strong>submitted and is now pending approval</strong>.</p>` +
    `<p>We'll email you as soon as it's approved.</p>` +
    `<p><a href="${loginUrl}">View your profile</a></p>`;
  await deliver("mentor-submitted", to, subject, text, html);
}

type StudentApprovalEmail = {
  to: string;
  name?: string | null;
  dashboardUrl: string;
  profileUrl: string;
  /** 0–100 profile completeness. Below 100 adds the "complete your profile" nudge. */
  completeness: number;
};

/**
 * Student profile approved by a reviewer — the welcome/congrats email. When the
 * profile isn't yet 100% complete we include the completion nudge + link;
 * otherwise we skip it and just point them at their dashboard.
 */
export async function sendStudentApprovedEmail({
  to,
  name,
  dashboardUrl,
  profileUrl,
  completeness,
}: StudentApprovalEmail): Promise<void> {
  const first = (name ?? "").trim();
  const greeting = first ? `Congratulations, ${first}!` : "Congratulations!";
  const subject = first
    ? `Congratulations, ${first}!`
    : "Congratulations — your CareerLaunchPad registration is approved!";
  const incomplete = completeness < 100;

  const profileText = incomplete
    ? `Your profile is now active. Please take a moment to log in and ensure your profile details are 100% complete (currently ${completeness}%) so you do not miss out on any personalized opportunities:\n${profileUrl}\n\n`
    : `Your profile is now active and 100% complete.\n\n`;
  const text =
    `${greeting}\n\n` +
    `We are excited to inform you that your registration with CareerLaunchPad has been officially approved by our admin team! Welcome to our training institute.\n\n` +
    profileText +
    `What's next?\nStay tuned! We will send you updates shortly regarding your upcoming training schedules, batch details, and exclusive learning resources.\n\n` +
    `Go to My Dashboard:\n${dashboardUrl}\n\n` +
    `To your success,\nThe CareerLaunchPad Team\n`;

  const profileHtml = incomplete
    ? `<p>Your profile is now active. Please take a moment to log in and ensure your profile details are <strong>100% complete</strong> (currently ${completeness}%) so you do not miss out on any personalized opportunities.</p>` +
      `<p><a href="${profileUrl}">Complete your profile</a></p>`
    : `<p>Your profile is now active and <strong>100% complete</strong>.</p>`;
  const html =
    `<p>${first ? `Congratulations, <strong>${first}</strong>!` : "Congratulations!"}</p>` +
    `<p>We are excited to inform you that your registration with <strong>CareerLaunchPad</strong> has been officially approved by our admin team! Welcome to our training institute.</p>` +
    profileHtml +
    `<p><strong>What's next?</strong><br/>Stay tuned! We will send you updates shortly regarding your upcoming training schedules, batch details, and exclusive learning resources.</p>` +
    `<p><a href="${dashboardUrl}">Go to My Dashboard</a></p>` +
    `<p>To your success,<br/>The CareerLaunchPad Team</p>`;

  await deliver("student-approved", to, subject, text, html);
}

type RemarksEmail = {
  to: string;
  name?: string | null;
  /** The reviewer's remark, verbatim (free text — escaped + line-break-preserved here). */
  remarks: string;
  /** True when the profile was sent back for correction (pre-approval); false for
   *  an informational note to an already-approved/registered student. */
  requestChanges: boolean;
  profileUrl: string;
};

/**
 * A reviewer left remarks on a student's registration (issue #82). When
 * `requestChanges` is true the student was sent back to correct + re-submit;
 * otherwise it's an informational note (they keep their current access). Uses the
 * responsive email shell so it reads well on a phone. Best-effort — never throws.
 */
export async function sendStudentRemarksEmail({
  to,
  name,
  remarks,
  requestChanges,
  profileUrl,
}: RemarksEmail): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const subject = requestChanges
    ? "Action needed on your CareerLaunchpad registration"
    : "A note from the CareerLaunchpad team about your profile";
  const lead = requestChanges
    ? "Our team reviewed your registration and needs a few corrections before we can approve it:"
    : "Our team left a note about your CareerLaunchpad profile:";
  const closing = requestChanges
    ? "Please update your profile and re-submit — we'll review it again as soon as you do."
    : "You can update your profile any time from the link below.";
  const cta = requestChanges ? "Update & re-submit" : "Open my profile";

  const text =
    `${hi}\n\n${lead}\n\n${remarks}\n\n${closing}\n\n${cta}: ${profileUrl}\n`;

  // Render the reviewer's Markdown (GFM) to HTML for the email body.
  const remarksHtml = markdownToEmailHtml(remarks);
  const content =
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${requestChanges ? "Action needed on your registration" : "A note about your profile"}</h1>` +
    `<p style="margin:0 0 16px;">${escapeHtml(hi)}</p>` +
    `<p style="margin:0 0 16px;">${escapeHtml(lead)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>` +
    `<td style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 16px;color:#7c2d12;font-size:15px;line-height:1.6;">${remarksHtml}</td>` +
    `</tr></table>` +
    `<p style="margin:0 0 22px;">${escapeHtml(closing)}</p>` +
    emailButton(profileUrl, cta);

  const html = emailShell({
    preheader: requestChanges
      ? "Your reviewer requested corrections to your registration."
      : "Your reviewer left a note on your CareerLaunchpad profile.",
    contentHtml: content,
  });

  await deliver("student-remarks", to, subject, text, html);
}

type PendingNotice = {
  to: string[];
  kind: "student" | "mentor" | "college_staff";
  name?: string | null;
  reviewUrl: string;
  /** College the registration belongs to — shown for college_staff, where the
   * recipient list spans one college's admins AND every platform admin, so
   * "which college?" is the first thing a platform admin needs to know. */
  collegeName?: string | null;
};

const PENDING_LABEL: Record<PendingNotice["kind"], string> = {
  student: "student",
  mentor: "mentor",
  college_staff: "college staff member",
};

/**
 * Notify reviewers that a new registration is awaiting approval. `to` is the
 * resolved recipient list — notification_recipients() for students/mentors, and
 * college_staff_recipients(college) for staff, which is scoped to THAT college's
 * admins plus platform admins (migration 175 §10e). Skips silently if empty, and
 * sends to all addresses at once (Bcc'd so recipients don't see each other).
 */
export async function sendRegistrationPendingEmail({ to, kind, name, reviewUrl, collegeName }: PendingNotice): Promise<void> {
  if (!to.length) return;
  const who = PENDING_LABEL[kind];
  const at = collegeName ? ` at ${collegeName}` : "";
  const label = name ? `${name} (${who}${at})` : `A new ${who}${at}`;
  const subject = `New ${who} registration awaiting approval${name ? ` — ${name}` : ""}${collegeName ? ` (${collegeName})` : ""}`;
  const text =
    `${label} has submitted a registration and is awaiting approval.\n\n` +
    `Review it here:\n${reviewUrl}\n`;
  const html =
    `<p><strong>${escapeHtml(label)}</strong> has submitted a registration and is awaiting approval.</p>` +
    `<p><a href="${reviewUrl}">Review the registration</a></p>`;
  // One message, recipients hidden from each other.
  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[registration-pending] would email ${to.length} recipient(s): ${subject}`);
    return;
  }
  try {
    await mailer.sendMail({ from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, bcc: to, subject, text, html });
  } catch (err) {
    console.error(`[registration-pending] failed to email reviewers:`, err);
  }
}

// ---- College Staff (#107) --------------------------------------------------

/** Staff finished registration — confirm we received it and who reviews it. */
export async function sendCollegeStaffSubmittedEmail({
  to, name, collegeName, loginUrl,
}: ApprovalEmail & { collegeName?: string | null }): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const at = collegeName ? ` for ${collegeName}` : "";
  const subject = "We've received your CareerLaunchpad staff registration — pending approval";
  const text =
    `${hi}\n\n` +
    `Thanks for registering as college staff${at} — your registration has been submitted and is now pending approval by your college admin.\n\n` +
    `We'll email you as soon as it's approved. You can sign in any time to view or update your details:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>Thanks for registering as college staff${escapeHtml(at)} — your registration has been ` +
    `<strong>submitted and is now pending approval</strong> by your college admin.</p>` +
    `<p>We'll email you as soon as it's approved.</p>` +
    `<p><a href="${loginUrl}">View your registration</a></p>`;
  await deliver("college-staff-submitted", to, subject, text, html);
}

/** Staff registration approved — they now have access to their college. */
export async function sendCollegeStaffApprovedEmail({
  to, name, collegeName, loginUrl,
}: ApprovalEmail & { collegeName?: string | null }): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const at = collegeName ? ` for ${collegeName}` : "";
  const subject = "Your CareerLaunchpad staff access is approved";
  const text =
    `${hi}\n\n` +
    `Good news — your staff access${at} has been approved. You can now see your college's students, batches and results.\n\n` +
    `Sign in here:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p>` +
    `<p>Good news — your staff access${escapeHtml(at)} has been <strong>approved</strong>. ` +
    `You can now see your college's students, batches and results.</p>` +
    `<p><a href="${loginUrl}">Open your dashboard</a></p>`;
  await deliver("college-staff-approved", to, subject, text, html);
}

/**
 * A reviewer sent the registration back, rejected it, or suspended access. One
 * template for all three because the message is the same shape — what happened,
 * why, what to do — and splitting it would mean three near-identical bodies that
 * drift. `note` is the reviewer's own words and is always shown; without a
 * reason these emails are just a dead end for the recipient.
 */
export async function sendCollegeStaffReviewEmail({
  to, name, outcome, note, loginUrl,
}: {
  to: string;
  name?: string | null;
  outcome: "changes_requested" | "rejected" | "suspended";
  note?: string | null;
  loginUrl: string;
}): Promise<void> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const copy = {
    changes_requested: {
      subject: "Your CareerLaunchpad staff registration needs a correction",
      lead: "Your college admin has asked for a correction to your staff registration before it can be approved.",
      cta: "Update your registration",
    },
    rejected: {
      subject: "About your CareerLaunchpad staff registration",
      lead: "Your college admin was not able to approve your staff registration.",
      cta: "View your registration",
    },
    suspended: {
      subject: "Your CareerLaunchpad staff access has been paused",
      lead: "Your staff access has been paused by your college admin.",
      cta: "View your registration",
    },
  }[outcome];

  const reason = note?.trim();
  const text =
    `${hi}\n\n${copy.lead}\n\n` +
    (reason ? `What they said:\n${reason}\n\n` : "") +
    `${copy.cta}:\n${loginUrl}\n`;
  const html =
    `<p>${hi}</p><p>${copy.lead}</p>` +
    (reason
      ? `<p style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #7c3aed;">${escapeHtml(reason)}</p>`
      : "") +
    `<p><a href="${loginUrl}">${copy.cta}</a></p>`;
  await deliver(`college-staff-${outcome}`, to, copy.subject, text, html);
}

/** Whether real delivery is wired up, and the From address if so. For the
 * owner-facing integration-test screen (lib reads server-only env, the page
 * shows the address — never the password). */
export function mailerStatus(): { configured: boolean; from: string | null } {
  return { configured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD), from: FROM_ADDRESS ?? null };
}

type ClassInviteEmail = {
  to: string;
  mentorName?: string | null;
  batchName: string;
  subjectName: string;
  title: string;
  /** Human-readable date/time, e.g. "Mon 20 Jul 2026, 10:00–11:30 (IST)". */
  whenLabel: string;
  joinUrl?: string | null;
  /** The .ics body from lib/ics.ts. */
  ics: string;
  /** REQUEST for a new/updated invite, CANCEL to withdraw it. */
  method: "REQUEST" | "CANCEL";
};

/**
 * Email a subject mentor their class calendar invite, with the .ics attached as
 * an `icalEvent` so it opens/updates natively in Outlook/Google/Apple Calendar.
 * Fire-and-forget: NEVER throws (a mail outage must not fail scheduling). Returns
 * whether delivery was attempted so the caller can log invite state.
 */
export async function sendClassInviteEmail(input: ClassInviteEmail): Promise<{ sent: boolean; error?: string }> {
  const cancelled = input.method === "CANCEL";
  const hi = input.mentorName ? `Hi ${input.mentorName},` : "Hi,";
  const verb = cancelled ? "cancelled" : "scheduled";
  const subject = `${cancelled ? "Cancelled: " : ""}${input.subjectName} class — ${input.title} (${input.batchName})`;
  const joinLine = input.joinUrl && !cancelled ? `Join: ${input.joinUrl}\n` : "";
  const text =
    `${hi}\n\n` +
    `A ${input.subjectName} class for ${input.batchName} has been ${verb}.\n\n` +
    `Class: ${input.title}\nWhen: ${input.whenLabel}\n${joinLine}\n` +
    `The calendar invite is attached.\n`;

  // Escape every interpolated value — titles/names are staff-entered free text.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const joinHtml =
    input.joinUrl && !cancelled
      ? `<p><a href="${esc(input.joinUrl)}">Join the Zoom class</a></p>`
      : "";
  const html =
    `<p>${esc(hi)}</p>` +
    `<p>A <strong>${esc(input.subjectName)}</strong> class for <strong>${esc(input.batchName)}</strong> has been ${verb}.</p>` +
    `<p><strong>${esc(input.title)}</strong><br/>${esc(input.whenLabel)}</p>` +
    joinHtml +
    `<p>The calendar invite is attached.</p>`;

  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[class-invite] would email ${input.to}: ${subject}`);
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await mailer.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to: input.to,
      subject,
      text,
      html,
      icalEvent: { method: input.method, content: input.ics, filename: "invite.ics" },
    });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[class-invite] failed to email ${input.to}:`, err);
    return { sent: false, error };
  }
}

export type ExamResultSection = { name: string; got: number; max: number };

export type ExamResultEmail = {
  to: string;
  name?: string | null;
  examTitle: string;
  sittingLabel: string;
  collegeName?: string | null;
  marks: number;
  maxMarks: number;
  correct: number;
  questions: number;
  /** Questions with a selection — only surfaced when the attempt was interrupted. */
  answered: number;
  /** The exam monitor cut the attempt short (abort_count > 0). */
  interrupted: boolean;
  rank: number | null;
  outOf: number | null;
  collegeAverage: number | null;
  sections: ExamResultSection[];
  resultUrl: string;
};

/**
 * Compose the "your result is ready" email (issue #77). Split out from the
 * sender so the template can be rendered without SMTP — which is how it was
 * reviewed at 320 / 390 / 600px before it shipped.
 *
 * Mirrors the printed Statement of Marks field for field, grading through
 * lib/exam-grading.ts so the email and the result page cannot disagree.
 *
 * Deliberately has NO chart. An earlier draft drew a per-section bar with nested
 * `bgcolor` cells; at 320px the four fixed columns overran the ~240px the shell
 * leaves for content, which widened the shared body cell and clipped the whole
 * email against the card's overflow:hidden. The bar was redundant beside the
 * marks and the percentage. Sections below the pass mark carry a downward arrow
 * as well as red, so nothing is signalled by colour alone.
 *
 * No media queries anywhere — Outlook.com strips them.
 *
 */
export function buildExamResultEmail(d: ExamResultEmail): {
  subject: string;
  text: string;
  html: string;
} {
  const percentage = examPercentage(d.marks, d.maxMarks);
  const passed = examPassed(percentage);
  const verdict = examVerdict(percentage);
  const gradeLabel = examGrade(percentage);
  const pctLabel = percentage == null ? "—" : `${percentage.toFixed(1)}%`;
  // An UNKNOWN verdict must not wear the fail colours — a red pill reading "—"
  // tells a student they failed when the truth is that nothing could be graded.
  const verdictBg = verdict === "—" ? "#eef2f7" : passed ? "#dcfce7" : "#fee2e2";
  const verdictInk = verdict === "—" ? "#475569" : passed ? "#047857" : "#b91c1c";

  // Lowest-scoring subject, named only when it is actually below the pass mark —
  // and never for an interrupted attempt, whose low sections record where the
  // clock stopped rather than where the student is weak.
  const withPct = d.sections
    .map((s) => ({ ...s, pct: examPercentage(s.got, s.max) }))
    .filter((s) => s.pct != null) as (ExamResultSection & { pct: number })[];
  const weakest = withPct.length
    ? withPct.reduce((a, s) => (s.pct < a.pct ? s : a))
    : null;
  const showFocus = !d.interrupted && weakest != null && weakest.pct < EXAM_PASS_PCT;
  const showRank = !d.interrupted && d.rank != null && d.outOf != null;

  const hi = d.name ? `Hi ${d.name},` : "Hi,";
  const subject = `Your result for ${d.examTitle} is now available`;

  /* ---- plain text ------------------------------------------------------- */
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  const textLines = [
    hi,
    "",
    `Your results for ${d.examTitle} (${d.sittingLabel}) have been published.`,
    "",
    `  Marks obtained : ${d.marks} / ${d.maxMarks}`,
    `  Percentage     : ${pctLabel}`,
    `  Correct        : ${d.correct} / ${d.questions}`,
    `  Grade          : ${gradeLabel}`,
    `  Result         : ${verdict}  (pass mark ${EXAM_PASS_PCT}%)`,
  ];
  if (showRank)
    textLines.push(
      `  Rank           : ${d.rank} of ${d.outOf}` +
        (d.collegeAverage != null ? `  (college average ${d.collegeAverage})` : ""),
    );
  if (d.interrupted)
    textLines.push(
      "",
      `Your attempt was interrupted by the exam monitor, so only the ${d.answered} of`,
      `${d.questions} questions you had answered were graded. Your marks are out of`,
      "the full paper.",
    );
  if (d.sections.length > 1) {
    textLines.push("", "Section-wise performance", "");
    for (const s of d.sections) {
      const sp = examPercentage(s.got, s.max);
      textLines.push(
        `  ${pad(s.name, 26)}${pad(`${s.got} / ${s.max}`, 12)}${sp == null ? "—" : `${sp.toFixed(1)}%`}`,
      );
    }
  }
  if (showFocus && weakest)
    textLines.push(
      "",
      `Start with ${weakest.name} — it is your lowest section at ${weakest.pct.toFixed(1)}%.`,
    );
  textLines.push(
    "",
    "See the full answer key, with an explanation for every question:",
    d.resultUrl,
    "",
    "-- ",
    "CareerLaunchpad · please do not reply to this address",
  );
  const text = textLines.join("\n");

  /* ---- html ------------------------------------------------------------- */
  // 3-up stat cells. nowrap on both lines: at 320px a wrapped "33 / 40"
  // collided with the rule above it.
  const stat = (label: string, value: string) =>
    `<td width="33.33%" align="center" style="padding:12px 3px 0;">` +
    `<div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b;white-space:nowrap;">${escapeHtml(label)}</div>` +
    `<div style="font-size:17px;font-weight:700;color:#0f172a;padding-top:2px;white-space:nowrap;">${escapeHtml(value)}</div>` +
    `</td>`;

  const secRow = (s: ExamResultSection) => {
    const sp = examPercentage(s.got, s.max);
    const low = sp != null && sp < EXAM_PASS_PCT;
    return (
      `<tr>` +
      `<td style="padding:9px 0;border-bottom:1px solid #eef2f7;font-size:14px;line-height:1.4;color:#0f172a;">${escapeHtml(s.name)}</td>` +
      `<td width="66" align="right" style="padding:9px 0 9px 8px;border-bottom:1px solid #eef2f7;font-size:14px;color:#0f172a;white-space:nowrap;">` +
      `<strong>${s.got}</strong><span style="color:#64748b;">&nbsp;/&nbsp;${s.max}</span></td>` +
      `<td width="58" align="right" style="padding:9px 0 9px 8px;border-bottom:1px solid #eef2f7;font-size:13px;font-weight:${low ? "700" : "400"};color:${low ? "#b91c1c" : "#64748b"};white-space:nowrap;">` +
      `${sp == null ? "&mdash;" : `${sp.toFixed(1)}%${low ? "&nbsp;&#8595;" : ""}`}</td>` +
      `</tr>`
    );
  };

  const sectionBlock =
    d.sections.length > 1
      ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:0 0 4px;">Section-wise performance</div>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;">` +
        d.sections.map(secRow).join("") +
        `</table>`
      : "";

  const interruptedNote = d.interrupted
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;"><tr>` +
      `<td style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:8px;padding:13px 16px;color:#7c2d12;font-size:14px;line-height:1.55;">` +
      `Your attempt was interrupted by the exam monitor, so only the <strong>${d.answered} of ${d.questions} questions</strong> you had answered were graded. Your marks are out of the full paper.` +
      `</td></tr></table>`
    : "";

  const focusNote =
    showFocus && weakest
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;"><tr>` +
        `<td style="background:#f4f7ff;border-left:4px solid #2563eb;border-radius:8px;padding:13px 16px;color:#1e3a8a;font-size:14px;line-height:1.55;">` +
        `<strong>Start with ${escapeHtml(weakest.name)}</strong> &mdash; it is your lowest section at ${weakest.pct.toFixed(1)}%. The result page shows the correct answer and an explanation for every question you missed.` +
        `</td></tr></table>`
      : "";

  const rankLine = showRank
    ? `<div style="font-size:13px;color:#64748b;padding-top:12px;border-top:1px solid #e3eaf6;margin-top:14px;">` +
      `Rank <strong style="color:#0f172a;">${d.rank}</strong> of ${d.outOf}` +
      (d.collegeAverage != null
        ? ` &nbsp;&middot;&nbsp; College average ${d.collegeAverage} / ${d.maxMarks}`
        : "") +
      `</div>`
    : "";

  const metaLine = [d.sittingLabel, d.collegeName]
    .filter(Boolean)
    .map((s) => escapeHtml(String(s)))
    .join(" &nbsp;&middot;&nbsp; ");

  const content =
    `<h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;color:#0f172a;">Your result is ready</h1>` +
    `<p style="margin:0 0 18px;font-size:14px;color:#64748b;line-height:1.5;">${escapeHtml(d.examTitle)}<br>${metaLine}</p>` +
    `<p style="margin:0 0 18px;">${escapeHtml(hi)}</p>` +
    `<p style="margin:0 0 18px;">Your results for this exam have been published. Here is your statement of marks.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;"><tr>` +
    // 14px, not 18px, of horizontal padding: measured at a true 320px viewport,
    // the three nowrap stat cells need 208px, and 18px pushed the card's
    // min-width to 299 — 323 with the shell's gutters, i.e. a 3px horizontal
    // scroll on a 320px phone. This is the cheapest 8px and is invisible at 600px.
    `<td bgcolor="#f4f7ff" style="background:#f4f7ff;border-radius:12px;padding:20px 14px;">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">Marks obtained</div>` +
    `<div style="padding:2px 0 14px;">` +
    `<span style="font-size:38px;font-weight:700;color:#1d4ed8;line-height:1.05;">${d.marks}</span>` +
    `<span style="font-size:19px;color:#64748b;">&nbsp;/&nbsp;${d.maxMarks}</span></div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #e3eaf6;"><tr>` +
    stat("Percentage", pctLabel) +
    stat("Correct", `${d.correct} / ${d.questions}`) +
    stat("Grade", gradeLabel) +
    `</tr></table>` +
    `<div style="padding-top:16px;">` +
    `<span style="display:inline-block;background:${verdictBg};color:${verdictInk};font-size:13px;font-weight:700;letter-spacing:.04em;padding:5px 12px;border-radius:6px;white-space:nowrap;">RESULT: ${verdict}</span>` +
    `</div>` +
    // Suppressed on a zero-mark paper, where "40% of 0 marks" is nonsense.
    (d.maxMarks > 0
      ? `<div style="padding-top:7px;font-size:12px;color:#64748b;">Pass mark: ${EXAM_PASS_PCT}% of ${d.maxMarks} marks</div>`
      : "") +
    rankLine +
    `</td></tr></table>` +
    interruptedNote +
    sectionBlock +
    focusNote +
    `<p style="margin:0 0 16px;">Open your result to see the full answer key, with the correct answer and an explanation for every question.</p>` +
    emailButton(d.resultUrl, "View my result") +
    `<p style="margin:16px 0 0;font-size:13px;color:#64748b;">You can also print your statement of marks and the answer key as PDFs from that page.</p>`;

  const html = emailShell({
    preheader: "Marks, section-wise breakdown and the full answer key with explanations.",
    contentHtml: content,
    footerHtml:
      `You're receiving this because you registered at CareerLaunchpad.` +
      (d.collegeName ? ` Results were published by ${escapeHtml(d.collegeName)}.` : "") +
      ` Please do not reply to this address.`,
  });

  return { subject, text, html };
}

/**
 * Deliver the results email. Returns the outcome instead of swallowing it
 * (unlike `deliver`), because the caller records it in exam_result_notification
 * and offers a retry.
 */
export async function sendExamResultEmail(
  d: ExamResultEmail,
): Promise<{ sent: boolean; error?: string }> {
  const { subject, text, html } = buildExamResultEmail(d);

  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[exam-result] would email ${d.to}: ${subject}`);
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await mailer.sendMail({ from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, to: d.to, subject, text, html });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[exam-result] failed to email ${d.to}:`, err);
    return { sent: false, error };
  }
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
    return { ok: false, error: "SMTP_HOST / SMTP_USER / SMTP_PASSWORD are not set. Add them to .env and restart the server." };
  }
  try {
    const info = await mailer.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to,
      subject: "CareerLaunchpad email test",
      text: "This is a test email confirming SMTP is configured correctly for CareerLaunchpad.",
      html: "<p>This is a <strong>test email</strong> confirming SMTP is configured correctly for CareerLaunchpad. 🎉</p>",
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type FeedbackReminderEmail = {
  to: string;
  name?: string | null;
  batchName: string | null;
  subjectName: string | null;
  chapterName: string | null;
  /** ISO date the window shuts — the only urgency this email is allowed to use. */
  closesAt: string;
  feedbackUrl: string;
};

/**
 * The single reminder that a chapter's feedback window is open (issue #84 §G3,
 * migration 168). ONE per window per student, ever — the queue's primary key is
 * what guarantees that, not this function.
 *
 * The copy carries three loads, and each is deliberate:
 *   · It says what feedback is FOR ("what we change"), because a student who has
 *     never seen anything change stops answering (§F6).
 *   · It repeats the visibility promise verbatim from the form — the trainer sees
 *     combined results with no names. An email that is vaguer than the form it links
 *     to is where trust in an anonymous channel goes.
 *   · It tells an already-answered student to ignore it, because enqueue happens
 *     before the drain and a few will have answered in between (migration 168 §2).
 *
 * Returns the outcome rather than swallowing it: the caller records it in
 * feedback_reminder_notification and the row is retried on the next run.
 */
export async function sendFeedbackReminderEmail(
  d: FeedbackReminderEmail,
): Promise<{ sent: boolean; error?: string }> {
  const hi = d.name ? `Hi ${d.name},` : "Hi,";
  const chapter = d.chapterName ?? "a chapter you've just finished";
  const closes = new Date(d.closesAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const where = [d.subjectName, d.batchName].filter(Boolean).join(" · ");
  const subject = `45 seconds: how was ${chapter}?`;

  const text =
    `${hi}\n\n` +
    `${chapter}${where ? ` (${where})` : ""} is marked complete, and we'd like to know how it went ` +
    `for you. Six questions, about 45 seconds — it closes on ${closes}.\n\n` +
    `${d.feedbackUrl}\n\n` +
    `Your trainer sees the combined results with no names attached. Your teachers and ` +
    `the academic team use it to change the pace, the notes and the practice.\n\n` +
    `Already answered? Thank you — please ignore this.\n`;

  const content =
    `<h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;color:#0f172a;">How was ${escapeHtml(chapter)}?</h1>` +
    (where
      ? `<p style="margin:0 0 18px;font-size:14px;color:#64748b;line-height:1.5;">${escapeHtml(where)}</p>`
      : "") +
    `<p style="margin:0 0 18px;">${escapeHtml(hi)}</p>` +
    `<p style="margin:0 0 18px;">This chapter is marked complete. Six questions on how it went for you — about <strong>45 seconds</strong>, and it closes on <strong>${escapeHtml(closes)}</strong>.</p>` +
    emailButton(d.feedbackUrl, "Give feedback") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border-collapse:collapse;"><tr>` +
    `<td style="background:#f4f7ff;border-left:4px solid #2563eb;border-radius:8px;padding:13px 16px;color:#1e3a8a;font-size:14px;line-height:1.55;">` +
    `Your trainer sees the combined results with <strong>no names attached</strong>. The academic team uses it to change the pace, the notes and the practice — and publishes what changed back to your batch.` +
    `</td></tr></table>` +
    `<p style="margin:18px 0 0;font-size:13px;color:#64748b;">Already answered? Thank you — please ignore this. We only send one reminder per chapter.</p>`;

  const html = emailShell({
    preheader: `Six questions on ${chapter}. Closes ${closes}.`,
    contentHtml: content,
    footerHtml:
      `You're receiving this because you're enrolled in this batch at CareerLaunchpad.` +
      ` This is the only reminder we send for this chapter. Please do not reply to this address.`,
  });

  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[feedback-reminder] would email ${d.to}: ${subject}`);
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await mailer.sendMail({ from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, to: d.to, subject, text, html });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[feedback-reminder] failed to email ${d.to}:`, err);
    return { sent: false, error };
  }
}

export type OverdueActionsEmail = {
  to: string;
  name?: string | null;
  items: {
    title: string;
    dueOn: string | null;
    priority: string;
    status: string;
    batchName: string | null;
  }[];
  actionsUrl: string;
};

/**
 * Weekly nudge about the feedback action items you own that are past their due date
 * (issue #84 §V11, migration 172). One per person per week — the digest log's primary
 * key is what guarantees that, not this function.
 *
 * It lists the items rather than just counting them, because "you have 4 overdue
 * items" makes you open a tab to find out which; the list lets someone close one from
 * their phone on the way in. Titles are staff-authored free text that may name a
 * student, which is fine — this only ever goes to the item's own owner.
 */
export async function sendOverdueActionsEmail(
  d: OverdueActionsEmail,
): Promise<{ sent: boolean; error?: string }> {
  const hi = d.name ? `Hi ${d.name},` : "Hi,";
  const n = d.items.length;
  const subject = `${n} overdue feedback action${n === 1 ? "" : "s"}`;

  const line = (i: OverdueActionsEmail["items"][number]) =>
    [i.title, i.batchName, i.dueOn ? `due ${i.dueOn}` : null].filter(Boolean).join(" · ");

  const text =
    `${hi}\n\n` +
    `You have ${n} feedback action${n === 1 ? "" : "s"} past its due date:\n\n` +
    d.items.map((i) => `  · ${line(i)}`).join("\n") +
    `\n\nClose one by recording what actually changed — that note is what gets published ` +
    `back to the students who asked for it.\n\n${d.actionsUrl}\n`;

  const rows = d.items
    .map(
      (i) =>
        `<tr><td style="padding:9px 0;border-bottom:1px solid #eef2f7;font-size:14px;line-height:1.5;">` +
        `<strong style="color:#0f172a;">${escapeHtml(i.title)}</strong>` +
        `<span style="display:block;color:#64748b;font-size:13px;">` +
        [i.batchName, i.dueOn ? `due ${i.dueOn}` : null, i.priority !== "normal" ? i.priority : null]
          .filter(Boolean)
          .map((s) => escapeHtml(String(s)))
          .join(" &middot; ") +
        `</span></td></tr>`,
    )
    .join("");

  const content =
    `<h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;color:#0f172a;">${n} overdue action${n === 1 ? "" : "s"}</h1>` +
    `<p style="margin:0 0 18px;font-size:14px;color:#64748b;line-height:1.5;">From student feedback on your batches</p>` +
    `<p style="margin:0 0 14px;">${escapeHtml(hi)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">${rows}</table>` +
    emailButton(d.actionsUrl, "Open feedback triage") +
    `<p style="margin:18px 0 0;font-size:13px;color:#64748b;">Closing an item with a resolution note is what lets us publish "here's what changed" back to the batch — students who never see a change stop answering.</p>`;

  const html = emailShell({
    preheader: `${n} feedback action${n === 1 ? "" : "s"} past due.`,
    contentHtml: content,
    footerHtml:
      `You're receiving this because you own these action items on CareerLaunchpad.` +
      ` One digest per week, and only when something is overdue.`,
  });

  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[overdue-actions] would email ${d.to}: ${subject}`);
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await mailer.sendMail({ from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, to: d.to, subject, text, html });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[overdue-actions] failed to email ${d.to}:`, err);
    return { sent: false, error };
  }
}
