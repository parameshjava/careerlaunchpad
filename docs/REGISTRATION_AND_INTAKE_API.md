# Registration & Admin Excel Intake — API Design (for review)

**Status:** DRAFT — design-first spec, *not yet implemented*. Review and approve before build.

This spec covers three connected pieces, designed API-first per CLAUDE.md:

1. **Student Registration API** — the 6-step registration form, saved **incrementally** so a student can stop and resume, and **edit later**.
2. **Admin Excel Intake API** — an admin downloads a template, picks a college, fills/updates it offline, and uploads it. Imported rows are **compatible with the registration model** and become the student's editable profile.
3. **Reference-data API** — option sets (dropdowns/chips) served from the `ref_*` tables so forms never hard-code them.

The guiding constraints, from your input:

- **Incremental / partial.** Every write accepts a *subset* of fields, merges it, and tracks progress so the user resumes where they left off.
- **One data model.** Excel columns ↔ registration fields ↔ `student_profile` columns are the same set. A row imported by an admin and a profile filled by a student are the same shape, so the student can edit imported data later.
- **Invite-only auth is preserved.** A `student_profile` still only exists for a provisioned `app_user`. Imported students (no account yet) live in a **staging table** keyed by email and are merged into the real profile when they accept an invite and sign in.

---

## 1. The reconciliation lifecycle (why a staging table)

`student_profile.user_id` is a PK FK to `app_user(id)` — a profile requires an authenticated user. Bulk-imported students have **no account yet**, so they cannot have a `student_profile` row. They live in a new **`student_intake`** table keyed by `email`.

```
Admin fills Excel ──upload──▶ student_intake (keyed by email, partial OK)
                                   │
                          (admin issues invite for that email)
                                   │
                 student accepts invite + signs in via OAuth
                                   │
                 handle_new_user trigger (migration 005, extended):
                   creates app_user + user_role + student_profile,
                   then MERGES the matching student_intake row into
                   the new student_profile, marks intake 'claimed'
                                   │
                 student opens /student registration form,
                 resumes from last_completed_step, edits & submits
```

So imported data and student-entered data converge into the **same** `student_profile`, and "edit later" is just the normal registration form running against an already-populated profile.

---

## 2. Data model changes

### 2a. `student_profile` — registration columns + progress (migration 010, extend)

Migration `010_registration_reference.sql` already adds the registration fields (gender, location, year_of_study, `career_goal_ids[]`, `primary_career_goal_id`, `skill_assessment` jsonb, `interests[]`, mentor pref, `biggest_challenge`, readiness score). **Add progress-tracking columns** so partial saves can resume:

```sql
alter table public.student_profile
  add column if not exists registration_status text not null default 'in_progress'
    check (registration_status in ('in_progress','submitted')),
  add column if not exists last_completed_step  int  not null default 0,  -- 0..6
  add column if not exists registration_submitted_at timestamptz;
```

`last_completed_step` is the highest step the student has saved; the form opens at `last_completed_step + 1`. `registration_status` flips to `submitted` only when the final submit passes validation. Imported profiles start with whatever steps the Excel populated (see merge, §2c).

**Audit columns (migration 160, issue #83).** `registration_started_at`, `registration_completed_at`, `registration_reopened_at`, `created_by`, `created_via`, `updated_by`, `last_ip`, `revision` — plus the `student_registration_event` timeline. They are **stamped by triggers, not by routes**, and pinned against untrusted writes, so nothing in this document needs to set them; the two API-visible additions are that all four registration routes call `record_registration_activity()` (for the IP and the revision bump) and that `updated_at`/`updated_by` are now maintained for you. Note `registration_submitted_at` above still means the *latest* submit, while `registration_completed_at` is the *first* one. Full design: `docs/STUDENT_REGISTRATION_AUDIT.md`.

### 2b. `student_intake` — staging for imported students (new migration 011)

One row per imported student, keyed by `email`. **Every field is nullable** — partial rows are allowed (only `email` is required as the reconciliation key). Columns mirror the registration model exactly:

```sql
create table if not exists public.student_intake (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,                       -- reconciliation key
  college_id    uuid references public.college(id),  -- admin-chosen college
  -- mirror of the registration fields (all nullable; partial allowed)
  full_name     text,
  phone         text,
  gender        text,
  pincode       text,                                -- #101; CHECK 6 digits, no leading zero
  flat_building text,                                -- #101: typed by the student, never auto-filled
  address       text,                                -- #101: the geocoder's formatted_address, verbatim
  city_village  text,
  district      text,
  state         text,
  degree        text,
  branch        text,
  year_of_study text,
  graduation_year int,
  cgpa          numeric(4,2),
  career_goal_ids        uuid[] not null default '{}',
  primary_career_goal_id uuid references public.ref_career_goal(id),
  skill_assessment jsonb not null default '{}',
  skills        text[] not null default '{}',
  interests     text[] not null default '{}',
  preferred_mentor_pref_id uuid references public.ref_mentor_preference(id),
  biggest_challenge text,
  -- import bookkeeping
  source         text not null default 'excel_import',
  import_batch_id uuid,                               -- groups one upload
  status         text not null default 'pending'
                 check (status in ('pending','invited','claimed')),
  invite_id      uuid references public.invite(id),
  created_by     uuid references public.app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint student_intake_email_uniq unique (lower(email))
);
create index if not exists student_intake_college_idx on public.student_intake (college_id);
create index if not exists student_intake_status_idx  on public.student_intake (status);
```

Re-uploading the same email **upserts** (merges non-null cells) — this is how an admin "updates the Excel file" iteratively.

### 2c. `handle_new_user` extension (migration 005 / 011)

After the trigger creates the stub `student_profile`, add: if a `student_intake` row exists for the new user's email, copy its non-null fields into `student_profile`, set `college_id` from the intake (overriding the invite's college if present), set `last_completed_step` based on which groups are populated, and mark `student_intake.status = 'claimed'`.

### 2d. RLS & permissions

- `student_intake`: enable RLS. **Insert/select/update** allowed to `has_permission('student.intake.import')` (Owner via `*`, plus Platform Admin and Support) **or** a College Admin scoped to that `college_id` (`has_college_permission('student.intake.import', college_id)`). Students never touch this table.
- New permission **`student.intake.import`** seeded and granted to: **`owner`** (via `*`), **`platform_admin`** (the "CareerLaunchpad Admin" role — see below), **`support`**, and **`college_admin`** (scoped, so college staff import their own students). Added in migration 011.
- New role **`platform_admin`** ("CareerLaunchpad Admin") — a console role (routes to `/dashboard`) for platform staff. Broad management bundle (user.invite/manage/view/suspend, invite.resend, college.manage, analytics.platform.view, student.profile.search/view, student.intake.import) but **not** the owner-only `*` wildcard or `role.manage`. Because it holds the relevant permission keys, the existing RLS policies grant it access automatically — no policy changes needed.

---

## 3. Reference-data API

### `GET /api/registration/reference`
Auth: signed-in (RLS already makes `ref_*` public-read). Returns every option set the form needs, so dropdowns/chips are data-driven:

```jsonc
{
  "gender":        [{ "slug": "male", "label": "Male" }, ...],
  "degree":        [...], "branch": [...], "year_of_study": [...],
  "career_goal":   [{ "slug": "fullstack_developer", "label": "Full Stack Developer",
                      "category": "IT Sector", "id": "<uuid>" }, ...],  // grouped by category in UI
  "skill_assessment_category": [{ "slug": "communication", "label": "Communication Skills" }, ...],
  "skill":         [...], "interest": [...], "mentor_preference": [...]
}
```

Career goals include `id` because `career_goal_ids` / `primary_career_goal_id` are FKs (uuid); other multi-selects (`skills`, `interests`) are slug `text[]`.

### Degree → Branch (issue #99, migration 161)

`degree` and `branch` used to be two **unrelated** flat lists, so `degree='mba' + branch='civil'` passed both the form and the API, and the 10 branches were engineering-only — every B.Sc/B.Com/B.A student was pushed into "Other". They are now a relation. Both `GET /api/registration/reference` and `GET /api/mentor/reference` return the enriched rows plus the mapping:

```jsonc
{
  "degree": [
    { "slug": "btech", "label": "B.Tech", "category": "UG",
      "branch_mode": "required", "level": "ug", "duration_years": 4,
      "search_terms": ["btech", "b tech", "engineering"], "sort_order": 1 },
    { "slug": "mba", "label": "MBA", "category": "PG",
      "branch_mode": "none", "level": "pg", "duration_years": 2, "sort_order": 10 }
  ],
  "branch": [
    { "slug": "cse", "label": "Computer Science & Engineering (CSE)",
      "category": "Engineering", "family": "computing",
      "search_terms": ["cse", "csc", "computers", "comp sci"], "sort_order": 1 }
  ],
  "degree_branch": [
    { "degree_slug": "btech", "branch_slug": "cse", "sort_order": 1, "group_label": "Engineering" }
  ]
}
```

- **`branch_mode`** — `required` / `optional` / `none`. `none` (MBA, MCA, M.Com, B.Pharm, Pharm.D, B.Arch, Other) means the Branch field is **not rendered** and `branch` is stored as `null`, never `"other"`.
- **`group_label` lives on the mapping, not on `ref_branch.category`** — a shared branch belongs to different groups under different degrees (`data_science` is "Engineering" under B.Tech, "Single major" under B.Sc). The UI groups by `group_label ?? branch.category`.
- **`search_terms`** — aliases matched alongside the label, so `csc`, `computers`, `mpc`, `bcom computers` all find the right option.
- **`duration_years`** caps the Year of Study list (a 3-year B.Sc has no 4th year; `year_5`/`year_6` exist for B.Arch/Pharm.D).
- **`family`** is the coarse bucket (12 values) that mentor matching (`same_branch`) and branch-keyed analytics group by, so ~143 branches don't break either.

Every rule is implemented once, in **`lib/degree-branch.ts`** (dependency-free), and shared by the student form, the mentor form, both PATCH validators, the Excel intake and the admin catalogue.

---

## 4. Student Registration API

All endpoints: auth = signed-in **student** with `student.profile.manage_own`; the profile is always the caller's own (`user_id = auth.uid()`), enforced by RLS.

### `GET /api/registration/profile`
Returns the caller's profile plus progress, for **resume**:

```jsonc
{
  "registration_status": "in_progress",
  "last_completed_step": 2,                 // form opens at step 3
  "profile": {
    "full_name": "Ravi Kumar", "phone": "+91...", "gender": "male",
    "flat_building": "Flat 302, Sai Residency",
    "address": "Chenchupet, Tenali, Andhra Pradesh 522202, India",
    "pincode": "522201", "city_village": "Tenali", "district": "Guntur", "state": "Andhra Pradesh",
    "latitude": 12.969350, "longitude": 77.735550,
    "address_source": "gps", "address_captured_at": "2026-08-05T09:12:44Z",
    "college_id": "<uuid>", "college": { "id": "...", "name": "...", "place": "..." },
    "degree": "btech", "branch": "cse", "year_of_study": "year_3",
    "graduation_year": 2026, "cgpa": 8.2,
    "career_goal_ids": ["<uuid>", "<uuid>"], "primary_career_goal_id": "<uuid>",
    "skill_assessment": { "communication": 4, "aptitude": 3, ... },
    "skills": ["java","python"], "interests": ["coding"],
    "preferred_mentor_pref_id": "<uuid>", "biggest_challenge": "..."
  }
}
```

### `PATCH /api/registration/profile` — incremental save (the core endpoint)
Accepts a **partial** payload + the step being saved. Only provided fields are written (merge semantics); `last_completed_step` advances monotonically. Idempotent and re-runnable.

Request:
```jsonc
{
  "step": 3,
  "data": {
    "career_goal_ids": ["<uuid-a>", "<uuid-b>"],
    "primary_career_goal_id": "<uuid-a>"   // must be one of career_goal_ids
  }
}
```
Response: `{ "ok": true, "last_completed_step": 3, "profile": { ... } }`

Per-step field map (request `data` keys by step):

| Step | Fields |
|------|--------|
| 1 Basic Info | `full_name`*, `phone`*, `date_of_birth`*, `email`*(read-only from auth), `gender`, `flat_building`, `address`, `pincode`, `city_village`, `district`, `state`, `latitude`, `longitude`, `address_source` |
| 2 Academics | `college_id`*, `degree`, `degree_other`, `branch`, `branch_other`, `year_of_study`, `graduation_year`, `cgpa` |
| 3 Career Goals | `career_goal_ids`* (≥1), `primary_career_goal_id`* (∈ career_goal_ids) |
| 4 Self-Assessment | `skill_assessment` (slug→1..5 for each `ref_skill_assessment_category`) |
| 5 Skills & Interests | `skills[]`, `interests[]` |
| 6 Tell Us | `is_first_generation` (bool), `languages[]` (ref_language), `caste_certificate_status` (ref_caste_certificate_status), `reservation_category` (ref_reservation_category, only when cert = `has`), `income_band` (ref_income_band), `family_members` (jsonb `[{relation, occupation}]` — ref_family_relation / ref_family_occupation), `hobbies[]` (ref_hobby), `custom_hobbies[]` (free text), `biggest_challenge` (Markdown) |

> Step 6 was reworked from "Mentor" → "Tell Us" (migration `121_tell_us_step.sql`). `preferred_mentor_pref_id` is retired from the wizard (moved to `LEGACY_FIELDS`) but the column + `ref_mentor_preference` stay for the Excel-intake pipeline. All Step-6 fields are optional.

> **`date_of_birth` moved from Step 6 to Step 1 and became required** (2026-08-06, issue #84 O-11). It is the only field whose absence changes what a student is *eligible for* rather than how complete their profile looks: chapter feedback is not collected from under-18s, and a student whose age is unknown is skipped by the age gate (migration 173). Measured before the change, 43% of profiles had a DOB and the bulk-intake path had supplied none — so the gate was open for the majority. It uses the same `DobPicker` calendar (min age `MIN_AGE_YEARS = 17`), now rendered by `registration-fields.tsx` rather than `tell-us-step.tsx`. Existing DOB-less students are asked for it through the review-note channel — see `POST /api/admin/students/request-dob`.

Validation is **per-step and lenient**: only validates the fields present; FK slugs/ids checked against `ref_*`; `primary_career_goal_id ∈ career_goal_ids`; ratings 1–5; cgpa range. Missing fields are *not* errors on PATCH (that's what makes it resumable).

**Degree ⇄ Branch is the one genuinely cross-field rule** (#99), so `validatePartial()` also takes the stored `{degree, branch}` — a PATCH of just `{degree:'mba'}` has to clear a branch it can't see, and a lone `{branch}` is checked against the degree saved earlier. In order:

| Condition | Result |
|---|---|
| degree has `branch_mode = 'none'` and a branch is set | `branch := null`, **silently** — a stale draft value must not block a save, and the student never saw the field |
| `branch` set, no degree anywhere | `422` — *"Choose your degree before selecting a branch."* |
| pair not in `ref_degree_branch`, branch came from **storage** while this request changed the degree | `branch := null`, silently (that's "I switched B.Tech → B.Com") |
| pair not in `ref_degree_branch` and the branch was **sent** | `422` — *"That branch isn't offered for the selected degree."* |
| `degree`/`branch` moved off `other` | the matching `*_other` write-in is dropped |

`degree_other` / `branch_other` are free text (≤120 chars), kept only while their field is on `other`, and are excluded from `profileCompleteness` (like `apaar_id`) since most students never see them. The mapping is read **without** the `is_active` filter on purpose: deactivating a branch hides it from new pickers but must never start rejecting the save of a student who already holds it.

### `POST /api/registration/profile/submit` — finalize
Runs **full** validation across all required fields (name, phone, date of birth, college). On success sets `registration_status = 'submitted'`, `registration_submitted_at = now()`. On failure returns `{ ok:false, missing:[{step,field}] }` so the form can jump the user back.

### College picker — reuse `GET /api/colleges/search?q=` (exists).

---

## 5. Admin Excel Intake API

Auth: `student.intake.import` (Owner, Support, or College Admin scoped to the college). Library: **`exceljs`** (new dependency) — chosen over SheetJS because it generates **in-cell dropdown data-validation** for enumerated columns and reads them back cleanly.

### `GET /api/admin/intake/template?college_id=<uuid>`
Streams an `.xlsx` template:

- **Header row** = human labels matching the registration fields; a second, hidden machine-key row (or a `_meta` sheet) carries the stable column keys + the chosen `college_id` + college name, so re-upload is unambiguous.
- **Pre-filled college**: the picked college's name shows in a locked cell / header; its `id` is embedded in `_meta`.
- **Dropdown validation** on single-select enumerated columns (gender, degree, branch, year_of_study, caste_certificate_status, reservation_category, income_band, first-generation Yes/No, and the 1–5 self-assessment) sourced from the `ref_*` tables, so admins pick valid values offline. Multi-select columns can't use an in-cell dropdown, so their valid labels are listed in a header note and typed comma-separated: **Career Paths** (`preferred_category_slugs`, `ref_preference_category`, ≤ 2 — extra values are dropped with a per-row warning so the downstream `student_profile` CHECK can't reject the claimed profile), **Skills** (`ref_skill`), **Interests** (`ref_interest`), **Languages** (`ref_language`), **Hobbies** (`ref_hobby`). `date_of_birth` is a free-text `YYYY-MM-DD` column.
- The template mirrors the **current** wizard: Step 3 is the preference-category "Career Paths" picker (issue #42) and Step 6 carries the "Tell Us" background fields (issue #44). The legacy **Career Goals / Primary Career Goal / Preferred Mentor Type** columns were removed from the template (the DB columns + `ref_career_goal`/`ref_mentor_preference` remain for analytics; the wizard and template simply stopped collecting them). `family_members` (nested) and `custom_hobbies` (write-ins) are intentionally **not** in the template — students add those later in their own form.
- One row per student; `email` is the only required column. Everything else is optional → partial rows are fine. **`date_of_birth` stays optional here** even though the student-facing form requires it: colleges routinely don't hold it, and rejecting a 300-row upload over one column would push them back to sending spreadsheets by email. The student is asked for it in their own form instead, where it blocks submission.
- **Degree → Branch (#99) can't be a dependent dropdown.** Per-degree named ranges + `INDIRECT` validation are brittle across Excel / LibreOffice / Google Sheets, so instead: the Branch column keeps a **flat** dropdown of every branch, the template ships a **visible `Degree → Branch` sheet** listing every legal pair (with an explicit *"— no branch — leave the Branch cell empty"* row for MBA/MCA/M.Com/B.Pharm/Pharm.D/B.Arch), and the pair is enforced **server-side per row** on import through the same `lib/degree-branch.ts` rules the forms use. A mismatch fails **that row** with *"Branch: 'Civil' is not offered for Degree 'B.Com' — see the 'Degree → Branch' sheet"*; the rest of the file still imports. Year of Study is checked against the degree's `duration_years` the same way. The single-student endpoint (`POST /api/admin/intake/student`) applies the identical gate, so no intake path can stage a bad pair.

### `POST /api/admin/intake/import`  (multipart: `file` + `college_id`)
1. Parse the workbook; read `_meta` for `college_id` (body value must match, else 400).
2. For each row: map labels→keys, resolve `ref_*` labels→ids/slugs, validate types.
3. **Upsert into `student_intake` by `lower(email)`**, merging non-null cells (re-import updates), stamping `import_batch_id`, `created_by`, `college_id`.
4. Partial/invalid cells: skip just that cell or flag just that row; never fail the whole upload for one bad row.
5. **Auto-invite (decision #3):** for every successfully staged row, issue an **individual** invite (role=`student`, scope=`college_id`) unless one already exists, link `invite_id`, flip intake `status` → `invited`, and send the invite email via the existing mailer. The student accepts → `handle_new_user` merges their intake into a real profile (§2c).
6. Response = per-row report, including invite outcome:

```jsonc
{
  "batch_id": "<uuid>", "total": 120,
  "created": 90, "updated": 25, "skipped": 5, "invited": 112, "invite_skipped": 3,
  "rows": [{ "row": 7, "email": "x@y.com", "result": "created", "invite": "sent" },
           { "row": 8, "email": "", "result": "error", "errors": ["email required"] },
           { "row": 9, "email": "z@y.com", "result": "updated", "invite": "already_pending" }, ...]
}
```

### `GET /api/admin/intake?college_id=&status=`
Lists staged rows for a review table in the console (scoped by the caller's permissions).

---

## 6. UI surfaces (built against the APIs above)

Per CLAUDE.md, these use **shadcn/Tailwind** on the app surface (the `mockups/student-registration-form.html` is the **visual reference only** — the bespoke landing CSS does not apply here).

- **Student registration** at `/student/register` (or `/student/profile`): on load calls `GET /api/registration/reference` + `GET /api/registration/profile`, jumps to `last_completed_step + 1`, saves each step via `PATCH`, finalizes via `submit`. Replaces the `/app/student/page.tsx` placeholder. Same 6 steps and the multi-goal+primary picker we built.
- **Admin import** at `/dashboard/students/import`: college picker (reuse `/api/colleges/search`) → "Download template" (`GET …/template`) → upload filled file (`POST …/import`) → render the per-row report (each row shows staged + invite outcome, since invites are auto-issued).
- **Console students table**: can later read real `student_profile` rows (+ intake for not-yet-claimed) instead of the sample data in `lib/students-data.ts`.

---

## 7. Build plan (after approval)

1. **Migration 010 (extend):** add `registration_status`, `last_completed_step`, `registration_submitted_at` to `student_profile`.
2. **Migration 011 (new):** `student_intake` table + RLS + `student.intake.import` permission seed (owner/support/college_admin) + extend `handle_new_user` to merge intake.
3. **Reference API:** `GET /api/registration/reference`.
4. **Registration APIs:** `GET` / `PATCH` profile + `POST submit`; Zod (or hand) validation per step.
5. **Registration UI:** port the mockup to a shadcn multi-step form at `/student/register`, wired to the APIs, mobile-first verified at ~320–390px.
6. **Excel APIs:** add `exceljs`; `template` + `import` (import auto-issues individual invites) + `list`.
7. **Admin import UI:** `/dashboard/students/import` with the report view.
8. **Lint + build**, render-verify both forms on mobile and desktop.

---

## 8. Resolved decisions

1. **Career aspirations in Excel** — originally one comma-separated `career_goals` cell + a `primary_career_goal` cell. Superseded: Step 3 became preference categories (issue #42), so the template now has a single comma-separated **Career Paths** cell (`preferred_category_slugs`, ≤ 2, validated against `ref_preference_category`). The template's Step-6 "Tell Us" columns were added in migration `133_intake_tell_us.sql`. [superseded 2026-07]
2. **Who can import** — **Owner**, **CareerLaunchpad Admin** (`platform_admin`, a new distinct role), **Support**, and **College Admin** (scoped to their own college). [confirmed]
3. **Auto-invite on import** — import **auto-issues an individual invite per imported email** and sends it (folded into `POST …/import`, §5 step 5). [confirmed]
4. **Excel breadth** — the template carries the **full** field set, including self-assessment, skills, interests, and mentor columns (all optional; map 1:1 to the model). [confirmed]
