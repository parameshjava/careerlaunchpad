-- ============================================================================
-- 018_student_placement.sql
-- Records that a student "got a job" — the missing piece behind the
-- student -> mentor conversion (requirement 1). A placed student is what
-- unlocks the in-app "Become a mentor" CTA (they register as a student_alumni
-- mentor via register_as_mentor()).
--
-- Self-reported by the student: these columns live on student_profile and ride
-- its existing self-RLS (student_profile_self — own row only), so NO new
-- permission is needed. The placement detail is a small jsonb blob rather than
-- a wide set of columns, since it's display/match metadata, not relational.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

alter table public.student_profile
  add column if not exists employment_status text not null default 'seeking'
    check (employment_status in ('seeking', 'placed', 'higher_studies', 'other')),
  -- { company, title, location, type ('internship'|'full_time'), offer_date, package }
  add column if not exists placement jsonb;

create index if not exists student_profile_employment_idx
  on public.student_profile (employment_status);
