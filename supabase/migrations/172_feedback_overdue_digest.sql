-- ============================================================================
-- 172_feedback_overdue_digest.sql
-- Chase overdue action items by email, once a week, to the person who owns them
-- (issue #84 §V11 "an aging view", phasing v2 "overdue action digest to staff").
--
-- WHY IT IS NEEDED
--   An action item's due date does nothing on its own. Everything built so far shows
--   overdue counts to whoever OPENS a screen, which makes closing the loop depend on
--   someone choosing to look — the same failure the auto-proposer (166) fixed on the
--   detection side. §6 targets 80% of actions closed with a resolution note within 30
--   days; nothing was pushing toward that.
--
-- DEDUP IS BY WEEK, NOT BY ROW  (this is the difference from 168)
--   The student reminder is one-per-window-ever, so its queue row IS the record. A
--   digest recurs, so the record has to be "this person, this week": one row in
--   feedback_digest_log per (owner, ISO week). That makes the job idempotent under a
--   DAILY cron — the first run of the week sends, the rest find the row and skip — so
--   a failed Monday is covered by Tuesday instead of losing a week.
--
-- OWNER ONLY  (owner decision)
--   Each person is chased about their own items and nobody else's. Unowned items —
--   including auto-proposals nobody has taken on — are therefore NOT emailed to
--   anyone; they are visible in /dashboard/feedback, where the "Nobody on it" counter
--   is built for exactly that. Escalating unowned work to admins is a real gap, and
--   the honest place to record it is here rather than in a mailbox nobody asked for.
-- ============================================================================

begin;

create table if not exists public.feedback_digest_log (
  user_id    uuid not null references public.app_user(id) on delete cascade,
  -- Monday of the week the digest went out, in UTC. The primary key IS the
  -- once-a-week rule.
  week_start date not null,
  sent_at    timestamptz not null default now(),
  item_count int not null default 0,
  primary key (user_id, week_start)
);

alter table public.feedback_digest_log enable row level security;

-- Readable by the people who manage actions (it answers "was I actually chased?").
-- No write policy: the definer functions below are the only writers.
drop policy if exists feedback_digest_log_read on public.feedback_digest_log;
create policy feedback_digest_log_read on public.feedback_digest_log
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('feedback.action.manage'));

grant select on public.feedback_digest_log to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Who needs chasing this week, and with what. One row per owner, items inlined,
--    so a 30-person staff is one round trip.
-- ---------------------------------------------------------------------------
create or replace function public.pending_overdue_action_digests()
returns table (
  user_id    uuid,
  email      text,
  full_name  text,
  items      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with overdue as (
    select ai.owner_user_id as uid, ai.id, ai.title, ai.due_on, ai.priority,
           ai.status, b.name as batch_name
    from public.feedback_action_item ai
    join public.batch b on b.id = ai.batch_id
    where ai.owner_user_id is not null
      and ai.status in ('open', 'in_progress')
      and ai.due_on is not null
      and ai.due_on < current_date
  )
  select u.id, lower(u.email), coalesce(u.full_name, u.email),
         jsonb_agg(jsonb_build_object(
           'id', o.id, 'title', o.title, 'due_on', o.due_on,
           'priority', o.priority, 'status', o.status, 'batch_name', o.batch_name)
         order by o.due_on)
  from overdue o
  join public.app_user u on u.id = o.uid
  where u.email is not null
    and u.status = 'active'
    -- Not already chased this week.
    and not exists (
      select 1 from public.feedback_digest_log l
      where l.user_id = u.id
        and l.week_start = (date_trunc('week', current_date at time zone 'UTC'))::date
    )
  group by u.id, u.email, u.full_name;
$$;

-- ---------------------------------------------------------------------------
-- 2. Record what went out. Only successes are logged — a failed send must be
--    retried tomorrow, not treated as this week's digest.
-- ---------------------------------------------------------------------------
create or replace function public.record_overdue_action_digests(p_results jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_count int;
begin
  with r as (
    select (x->>'user_id')::uuid                  as user_id,
           coalesce((x->>'ok')::boolean, false)   as ok,
           coalesce((x->>'item_count')::int, 0)   as item_count
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) x
  ),
  ins as (
    insert into public.feedback_digest_log (user_id, week_start, item_count)
    select r.user_id, (date_trunc('week', current_date at time zone 'UTC'))::date, r.item_count
    from r where r.ok
    on conflict (user_id, week_start) do nothing
    returning 1
  )
  select count(*)::int into v_count from ins;
  return v_count;
end $$;

revoke all on function public.pending_overdue_action_digests() from public, anon, authenticated;
revoke all on function public.record_overdue_action_digests(jsonb) from public, anon, authenticated;
grant execute on function public.pending_overdue_action_digests()  to service_role;
grant execute on function public.record_overdue_action_digests(jsonb) to service_role;

commit;
