-- ============================================================================
-- 168_feedback_reminders.sql
-- ONE reminder email per feedback window, to the students who haven't answered
-- (issue #84 §G3 "being asked at all", phasing v2).
--
-- THE PROBLEM
--   159 asks in-app only: a card on /student/quizzes and the batch's Feedback tab.
--   A student who doesn't open those pages during the 14 days is never told a window
--   exists, and their silence lands in the response rate as if they had declined.
--   §6 targets 60% response by the third chapter; in-app-only prompting cannot get
--   there, and the literature on online course evaluations is unanimous that a
--   reminder is the single highest-yield intervention.
--
-- THE RULE, ENFORCED BY THE PRIMARY KEY
--   At most ONE reminder per (request, student), ever. The row is written at enqueue
--   time and never deleted, so "already reminded" is a fact in the table rather than
--   a timestamp comparison someone has to get right. A second nudge is not a
--   configuration away — it would need a new table, which is the point (§F4: prompt
--   fatigue is what kills response rates, and this feature can generate one prompt
--   per chapter per student already).
--
-- WHY DAY 3
--   Late enough that the in-app prompt has had a real chance (most students open the
--   assessments hub within a couple of days of a chapter closing), early enough to
--   leave 11 of the 14 days to act. p_after_days makes it one argument, not a rewrite.
--
-- HOW IT RUNS
--   Vercel Cron → GET /api/cron/feedback-reminders (daily) → enqueue, then drain
--   through lib/mailer.ts. NOT pg_cron: the mail transport lives in Node, and
--   pg_net-ing out of Postgres to reach it would put a URL and a shared secret in a
--   migration. The three functions here are granted to service_role ONLY — the cron
--   route is the sole caller, through the admin client.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The queue AND the audit trail. Same shape as exam_result_notification (157),
--    deliberately: one proven pattern for "we emailed a student about X".
-- ---------------------------------------------------------------------------
create table if not exists public.feedback_reminder_notification (
  request_id    uuid not null references public.chapter_feedback_request(id) on delete cascade,
  student_id    uuid not null references public.app_user(id) on delete cascade,
  -- Snapshotted at enqueue time, so the audit row records where we actually sent.
  email         text,
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'skipped')),
  email_sent_at timestamptz,
  last_error    text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  primary key (request_id, student_id)
);

-- The drain's only query: "what still needs sending".
create index if not exists feedback_reminder_notification_status_idx
  on public.feedback_reminder_notification (status, created_at);

alter table public.feedback_reminder_notification enable row level security;

-- Staff read it (it is the evidence that asking happened). No write policy at all:
-- every mutation goes through the definer functions below.
drop policy if exists feedback_reminder_read on public.feedback_reminder_notification;
create policy feedback_reminder_read on public.feedback_reminder_notification
  for select to authenticated
  using (public.has_permission('feedback.view.identified'));

-- ---------------------------------------------------------------------------
-- 2. Enqueue: one row per (still-open window older than N days, student who has
--    not responded). Idempotent — `on conflict do nothing` is what makes "at most
--    one reminder" true no matter how often cron runs.
--
--    A student who responds between enqueue and drain still gets the email. That is
--    accepted: the alternative is re-checking at send time, which buys one avoided
--    email at the cost of a second source of truth about who was reminded. The
--    email's copy handles it ("if you've already answered, thank you — ignore this").
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_feedback_reminders(p_after_days int default 3)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_days int := greatest(coalesce(p_after_days, 3), 1);
        v_n int;
begin
  with queued as (
    insert into public.feedback_reminder_notification
      (request_id, student_id, email, status, last_error)
    select r.id, e.student_id, lower(u.email),
           case when u.email is null then 'skipped' else 'pending' end,
           case when u.email is null then 'No email address on the student account' end
    from public.chapter_feedback_request r
    join public.student_enrollment e
      on e.batch_id = r.batch_id and e.status in ('pending', 'active')
    join public.app_user u on u.id = e.student_id
    where r.status = 'open'
      and r.closes_at > now()
      and r.opened_at <= now() - make_interval(days => v_days)
      -- Suspended/deleted accounts are not chased.
      and u.status = 'active'
      and not exists (
        select 1 from public.chapter_feedback_response resp
        where resp.request_id = r.id and resp.student_id = e.student_id
      )
    on conflict (request_id, student_id) do nothing
    returning 1
  )
  select count(*)::int into v_n from queued;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. What to send, with everything the email renders — one round trip, no N+1.
--    p_limit + 1 rows are returned so the caller can tell there is more to do
--    (same contract as pending_exam_result_notifications).
-- ---------------------------------------------------------------------------
create or replace function public.pending_feedback_reminders(p_limit int default 200)
returns table (
  request_id   uuid,
  student_id   uuid,
  email        text,
  student_name text,
  batch_name   text,
  subject_name text,
  chapter_name text,
  closes_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.request_id, n.student_id, n.email,
         coalesce(sp.full_name, u.full_name),
         b.name, bs.subject_name, bc.chapter_name, r.closes_at
  from public.feedback_reminder_notification n
  join public.chapter_feedback_request r on r.id = n.request_id
  join public.batch b on b.id = r.batch_id
  join public.batch_subject bs on bs.batch_id = r.batch_id and bs.subject_id = r.subject_id
  left join public.batch_chapter bc
         on bc.batch_id = r.batch_id and bc.subject_id = r.subject_id
        and bc.chapter_id = r.chapter_id
  join public.app_user u on u.id = n.student_id
  left join public.student_profile sp on sp.user_id = n.student_id
  where n.status in ('pending', 'failed')
    and n.email is not null
    -- Never send after the window shuts: the link would open a closed form, which
    -- reads as being asked for something already taken away.
    and r.closes_at > now()
  order by r.closes_at, n.student_id
  limit greatest(0, coalesce(p_limit, 200)) + 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Record the outcome of a drain — one call for the whole batch.
-- ---------------------------------------------------------------------------
create or replace function public.record_feedback_reminders(p_results jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_count int;
begin
  with r as (
    select (x->>'request_id')::uuid              as request_id,
           (x->>'student_id')::uuid              as student_id,
           coalesce((x->>'ok')::boolean, false)  as ok,
           nullif(x->>'error', '')               as err
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) x
  ),
  upd as (
    update public.feedback_reminder_notification n
    set status        = case when r.ok then 'sent' else 'failed' end,
        email_sent_at = case when r.ok then now() else n.email_sent_at end,
        last_error    = case when r.ok then null else r.err end,
        attempts      = n.attempts + 1
    from r
    where n.request_id = r.request_id and n.student_id = r.student_id
    returning 1
  )
  select count(*)::int into v_count from upd;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Grants. service_role only — these run from the cron route's admin client,
--    never from a browser session. A student must not be able to trigger a mail
--    run, and staff have no reason to.
-- ---------------------------------------------------------------------------
revoke all on function public.enqueue_feedback_reminders(int) from public, anon, authenticated;
revoke all on function public.pending_feedback_reminders(int) from public, anon, authenticated;
revoke all on function public.record_feedback_reminders(jsonb) from public, anon, authenticated;

grant execute on function public.enqueue_feedback_reminders(int)  to service_role;
grant execute on function public.pending_feedback_reminders(int)  to service_role;
grant execute on function public.record_feedback_reminders(jsonb) to service_role;

grant select on public.feedback_reminder_notification to authenticated;

commit;
