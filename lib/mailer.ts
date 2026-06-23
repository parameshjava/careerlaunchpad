/**
 * Invite notifications.
 *
 * Accounts are provisioned by email-match on first social sign-in (see
 * supabase/migrations/005_handle_new_user.sql), so an "invite" is really a
 * notification telling the person to sign in with THIS email. Real delivery
 * (Supabase SMTP / Resend / an Edge Function) is a follow-up — for now we log,
 * so the rest of the flow is testable without email infra.
 */
type InviteEmail = {
  to: string;
  roleName: string;
  invitedBy?: string | null;
  loginUrl: string;
};

export async function sendInviteEmail({ to, roleName, invitedBy, loginUrl }: InviteEmail): Promise<void> {
  // TODO: wire a real provider. Until then, log so dev/test can follow the flow.
  console.info(
    `[invite] would email ${to}: you've been added as "${roleName}"` +
      (invitedBy ? ` by ${invitedBy}` : "") +
      `. Sign in with this email at ${loginUrl}`,
  );
}
