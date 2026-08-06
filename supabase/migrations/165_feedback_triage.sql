-- ============================================================================
-- 165_feedback_triage.sql
-- Cross-batch feedback triage for staff (issue #84, §4.8 "shows on the staff
-- triage list").
--
-- WHAT WAS MISSING
--   159 computes the trip rules correctly, but only ever inside
--   batch_feedback_overview(one_batch) — so the only way to find a chapter that
--   needs attention was to open every batch's Feedback tab in turn. A coordinator
--   with a dozen live batches will not do that daily, and the trip rules are worth
--   exactly as much as the chance someone looks at them.
--
-- HOW
--   The 100-line aggregate query is lifted OUT of batch_feedback_overview into one
--   internal helper over a set of batch ids. Both callers then share a single
--   definition of "top-2-box", "trip" and "response rate", which is the point: a
--   triage list that disagreed with the batch tab about what tripped would be worse
--   than no triage list. batch_feedback_overview keeps its exact signature and
--   authorization, so the API and lib/feedback-query.ts are untouched.
--
--   _feedback_overview_rows is SECURITY DEFINER with NO permission check of its own
--   and is revoked from authenticated — it is reachable only through the two
--   functions below, each of which authorizes first. That is deliberate: one place
--   computes the numbers, two places decide who may see them.
-- ============================================================================

begin;

-- ============================================================================
-- 1) The shared aggregate. Body is 159 §7h verbatim, generalized from one batch to
--    a set and carrying batch_id / batch_name for the cross-batch caller.
-- ============================================================================
create or replace function public._feedback_overview_rows(p_batch_ids uuid[])
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
  mentor_snapshot text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with reqs as (
    select r.*, b.name as batch_name, bs.subject_name, bc.chapter_name,
           (r.status = 'open' and r.closes_at > now()) as open_now
    from public.chapter_feedback_request r
    join public.batch b on b.id = r.batch_id
    join public.batch_subject bs on bs.batch_id = r.batch_id and bs.subject_id = r.subject_id
    left join public.batch_chapter bc
           on bc.batch_id = r.batch_id and bc.subject_id = r.subject_id
          and bc.chapter_id = r.chapter_id
    where r.batch_id = any(p_batch_ids)
  )
  select reqs.id, reqs.batch_id, reqs.batch_name,
         reqs.subject_id, reqs.subject_name, reqs.chapter_id, reqs.chapter_name,
         reqs.opened_at, reqs.closes_at, reqs.open_now, reqs.eligible_count,
         coalesce(rc.n, 0)::int,
         case when reqs.eligible_count > 0
              then round(100.0 * coalesce(rc.n, 0) / reqs.eligible_count, 0) end,
         (coalesce(rc.n, 0) < 5),
         grp.scores, itm.scores,
         coalesce(rc.remarks, 0)::int,
         coalesce(rc.flagged, 0)::int,
         -- Trip rules (§4.8). Any one of these puts the chapter on the triage list.
         (select coalesce(array_agg(t), '{}') from (
            select 'low_rating'::text as t where rc.low_rating > 0
            union all
            select 'low_mean' where itm.min_mean is not null and itm.min_mean < 3.0
            union all
            select 'has_remark' where coalesce(rc.remarks, 0) > 0
            union all
            select 'low_turnout'
             where not reqs.open_now and reqs.eligible_count > 0
               and (100.0 * coalesce(rc.n, 0) / reqs.eligible_count) < 40
          ) tr),
         coalesce(qz.attempted, 0)::int, qz.pass_pct,
         reqs.mentor_note, reqs.mentor_snapshot
  from reqs
  left join lateral (
    select count(*) as n,
           count(*) filter (where resp.remark is not null) as remarks,
           count(*) filter (where resp.quality_flag is not null) as flagged,
           (select count(*)
              from public.chapter_feedback_response r2
              join public.chapter_feedback_answer a2 on a2.response_id = r2.id
              join public.feedback_form_item i2 on i2.id = a2.item_id
             where r2.request_id = reqs.id and a2.rating between 1 and 2
               and i2.item_group in ('teaching', 'content')) as low_rating
    from public.chapter_feedback_response resp
    where resp.request_id = reqs.id
  ) rc on true
  left join lateral (
    select jsonb_object_agg(g.item_group, jsonb_build_object(
             'top2', g.top2, 'rated', g.rated,
             'pct', case when g.rated > 0 then round(100.0 * g.top2 / g.rated, 0) end,
             'mean', case when g.rated > 0 then round(g.total::numeric / g.rated, 2) end)) as scores
    from (
      select i.item_group, count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             coalesce(sum(a.rating), 0) as total
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = reqs.id and i.response_type = 'rating5'
      group by i.item_group
    ) g
  ) grp on true
  left join lateral (
    select jsonb_object_agg(s.dimension_key, jsonb_build_object(
             'prompt', s.prompt, 'group', s.item_group, 'rated', s.rated, 'top2', s.top2,
             'pct', case when s.rated > 0 then round(100.0 * s.top2 / s.rated, 0) end,
             'mean', s.mean)) as scores,
           min(s.mean) as min_mean
    from (
      select i.dimension_key, i.prompt, i.item_group,
             count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             case when count(a.rating) > 0
                  then round(sum(a.rating)::numeric / count(a.rating), 2) end as mean
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = reqs.id and i.response_type = 'rating5'
      group by i.dimension_key, i.prompt, i.item_group
    ) s
  ) itm on true
  left join lateral (
    select count(distinct qa.student_id) as attempted,
           case when count(distinct qa.student_id) > 0
                then round(100.0 * count(distinct qa.student_id) filter (where qa.passed)
                           / count(distinct qa.student_id), 0) end as pass_pct
    from public.chapter_quiz_attempt qa
    where qa.batch_id = reqs.batch_id and qa.chapter_id = reqs.chapter_id
      and qa.status = 'submitted'
  ) qz on true
  order by reqs.opened_at desc;
$$;

revoke all on function public._feedback_overview_rows(uuid[]) from public;
revoke all on function public._feedback_overview_rows(uuid[]) from anon, authenticated;

-- ============================================================================
-- 2) Supersedes 159 §7h. Same signature, same columns, same authorization —
--    the aggregate now comes from the shared helper instead of an inline copy.
-- ============================================================================
create or replace function public.batch_feedback_overview(p_batch_id uuid)
returns table (
  request_id     uuid,
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
  mentor_snapshot text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_permission('feedback.view.identified')
    or public.has_permission('batch.progress.manage')
    or exists (
      select 1 from public.batch_college bcol
      where bcol.batch_id = p_batch_id
        and public.has_college_permission('feedback.view.identified', bcol.college_id)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select o.request_id, o.subject_id, o.subject_name, o.chapter_id, o.chapter_name,
         o.opened_at, o.closes_at, o.is_open, o.eligible_count, o.response_count,
         o.response_pct, o.low_confidence, o.group_scores, o.item_scores,
         o.remark_count, o.flagged_count, o.trips, o.quiz_attempted, o.quiz_pass_pct,
         o.mentor_note, o.mentor_snapshot
  from public._feedback_overview_rows(array[p_batch_id]) o;
end $$;

-- ============================================================================
-- 3) Every request the caller may triage, across every batch they may see.
--
--    The visible-batch set is resolved ONCE here rather than per row: a global
--    holder of feedback.view.identified (or batch.progress.manage, or '*') sees
--    every batch; a college admin sees only batches linked to a college they hold
--    the permission on. Same rule batch_feedback_overview applies to one batch, so
--    the inbox can never surface a row its own batch tab would refuse.
--
--    p_only_trips defaults true because this screen answers one question — "what
--    needs me today?" — and a chapter that tripped nothing does not. Pass false for
--    the full cross-batch list.
-- ============================================================================
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
  open_action_count int
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
  -- at all must get the 403 even though both produce zero rows. has_college_
  -- permission needs a college id, so the college-scoped grant is checked directly.
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
         coalesce(act.n, 0)::int
  from public._feedback_overview_rows(v_batches) o
  -- How many action items are already open against this request. Without it the
  -- inbox re-nags about a chapter someone is already working on, which is how a
  -- triage list gets ignored.
  left join lateral (
    select count(*) as n
    from public.feedback_action_item ai
    where ai.request_id = o.request_id and ai.status in ('open', 'in_progress')
  ) act on true
  where not p_only_trips or cardinality(o.trips) > 0
  -- Worst first, then oldest window: a chapter with a 1-2 rating and no action yet
  -- outranks one that only has a remark.
  order by (coalesce(act.n, 0) = 0) desc,
           cardinality(o.trips) desc,
           ('low_rating' = any(o.trips)) desc,
           o.closes_at asc
  limit v_limit;
end $$;

grant execute on function public.feedback_triage_overview(boolean, int) to authenticated;

commit;
