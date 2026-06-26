# Email Notifications & Sender Specification

Status: **draft for review** · Owner: Paramesh · Date: 2026-06-26

This spec covers (a) moving outbound email onto our own domain via **Zoho Mail SMTP**
(`noreply@careerlaunchpad.ai`), and (b) the four lifecycle notifications below. It
follows the repo's **API-design-first** rule: every flow defines its trigger, recipient
resolution, DB reads/writes, and the mailer function before any UI is built.

## 1. Goals (the four flows)

| # | Event | Recipient | Purpose |
|---|-------|-----------|---------|
| 1 | Admin bulk-imports student profiles | each **student** | "Sign in to the portal" — **already built** (`sendStudentImportedEmail`); only the sender changes (§3). |
| 2 | A **student** submits registration | all **owners + admins** | "A student is awaiting approval." Student now waits on an **approval gate** (§5). On approval → student gets an email. |
| 3 | A **mentor** submits registration | all **owners + admins** | "A mentor is awaiting approval." (Mentor approval gate already exists.) On approval → mentor gets the existing approved email. |
| 4 | Owner/admin **invites a mentor** | the **mentor** | "Sign in to CareerLaunchPad." Requires adding `mentor` to the invitable roles. |

Decisions locked with the requester (2026-06-26):
- **Student approval gate is real** — students stay *pending* after submit and cannot
  fully use the portal until an owner/admin approves them (mirrors mentors today).
- **Recipients = all owners + all admins, globally** (no per-college scoping for v1).
- **Recipient addresses** are auto-resolved from owner/admin accounts, **plus** each
  person may have extra addresses (one office `@careerlaunchpad.ai`, one personal),
  each independently **toggleable** so a personal address can be turned off later (§4).
- **Office `@careerlaunchpad.ai` addresses belong only to owners, platform admins, and
  mentors** — i.e. internal CareerLaunchPad people. **College admins** are external
  college staff and use their **own** email, and **students** likewise only ever have
  their own login/personal email. So only owner / platform_admin / mentor are eligible
  for an office address; everyone else uses their personal address only.
- **Imported students are auto-approved** (the college already vouched for them); only
  **self-registered** students pass through the approval gate (§5).

## 2. Current state (what exists today)

- `lib/mailer.ts` — nodemailer over generic **SMTP** (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
  `SMTP_PASSWORD`, From = `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME`) — done in §3, configured
  for Zoho. Falls back to a console log when unset, **never throws** (mail is a best-effort
  side effect of the flow that calls it). Exposes `sendInviteEmail`, `sendStudentImportedEmail`,
  `sendStudentSubmittedEmail`, `sendMentorApprovedEmail`, `mailerStatus`, `sendTestEmail`.
- Flow 1 is done: `app/api/admin/intake/import/route.ts` → `sendStudentImportedEmail`.
- Student submit (`app/api/registration/profile/submit/route.ts`) emails only the
  **student** a confirmation; nobody is notified to approve, and there is **no approval
  status** on `student_profile` (only `registration_status in ('in_progress','submitted')`).
- Mentor submit (`app/api/mentor/profile/submit/route.ts`) notifies **nobody**.
- Mentors already have the full gate: `mentor_profile.status in
  ('pending_review','approved','suspended')`, guard trigger, `set_mentor_status()` RPC,
  `mentor.review` permission, and `setMentorStatus()` sends `sendMentorApprovedEmail`.
- Invitable roles (`app/dashboard/users/actions.ts`) = student, college_admin, employer,
  support, platform_admin — **no `mentor`**.

## 3. Sender / SMTP migration (Zoho)

Replace Gmail with generic SMTP env so the provider isn't hard-coded. Keep the
console-log fallback and never-throws contract.

### 3.1 Environment variables (replaces `GMAIL_*` in `.env.example`)

```
# --- Email (transactional, via Zoho Mail SMTP) ---
SMTP_HOST=smtppro.zoho.in        # from the Zoho config screen
SMTP_PORT=465                    # 465 = SSL (secure:true); 587 = STARTTLS (secure:false)
SMTP_USER=noreply@careerlaunchpad.ai
SMTP_PASSWORD=                   # Zoho app-specific password (2FA on the mailbox)
MAIL_FROM_ADDRESS=noreply@careerlaunchpad.ai
MAIL_FROM_NAME=CareerLaunchPad
```

Notes / gotchas:
- **`secure` is derived from the port**: `secure = (SMTP_PORT === 465)`. Port 587 uses
  STARTTLS (`secure:false`), matching the current Gmail-on-587 pattern.
- **Zoho only sends as an address the authenticated account owns.** `noreply@careerlaunchpad.ai`
  must be a real mailbox (or a verified alias of `SMTP_USER`) in the Zoho org, and the
  domain must be verified (MX/SPF/DKIM) — otherwise Zoho rejects the message or it lands
  in spam. Add **SPF** (`v=spf1 include:zohomail.in ~all`) and **DKIM** for the domain.
- The Zoho screenshot's IMAP/POP servers are for *receiving* and are out of scope; we
  only need **Outgoing/SMTP** (`smtppro.zoho.in`, 465 SSL / 587 TLS, auth required).
- Keep backward-compat optional: if `SMTP_*` is unset, fall back to console log (CI/dev).

### 3.2 `lib/mailer.ts` changes

- `getTransporter()` reads `SMTP_HOST/PORT/USER/PASSWORD` (drop the hard-coded
  `smtp.gmail.com`). `from` becomes `"${MAIL_FROM_NAME}" <${MAIL_FROM_ADDRESS}>`.
- `mailerStatus()` returns `{ configured, from: MAIL_FROM_ADDRESS }` (the owner email-test
  screen at `app/dashboard/email-test/` keeps working unchanged).
- No behavioral change to existing send functions beyond the transport/from.

## 4. Recipient model — who gets the "approve" emails

"Owners + admins" resolves to users holding role **`owner`**, **`platform_admin`**, or
**`college_admin`** (any scope), that are `status='active'`. Because the student/mentor
*submit* requests run as that low-privilege user (who cannot read other users' emails
under RLS), recipient resolution **must** be a `SECURITY DEFINER` SQL function.

The **office-address** feature (adding an `@careerlaunchpad.ai` address) is only for
**owners, platform admins, and mentors**. College admins still *receive* notifications,
but on their own email — they get no office address. Students are excluded entirely
(no office address, and they receive no approval notifications — they are subjects).

### 4.1 New table: `notification_email`

Each owner / admin / mentor can have multiple notify addresses, each toggleable.

```sql
create table public.notification_email (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_user(id) on delete cascade,
  email      text not null,
  kind       text not null default 'office' check (kind in ('personal','office')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, lower(email))
);
create index notification_email_user_idx on public.notification_email (user_id);
```

- On provisioning (extend `handle_new_user()`), seed one row from `app_user.email`
  with `kind='personal'` **only when the invited role is owner / platform_admin /
  college_admin / mentor** — never for students. (College admins get a personal row so
  they receive notifications, but no office address.) Adding an office
  `@careerlaunchpad.ai` address is offered later via the settings UI (§6.4) **only to
  owners / platform_admins / mentors**. Turning a personal address off = `active=false`
  (the "later turn off personal" requirement) — no row deletion needed.
- RLS (owner-managed model): anyone with **`user.manage`** (owner via `*`) reads/writes
  every row; a user may additionally **read their own** rows (no self-write). Implemented
  in `019_notification_email.sql`.

### 4.2 New RPC: `notification_recipients()` → `text[]`

```
public.notification_recipients(p_audience text default 'owners_admins') returns text[]
  -- SECURITY DEFINER. Returns DISTINCT lower(email) for the audience:
  -- 'owners_admins' = users with role in (owner, platform_admin, college_admin),
  --                   app_user.status='active', via their ACTIVE notification_email rows,
  --                   unioned with app_user.email as a safety net if they have no rows.
  -- grant execute to authenticated (so student/mentor submit can call it).
```

The submit routes call this RPC to get the To list — they never query `app_user` directly.

## 5. Student approval gate (new — mirrors mentors)

**Scope:** the gate applies to **self-registered** students only. Students created via
**bulk import are auto-approved** — `import_student_intake()` sets `status='approved'`
because the college has already vouched for them, so they skip the gate and the
owner/admin notification (Flow 2) does not fire for them.

### 5.1 Schema (migration, e.g. `019_student_approval.sql`)

```sql
alter table public.student_profile
  add column status      text not null default 'pending_review'
                         check (status in ('pending_review','approved','suspended')),
  add column reviewed_by  uuid references public.app_user(id),
  add column reviewed_at  timestamptz;
create index student_profile_status_idx on public.student_profile (status);
```

- **Guard trigger** (copy of mentor's): only a reviewer may change `status`; on INSERT it
  is pinned to `pending_review`; unauthorized status changes are silently reverted.
- **Backfill**: existing students predate the gate → set them to `approved` so nobody is
  locked out by the migration. `import_student_intake()` must also be updated to insert
  imported students with `status='approved'` (auto-approval, per §5 scope).
- **Permission** `student.review` (data, seeded): granted to `platform_admin`; owner has `*`.
  `college_admin` may review students of its scoped college (RLS check, parity with mentors).

### 5.2 RPC `set_student_status(p_user uuid, p_status text)`

`SECURITY DEFINER`, checks `student.review` (global or college-scoped on the student's
`college_id`), sets `status`, `reviewed_by=auth.uid()`, `reviewed_at=now()`. Mirror of
`set_mentor_status`.

### 5.3 Access gating

A student whose `status <> 'approved'` is treated as not-yet-active: routing
(`computeHomePath` / the `/student` guard) sends them to a "pending approval" screen, and
student-only data RLS requires `status='approved'`. Submit (form completion) stays
`registration_status='submitted'`; **approval is the separate `status` axis.**

## 6. API & code changes per flow

### 6.1 Flow 1 — student import (DONE, sender only)
No logic change. Verify the email now sends from `noreply@careerlaunchpad.ai` after §3.

### 6.2 Flow 2 — student submits → notify owners/admins
Applies to **self-registered** students only (imported students are already `approved`
and never reach this gate). `app/api/registration/profile/submit/route.ts`, after
flipping to `submitted`:
1. Keep `sendStudentSubmittedEmail(student)` (confirmation) — reword to "received and
   pending approval."
2. `const recips = await supabase.rpc('notification_recipients')` → `sendRegistrationPendingEmail({ to: recips, kind: 'student', name, reviewUrl: \`${SITE_URL}/dashboard/students\` })`.
- New mailer fn `sendRegistrationPendingEmail` (one mail, multiple To, or loop — best-effort).
- **Approval action** (new): `app/dashboard/students/actions.ts` → `setStudentStatus(userId, status)`
  calling `set_student_status` RPC; on `approved` send a new `sendStudentApprovedEmail`
  (clone of `sendMentorApprovedEmail`, link `/student`). Approve UI added to the students grid.

### 6.3 Flow 3 — mentor submits → notify owners/admins
`app/api/mentor/profile/submit/route.ts`, after flipping to `submitted`: resolve recipients
via the RPC and call `sendRegistrationPendingEmail({ to, kind: 'mentor', name, reviewUrl: \`${SITE_URL}/dashboard/mentors\` })`.
(Approval + approved-email path already exists in `app/dashboard/mentors/actions.ts`.)

### 6.4 Flow 4 — owner/admin invites a mentor → email the mentor — **DONE**
- Added `mentor` to the `INVITABLE` set in `app/dashboard/users/actions.ts` and to the
  invite role `<select>` in `invite-form.tsx`. Mentor invites are unscoped (no
  college/employer required), like support/platform_admin.
- No migration needed: `handle_new_user()` already assigns the unscoped `mentor` role, and
  the `mentor_profile` row is created on first save by the upsert in `app/api/mentor/profile`
  (PATCH), gated by the `mentor.profile.manage_own` RLS the role grants. The mentor lands on
  `/mentor` → registration form.
- The existing `sendInviteEmail` covers the "sign in" email; only the role label ("Mentor")
  differs.

### 6.5 Notification-emails console (§4.1) — **DONE**
Owner-managed central list at **`/dashboard/notifications`** (gated on `user.manage`; nav
item under Administration). Lists every owner / platform_admin / mentor as a card with
their **personal** address (the login email, seeded automatically, with an enable/disable
toggle) and an editable **office** `@careerlaunchpad.ai` address (set/clear + toggle).
Files: `page.tsx`, `actions.ts` (`setOfficeEmail`, `toggleEmailActive`), `office-email-form.tsx`.
College admins are not listed (no office address); they still receive on their personal
email via the recipient fallback. The `notification_recipients()` RPC (built in migration
019) is the foundation Flows 2/3 will call. Backed by
a route handler/server action that round-trips `notification_email` through RLS (per the
forms-through-the-API rule). Fetch the user's rows; create/toggle/delete.

## 7. Mailer functions — final surface (`lib/mailer.ts`)

| Function | To | When | Status |
|----------|----|----|--------|
| `sendStudentImportedEmail` | student | bulk import | exists |
| `sendStudentSubmittedEmail` | student | student submit | exists (reword) |
| `sendStudentApprovedEmail` | student | student approved | **new** (clone of mentor-approved) |
| `sendMentorApprovedEmail` | mentor | mentor approved | exists |
| `sendInviteEmail` | invitee | any invite incl. mentor | exists |
| `sendRegistrationPendingEmail` | owners+admins | student/mentor submit | **new** |
| `mailerStatus`, `sendTestEmail` | — | owner email-test screen | exists |

All keep the never-throw, console-fallback contract. `sendRegistrationPendingEmail` accepts
`to: string[]` and skips silently on an empty list.

## 8. Templates (subject lines; bodies follow the existing plain+HTML pattern)

- Student pending (to admins): `New student registration awaiting approval — {name}` →
  body: who registered, college, link to `/dashboard/students`.
- Mentor pending (to admins): `New mentor registration awaiting approval — {name}` → link
  to `/dashboard/mentors`.
- Student approved (to student): `Your CareerLaunchPad profile is approved` → link `/student`.
- (Reword) Student submitted (to student): `We've received your registration — pending approval`.

## 9. Cross-cutting

- **Best-effort delivery**: notifications never block the submit/approve transaction (current
  pattern preserved). Failures are logged, not surfaced to the registrant.
- **No PII leak**: recipient resolution is server-side via `SECURITY DEFINER`; emails are
  never sent to the browser.
- **Idempotency**: re-submitting a form re-notifies admins. Acceptable for v1; a "notified_at"
  guard on the profile can suppress duplicates later if it becomes noisy.
- **Verification** (no test suite): after wiring, use the owner email-test screen to confirm
  Zoho SMTP, then exercise each flow on a narrow mobile width for any new UI (approve button,
  pending screen, settings) per the mobile-first rule.

## 10. Migration / file checklist

- ✅ `supabase/migrations/019_notification_email.sql` — table + RLS + `handle_new_user()`
  personal-address seed + backfill + `notification_recipients()` RPC. **DONE.**
- ✅ `lib/mailer.ts` + `.env.example` — generic/Zoho SMTP transport (§3). **DONE.**
- ✅ `app/dashboard/users/actions.ts` + `invite-form.tsx` — `mentor` invitable (§6.4). **DONE.**
- ✅ `app/dashboard/notifications/*` + `lib/nav.ts` — owner-managed notification-emails
  console (§6.5). **DONE.**
- ✅ `supabase/migrations/020_student_approval.sql` — student `status` + guard trigger
  (with `app.provisioning` GUC bypass) + `set_student_status()` RPC + `student.review` perm;
  existing rows backfilled `approved` via the add-default trick; invited/imported students
  auto-`approved` in `handle_new_user()`; self-signups start `pending_review`. **DONE.**
- ✅ `lib/mailer.ts` — added `sendStudentApprovedEmail`, `sendRegistrationPendingEmail`
  (Bcc'd to the resolved recipient list). **DONE.**
- ✅ `app/api/registration/profile/submit/route.ts` (notifies only when `pending_review`) +
  `app/api/mentor/profile/submit/route.ts` — notify owners/admins via
  `notification_recipients()`. **DONE.**
- ✅ `app/dashboard/students/actions.ts` + dashboard "Awaiting approval" card —
  `setStudentStatus` approve/suspend, emails the student on approval. **DONE.**
- ✅ Student routing gate — `/student` routes submitted+pending → new `/student/pending`
  screen; `/student/insights` redirects there until `status='approved'`. **DONE.**

Deferred (noted): broader RLS gating of student feature tables (e.g. `job.apply`) on
`status='approved'` — v1 gates at the routing/insights layer only. College-scoped
`student.review` for college_admins (parity with the deferred mentor.review scope).

## 11. Resolved & open

Resolved (2026-06-26):
- **Imported students are auto-approved**; only self-registered students hit the gate (§5).
- **Office `@careerlaunchpad.ai` addresses are for owners, platform admins, and mentors
  only** — college admins (external college staff) and students use their own email (§4).

- **Management model = owner-managed central list** at `/dashboard/notifications` (§6.5).

Open:
1. Should `college_admin` notifications be **scoped to their college** later (v2)? v1 = all.
