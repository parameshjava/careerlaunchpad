-- ============================================================================
-- 140_mentor_teachable_subjects.sql
-- Mentors declare the SUBJECT(S) they can teach, alongside the free-text skills
-- they already list. Subjects are the platform's canonical `public.subject`
-- rows (the same ones batches teach and mentors get assigned to via
-- batch_subject_mentor), so a mentor's declared subjects line up with the batch
-- vocabulary — no second, drifting subject list.
--
-- `subject` RLS is exam-staff-only (021), but the teachable-subjects picker must
-- work for EXTERNAL mentors self-registering (who are not exam staff). So, as
-- migration 135 does for the batch syllabus picker, we expose just id + name of
-- ACTIVE subjects through a SECURITY DEFINER function granted to authenticated.
-- Idempotent.
-- ============================================================================

-- 1) Column: the subjects this mentor can teach (public.subject ids). Stored as
--    an id array like mentoring_area_ids/career_goal_ids (arrays can't carry a
--    per-element FK; the reader + validator keep them referentially honest).
alter table public.mentor_profile
  add column if not exists teachable_subject_ids uuid[] not null default '{}';

-- 2) Reader for the registration form + server-side validation. Exposes only the
--    id + name of active subjects — non-sensitive — to any signed-in user.
create or replace function public.mentor_teachable_subjects()
returns table (id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name
  from public.subject s
  where s.status = 'active'
  order by lower(s.name);
$$;

grant execute on function public.mentor_teachable_subjects() to authenticated;
