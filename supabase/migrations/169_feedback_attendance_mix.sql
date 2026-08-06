-- ============================================================================
-- 169_feedback_attendance_mix.sql
-- Report the attendance screener beside the scores on the trainer's board
-- (issue #84 §G1).
--
-- WHY
--   159 added the screening item — "how much of this chapter did you attend?" —
--   precisely because no attendance model exists, so a student who never came can
--   still rate the teaching. It asks the question, requires an answer, and shows it
--   per response to STAFF. The trainer, who is the person the scores are about,
--   never sees it at all: mentor_chapter_feedback() returns aggregates only, and
--   attendance was not one of them.
--
--   That makes a clarity score of 2.4 unreadable in the one place it matters. "2.4,
--   and four of the six respondents attended some or none of it" is a different
--   finding from "2.4, everyone was there" — the first is a scheduling problem, the
--   second is a teaching one, and §G4's whole argument is that the system must not
--   blur those.
--
-- SCOPE
--   Only the mentor read needs SQL. The staff panel already loads every response
--   (request_feedback_responses returns `attended` per row), so its mix is computed
--   on data it has — no second definition of the same number in the database. The
--   triage inbox is a queue, not an analysis screen, and stays as it is.
--
--   The mix is withheld while the window is open, exactly like the scores (O-5):
--   the point of that rule is that a trainer should not be watching a live number,
--   and attendance is no different.
-- ============================================================================

begin;

-- Supersedes 159 §7f. Restated in full (return type gains a column, so this is a
-- drop + create); identical in every other respect, including the guarantee that no
-- shape of this function can return a per-student row.
drop function if exists public.mentor_chapter_feedback();
create or replace function public.mentor_chapter_feedback()
returns table (
  request_id      uuid,
  batch_id        uuid,
  batch_name      text,
  subject_id      uuid,
  subject_name    text,
  chapter_id      uuid,
  chapter_name    text,
  opened_at       timestamptz,
  closes_at       timestamptz,
  is_open         boolean,
  eligible_count  int,
  response_count  int,
  low_confidence  boolean,
  group_scores    jsonb,
  item_scores     jsonb,
  remarks         text[],
  quiz_attempted  int,
  quiz_pass_pct   numeric,
  mentor_note     text,
  attended_mix    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.*, b.name as batch_name, bs.subject_name, bc.chapter_name,
           (r.status = 'open' and r.closes_at > now()) as open_now
    from public.chapter_feedback_request r
    join public.batch_subject_mentor m
      on m.batch_id = r.batch_id and m.subject_id = r.subject_id and m.mentor_id = auth.uid()
    join public.batch b on b.id = r.batch_id
    join public.batch_subject bs on bs.batch_id = r.batch_id and bs.subject_id = r.subject_id
    left join public.batch_chapter bc
           on bc.batch_id = r.batch_id and bc.subject_id = r.subject_id
          and bc.chapter_id = r.chapter_id
  )
  select mine.id, mine.batch_id, mine.batch_name, mine.subject_id, mine.subject_name,
         mine.chapter_id, mine.chapter_name, mine.opened_at, mine.closes_at, mine.open_now,
         mine.eligible_count,
         coalesce(rc.n, 0)::int,
         (coalesce(rc.n, 0) < 5),
         case when mine.open_now then null else grp.scores end,
         case when mine.open_now then null else itm.scores end,
         case when mine.open_now then null else rm.remarks end,
         coalesce(qz.attempted, 0)::int,
         qz.pass_pct,
         mine.mentor_note,
         case when mine.open_now then null else att.mix end
  from mine
  left join lateral (
    select count(*) as n from public.chapter_feedback_response resp
    where resp.request_id = mine.id
  ) rc on true
  -- Top-2-box per group: ratings of 4-5 over non-N/A ratings. Percentage AND raw
  -- counts, because "79%" without "11 of 14" is the number that misleads.
  left join lateral (
    select jsonb_object_agg(g.item_group, jsonb_build_object(
             'top2', g.top2, 'rated', g.rated,
             'pct', case when g.rated > 0 then round(100.0 * g.top2 / g.rated, 0) end,
             'mean', case when g.rated > 0 then round(g.total::numeric / g.rated, 2) end)) as scores
    from (
      select i.item_group,
             count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             coalesce(sum(a.rating), 0) as total
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = mine.id and i.response_type = 'rating5'
      group by i.item_group
    ) g
  ) grp on true
  left join lateral (
    select jsonb_object_agg(s.dimension_key, jsonb_build_object(
             'prompt', s.prompt, 'group', s.item_group,
             'rated', s.rated, 'top2', s.top2,
             'pct', case when s.rated > 0 then round(100.0 * s.top2 / s.rated, 0) end,
             'mean', case when s.rated > 0 then round(s.total::numeric / s.rated, 2) end,
             'dist', s.dist)) as scores
    from (
      select i.dimension_key, i.prompt, i.item_group,
             count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             coalesce(sum(a.rating), 0) as total,
             jsonb_build_object(
               '1', count(*) filter (where a.rating = 1),
               '2', count(*) filter (where a.rating = 2),
               '3', count(*) filter (where a.rating = 3),
               '4', count(*) filter (where a.rating = 4),
               '5', count(*) filter (where a.rating = 5)) as dist
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = mine.id and i.response_type = 'rating5'
      group by i.dimension_key, i.prompt, i.item_group
    ) s
  ) itm on true
  -- Remarks in RANDOM order with no timestamps. With names already gone, order of
  -- submission is the remaining re-identification vector in a small batch.
  left join lateral (
    select array_agg(resp.remark order by random()) as remarks
    from public.chapter_feedback_response resp
    where resp.request_id = mine.id
      and resp.moderation = 'ok' and resp.remark is not null
  ) rm on true
  -- The learning half (§G6): what the chapter's quiz actually says. A rating read
  -- without this cannot separate "enjoyed it" from "learned it".
  left join lateral (
    select count(distinct qa.student_id) as attempted,
           case when count(distinct qa.student_id) > 0
                then round(100.0 * count(distinct qa.student_id) filter (where qa.passed)
                           / count(distinct qa.student_id), 0) end as pass_pct
    from public.chapter_quiz_attempt qa
    where qa.batch_id = mine.batch_id and qa.chapter_id = mine.chapter_id
      and qa.status = 'submitted'
  ) qz on true
  -- Attendance mix (§G1). Counts only, no percentages: with 4 buckets over a handful
  -- of responses, "50% attended some" is a more confident-sounding claim than the
  -- data can support. The four keys are always present so the UI never has to guess
  -- whether a zero means "nobody" or "not asked".
  left join lateral (
    select jsonb_build_object(
             'all',  count(*) filter (where a.choice = 'all'),
             'most', count(*) filter (where a.choice = 'most'),
             'some', count(*) filter (where a.choice = 'some'),
             'none', count(*) filter (where a.choice = 'none')) as mix
    from public.chapter_feedback_response resp
    join public.chapter_feedback_answer a on a.response_id = resp.id
    join public.feedback_form_item i on i.id = a.item_id
    where resp.request_id = mine.id and i.dimension_key = 'attended'
  ) att on true
  order by mine.opened_at desc;
$$;

grant execute on function public.mentor_chapter_feedback() to authenticated;

commit;
