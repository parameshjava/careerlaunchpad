-- ============================================================================
-- 157_exam_result_notifications.sql
-- Issue #77 — email every student when a sitting's results are published.
--
-- "Results published" means exactly one thing in this schema:
-- exam_session.results_published flipping to true. Chapter quizzes grade
-- instantly and have no publish step, so they are not involved.
--
-- THREE PIECES
--   1) exam_result_notification — the queue AND the audit trail. One row per
--      (sitting, student), so re-publishing after an unpublish can never
--      double-send, and a delivery failure survives as a retryable fact
--      instead of vanishing into a server log. Modelled on the shipped
--      batch_session_invite (migration 134).
--   2) exam_result_digest() — everything the email needs, per student, in one
--      round trip. Its arithmetic deliberately MIRRORS student-result.tsx: an
--      email that grades differently from the page it links to is the one bug
--      worth engineering against.
--   3) enqueue / record functions — the only way rows are written. The table
--      has a SELECT policy and no write policy, so nothing can mark a row
--      'sent' except these SECURITY DEFINER functions.
--
-- WHO IS ELIGIBLE
--   A finalized attempt (submitted / graded / aborted) with a non-null score.
--   Students with no attempt row are excluded on purpose: get_exam_result
--   raises 'No attempt found' for them, so the email's only call to action
--   would land them on an error screen.
--
-- WHY marks COMES FROM sum(awarded_marks) AND NOT exam_attempt.score
--   They are equal by construction — _grade_attempts (migration 115) sets
--   score = sum(awarded_marks). Summing here keeps this function computing the
--   same expression the result page computes, so the two cannot drift apart if
--   scoring ever changes. Rank uses the same summed value for the same reason.
--
-- WHAT 'interrupted' MEANS
--   abort_count > 0 — the exam monitor cut the attempt short at least once.
--   Every finalized attempt ends up status='graded' (a normal submit grades via
--   the same path), so the status column cannot distinguish a completed attempt
--   from an interrupted one; abort_count can. A student who simply ran out of
--   time without submitting is NOT flagged — nothing was taken from them.
--
-- Read paths are stable + SECURITY DEFINER, guarded by the same four-way rule
-- as exam_session_progress (migration 152).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The queue / audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.exam_result_notification (
  session_id    uuid not null references public.exam_session(id) on delete cascade,
  student_id    uuid not null references public.app_user(id) on delete cascade,
  -- Snapshotted at enqueue time so the audit row records where we actually sent.
  email         text,
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'skipped')),
  email_sent_at timestamptz,
  last_error    text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  primary key (session_id, student_id)
);

-- The drain's only query: "what still needs sending for this sitting".
create index if not exists exam_result_notification_status_idx
  on public.exam_result_notification (session_id, status);

alter table public.exam_result_notification enable row level security;

-- Staff read it (the console shows the counts). There is deliberately NO write
-- policy: every mutation goes through the definer functions below.
drop policy if exists exam_result_notification_read on public.exam_result_notification;
create policy exam_result_notification_read on public.exam_result_notification
  for select to authenticated
  using (
    public.is_exam_admin()
    or public.has_college_permission('exam.assign', public.exam_session_college(session_id))
    or public.has_college_permission('exam.results.view_all', public.exam_session_college(session_id))
    or public.is_exam_staff_for_session(session_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Shared guard — same rule as exam_session_progress (migration 152).
--    Internal: no grant, so it is reachable only from the definer functions
--    below (which execute as the owner).
-- ---------------------------------------------------------------------------
create or replace function public._can_notify_exam_results(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_exam_admin()
      or public.has_college_permission('exam.assign', public.exam_session_college(p_session_id))
      or public.has_college_permission('exam.results.view_all', public.exam_session_college(p_session_id))
      or public.is_exam_staff_for_session(p_session_id);
$$;
revoke all on function public._can_notify_exam_results(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Enqueue. Idempotent, and the no-double-send guarantee lives in its
--    ON CONFLICT clause: a 'sent' row is never revisited.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_exam_result_notifications(p_session_id uuid)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_published boolean; v_queued int;
begin
  if not public._can_notify_exam_results(p_session_id) then
    raise exception 'Forbidden';
  end if;

  select results_published into v_published
  from public.exam_session where id = p_session_id;
  if not coalesce(v_published, false) then
    raise exception 'Results are not published for this sitting';
  end if;

  insert into public.exam_result_notification as n
    (session_id, student_id, email, status, last_error)
  select
    p_session_id,
    a.student_id,
    lower(u.email),
    case when u.email is null then 'skipped' else 'pending' end,
    case when u.email is null then 'No email address on the student account' end
  from public.exam_attempt a
  left join public.app_user u on u.id = a.student_id
  where a.session_id = p_session_id
    and a.status in ('submitted', 'graded', 'aborted')
    and a.score is not null
  on conflict (session_id, student_id) do update
    set email = excluded.email,
        -- 'sent' and 'failed' keep their state ('failed' is retried by the
        -- drain anyway). 'skipped' heals into 'pending' once an address exists,
        -- so fixing a missing email and pressing Resend actually delivers.
        status = case
                   when n.status = 'skipped' and excluded.email is not null then 'pending'
                   else n.status
                 end,
        last_error = case
                       when n.status = 'skipped' and excluded.email is not null then null
                       else n.last_error
                     end;

  select count(*)::int into v_queued
  from public.exam_result_notification
  where session_id = p_session_id and status in ('pending', 'failed');

  return v_queued;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The digest — one row per student, everything the email renders.
--    p_student_ids narrows the PAYLOAD only; rank, out_of and the college
--    average are always computed over the whole sitting, which is why the
--    filter is applied after the window functions rather than in `att`.
-- ---------------------------------------------------------------------------
create or replace function public.exam_result_digest(
  p_session_id uuid, p_student_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public._can_notify_exam_results(p_session_id) then
    raise exception 'Forbidden';
  end if;

  with att as (
    select a.id, a.student_id, a.abort_count
    from public.exam_attempt a
    where a.session_id = p_session_id
      and a.status in ('submitted', 'graded', 'aborted')
      and a.score is not null
  ),
  -- Per (student, section): the same four figures the result page derives from
  -- its question list. max_marks sums the SECTION's marks_per_question over the
  -- questions actually in the attempt, exactly as the page's maxFromQuestions does.
  per_section as (
    select a.student_id,
           aq.section_id,
           count(*)::int                                                   as questions,
           count(*) filter (where coalesce(aq.awarded_marks, 0) > 0)::int   as correct,
           count(*) filter (
             where array_length(aq.selected_option_ids, 1) is not null)::int as answered,
           coalesce(sum(aq.awarded_marks), 0)                              as awarded,
           coalesce(sum(sec.marks_per_question), 0)                        as max_marks
    from att a
    join public.exam_attempt_question aq on aq.attempt_id = a.id
    left join public.exam_section sec    on sec.id = aq.section_id
    group by a.student_id, aq.section_id
  ),
  -- Sections are rolled up to SUBJECTS, because one subject can span several
  -- sections — the same aggregation fetchSubjectMarksByStudent performs.
  per_subject as (
    select ps.student_id,
           coalesce(sj.name, 'Questions') as subject,
           min(sec.position)              as position,
           sum(ps.awarded)                as got,
           sum(ps.max_marks)              as max_marks
    from per_section ps
    join public.exam_section sec on sec.id = ps.section_id
    left join public.subject sj  on sj.id = sec.subject_id
    group by ps.student_id, coalesce(sj.name, 'Questions')
  ),
  totals as (
    select ps.student_id,
           sum(ps.questions)::int as questions,
           sum(ps.correct)::int   as correct,
           sum(ps.answered)::int  as answered,
           sum(ps.awarded)        as marks,
           sum(ps.max_marks)      as max_marks
    from per_section ps
    group by ps.student_id
  ),
  -- rank() gives standard competition ranking (1, 2, 2, 4) — the identical rule
  -- the printed results sheet applies, so the two can never disagree.
  ranked as (
    select t.student_id,
           (rank() over (order by t.marks desc))::int as rank,
           (count(*) over ())::int                    as out_of,
           round(avg(t.marks) over (), 2)             as college_average
    from totals t
  )
  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id',                s.id,
        'label',             s.label,
        'exam_title',        e.title,
        'college_name',      co.name,
        'results_published', s.results_published,
        -- The blueprint total, used only as a fallback when an attempt somehow
        -- carries no per-question marks.
        'blueprint_total', (
          select coalesce(sum(es.num_questions * es.marks_per_question), 0)
          from public.exam_section es where es.exam_id = e.id))
      from public.exam_session s
      join public.exam e          on e.id = s.exam_id
      left join public.college co on co.id = s.college_id
      where s.id = p_session_id),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id',      t.student_id,
        'full_name',       sp.full_name,
        'roll_number',     sp.roll_number,
        'email',           lower(u.email),
        'marks',           t.marks,
        'max_marks',       t.max_marks,
        'correct',         t.correct,
        'questions',       t.questions,
        'answered',        t.answered,
        'interrupted',     coalesce(a.abort_count, 0) > 0,
        'rank',            r.rank,
        'out_of',          r.out_of,
        'college_average', r.college_average,
        'sections', coalesce((
          select jsonb_agg(
                   jsonb_build_object('name', x.subject, 'got', x.got, 'max', x.max_marks)
                   order by x.position, x.subject)
          from per_subject x where x.student_id = t.student_id), '[]'::jsonb))
        order by t.marks desc, sp.full_name)
      from totals t
      join att a                        on a.student_id = t.student_id
      join ranked r                     on r.student_id = t.student_id
      left join public.app_user u       on u.id = t.student_id
      left join public.student_profile sp on sp.user_id = t.student_id
      where p_student_ids is null or t.student_id = any(p_student_ids)
    ), '[]'::jsonb))
  into v;

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. What still needs sending. The worker could read the table directly under
--     the SELECT policy above, but going through a definer function means
--     delivery does not depend on a brand-new RLS path being right for every
--     staff role — and the per-run cap is applied in SQL, where it belongs.
--     p_limit + 1 rows are returned so the caller can tell there is more.
-- ---------------------------------------------------------------------------
create or replace function public.pending_exam_result_notifications(
  p_session_id uuid, p_limit int default 200)
returns table (student_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._can_notify_exam_results(p_session_id) then
    raise exception 'Forbidden';
  end if;

  return query
  select n.student_id, n.email
  from public.exam_result_notification n
  where n.session_id = p_session_id
    and n.status in ('pending', 'failed')
  order by n.student_id
  limit greatest(0, coalesce(p_limit, 200)) + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Record the outcome of a drain — one call for the whole batch, so a
--    300-student sitting is one round trip and not 300.
-- ---------------------------------------------------------------------------
create or replace function public.record_exam_result_notifications(
  p_session_id uuid, p_results jsonb)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_count int;
begin
  if not public._can_notify_exam_results(p_session_id) then
    raise exception 'Forbidden';
  end if;

  with r as (
    select (x->>'student_id')::uuid              as student_id,
           coalesce((x->>'ok')::boolean, false)  as ok,
           nullif(x->>'error', '')               as err
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) x
  ),
  upd as (
    update public.exam_result_notification n
    set status        = case when r.ok then 'sent' else 'failed' end,
        email_sent_at = case when r.ok then now() else n.email_sent_at end,
        last_error    = case when r.ok then null else r.err end,
        attempts      = n.attempts + 1
    from r
    where n.session_id = p_session_id and n.student_id = r.student_id
    returning 1
  )
  select count(*)::int into v_count from upd;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Counts for the session console.
-- ---------------------------------------------------------------------------
create or replace function public.exam_result_notification_summary(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public._can_notify_exam_results(p_session_id) then
    raise exception 'Forbidden';
  end if;

  select jsonb_build_object(
    'total',   count(*)::int,
    'pending', count(*) filter (where status = 'pending')::int,
    'sent',    count(*) filter (where status = 'sent')::int,
    'failed',  count(*) filter (where status = 'failed')::int,
    'skipped', count(*) filter (where status = 'skipped')::int,
    'last_sent_at', max(email_sent_at))
  into v
  from public.exam_result_notification
  where session_id = p_session_id;

  return v;
end;
$$;

grant execute on function public.enqueue_exam_result_notifications(uuid)          to authenticated;
grant execute on function public.pending_exam_result_notifications(uuid, int)     to authenticated;
grant execute on function public.exam_result_digest(uuid, uuid[])                 to authenticated;
grant execute on function public.record_exam_result_notifications(uuid, jsonb)    to authenticated;
grant execute on function public.exam_result_notification_summary(uuid)           to authenticated;

commit;
