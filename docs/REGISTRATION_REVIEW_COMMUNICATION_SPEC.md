# Registration Review Communication — Design (for review)

**Status:** IMPLEMENTED (migration 149 + UI/API). This doc is the design of record.
**Issue:** [#82 — Establish communication for registration actions](https://github.com/parameshjava/careerlaunchpad/issues/82)

Lets a reviewer **comment on a student's profile and send it back for corrections**, and
lets the student **receive those remarks by email** and fix their form. Also supports
sending a remark/notification to **any** profile — including already-approved students —
so an admin can nudge an existing student without revoking their access.

Designed API-first per CLAUDE.md: the DB schema, RPC, and email template are defined
before the UI, and the admin panel + student form are built against that contract.

---

## 1. What already exists (leverage — do not rebuild)

| Capability | Where |
|---|---|
| SMTP mailer (Zoho, nodemailer), fire-and-forget, never throws | `lib/mailer.ts` |
| Transactional templates (submit / approved / pending / invite / class-invite) | `lib/mailer.ts` |
| Admin review UI on a profile (Approve / Suspend bar) | `app/dashboard/students/[id]/page.tsx` (`ApprovalBar`, ~L138) |
| Review RPC + permission (`set_student_status`, `student.review`) | `supabase/migrations/020_student_approval.sql` |
| Admin-recipient resolver (`notification_recipients()`) | `supabase/migrations/019_notification_email.sql` |
| Student can always re-edit after submit (no server lock) | `registration-form.tsx:293`, `app/api/registration/profile/route.ts` |

The two state columns on `student_profile` (easy to conflate):

- **`registration_status`** — form completion: `in_progress` → `submitted` (`migration 010`).
- **`status`** — review gate: `pending_review` → `approved` / `suspended` (`migration 020`).

## 2. Gaps this spec closes

1. **No "sent back" state** — neither column models "returned to the student for correction".
2. **No remarks storage** — no feedback column/thread on `student_profile`
   (`rejection_reason` exists only on *enrollments*, unrelated).
3. **No admin UI/action to send back** — `ApprovalBar` has only Approve/Suspend;
   `set_student_status` takes no remarks argument.
4. **No re-review trigger** — a student editing after submit does not flip status or
   re-notify admins (submit route only pings admins when `status = 'pending_review'`).
5. **No student-facing surface for remarks** — `/student/pending` and the summary show
   generic "waiting" copy; nowhere to display the reviewer's message.

## 3. Core design principle — remarks are decoupled from approval

Nudging an **approved** student to fix a typo must **not** revoke their access. So remarks
live in their own thread table, and the *optional* "send back" status transition applies
**only pre-approval**:

```
submitted + pending_review ──Admin "Request changes"──▶ changes_requested   (+ note, + email)
                                                              │  student edits & re-submits
                                                              ▼
                                                        pending_review        (admins re-notified; note resolved)

approved ──────Admin "Send remark"─────▶ still approved                       (+ note, + email)   ← existing-profile case
```

- **Confirmed:** remarks stored as a **thread** (history of every note), not a single
  overwriting column.
- **Confirmed:** sending a remark to an **approved** student **keeps them approved**
  (the note is a nudge + email, never a demotion).

---

## 4. Data model (migration 149)

### 4a. Review-note thread

```sql
create table public.student_review_note (
  id              uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_user(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id),
  body            text not null check (length(trim(body)) > 0),
  kind            text not null default 'changes_requested'
                    check (kind in ('changes_requested', 'note')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz            -- set when the student next re-submits
);

create index student_review_note_student_idx
  on public.student_review_note (student_user_id, created_at desc);
```

- `kind = 'changes_requested'` — a pre-approval send-back (paired with the status flip).
- `kind = 'note'` — a plain remark/notification (no status change; used for approved
  students and for informational notes).
- `resolved_at` — stamped by the submit route when the student re-submits, so the admin
  can see which remarks have been acted on.

**RLS**

```sql
alter table public.student_review_note enable row level security;

-- Reviewers (student.review global, or college-scoped on the student's college) read/write.
create policy student_review_note_reviewer_all on public.student_review_note
  for all to authenticated
  using (public.has_permission('student.review')
      or public.has_college_permission('student.review',
           (select college_id from public.student_profile where user_id = student_user_id)))
  with check ( ... same ... );

-- The student may READ their own notes (to display them); never write.
create policy student_review_note_self_read on public.student_review_note
  for select to authenticated
  using (student_user_id = auth.uid());
```

### 4b. Add the `changes_requested` review state

`student_profile.status` gains a fourth value. This touches three places that hard-code
the value list — **all must change together** or the guard/RPC will reject it:

1. The check constraint (drop + recreate on `student_profile.status`).
2. `student_profile_status_guard()` (migration 020) — allow the new value.
3. `set_student_status()` whitelist + `setStudentStatus` action whitelist
   (`app/dashboard/students/actions.ts:24`) + any TS union in `lib/student-approval.ts`.

```sql
alter table public.student_profile drop constraint student_profile_status_check;
alter table public.student_profile add constraint student_profile_status_check
  check (status in ('pending_review', 'changes_requested', 'approved', 'suspended'));
```

---

## 5. RPC — `add_student_review_note`

`SECURITY DEFINER`, so it can insert the note + stamp reviewer bookkeeping under the
caller's `student.review` authorization.

```
add_student_review_note(p_student uuid, p_body text, p_request_changes boolean) → uuid (note id)
```

Logic:
1. Assert caller holds `student.review` (global or college-scoped on the target's college);
   else `raise exception 'Forbidden'`.
2. Insert a `student_review_note` row: `author_user_id = auth.uid()`,
   `kind = case when p_request_changes then 'changes_requested' else 'note' end`.
3. **Only if** `p_request_changes` **and** the student's current `status = 'pending_review'`:
   `update student_profile set status = 'changes_requested', reviewed_by = auth.uid(),
   reviewed_at = now()`. (Approved/suspended students are never demoted here.)
4. Return the note id.

`grant execute on function public.add_student_review_note(uuid, text, boolean) to authenticated;`

---

## 6. Server action + email

### 6a. Action — `sendStudentRemark` (in `app/dashboard/students/actions.ts`)

```
sendStudentRemark(formData) :
  user_id, body, request_changes  ← formData
  requirePermission("student.review")
  rpc add_student_review_note({ p_student, p_body, p_request_changes })
  fetch student email + full_name
  await sendStudentRemarksEmail({ to, name, remarks: body, request_changes, profileUrl })
  revalidatePath("/dashboard"); revalidatePath(`/dashboard/students/${user_id}`)
```

Mail is best-effort (never throws), matching every other caller.

### 6b. Email template — `sendStudentRemarksEmail` (in `lib/mailer.ts`)

New export mirroring `sendStudentApprovedEmail`, built on a **responsive email shell**
(`emailShell()` / `emailButton()`): a single fluid column (`max-width:600px`, 100% on
phones), table-based, all CSS inlined, `viewport` + `x-apple-disable-message-reformatting`
meta, `bgcolor` fallbacks beside gradients (Outlook), ≥16px text and a bulletproof CTA
button — so it renders correctly on a phone. Subject e.g. *"Action needed on your
CareerLaunchpad registration"*; body greets the student, shows the reviewer's remarks
(**rendered from Markdown**, see §12) in an amber callout, and links to
`${SITE_URL}/student/register`. When `request_changes` is true it adds a "please update and
re-submit" line; otherwise it reads as an informational note. A plain-text alternative
(the raw Markdown) always accompanies the HTML.

---

## 7. Re-review trigger — submit route change

`app/api/registration/profile/submit/route.ts`:

- Widen the admin-notify branch from `status === 'pending_review'` to
  `status in ('pending_review', 'changes_requested')`.
- If the student was `changes_requested`, flip them back to `pending_review` on submit
  (re-enters the review queue).
- Stamp `resolved_at = now()` on that student's unresolved `changes_requested` notes, so
  the admin sees the loop closed.

No editability change is needed — the profile PATCH endpoint already has no
`registration_status` lock, so a sent-back student can edit immediately.

---

## 8. Admin UI — profile page (`app/dashboard/students/[id]/page.tsx`)

Add a **Remarks** panel below the existing `ApprovalBar`, shown for **every** profile
(pending, approved, or suspended) so it also serves the existing-profile case:

- A **thread** of prior `student_review_note` rows (newest first): author, timestamp,
  body, and a "resolved" chip when `resolved_at` is set.
- A composer: the shared **`<MarkdownEditor>`** (Write/Preview + toolbar) for the remark +
  a "Send to student" submit button.
- A **"Request corrections (send back)"** checkbox — shown/meaningful only when the
  student is still `pending_review` (for approved students the remark is a plain note).
- Mobile-first: panel stacks; textarea full-width; verify at ~320–390px per CLAUDE.md.

Optional grid touch: a **"Changes requested"** `StatusBadge` (amber/rose tone) and/or
inclusion in the dashboard tabs so sent-back students are visible at a glance.

## 9. Student UI — surface the remarks

On `/student/register` (the read-only summary) and `/student/pending`, render an **alert
card** listing the student's **unresolved** `student_review_note` bodies with an
"Update my profile" CTA that opens the wizard. This is the in-app mirror of the email so a
student who clicks through from the email lands on their remarks in context.

---

## 10. Build checklist

- [x] Migration 149: `student_review_note` table + RLS; add `changes_requested` to the
      `student_profile.status` constraint; RPCs `add_student_review_note` +
      `mark_registration_resubmitted` (`supabase/migrations/149_student_review_notes.sql`).
- [x] `sendStudentRemarksEmail` in `lib/mailer.ts` on a responsive email shell; remark body
      rendered from Markdown via `lib/markdown-email.ts` (micromark + GFM, HTML-safe).
- [x] `sendStudentRemark` server action (`app/dashboard/students/actions.ts`).
- [x] Submit route: notify on `changes_requested`, flip back to `pending_review`, resolve notes
      (`app/api/registration/profile/submit/route.ts` + `mark_registration_resubmitted`).
- [x] Admin Remarks panel + thread, **Markdown composer** (`components/students/remarks-panel.tsx`),
      shown for every profile on the detail page.
- [x] Student alert card (`components/students/student-remarks-alert.tsx`) on `/student/register`
      + `/student/pending` (with a `changes_requested` variant on pending).
- [x] `changes_requested` badge in the grid + broadened "Pending approval" tab; TS type in
      `lib/students-query.ts`.
- [ ] **Manual verification pending:** email at the owner test screen once SMTP is set; UI at
      mobile + desktop widths.

## 12. Markdown remarks (build note)

Remarks are authored with the shared **`<MarkdownEditor>`** (Write/Preview + toolbar) and stored
as Markdown. They render three ways from the one source:
- **In-app** (admin thread + student alert) via `<RichContent math={false}>` — the same engine.
- **Email** via `lib/markdown-email.ts` (`micromark` + `micromark-extension-gfm`), which emits an
  HTML **string** (no `react-dom/server`, so it stays importable from the client-reachable
  server-action graph without tripping Next's build check) and is safe by default (raw HTML
  escaped, dangerous URL protocols dropped).

## 11. Open decisions (resolved)

- **Remarks storage:** thread table (history), not a single overwriting column. ✅
- **Remark to an approved student:** keep them approved; note + email only, no demotion. ✅
- **Deliverable:** this spec + a summary comment on issue #82. ✅
