# Code Review — Step 6 "Mentor" → "Tell Us" Registration Rework

**Branch:** `feat/tell-us-registration` (`git diff main...HEAD`)
**Review depth:** high-effort, workflow-backed (4 finders → independent verifier per finding)
**Result:** 10 verified findings reported (2 lower-severity cleanups dropped under the 10-item cap; 1 candidate refuted)
**Remediation status (2026-07-21):** all 10 addressed — 9 fixed in code, 1 (#9) resolved as operational. Build green (compile + type-check). Mobile-width visual verification of the Tell Us step still pending.

| # | Finding | Status |
|---|---------|--------|
| 1 | Free text through KaTeX | ✅ Fixed |
| 2 | Step-6 PATCH total data loss | ✅ Fixed |
| 3 | Completeness denominator regression | ✅ Fixed |
| 4 | Custom hobby silent truncation | ✅ Fixed |
| 5 | Only family row unremovable | ✅ Fixed |
| 6 | Excel mentor pref invisible | ✅ Fixed |
| 7 | Future/absurd DOB accepted | ✅ Fixed |
| 8 | Ref cache serves stale set | ✅ Fixed |
| 9 | Migration-121 coupling | ☑️ Operational (no code change) |
| 10 | reservation_category unreachable | ✅ Fixed (with #3) |

Changed files reviewed:
- `app/dashboard/students/[id]/page.tsx`
- `app/student/register/registration-form.tsx`
- `components/students/registration-fields.tsx`
- `components/students/tell-us-step.tsx`
- `docs/REGISTRATION_AND_INTAKE_API.md`
- `lib/registration.ts`
- `supabase/migrations/121_tell_us_step.sql`
- `supabase/migrations/122_income_*.sql`

---

## Findings (most-severe first)

### 1. Student free text rendered through KaTeX — garbled output ✅ FIXED
- **File:** `app/student/register/registration-form.tsx:382`
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** `biggest_challenge` prose is now piped through `RichContent` (remark-math + rehype-katex), a component previously fed only authored exam content.
- **Failure scenario:** A student writes *"I need $500 for fees and $200 for books"*. The text between the two `$` signs is parsed as inline math, so *"500 for fees and"* renders as garbled KaTeX (or a red error box) on both the student's profile summary and the admin's student detail page — misrepresenting what the student actually wrote.
- **Fix:** Added a `math` prop (default `true`) to `RichContent`; when `false` it drops `remarkMath`/`rehypeKatex` and parses only GFM. `biggest_challenge` now renders with `math={false}` in both the summary and the editor preview. (`components/exam/RichContent.tsx`, `registration-form.tsx`, `tell-us-step.tsx`)

### 2. Entire Step-6 PATCH fails (total data loss) when uncapped controls exceed server limits ✅ FIXED
- **File:** `lib/registration.ts:288`
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** `custom_hobbies` (>20) and `family_members` (>12) caps are enforced only server-side; the UI's Add controls have no cap. Because Step 6 is a single PATCH, hitting the cap fails the whole step.
- **Failure scenario:** A student adds a 13th family member (or 21st custom hobby) — nothing in the UI stops them. On save, `validatePartial` pushes `family_members: too many (max 12)` and the single Step-6 PATCH returns 400, so **none** of the Tell-Us data in that payload (DOB, income, languages, etc.) is persisted, and the student sees only a terse error with no field-level guidance.
- **Fix:** Added `MAX_FAMILY_MEMBERS = 12` / `MAX_CUSTOM_HOBBIES = 20` client constants (matching the server bounds). The "Add family member" button and the custom-hobby Add button/input are disabled at the cap, each with a short helper note, so the client stops before the server ever rejects. (`tell-us-step.tsx`)

### 3. Profile-completeness denominator regression re-fires approval nudge ✅ FIXED
- **File:** `lib/registration.ts:76` (same root cause also at `lib/registration.ts:68`)
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** `STEP_FIELDS[6]` changed from `[preferred_mentor_pref_id, biggest_challenge]` to 10 new optional fields, and `preferred_mentor_pref_id` was removed from `ALL_FIELDS`. `profileCompleteness()` divides filled fields by `ALL_FIELDS.length` — the single source of truth for the admin grid **and** the approval email's "complete your profile" nudge.
- **Failure scenario:** After deploy, every existing student's completeness % drops (8 net-new always-empty fields in the denominator, plus mentor pref no longer counted). Students previously shown near-100% now read lower, and the approval-email "complete your profile" nudge may re-fire for students who had already effectively completed the old form.
- **Fix:** Introduced `COMPLETENESS_FIELDS` (steps 1–5 only) and switched `profileCompleteness()` to divide by it. Step 6 "Tell Us" is optional enrichment and is excluded from the metric, so the denominator no longer swells with always-empty optional fields. (`lib/registration.ts`) — also resolves #10.

### 4. Custom hobbies silently truncated to 60 chars ✅ FIXED
- **File:** `lib/registration.ts:287`
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** `custom_hobbies` entries are truncated to 60 chars in validation (`s.slice(0,60)`) with no error, while the UI imposes no length limit.
- **Failure scenario:** A student types a hobby longer than 60 characters (e.g. *"Competitive long-distance open-water swimming and triathlon training"*). The Add button and tag show the full text, but on PATCH the stored value is silently cut. On reload the student sees their hobby truncated mid-word with no indication why.
- **Fix:** UI input now has `maxLength={100}` so over-length text can't be entered; the server no longer slices — it errors (`custom_hobbies: each hobby must be 100 characters or fewer`) as a guard against direct API use. The cap was raised from 60 → 100 (the DB column is unbounded `text[]`, and 60 was too tight for phrase-length hobbies). (`tell-us-step.tsx`, `lib/registration.ts`)

### 5. The only family-member row cannot be removed ✅ FIXED
- **File:** `components/students/tell-us-step.tsx:145`
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** The desktop remove X is `disabled={rows.length === 1}` and the mobile "Remove" link is only rendered when `rows.length > 1`.
- **Failure scenario:** A student adds exactly one family member, saves, then decides they don't want to list any. There is no working remove control — they're stuck manually resetting both dropdowns back to "Select…" to clear the entry, which is non-obvious.
- **Fix:** Added a `soleEmptyRow` flag; the remove control is now disabled/hidden only when the single fallback row is already blank. Removing a filled sole row clears the entry (it reappears as one empty row). (`tell-us-step.tsx`)

### 6. Excel-imported mentor preference now invisible to admins ✅ FIXED
- **File:** `app/student/register/registration-form.tsx:348`
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** The old Step-6 summary rendered "Preferred mentor type" (via the now-deleted `byId` helper). That row and helper were removed and the section renamed "Tell Us". But `preferred_mentor_pref_id` is still written by the Excel-intake pipeline (`lib/intake-excel.ts` / `app/api/admin/intake/student/route.ts`) and still selected via `PROFILE_SELECT` (moved to `LEGACY_FIELDS`, not dropped).
- **Failure scenario:** For a student imported via Excel with a recorded mentor preference, an admin opening `/dashboard/students/[id]` can no longer see that value anywhere in the UI — the data is now write-only/invisible even though the column and ref table were deliberately retained "for analytics".
- **Fix:** Added `preferred_mentor_pref_id` to the form type + `EMPTY`, hydrated it on profile load, and the summary's "Tell Us" section now renders a read-only "Preferred mentor type" row (label via `refs.mentor_preference`) whenever a value is present. (`registration-fields.tsx`, `registration-form.tsx`)

### 7. DOB server validation accepts future / implausible dates ✅ FIXED
- **File:** `lib/registration.ts:257` (same root cause also at `lib/registration.ts:256`)
- **Verdict:** CONFIRMED · **Category:** correctness
- **Issue:** The `DobPicker` disables future dates in the UI, but `validatePartial` only checks the `YYYY-MM-DD` shape and `Date.parse`.
- **Failure scenario:** A direct PATCH to `/api/registration/profile` (or any client not using the picker) can persist an implausible `date_of_birth` such as `2099-01-01` or `1900-01-01`, which is then surfaced as the student's DOB in the console profile summary.
- **Fix:** After the format check, the server rejects years before 1900 (`date_of_birth: year is out of range`) and enforces a **minimum age of `MIN_AGE_YEARS` (17)** — `date_of_birth: you must be at least 17 years old` — which also rules out future dates. Students must have completed 12th standard to be here. The `DobPicker` shares the same `MIN_AGE_YEARS` constant and disables any date newer than 17 years ago. (`lib/registration.ts`, `tell-us-step.tsx`)

### 8. Ref-data cache key ignores table set — empty chips for up to 1h after deploy ✅ FIXED
- **File:** `lib/ref-cache.ts:51`
- **Verdict:** PLAUSIBLE · **Category:** correctness
- **Issue:** `REF_TABLES` gained 7 tables (language / hobby / caste_certificate_status / reservation_category / income_band / family_relation / family_occupation), but `getRefData(REF_TABLES, "registration")` keys the Next.js Data Cache only on `["ref-data","registration"]` with `revalidate 3600`.
- **Failure scenario:** On Vercel the Data Cache persists across deployments, so after deploy the reference endpoint keeps serving the pre-deploy payload (missing all 7 new keys) for up to an hour. During that window every student who opens Step 6 sees empty chip lists for languages, hobbies, certificate status, reservation category and income band — and literally cannot select any of those options.
- **Fix:** The sorted table-key set is now folded into the cache key (`["ref-data", cacheKey, tableSetKey]`), so adding/removing a `ref_*` table changes the key and busts the Data Cache on deploy. (`lib/ref-cache.ts`)

### 9. `PROFILE_SELECT` couples five call sites to migration 121 ☑️ RESOLVED (operational, no code change)
- **File:** `app/dashboard/students/[id]/page.tsx:26`
- **Verdict:** PLAUSIBLE · **Category:** correctness
- **Issue:** `PROFILE_SELECT` now lists the migration-121 columns (`languages`, `family_members`, `date_of_birth`, etc.), coupling five call sites to that migration having run.
- **Failure scenario:** On any environment where `121_tell_us_step.sql` has not been applied (e.g. a preview DB provisioned before the branch), every query built from `PROFILE_SELECT` — the students grid (`students-query.ts`), the CSV export (`actions.ts`), the student detail page, and the registration profile GET/PATCH — fails with a Postgres `column ... does not exist` error, 500-ing the entire students console rather than degrading gracefully.
- **Resolution:** Confirmed migrations `121_tell_us_step.sql` and `122_income_bands_annual.sql` both ship in this branch's diff alongside the code, so the coupling resolves as long as migrations are applied as part of the deploy (standard practice). No graceful degradation is possible for a Postgres query referencing a not-yet-existing column without splitting queries — over-engineering for a same-PR migration. **Action item:** ensure migrations run before/with the app deploy on every environment (incl. preview DBs).

### 10. `reservation_category` in completeness denominator → most students can never reach 100% ✅ FIXED (with #3)
- **File:** `lib/registration.ts:44`
- **Verdict:** CONFIRMED · **Category:** cleanup
- **Issue:** `reservation_category` counts toward `profileCompleteness` (added to `ALL_FIELDS` via `STEP_FIELDS[6]`), but in the UI the reservation-category select only renders when the caste-certificate chip is `has`, and `STEP_PAYLOAD` only sends it in that case.
- **Failure scenario:** A student with no government caste/community certificate — the majority — structurally cannot fill this field, so the admin grid and the approval-email nudge show them capped below 100% completeness forever, even after filling everything they can. `custom_hobbies` (a niche free-text escape hatch) similarly dilutes the denominator.
- **Fix:** Covered by the #3 fix — `reservation_category`, `custom_hobbies` and all other Step-6 fields are excluded from `COMPLETENESS_FIELDS`, so they no longer sit in the denominator. (`lib/registration.ts`)

---

## Dropped under the 10-item cap (lower severity)

- **Hardcoded brand hex** in `components/students/tell-us-step.tsx` (e.g. `from-[#2563eb] to-[#7c3aed]`, `text-[#7c3aed]`) instead of theme tokens — violates the app-surface token rule in `docs/STYLE_GUIDE.md` / `CLAUDE.md`.
- **First-generation options as an inline literal** (`[{slug:"yes",label:"Yes"},{slug:"no",label:"No"}]`) in `tell-us-step.tsx:62` instead of sourced from the reference API like every sibling field on the step — violates the "fetch reference/option data from the API" working principle.
- **`ChipSingle`/`ChipMulti` markup duplicated** in `tell-us-step.tsx` after the shared `ChipSingle` was deleted from `registration-fields.tsx` (near-verbatim chip-button markup re-added privately).

## Refuted

- Duplication claim at `components/students/tell-us-step.tsx:231` — one verifier flagged the re-added private `ChipSingle`/`ChipMulti` as duplication, but it was refuted on independent verification (the duplication is captured in the dropped-cleanups note above rather than as a standalone finding).
