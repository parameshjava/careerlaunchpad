-- ============================================================================
-- 129_self_enroll_reenrol.sql
-- Fix (code review #1): a rejected (cancelled) enrolment must not permanently
-- lock a student out of a batch. The `unique (student_id, batch_id)` table
-- constraint counted cancelled rows, so once rejected neither the student
-- (enroll_self) nor an admin could ever enrol them again.
--
-- Replace the constraint with a PARTIAL unique index that ignores cancelled
-- rows — a student may hold at most one live (pending/active/completed)
-- enrolment per batch, while any number of historical cancelled rows may
-- remain. Also relax enroll_self's duplicate guard to ignore cancelled rows.
-- Idempotent.
-- ============================================================================

-- 1) Swap the full unique constraint for a partial unique index.
alter table public.student_enrollment
  drop constraint if exists student_enrollment_student_id_batch_id_key;

drop index if exists public.student_enrollment_live_uniq;
create unique index student_enrollment_live_uniq
  on public.student_enrollment (student_id, batch_id)
  where status <> 'cancelled';

-- 2) enroll_self: only a LIVE enrolment blocks re-enrolment (a prior rejection
--    leaves a cancelled row, which no longer counts).
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

  -- Only a live (non-cancelled) enrolment blocks re-enrolment; a rejected
  -- (cancelled) one may be superseded by a fresh request.
  if exists (
    select 1 from public.student_enrollment e
    where e.batch_id = p_batch_id and e.student_id = v_uid
      and e.status <> 'cancelled'
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
    'none', 0, 'full', 'pending', v_uid
  )
  returning id into v_enrollment;

  return v_enrollment;
end;
$$;

grant execute on function public.enroll_self(uuid) to authenticated;
