# Student Registration Audit — design & behaviour

Issue: [#83](https://github.com/parameshjava/careerlaunchpad/issues/83)
Migration: `supabase/migrations/160_student_registration_audit.sql`

## What the story asked for

> When a student registered their profile, capture: registration start time,
> registration end time, the student's system IP address, last updated date time,
> last updated by, created by (self vs admin registered), and the number of times
> the revision happened (increment a version on every submit).

## What it maps to

| Ask | Where it lives |
|---|---|
| Registration start time | `student_profile.registration_started_at` |
| Registration end time | `student_profile.registration_completed_at` |
| Student's IP address | `student_profile.last_ip` + `student_registration_event.ip` |
| Last updated date time | `student_profile.updated_at` (now trigger-stamped) |
| Last updated by | `student_profile.updated_by` |
| Created by (self vs admin) | `student_profile.created_by` + `created_via` |
| Number of revisions | `student_profile.revision` + one event row per submit |

## The three timestamps

"End time" is ambiguous the moment a student can be sent back for corrections
(#82) and re-submit, so the clocks are split:

- **`registration_started_at`** — the first ever write to the profile. Immutable,
  and only ever stamped for a registration still **in flight**: if
  `registration_completed_at` is already set (a student who registered before
  auditing existed), their next save must leave the start NULL rather than stamp
  `now()`, which would place the start *after* the recorded completion — a
  registration that finished before it began. The panel additionally suppresses any
  start that postdates the completion, so an incoherent timeline can't render even
  if some future writer produces one.
- **`registration_completed_at`** — the **first** successful submit. This is the
  story's "end time". Stamped once, so `completed − started` is a stable
  time-to-register that later edits don't inflate.
- **`registration_reopened_at`** — a soft-deleted student re-registering (#79)
  begins a new attempt. `started_at` keeps the original, so this is the
  "current attempt began" clock, and the UI measures duration from it.

`registration_submitted_at` (migration 010) is untouched and keeps its existing
meaning — the **latest** submit. Nothing that already reads it changes.

## Why it's trigger-driven, not route-driven

`student_profile` is written by four provisioning functions
(`register_as_student`, `_provision_from_invites`, the intake claim, staff
creation) and two API surfaces (the student's own form and the staff mirror).
Audit stamped at each call site would drift the first time a seventh writer
appears. So:

- **`student_profile_audit_stamp()`** (BEFORE INSERT/UPDATE) sets
  `registration_started_at`, `created_by`, `created_via`, `updated_by`,
  `updated_at` on **every** write, whoever writes it.
- **`record_registration_activity()`** handles the two things a trigger cannot
  see: the client IP (an HTTP header, so only a route handler knows it) and the
  submit that bumps `revision`.

The same trigger also **pins** the audit columns for untrusted writers. Without
that, a student could PATCH a forged `created_via` or `last_ip` straight through
PostgREST — and a forgeable audit trail is worse than none. Trusted writes open
the gate with the `app.audit_write` GUC, the same pattern migration 020 uses for
`status`.

## The actor is derived, never declared

`enterImpersonation` mints the **target's** real Supabase session, so during a
"View as" session `auth.uid()` *is* the student. A naive
`updated_by := auth.uid()` would therefore credit the student for an admin's
edit — the audit lying in exactly the case it exists for.

`acting_user()` resolves the real actor from `impersonation_log` (migration 101):
if the latest row for `auth.uid()` as a target is an un-exited `enter` inside the
session's lifetime, the actor is that admin. Events recorded this way also carry
`on_behalf = true`, and the UI badges them **Viewed as**.

The `cl-impersonating` marker cookie is deliberately **not** consulted. `httpOnly`
stops browser JavaScript from reading a cookie, not a crafted request from
sending one — trusting it would re-open the forgery hole. The database is the
authority.

**8-hour window.** A dangling `enter` (admin closed the tab without pressing
Exit) would otherwise attribute the student's own later edits to that admin, so
`impersonating_admin()` only honours an `enter` newer than 8 hours. That mirrors
`SESSION_MAX_AGE` in `app/impersonation/actions.ts` — **keep the two in sync.**

## Re-registration (#79)

`register_as_student()` un-deletes the `app_user` and then inserts the profile
with `ON CONFLICT DO NOTHING`, so for a returning student **nothing fires on
`student_profile`** and the new attempt would be invisible. The audit therefore
watches `app_user.status` instead: `app_user_reactivation_audit()` fires when
status leaves `'deleted'`, stamps `registration_reopened_at`, and appends a
`reregistered` event. This also catches an admin restoring the account by any
other route.

## `created_via` — how the source is inferred

`infer_registration_source()` prefers evidence over guesswork, most specific
first:

1. a `student_intake` row for the email → **`import`**. Both the Excel import and
   the console's single "Add student" go through `import_student_intake()`, so this
   one branch covers every staff-staged student.
2. an `invite` row → **`invite`** (staff invited them individually)
3. an acting user who isn't the student → **`admin`** (created in the console)
4. otherwise → **`self`** (open self-signup)

Step 4 is an inference from exhausted alternatives, not a guess: with no intake row
and no invite, the only remaining way an `app_user` + `student_profile` can exist is
`register_as_student()`. `unknown` is reserved for the genuinely unresolvable case —
no email to match evidence against.

A provisioning function may pass `created_via` explicitly and that wins.

**Precedence note:** an imported student who later fills the form themselves reads
as `import`, because the *record* originated with the college — which is the
distinction #83 asks for. `registration_status` still says whether they
personally completed the form.

## The timeline

`student_registration_event` is append-only: `created`, `submitted`,
`reregistered`. Each row carries the real actor, `actor_kind`, `on_behalf`, the
IP, the user agent, and (for submits) the revision number. A partial unique index
on `(student_user_id, revision)` means a double-submit can't inflate the count.

Two deliberate omissions:

- **Autosaves are not logged.** The wizard PATCHes several times per step; rows
  for those would bury the timeline for no audit value. An in-progress student's
  IP still lands on `student_profile.last_ip`, so an abandoned registration
  remains attributable.
- **No field-level diffs.** Recording which columns changed per revision needs a
  full profile snapshot per revision, duplicating the student's PII for a question
  #83 doesn't ask. To add it later: put `changed_fields text[]` on the event table
  and populate it from the RPC.

## API surface

`record_registration_activity(p_student, p_kind, p_ip, p_user_agent) → int`
(the resulting revision). `p_kind` is `'save'` or `'submit'`. Authorized for the
student themselves or a caller with `student.profile.manage` (global or scoped to
that student's college). `p_ip` is **text**, cast defensively — a malformed
`x-forwarded-for` must never fail a student's submit.

Called from all four registration routes via
`recordRegistrationActivity()` in `lib/request-audit.ts`:

| Route | Kind |
|---|---|
| `PATCH /api/registration/profile` | `save` |
| `POST /api/registration/profile/submit` | `submit` |
| `PATCH /api/students/[id]/profile` | `save` |
| `POST /api/students/[id]/profile/submit` | `submit` |

The helper never throws: an audit failure logs and is swallowed, because it must
not fail a registration.

### IP trust boundary

`clientIp()` reads the leftmost `x-forwarded-for` entry, falling back to
`x-real-ip`. **XFF is a request header, so a client can send anything.** It is
trustworthy here only because Vercel's edge overwrites it with the real peer
address before the function runs. Behind any other proxy — or none — the value is
attacker-controlled. Fine as an audit hint; never gate access on it.

## UI

- **`/dashboard/students/[id]`** → `RegistrationAuditPanel`: created by, started,
  completed (+ time taken), re-registered (when applicable), revisions, last
  updated + by whom, last IP, then the event history. Server-rendered — nothing
  is interactive and the data is PII we don't ship to a client bundle. Facts stack
  on phones and go two-column from `sm`.
- **Students grid** → a `Source` column (Self / Staff / Import / Invite),
  orthogonal to `Status` (which is lifecycle). Visible by default on **Pending
  approval**, where "self or staff?" is the reviewer's question; hidden by default
  elsewhere to keep the grid narrow on phones, and re-showable from the Columns
  menu.

Anything unknown prints **"Not recorded"** rather than a zero or a guess.

## Privacy & retention

An IP address is personal data under India's DPDP Act (and GDPR art. 4), so:

- The timeline is **staff-only** via RLS — `student.review` or
  `student.profile.manage`, global or college-scoped, mirroring
  `student_review_note` (migration 149). There are no insert/update/delete
  policies, so it is append-only from outside; only the SECURITY DEFINER
  functions write it.
- Students are **not** shown their own audit trail: there is nothing for them to
  act on, and surfacing "we logged your IP" invites support load for no benefit.
- **Retention is not yet implemented.** The intended follow-up is a pg_cron job
  (see `docs/DB_BACKUP_AND_CRON.md`) that nulls `student_registration_event.ip`
  and `student_profile.last_ip` older than ~12 months while keeping the
  timestamps, actors and counts. Until that ships, IPs are kept indefinitely.
- The registration form's privacy copy should state that the IP and timestamps
  are recorded for audit. **Not yet written** — pending copy review.

## Elapsed time is not effort

The panel shows elapsed wall-clock from the first save to the first submit. A
student can open Step 1, abandon it for a fortnight, then finish in ten minutes —
so the label reads **"12 d 11 hr elapsed"**, never "took 12 d 11 hr". Phrasing it
as effort turns a funnel signal into a false claim about the student.

`registration_submitted_at` (latest submit) and `updated_at` (any later change,
including staff edits) deliberately do **not** feed the duration; only
`registration_completed_at` does, which is why a 2027 edit to a 2026 registration
cannot inflate it. The panel states this in a caption, because the three clocks
are easy to conflate and conflating them produces wrong conclusions about a
student.

## Backfill & its limits

Section 4 of the migration runs **before** the triggers exist — deliberately,
since the pins would otherwise silently revert it. Section 8 then repairs values
written by an earlier version of this same file; both statements match nothing on
a fresh database, and the audit trigger is disabled around them so a data repair
doesn't stamp itself onto every student's `updated_at`.

Recovered honestly: `registration_completed_at` from the existing
`registration_submitted_at`, `created_via` from intake/invite evidence (with
"neither" resolving to `self` — see above), `created_by` from
`student_intake.created_by` / `invite.invited_by`, and `revision = 1` for anyone
already submitted.

**Not recoverable:** the start time, the IP, and the actor of historical submits.
Those stay NULL with `actor_kind = 'unknown'`, and the panel says "Not recorded" /
"Actor not recorded (predates auditing)".

**There is deliberately no start-time proxy.** An earlier draft filled
`registration_started_at` from `app_user.created_at`; the panel then subtracted it
from the submit time and reported a 12-day duration for a registration nobody had
measured. Account creation is when the student first signed in, not when they
opened the form. Pre-audit rows therefore show no start and no duration — only
registrations begun after the migration get either.

## Extending to mentors

`mentor_profile` has the same `registration_status` / `last_completed_step` shape
(migration 017) and no audit at all. The engine transfers directly: add the same
columns, point a second trigger at the table, and generalize
`record_registration_activity` on the table name. Out of scope for #83.
