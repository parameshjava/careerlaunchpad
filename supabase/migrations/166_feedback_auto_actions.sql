-- ============================================================================
-- 166_feedback_auto_actions.sql
-- Auto-propose an action item when a chapter's feedback trips a threshold
-- (issue #84 §V10: "auto-propose an action when a threshold trips, so triage
-- doesn't depend on someone remembering to look").
--
-- WHAT WAS MISSING
--   159 computed the trip flags and displayed them; every action item still had to
--   be typed by a human who first noticed the flag. The success metric — "≥90% of
--   trips converted to an action within 7 days" — was therefore measuring staff
--   memory, not the system.
--
-- WHAT A PROPOSAL IS, AND IS NOT
--   It is a real row in feedback_action_item with status 'open', no owner, and
--   auto_source='trip'. It is NOT a separate "suggestions" table: a proposal nobody
--   can act on in the same list as everything else gets ignored, and staff already
--   have the vocabulary to drop an item (status 'dropped') if it isn't worth doing.
--   The auto_source column is what keeps "the system noticed" distinguishable from
--   "a person committed to this" — the triage inbox counts those separately, so an
--   unclaimed proposal never reads as work in progress.
--
-- CONSERVATIVE BY CONSTRUCTION
--   • One proposal per request, ever (partial unique index), so a re-run cannot
--     stack duplicates.
--   • Nothing is proposed for a request that ALREADY has any action item — if a
--     human filed something, the machine has nothing to add.
--   • Only windows that closed in the last 30 days, so switching this on does not
--     back-fill a year of history into today's queue.
-- ============================================================================

begin;

-- ============================================================================
-- 1) Provenance column: which trip produced this row, if any.
-- ============================================================================
alter table public.feedback_action_item
  add column if not exists auto_source text
    check (auto_source is null or auto_source in ('trip'));

comment on column public.feedback_action_item.auto_source is
  'Non-null ⇒ proposed by propose_feedback_actions(), not typed by staff. Cleared '
  'never; ownership/status are what change as a human takes it on.';

-- At most one proposal per feedback window. The index is the guard, not the query:
-- two concurrent cron runs would otherwise both see "no item yet".
create unique index if not exists feedback_action_item_auto_request_idx
  on public.feedback_action_item (request_id)
  where auto_source is not null;

-- ============================================================================
-- 2) The proposer. Runs from cron (no auth.uid()), so created_by/owner stay null —
--    an unowned item is exactly what "nobody has picked this up" means.
-- ============================================================================
create or replace function public.propose_feedback_actions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batches uuid[];
  v_n int;
begin
  -- Candidate windows: lapsed, recent, and with nothing filed against them. The
  -- lapsed test is `closes_at <= now()` rather than the stored status, so this is
  -- correct whether or not close_expired_feedback_requests() has run yet — which is
  -- also why the two cron jobs below need no ordering between them.
  select coalesce(array_agg(distinct r.batch_id), '{}') into v_batches
  from public.chapter_feedback_request r
  where (r.status = 'closed' or r.closes_at <= now())
    and r.closes_at > now() - interval '30 days'
    and not exists (
      select 1 from public.feedback_action_item ai where ai.request_id = r.id
    );

  if v_batches = '{}' then return 0; end if;

  insert into public.feedback_action_item
    (batch_id, subject_id, chapter_id, request_id, dimension_key,
     title, detail, priority, due_on, auto_source)
  select
    o.batch_id, o.subject_id, o.chapter_id, o.request_id,
    -- The weakest-scoring item, so the row carries the dimension that earned it.
    worst.dimension_key,
    'Review feedback: ' || coalesce(o.chapter_name, 'chapter'),
    'Proposed automatically because ' || reasons.txt || '. '
      || o.response_count || ' of ' || o.eligible_count || ' students responded'
      || case when o.response_pct is not null then ' (' || o.response_pct || '%)' else '' end
      || '. Open the batch''s Feedback tab for the individual responses.',
    -- A rating of 1-2 or a sub-3.0 mean is a different urgency from a remark.
    case when o.trips && array['low_rating', 'low_mean'] then 'high' else 'normal' end,
    (current_date + 7),   -- the §6 metric is "converted within 7 days"
    'trip'
  from public._feedback_overview_rows(v_batches) o
  -- Re-applied per request: v_batches is a batch filter, and one batch can hold both
  -- a fresh window and a lapsed one with nothing filed.
  join public.chapter_feedback_request r on r.id = o.request_id
  left join lateral (
    select e.key as dimension_key
    from jsonb_each(coalesce(o.item_scores, '{}'::jsonb)) as e(key, value)
    where e.value->>'mean' is not null
    order by (e.value->>'mean')::numeric asc
    limit 1
  ) worst on true
  cross join lateral (
    select string_agg(l.txt, ', ') as txt
    from (
      select case u.t
               when 'low_rating'  then 'a student rated teaching or content 1-2'
               when 'low_mean'    then 'an item averaged below 3.0'
               when 'has_remark'  then 'a student wrote a remark'
               when 'low_turnout' then 'fewer than 40% responded'
             end as txt
      from unnest(o.trips) as u(t)
    ) l
  ) reasons
  where cardinality(o.trips) > 0
    and reasons.txt is not null
    and (r.status = 'closed' or r.closes_at <= now())
    and r.closes_at > now() - interval '30 days'
    and not exists (
      select 1 from public.feedback_action_item ai where ai.request_id = o.request_id
    )
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.propose_feedback_actions() from public;
revoke all on function public.propose_feedback_actions() from anon, authenticated;

-- ============================================================================
-- 3) Its own job alongside 164's expiry sweep. Two jobs rather than one two-
--    statement command: independent jobs are independently visible in cron.job_run_
--    details, so a failing proposer can't be mistaken for a failing expiry sweep.
--    They need no ordering — the proposer tests closes_at, not the stored status.
-- ============================================================================
do $$
begin
  perform cron.unschedule('cl-propose-feedback-actions');
exception when others then
  null;
end $$;

select cron.schedule(
  'cl-propose-feedback-actions',
  '*/5 * * * *',
  $cron$ select public.propose_feedback_actions(); $cron$
);

-- ============================================================================
-- 4) Supersedes 165 §3. Adds open_claimed_count so the inbox can tell "the system
--    noticed" from "a person is on it" — without it, auto-proposals would make
--    every tripped chapter look attended to the moment cron ran.
-- ============================================================================
drop function if exists public.feedback_triage_overview(boolean, int);
create or replace function public.feedback_triage_overview(
  p_only_trips boolean default true,
  p_limit int default 200
)
returns table (
  request_id     uuid,
  batch_id       uuid,
  batch_name     text,
  subject_id     uuid,
  subject_name   text,
  chapter_id     uuid,
  chapter_name   text,
  opened_at      timestamptz,
  closes_at      timestamptz,
  is_open        boolean,
  eligible_count int,
  response_count int,
  response_pct   numeric,
  low_confidence boolean,
  group_scores   jsonb,
  item_scores    jsonb,
  remark_count   int,
  flagged_count  int,
  trips          text[],
  quiz_attempted int,
  quiz_pass_pct  numeric,
  mentor_note    text,
  mentor_snapshot text[],
  open_action_count int,
  open_claimed_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_batches uuid[];
  v_global  boolean;
  v_limit   int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  v_global := public.has_permission('feedback.view.identified')
           or public.has_permission('batch.progress.manage');

  -- Authorize on the GRANT, not on the result. A college admin whose colleges run
  -- no batches yet must get an empty inbox, not a 403 — and someone with no grant
  -- at all must get the 403 even though both produce zero rows.
  if not v_global and not exists (
    select 1 from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.permission p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.key in ('*', 'feedback.view.identified')
  ) then
    raise exception 'Forbidden';
  end if;

  if v_global then
    select coalesce(array_agg(b.id), '{}') into v_batches from public.batch b;
  else
    select coalesce(array_agg(distinct bcol.batch_id), '{}') into v_batches
    from public.batch_college bcol
    where public.has_college_permission('feedback.view.identified', bcol.college_id);
  end if;

  if v_batches = '{}' then return; end if;

  return query
  select o.request_id, o.batch_id, o.batch_name, o.subject_id, o.subject_name,
         o.chapter_id, o.chapter_name, o.opened_at, o.closes_at, o.is_open,
         o.eligible_count, o.response_count, o.response_pct, o.low_confidence,
         o.group_scores, o.item_scores, o.remark_count, o.flagged_count, o.trips,
         o.quiz_attempted, o.quiz_pass_pct, o.mentor_note, o.mentor_snapshot,
         coalesce(act.n, 0)::int, coalesce(act.claimed, 0)::int
  from public._feedback_overview_rows(v_batches) o
  left join lateral (
    select count(*) as n,
           -- Claimed = a human is demonstrably involved: they typed it, they own it,
           -- or they moved it to in_progress. An untouched proposal is not progress.
           count(*) filter (
             where ai.auto_source is null
                or ai.owner_user_id is not null
                or ai.status = 'in_progress'
           ) as claimed
    from public.feedback_action_item ai
    where ai.request_id = o.request_id and ai.status in ('open', 'in_progress')
  ) act on true
  where not p_only_trips or cardinality(o.trips) > 0
  -- Unclaimed first, then worst: a proposal nobody has picked up is the queue.
  order by (coalesce(act.claimed, 0) = 0) desc,
           cardinality(o.trips) desc,
           ('low_rating' = any(o.trips)) desc,
           o.closes_at asc
  limit v_limit;
end $$;

grant execute on function public.feedback_triage_overview(boolean, int) to authenticated;

commit;
