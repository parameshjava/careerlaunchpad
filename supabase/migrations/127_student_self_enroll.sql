-- ============================================================================
-- 127_student_self_enroll.sql
-- Let a student enrol THEMSELVES into an open batch (issue #49). Enrolment writes
-- are otherwise gated on finance.manage; this SECURITY DEFINER function is the
-- controlled exception. It enforces:
--   * the caller is a registered student (has a student_profile),
--   * the target batch is 'open' or 'running',
--   * the batch is associated with the student's own college (batch_college),
--   * no self-granted concession — always full fee (gross snapshot),
--   * no duplicate enrolment.
-- Returns the new enrolment id. Idempotent (create or replace).
-- ============================================================================

create or replace function public.enroll_self(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_college    uuid;
  v_has_profile boolean;
  v_status     text;
  v_gross      bigint;
  v_enrollment uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select true, college_id into v_has_profile, v_college
  from public.student_profile where user_id = v_uid;
  if not v_has_profile then
    raise exception 'Only registered students can enrol';
  end if;

  select status into v_status from public.batch where id = p_batch_id;
  if v_status is null then
    raise exception 'Batch not found';
  end if;
  if v_status not in ('open', 'running') then
    raise exception 'This batch is not open for enrolment';
  end if;

  if v_college is null
     or not exists (
       select 1 from public.batch_college bc
       where bc.batch_id = p_batch_id and bc.college_id = v_college
     ) then
    raise exception 'This batch is not available for your college';
  end if;

  if exists (
    select 1 from public.student_enrollment e
    where e.batch_id = p_batch_id and e.student_id = v_uid
  ) then
    raise exception 'You are already enrolled in this batch';
  end if;

  select coalesce(sum(amount_paise), 0) into v_gross
  from public.fee_component where batch_id = p_batch_id;

  insert into public.student_enrollment (
    student_id, batch_id, college_id, gross_fee_paise,
    concession_type, concession_paise, payment_option, status, created_by
  ) values (
    v_uid, p_batch_id, v_college, v_gross,
    'none', 0, 'full', 'active', v_uid
  )
  returning id into v_enrollment;

  return v_enrollment;
end;
$$;

grant execute on function public.enroll_self(uuid) to authenticated;
