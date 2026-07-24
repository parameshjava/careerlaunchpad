-- ============================================================================
-- 139_batch_enrollment_status.sql
-- Batch lifecycle: Draft → Open → Enrollment Closed → Closed.
--
-- The lifecycle STAGE stays on batch.status (draft/open/running/closed/cancelled).
-- The enrolment GATE is a separate, extensible text enum — batch.enrollment_status
-- — so a batch can announce before enrolment opens, accept enrolments, then stop
-- accepting them, all independent of the lifecycle status:
--
--   'not_open' → enrolment has not opened yet (default; e.g. a Draft batch)
--   'open'     → students may self-enrol (when status is open/running)
--   'closed'   → the "Enrollment Closed" step — no new enrolments, even while running
--
-- A text enum (matching batch.status's text+CHECK convention) rather than a
-- boolean, so more states can be added later by widening the CHECK. This
-- migration is convergent — safe to re-run if an earlier 2-state version ran.
-- ============================================================================

begin;

alter table public.batch add column if not exists enrollment_status text;

-- Backfill/normalise: derive a sensible gate from the lifecycle status for any
-- row not already explicitly closed (open/running → open; everything else →
-- not_open). Leaves an intentional 'closed' untouched.
update public.batch
   set enrollment_status = case when status in ('open', 'running') then 'open' else 'not_open' end
 where enrollment_status is null or enrollment_status not in ('not_open', 'open', 'closed');

alter table public.batch alter column enrollment_status set default 'not_open';
alter table public.batch alter column enrollment_status set not null;

alter table public.batch drop constraint if exists batch_enrollment_status_check;
alter table public.batch
  add constraint batch_enrollment_status_check
  check (enrollment_status in ('not_open', 'open', 'closed'));

comment on column public.batch.enrollment_status is
  'Enrolment gate, independent of lifecycle status: not_open = enrolment not opened yet; open = students may self-enrol; closed = the "Enrollment Closed" step. Text enum so more states can be added later.';

-- enroll_self: on top of the lifecycle-status and college checks, only 'open'
-- enrolment is accepted. Distinct messages for not-yet-open vs closed.
create or replace function public.enroll_self(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_college       uuid;
  v_has_profile   boolean;
  v_status        text;
  v_enroll_status text;
  v_gross         bigint;
  v_enrollment    uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select true, college_id into v_has_profile, v_college
  from public.student_profile where user_id = v_uid;
  if not v_has_profile then
    raise exception 'Only registered students can enrol';
  end if;

  select status, enrollment_status into v_status, v_enroll_status
  from public.batch where id = p_batch_id;
  if v_status is null then
    raise exception 'Batch not found';
  end if;
  if v_status not in ('open', 'running') then
    raise exception 'This batch is not open for enrolment';
  end if;
  if v_enroll_status = 'closed' then
    raise exception 'Enrolment for this batch is closed';
  elsif v_enroll_status <> 'open' then
    raise exception 'Enrolment for this batch has not opened yet';
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

commit;
