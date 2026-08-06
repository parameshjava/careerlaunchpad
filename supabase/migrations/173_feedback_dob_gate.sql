-- ============================================================================
-- 173_feedback_dob_gate.sql
-- Close the O-11 hole: unknown date of birth now means NOT ASKED, and the student
-- is told why (issue #84).
--
-- WHAT 171 GOT WRONG, AND WHY
--   171 excluded under-18 students but treated an unknown DOB as adult, on the
--   reasoning that excluding on null would switch the feature off for anyone who
--   skipped an optional field. Measured against production, that reasoning was sound
--   and the outcome was still unacceptable: 15 of 35 student profiles had a DOB
--   (43%), the bulk-intake path had contributed zero, and exactly one known DOB was
--   under 18. So the control blocked one student and waved through twenty of unknown
--   age — in a product whose registration deliberately admits 17-year-olds.
--
-- WHAT CHANGES
--   1) date_of_birth is now REQUIRED to submit a registration (lib/registration.ts
--      REQUIRED_FIELDS, Step 1, using the same DobPicker calendar). Every new and
--      re-submitting student has one.
--   2) This migration flips _feedback_age_eligible to FAIL CLOSED: no DOB ⇒ not
--      asked, not counted in eligible_count, not emailed.
--   3) Because (2) would otherwise silence a student invisibly,
--      student_feedback_dob_required() lets their own screens say exactly what is
--      missing and what to do about it — and students_missing_dob() lets staff ask
--      the existing cohort to fill it in through the review-note channel that is
--      already built for "your profile needs a correction".
--
--   (2) without (1) and (3) would be a quiet 57% drop in who gets asked. The three
--   go together, in this order, or not at all.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Fail closed. Same signature, so all five call sites from 171 inherit it.
-- ---------------------------------------------------------------------------
create or replace function public._feedback_age_eligible(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- 18+ AND known. A missing profile row or a null DOB is now a no, because
  -- "we don't know how old they are" cannot be a reason to collect from them.
  select coalesce(
    (select sp.date_of_birth is not null
         and sp.date_of_birth <= (current_date - interval '18 years')
       from public.student_profile sp
      where sp.user_id = p_student_id),
    false);
$$;

comment on function public._feedback_age_eligible(uuid) is
  'DPDP O-11: chapter feedback is collected only from students whose DOB is known '
  'AND 18+. Unknown DOB fails closed — see student_feedback_dob_required() for the '
  'prompt that tells the student why, and REQUIRED_FIELDS for why new profiles have one.';

-- ---------------------------------------------------------------------------
-- 2. "You are being skipped, and this is why." True only when it MATTERS: the
--    student has no DOB and there is an open window they would otherwise be asked
--    about. Nagging someone with no feedback waiting would teach them to ignore it.
--
--    Deliberately does NOT distinguish "no DOB" from "under 18": a 17-year-old is
--    told nothing, because there is no action for them to take and inviting them to
--    "fix" their age would be an invitation to lie.
-- ---------------------------------------------------------------------------
create or replace function public.student_feedback_dob_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_profile sp
    where sp.user_id = auth.uid()
      and sp.date_of_birth is null
      and exists (
        select 1
        from public.chapter_feedback_request r
        join public.student_enrollment e
          on e.batch_id = r.batch_id and e.student_id = auth.uid()
         and e.status in ('pending', 'active')
        where r.status = 'open' and r.closes_at > now()
      )
  );
$$;

grant execute on function public.student_feedback_dob_required() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The cohort staff need to chase. Requires student.review — the same permission
--    that governs the review-note channel this list feeds, so anyone who can see the
--    list can act on it, and nobody sees a roster of names they cannot use.
--
--    Scoped to students who are ACTUALLY affected (enrolled in a batch), because a
--    list that includes every DOB-less profile ever imported is a list nobody works
--    through. `asked_recently` lets the caller skip someone already nudged, so the
--    button can be pressed twice without emailing anyone twice.
-- ---------------------------------------------------------------------------
create or replace function public.students_missing_dob()
returns table (
  student_id    uuid,
  full_name     text,
  email         text,
  college_id    uuid,
  asked_recently boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Either permission opens the list: student.review because it owns the channel used
  -- to ask, feedback.view.identified because the coordinator who notices the shortfall
  -- on /dashboard/feedback is usually not the same person who reviews registrations.
  if not (
    public.has_permission('student.review')
    or public.has_permission('feedback.view.identified')
    or exists (
      select 1 from public.user_role ur
      join public.role_permission rp on rp.role_id = ur.role_id
      join public.permission p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and p.key in ('*', 'student.review', 'feedback.view.identified')
    )
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select sp.user_id,
         coalesce(sp.full_name, u.full_name, u.email),
         u.email,
         sp.college_id,
         exists (
           select 1 from public.student_review_note n
           where n.student_user_id = sp.user_id
             and n.resolved_at is null
             and n.created_at > now() - interval '14 days'
         )
  from public.student_profile sp
  join public.app_user u on u.id = sp.user_id
  where sp.date_of_birth is null
    and u.status = 'active'
    and exists (
      select 1 from public.student_enrollment e
      where e.student_id = sp.user_id and e.status in ('pending', 'active')
    )
    -- Row scope must mirror the gate above, or a holder of a global
    -- feedback.view.identified would pass the check and then see an empty list and
    -- conclude there is nothing to chase. Global grant ⇒ everyone; college-scoped
    -- grant ⇒ that college only.
    and (
      public.has_permission('student.review')
      or public.has_permission('feedback.view.identified')
      or (sp.college_id is not null and (
            public.has_college_permission('student.review', sp.college_id)
            or public.has_college_permission('feedback.view.identified', sp.college_id)))
    )
  order by 2;
end $$;

grant execute on function public.students_missing_dob() to authenticated;

commit;
