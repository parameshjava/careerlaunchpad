# Email Notifications — Spec

Every transactional email the platform sends, who receives it, and what triggers
it. Delivery is generic SMTP (Zoho Mail, `noreply@careerlaunchpad.ai`) through
`lib/mailer.ts`.

> This file is cited by `supabase/migrations/019_notification_email.sql` and by
> `lib/mailer.ts`. It did not exist until issue #77; §1–§4 document what was
> already shipped, §5 is the new results notification.

## Delivery mechanics

`lib/mailer.ts` owns transport. Three things are true of every sender in it:

- **SMTP is optional.** Without `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` the
  mailer logs `[tag] would email …` and returns. Dev and CI follow the whole flow
  with no mail infrastructure.
- **A notification never breaks its trigger.** `deliver()` swallows errors: an
  invite, an approval or a submission must not fail because mail failed. The two
  senders that *do* report their outcome (`sendClassInviteEmail`,
  `sendExamResultEmail`) do so because their caller records delivery state and
  offers a retry — see §5.
- **One responsive shell.** `emailShell()` is a single fluid column (600px max,
  100% on phones), table-based with every style inlined — the combination that
  renders in Gmail, Apple Mail and Outlook's Word engine alike. Buttons come from
  `emailButton()`. **No media queries** anywhere: Outlook.com strips them.

Env: `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS` (defaults to `SMTP_USER`; Zoho rewrites
addresses the account may not send as), `NEXT_PUBLIC_SITE_URL` for links.

Owners can validate the integration end-to-end at `/dashboard/email-test`.

## §1 Account & invite notifications

| Email | Trigger | To |
| --- | --- | --- |
| `sendInviteEmail` | A platform user is invited | The invitee |
| `sendStudentImportedEmail` | A college bulk-imports students | Each student |

Accounts are provisioned by email-match on first social sign-in (migration 005),
so an "invite" is really a notification to sign in with *that* address.

## §2 Registration submitted → awaiting approval

| Email | Trigger | To |
| --- | --- | --- |
| `sendStudentSubmittedEmail` | Student submits registration | The student |
| `sendMentorSubmittedEmail` | Mentor submits registration | The mentor |
| `sendRegistrationPendingEmail` | Either of the above | Owners / platform admins / college admins, **Bcc** |

Recipients resolve through `notification_recipients()` (§4). Bcc'd so recipients
don't see each other.

## §3 Review outcome

| Email | Trigger | To |
| --- | --- | --- |
| `sendStudentApprovedEmail` | Student profile approved | The student |
| `sendMentorApprovedEmail` | Mentor profile approved | The mentor |
| `sendStudentRemarksEmail` | Reviewer leaves remarks (issue #82) | The student |

The approval email includes a "complete your profile" nudge only below 100%
completeness. Remarks are reviewer-authored Markdown, rendered by
`lib/markdown-email.ts`. See `docs/REGISTRATION_REVIEW_COMMUNICATION_SPEC.md`.

## §4 Where internal notifications go

`notification_email` (migration 019) holds a `personal` address (the login email,
seeded on provisioning) and an optional `office` @careerlaunchpad.ai address per
internal user, each with an `active` flag. Owner-managed via the
Notification-emails console.

`notification_recipients()` returns the active addresses of every active owner /
platform admin / college admin, falling back to the account email for a recipient
with no active rows. Mentors are deliberately **not** recipients (their office
address is contact-only). **Students never appear here** — they are notification
*subjects*, not recipients.

## §5 Results published → students (issue #77)

**Trigger.** `exam_session.results_published` flipping to true, via
`POST /api/exam/sessions/[id]/publish-results`. Two UI entry points reach that
route (the exam-papers browser and the session console); unpublishing sends
nothing. Chapter quizzes grade instantly and have no publish step, so they are not
involved.

**Recipients.** Rostered students with a finalized attempt (`submitted`,
`graded`, `aborted`) carrying a non-null score, and an email on their account.

- **Absentees are excluded on purpose.** `get_exam_result` raises
  `No attempt found` for a student with no attempt row, so the email's only call
  to action would land them on an error screen.
- A student with no address is recorded `skipped`, not silently dropped, so the
  console can show it. The row heals to `pending` once an address exists.

**Content** (`sendExamResultEmail`). Mirrors the printed Statement of Marks field
for field: marks obtained, percentage, correct count, grade, PASS/FAIL against the
pass mark, the section-wise table when the paper has more than one subject, and a
link to `/student/exams/<id>/result` for the full answer key.

- Grading goes through **`lib/exam-grading.ts`**, which the result page also
  imports. An email that grades differently from the page it links to is the worst
  failure this notification can have, so there is one definition of the pass mark
  and the grade bands.
- Rank, cohort size and the college average are included — the printed results
  sheet already ranks students, using the same standard competition ranking
  (1, 2, 2, 4) so the two cannot disagree.
- **Interrupted attempts** (`abort_count > 0`) instead get a note naming how many
  questions were graded, and have rank *and* the "start here" nudge suppressed:
  their lowest section records where the clock stopped, not where the student is
  weak.
- Marks are deliberately **not** in the subject line — it shows on lock screens
  and over shoulders. The subject names the exam; the preheader says what is
  inside.

**Queue and idempotency.** `exam_result_notification` (migration 157) holds one
row per (sitting, student) — queue and audit trail in one. `enqueue_exam_result_
notifications()` never revisits a row it has already sent, so unpublish →
publish cannot double-send. Delivery runs in `after()` so the publish response is
not held for N SMTP round-trips.

**Volume.** Delivery is a single mailbox with per-hour and per-day caps, so a
drain stops at a per-run cap (`lib/exam-result-notify.ts`), leaves the rest
`pending`, and continues on the next run. The session console shows
`sent / total` with `queued`, `failed` and `no address` counts, and a **Resend**
button (`POST /api/exam/sessions/[id]/notify-results`) that re-enqueues and drains.

**Deep links must survive login.** The result link is useless if a logged-out
student loses it at sign-in. The middleware records `?next=<path>`, the login page
forwards it through the OAuth round trip, and the callback honours it for a
provisioned account. Values are validated by `lib/next-path.ts` — an unchecked
`next` on a login flow is an open redirect.

---

## §6 Chapter feedback (issue #84) — the first *scheduled* senders

§1–§5 all fire as a side effect of somebody clicking something. These two have no
human trigger at all, which is the point: the gaps they close are that nobody was
telling students a feedback window had opened, and nothing was chasing an action
item past its due date.

**Scheduler.** Vercel Cron → `GET /api/cron/feedback-reminders`, daily at 04:30 UTC
(10:00 IST), configured in `vercel.json`. Both jobs run in that one invocation
(`lib/feedback-notify.ts`), sequentially, because they drain the same single mailbox.

- **`CRON_SECRET` is mandatory.** Vercel sends it as `Authorization: Bearer …`; with
  the variable unset the route answers **503 and sends nothing**. An unauthenticated
  endpoint that emails students is worse than a job that is not switched on yet, and
  the 503 says which state you are in.
- **Not pg_cron.** The SMTP transport lives in Node, so reaching it from Postgres
  would mean `pg_net` plus a URL and a shared secret inside a migration. The
  feedback jobs that need no mail — window expiry (164), action proposals (166), the
  24-month prune (171) — *do* run in pg_cron, where they belong.

### §6.1 "How was this chapter?" → students

**Trigger.** A feedback window that has been open **3 days** and is still open
(`enqueue_feedback_reminders(3)`, migration 168).

**Recipients.** Enrolled (`pending`/`active`), active-account students who have **not
responded**, have an email, and are **18 or over** (O-11 — under-18 students are never
asked; see CHAPTER_FEEDBACK_ANALYSIS §8).

**Exactly one, ever.** `feedback_reminder_notification`'s primary key is
`(request_id, student_id)`, so "once" is a database fact, not a timestamp comparison.
A second nudge would need a new table — deliberately, because prompt fatigue is what
kills response rates (§F4), and this feature already generates one prompt per chapter
per student.

**Content** (`sendFeedbackReminderEmail`). The chapter, the ~45-second promise, the
closing date, a button straight to `/student/feedback/<requestId>`, and the visibility
promise repeated **verbatim from the form** — the trainer sees combined results with no
names. An email vaguer than the form it links to is where trust in an anonymous
channel goes. It also tells an already-answered student to ignore it, because enqueue
happens before the drain and a few will have answered in between.

**Never sent after the window shuts.** `pending_feedback_reminders` filters on
`closes_at > now()`: a link to a closed form reads as being asked for something that
was then taken away.

### §6.2 Overdue action items → their owner

**Trigger.** Any `feedback_action_item` that is `open`/`in_progress` with `due_on` in
the past (`pending_overdue_action_digests()`, migration 172).

**Recipients.** The item's **owner only**. Unowned items — including auto-proposals
nobody has taken on (166) — are mailed to nobody; they are counted by "Nobody on it"
on `/dashboard/feedback` (O-13).

**Once a week.** `feedback_digest_log` is keyed `(user_id, week_start)` where
`week_start` is the UTC Monday. The daily cron therefore sends at most one digest per
owner per week, and a failed Monday is covered by Tuesday instead of losing a week.
Only successes are logged.

**Content** (`sendOverdueActionsEmail`). The items themselves, not a count — "you have
4 overdue items" makes you open a tab to find out which. Titles are staff-authored and
may name a student, which is acceptable here precisely because this only ever goes to
the item's own owner.
