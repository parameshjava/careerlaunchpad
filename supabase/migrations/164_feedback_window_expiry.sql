-- ============================================================================
-- 164_feedback_window_expiry.sql
-- Make a chapter's feedback window actually expire (issue #84, defect in 159).
--
-- THE BUG
--   159 shipped close_expired_feedback_requests() with a comment pointing at cron,
--   but no cron.schedule() call — so nothing ever flipped a lapsed request from
--   'open' to 'closed'. Reads all compute expiry live, so every report stayed
--   correct and the fault was invisible on screen. The damage was in the WRITE
--   path: open_chapter_feedback_request() resumed any row with status='open'
--   without looking at closes_at, so a chapter re-taught and re-completed after its
--   14 days handed back the dead request's id, student_pending_feedback() filtered
--   it out on `closes_at > now()`, and the batch was never asked again. Silently:
--   no error, no empty state, just a chapter that could not be rated twice.
--
-- THE FIX, IN TWO INDEPENDENT LAYERS
--   1) open_chapter_feedback_request() expires a lapsed window for the chapter it
--      is about to open, then resumes only a LIVE one. This is what makes the
--      feature correct, and it does not depend on cron having run — the same
--      stance 159 §7c took for the read path.
--   2) cron sweeps the rest every 5 minutes, so the stored status converges for
--      chapters nobody re-completes (mirrors 111_auto_close_expired_exams.sql).
--
--   Layer 1 is not optional politeness. chapter_feedback_request_one_open_idx is a
--   partial unique index on status='open', so a lapsed row that cron has not yet
--   swept would make the insert raise unique_violation, and 159's handler — which
--   re-reads an open row — would have returned the dead id right back.
-- ============================================================================

begin;

create extension if not exists pg_cron;

-- Supersedes 159 §7a. Restated in full (Postgres cannot patch a function body).
-- The only changes are the expire-first update and the `closes_at > now()` guard on
-- both lookups; eligibility, the mentor snapshot and the race handling are 159's.
create or replace function public.open_chapter_feedback_request(
  p_batch_id uuid, p_subject_id uuid, p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form     uuid;
  v_eligible int;
  v_mentors  text[];
  v_id       uuid;
begin
  select id into v_form from public.feedback_form
   where scope = 'chapter' and status = 'active';
  if v_form is null then return null; end if;   -- no active instrument: nothing to ask

  -- Expire a lapsed window for THIS chapter before touching the unique index. A
  -- reverted-then-re-completed chapter is exactly the case that reaches here, and
  -- it may be months after the original 14 days ran out.
  update public.chapter_feedback_request
     set status = 'closed'
   where batch_id = p_batch_id and subject_id = p_subject_id
     and chapter_id = p_chapter_id and status = 'open' and closes_at <= now();

  -- Resume a still-LIVE window rather than opening a second one, so a revert →
  -- re-complete inside the window keeps every response on one request.
  select id into v_id from public.chapter_feedback_request
   where batch_id = p_batch_id and subject_id = p_subject_id
     and chapter_id = p_chapter_id and status = 'open' and closes_at > now();
  if v_id is not null then return v_id; end if;

  select count(*) into v_eligible
  from public.student_enrollment e
  where e.batch_id = p_batch_id and e.status in ('pending', 'active');

  -- Nobody to ask ⇒ no request. An empty denominator would render as "0 of 0",
  -- which reads as a failure to collect rather than as nobody being enrolled.
  if coalesce(v_eligible, 0) = 0 then return null; end if;

  select coalesce(array_agg(m.mentor_name order by m.mentor_name), '{}')
    into v_mentors
  from public.batch_subject_mentor m
  where m.batch_id = p_batch_id and m.subject_id = p_subject_id
    and m.mentor_name is not null;

  insert into public.chapter_feedback_request
    (batch_id, subject_id, chapter_id, form_id, closes_at, eligible_count, mentor_snapshot)
  values
    (p_batch_id, p_subject_id, p_chapter_id, v_form,
     now() + interval '14 days', v_eligible, coalesce(v_mentors, '{}'))
  returning id into v_id;

  return v_id;
exception
  -- Two concurrent completions race for the partial unique index; the loser reads
  -- the winner's row instead of surfacing a 500 to whoever clicked second. The
  -- winner's row is by definition fresh, so the same `closes_at > now()` guard
  -- applies here — a lapsed row can no longer be handed back as if it were open.
  when unique_violation then
    select id into v_id from public.chapter_feedback_request
     where batch_id = p_batch_id and subject_id = p_subject_id
       and chapter_id = p_chapter_id and status = 'open' and closes_at > now();
    return v_id;
end $$;

-- Every 5 minutes, not every minute: nothing user-facing waits on this sweep (all
-- reads and the open path treat a lapsed window as closed already), so its only job
-- is to keep the stored status honest for anyone querying the table directly.
do $$
begin
  perform cron.unschedule('cl-close-expired-feedback');
exception when others then
  null;
end $$;

select cron.schedule(
  'cl-close-expired-feedback',
  '*/5 * * * *',
  $cron$ select public.close_expired_feedback_requests(); $cron$
);

-- One-off: sweep the windows that lapsed while no job was scheduled.
select public.close_expired_feedback_requests();

commit;
