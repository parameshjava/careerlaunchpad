# Student Class Calendar — API Design (for review)

**Status:** DRAFT — design-first spec per CLAUDE.md. The DB migration
(`supabase/migrations/134_batch_session.sql`) is written; the route handlers and
UI are built against this contract. GitHub issue #64.

## Goal

Staff assign **subjects** to a batch and **mentor(s) to each subject**, then
schedule classes **per batch per subject**. Every approved student enrolled in
the batch sees those classes on a personal Outlook/Google-style calendar (week
view, 30-minute slots) and joins the online (Zoom) class. When a class is
scheduled, the subject's mentor(s) are added as Zoom alternative hosts **and**
emailed an `.ics` calendar invite. A new student starts with an **empty**
calendar; it fills in as classes are scheduled.

## Design constraints (from CLAUDE.md)

- **API-first.** The calendar/scheduling UI reads/writes only through these
  endpoints and round-trips (a session created by staff re-fetches and edits
  through the same routes). No component talks to Supabase directly for this data.
- **Schema is the source of truth.** Every field below maps to a column in
  migration 134; changing a field changes the migration in the same PR.
- **RLS does the scoping.** A student's calendar = `batch_session` rows for
  batches where they have an enrolment; a mentor's = sessions for subjects they're
  assigned — enforced by RLS policies, not app-side filtering.

---

## 1. Data model (migration 134)

- **`batch_subject`** `(batch_id, subject_id)` — the subjects a batch teaches
  (seeded from the course's competitive-exam syllabus, then editable). Mirrors
  `batch_college`.
- **`batch_subject_mentor`** `(batch_id, subject_id, mentor_id)` — one or more
  mentors per subject; a mentor may teach many subjects/batches. FK to
  `batch_subject` and `mentor_profile`.
- **`batch_session_series`** — weekly recurrence template for one `(batch,
  subject)`; carries the shared Zoom meeting.
- **`batch_session`** — concrete occurrences, each tied to `(batch_id,
  subject_id)` via a composite FK. One-off = `series_id NULL`; recurring =
  materialised by `expand_batch_session_series()`. Key columns: `starts_at`,
  `ends_at` (`timestamptz`), `status` (`scheduled|live|completed|cancelled`),
  `delivery_mode`, `zoom_meeting_id`, `join_url` (student), `start_url` (host —
  **never** returned to students), `meeting_status`, `overridden`.
- **`batch_session_invite`** `(session_id, mentor_id)` — invite log: `ics_uid`
  (stable, so edits send calendar UPDATEs), `status`, `zoom_alt_host`,
  `email_sent_at`, `last_error`.

Status is advanced `scheduled → live → completed` every minute by the
`transition_batch_sessions()` cron; series horizons extended nightly by
`expand_all_batch_session_series()`.

---

## 2. Batch subjects & mentors (staff)

Under `/api/admin/batches/[id]/…`, gated on `finance.manage`.

### `GET /api/admin/batches/[id]/subjects`
Returns the batch's subjects with their assigned mentors, plus the
**candidate** subjects derivable from the course syllabus (for the "add subject"
picker) and eligible mentors.
```json
{
  "subjects": [
    { "subjectId": "s1", "name": "Quantitative Aptitude", "sortOrder": 0,
      "mentors": [ { "mentorId": "m1", "fullName": "Ravi K", "email": "ravi@…" } ] }
  ],
  "syllabusSubjects": [ { "subjectId": "s2", "name": "Verbal Ability" } ],
  "eligibleMentors": [ { "mentorId": "m3", "fullName": "Sita R", "email": "sita@…" } ]
}
```

### `PUT /api/admin/batches/[id]/subjects`
Replace the batch's subject set + per-subject mentor assignments transactionally.
```json
{ "subjects": [ { "subjectId": "s1", "mentorIds": ["m1","m3"] },
                { "subjectId": "s2", "mentorIds": ["m3"] } ] }
```
Rejects removing a subject that still has future (`scheduled`/`live`) sessions
(must cancel those first). `mentorId` must be an `approved` `mentor_profile`.

---

## 3. Student endpoint (self-view)

### `GET /api/calendar/sessions?from=<ISO>&to=<ISO>`

The caller's class sessions in `[from, to)`. RLS-scoped, so a student sees only
their enrolled batches' sessions. `start_url` is projected out.

| param  | type              | notes                                                    |
|--------|-------------------|----------------------------------------------------------|
| `from` | ISO 8601 datetime | inclusive start (required)                               |
| `to`   | ISO 8601 datetime | exclusive end (required); `to > from`; span capped 62 days |

**200**
```json
{
  "sessions": [
    {
      "id": "b3f…",
      "batchId": "9a1…",  "batchName": "ICET Foundation 2026-27",
      "subjectId": "s1",  "subjectName": "Quantitative Aptitude",
      "examCode": "ICET",
      "title": "Ratios & Averages",
      "mentors": [ { "fullName": "Ravi K" } ],
      "startsAt": "2026-07-20T10:00:00+05:30",
      "endsAt":   "2026-07-20T11:30:00+05:30",
      "deliveryMode": "online",
      "status": "scheduled",
      "joinUrl": "https://zoom.us/j/98765?pwd=…",
      "meetingStatus": "created"
    }
  ]
}
```
`joinUrl` is `null` until Zoom provisioning succeeds (or `not_required` for
offline). Cancelled sessions excluded by RLS. Colour-code by `subjectId` /
`examCode`.

**Errors:** `400` bad/oversized window · `401` not signed in.

---

## 4. Schedule classes (staff)

Under `/api/admin/batches/[id]/…`, gated on `finance.manage`. Every create/edit
targets one `subjectId` that must already exist in `batch_subject`.

### `GET /api/admin/batches/[id]/sessions?from=&to=&subjectId=`
Staff view (includes `startUrl`, `seriesId`, `overridden`, invite states).

### `POST /api/admin/batches/[id]/sessions`
Create a **one-off** class or a **recurring series** for a subject.

One-off:
```json
{
  "subjectId": "s1",
  "title": "Mock Test Review",
  "startsAt": "2026-07-24T15:00:00+05:30",
  "endsAt":   "2026-07-24T16:30:00+05:30",
  "deliveryMode": "online",
  "createZoomMeeting": true,
  "meetingUrl": null
}
```
Recurring (adds `recurrence`, omits `startsAt`/`endsAt`):
```json
{
  "subjectId": "s1",
  "title": "Quantitative Aptitude",
  "deliveryMode": "online",
  "createZoomMeeting": true,
  "recurrence": {
    "byWeekday": [1,3], "timeOfDay": "10:00", "durationMin": 90,
    "timezone": "Asia/Kolkata", "startsOn": "2026-07-20", "until": "2026-09-30"
  }
}
```

**Server flow**
1. Validate (§6); `subjectId` must be in `batch_subject`.
2. If `createZoomMeeting` and mode ≠ `offline`: Zoom **Create Meeting** (a
   recurring meeting for a series), capture `zoom_meeting_id`/`join_url`/
   `start_url`, and add each subject mentor (from `batch_subject_mentor`) as an
   **alternative host**. On failure → `meeting_status='failed'`, non-blocking
   warning.
3. Insert `batch_session` (one-off) or `batch_session_series` + call
   `expand_batch_session_series()` (recurring).
4. For each subject mentor, upsert a `batch_session_invite` (stable `ics_uid`)
   and **email an `.ics` invite** (see §5). Delivery is best-effort; failures are
   logged in `batch_session_invite.last_error`, not fatal.
5. Return created ids + any warnings.

**201:** `{ "ok": true, "seriesId": "…"|null, "sessionIds": ["…"], "invitedMentorIds": ["m1"], "meetingWarning": null }`

### `PATCH /api/admin/batches/[id]/sessions/[sessionId]`
Edit one occurrence (`overridden=true`); Zoom **Update Meeting** on
timing/mode change; re-send `.ics` **UPDATE** (same `ics_uid`) to mentors.

### `PATCH /api/admin/batches/[id]/series/[seriesId]`
Edit whole series; `applyTo:"future"` re-expands non-overridden future
occurrences.

### `DELETE /api/admin/batches/[id]/sessions/[sessionId]`
Soft-cancel (`status='cancelled'`) + Zoom **Delete Meeting** + `.ics` **CANCEL**
to mentors. `?scope=series` cancels all future occurrences.

---

## 5. Mentor invites (`.ics` + Zoom alternative host)

- Mentors resolved from `batch_subject_mentor` for the session's `(batch,
  subject)`; email from `app_user`.
- **Zoom:** added as `alternative_hosts` on Create/Update (so they can start the
  class); recorded as `zoom_alt_host=true`.
- **`.ics`:** an RFC 5545 `VEVENT` (`METHOD:REQUEST`, `ORGANIZER` = platform,
  `ATTENDEE` = mentor, `LOCATION`/`URL` = `join_url`) sent via the existing email
  pipeline (migration 019 / `email-test`). The **stable `ics_uid`** means edits
  send `METHOD:REQUEST` with a bumped `SEQUENCE` (calendar UPDATE) and
  cancellation sends `METHOD:CANCEL` — no duplicate events in the mentor's
  calendar.

---

## 6. Validation (shared parser, `lib/session-write.ts`)

- `subjectId` required and present in `batch_subject` for this batch.
- `title` required, ≤ 160 chars. `deliveryMode` ∈ `online|offline|hybrid`.
- One-off: `startsAt`/`endsAt` valid ISO, `endsAt > startsAt`, duration ≤ 600 min.
- Recurrence: `byWeekday` non-empty subset of `0..6` (0 = Sun); `timeOfDay`
  `HH:MM`; `durationMin` 1..600; `until ≥ startsOn` when present.
- When the batch has `start_date`/`end_date`, warn (don't block) if outside.
- `meetingUrl` manual override must be `https://`; an `online` class must end up
  with a Zoom or manual join URL else `meeting_status='failed'` (schedulable, flagged).

---

## 7. Files

| File | Role |
|------|------|
| `supabase/migrations/134_batch_session.sql` | schema, RLS, expand + transition fns, cron — **done** |
| `supabase/migrations/135_batch_subject_functions.sql` | syllabus/eligible-mentor reads + transactional `replace_batch_subjects` RPC — **done** |
| `lib/batch-subject-query.ts` · `lib/batch-subject-write.ts` | subjects/mentors read + payload parser — **done** |
| `app/api/admin/batches/[id]/subjects/route.ts` | subject set + mentor assignment `GET`/`PUT` — **done** |
| `app/dashboard/batches/[id]/subjects/page.tsx` · `components/batches/batch-subjects-editor.tsx` | "Subjects & mentors" screen — **done** |
| `supabase/migrations/136_batch_session_functions.sql` | `batch_subject_mentor_contacts` RPC (mentor emails) — **done** |
| `app/api/calendar/sessions/route.ts` | student self-view `GET` — **done** |
| `app/api/admin/batches/[id]/sessions/route.ts` | staff `GET` + `POST` — **done** |
| `app/api/admin/batches/[id]/sessions/[sessionId]/route.ts` | staff `PATCH` + `DELETE` (+ `?scope=series`) — **done** |
| `app/api/admin/batches/[id]/series/[seriesId]/route.ts` | series `GET` (prefill) + `PATCH` (re-expands future, non-overridden occurrences; updates Zoom + re-invites) — **done** |
| `lib/session-write.ts` | shared payload parser/validator + types — **done** |
| `lib/session-schedule.ts` | create/update/cancel orchestration (Zoom + DB + invites) — **done** |
| `lib/calendar-query.ts` | session fetch + subject/mentor join for both surfaces — **done** |
| `lib/zoom/index.ts` | server-only Zoom S2S client (create/update/delete, alt-hosts) — **done** |
| `lib/ics.ts` | build `VEVENT` (REQUEST/CANCEL) for mentor invites — **done** |
| `lib/mailer.ts#sendClassInviteEmail` | SMTP delivery of the `.ics` invite — **done** |
| `app/dashboard/batches/[id]/schedule/*` · `components/batches/batch-schedule.tsx` | staff scheduling UI — **done** |
| `app/student/calendar/page.tsx` · `components/students/my-calendar.tsx` · `components/students/student-calendar.css` | student calendar — custom Day/Week/Month/Agenda grid built to the approved mock (no external calendar lib) — **done** |

**Env required before Zoom works** (Vercel preview + prod, never `NEXT_PUBLIC_`):
`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`. Without them, classes
still schedule (with `meeting_status='failed'` or a manual link) — Zoom is
non-blocking. Mentor `.ics` emails use the existing SMTP config.
