-- ============================================================================
-- 111_auto_close_expired_exams.sql
-- Auto-close: 2 minutes after a sitting's window ends, close it and grade any
-- attempts still in progress (students who answered but never submitted), so
-- results are computable without an admin clicking Close. Runs every minute via
-- pg_cron. The client already auto-submits within a 1-min grace, so the extra
-- minute lets those final flushes land before we finalize.
--
-- grade_session_in_progress() can't run from cron (it checks
-- has_college_permission via auth.uid(), which is null in a cron job), so this
-- SECURITY DEFINER helper grades directly through the internal _grade_attempts
-- (the postgres owner bypasses its REVOKE). Idempotent.
-- ============================================================================

begin;

create extension if not exists pg_cron;

create or replace function public.close_expired_sessions()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
  v_attempts uuid[];
  v_closed integer := 0;
begin
  for v_session_id in
    select id from public.exam_session
    where status in ('scheduled', 'open')
      and closes_at is not null
      and now() > closes_at + interval '2 minutes'
  loop
    -- Finalize anyone who answered but never submitted (blank attempts score 0).
    select array_agg(id) into v_attempts
      from public.exam_attempt
      where session_id = v_session_id and status = 'in_progress';
    if v_attempts is not null then
      perform public._grade_attempts(v_attempts);
    end if;
    update public.exam_session set status = 'closed' where id = v_session_id;
    v_closed := v_closed + 1;
  end loop;
  return v_closed;
end $$;

-- Idempotent unschedule + re-schedule (same pattern as migration 108).
do $$
begin
  perform cron.unschedule('cl-close-expired-exams');
exception when others then
  null;
end $$;

select cron.schedule(
  'cl-close-expired-exams',
  '* * * * *',
  $cron$ select public.close_expired_sessions(); $cron$
);

commit;
