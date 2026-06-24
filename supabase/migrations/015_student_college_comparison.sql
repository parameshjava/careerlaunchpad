-- ============================================================================
-- 015_student_college_comparison.sql
-- Let a student see how they compare with their OWN college.
--
-- Problem: a student's RLS (student_profile_self) only exposes their own row, so
-- the student-insights page cannot read peers to compute a college benchmark.
--
-- Solution: a security-definer RPC that, for the CALLING student, returns the
-- aggregatable-but-ANONYMOUS rows for their college — only the four chart fields
-- (skills, career goals, primary goal, self-assessment), never names / emails /
-- ids. So the client can compute college averages & popularity for comparison
-- without ever seeing who answered what. The college is derived from the
-- caller's own profile (auth.uid()), never from a parameter, so a student can't
-- peek at another college.
--
-- Returns: { college: {id,name,place,state} | null, rows: [ {skills,
--            career_goal_ids, primary_career_goal_id, skill_assessment}, ... ] }
-- college is null when the student hasn't picked a college yet.
--
-- Idempotent: create-or-replace; safe to run more than once.
-- ============================================================================

create or replace function public.student_college_comparison()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  cid  uuid;
  coll jsonb;
  rows jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller's own college (single source of truth).
  select college_id into cid from public.student_profile where user_id = uid;
  if cid is null then
    return jsonb_build_object('college', null, 'rows', '[]'::jsonb);
  end if;

  select to_jsonb(c) into coll
  from (select id, name, place, state from public.college where id = cid) c;

  -- Anonymous union of registered + not-yet-claimed imported students for this
  -- college. No identifying columns are selected.
  select coalesce(jsonb_agg(r), '[]'::jsonb) into rows
  from (
    select skills, career_goal_ids, primary_career_goal_id, skill_assessment
    from public.student_profile
    where college_id = cid
    union all
    select skills, career_goal_ids, primary_career_goal_id, skill_assessment
    from public.student_intake
    where college_id = cid and status in ('pending', 'invited')
  ) r;

  return jsonb_build_object('college', coll, 'rows', rows);
end;
$$;

grant execute on function public.student_college_comparison() to authenticated;
