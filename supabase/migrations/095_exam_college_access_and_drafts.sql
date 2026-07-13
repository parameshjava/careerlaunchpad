-- ============================================================================
-- 094_exam_college_access_and_drafts.sql
-- Exam-creation wizard (spec docs/superpowers/specs/2026-07-13-exam-creation-
-- wizard-design.md). Three changes:
--   1. exam.draft_step — remember which wizard step a draft is on (resume).
--   2. College-based access — REPLACE the per-exam exam_staff gate on the
--      conduct tables with: any staff (is_exam_staff, broad) can read; students
--      of the session's college can SEE the session (D1/D3). Paper contents stay
--      staff/admin-only (students never read exam_paper directly — the start RPC
--      delivers questions at open-time, so the paper can't be pre-fetched).
--   3. Time-window open — students start when now ∈ [opens_at, closes_at],
--      regardless of session.status (D2), and their roster row is created
--      lazily on start (D1). Paper GENERATION stays central (D4) — unchanged.
-- Idempotent. NOTE: run `supabase db advisors` + the spec's AC4/AC5 checks after
-- applying (this migration widens who can read exams).
-- ============================================================================

-- 1) Draft-step for wizard resume ---------------------------------------------
alter table public.exam add column if not exists draft_step smallint not null default 1;

-- 2) Helper: is the caller a student whose profile college matches? -----------
-- student_profile.college_id is the single source of truth for a student's
-- college (migration 005). SECURITY DEFINER + auth.uid() filter scope it safely.
create or replace function public.is_student_of_college(p_college uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_profile
    where user_id = auth.uid() and college_id = p_college
  );
$$;
grant execute on function public.is_student_of_college(uuid) to authenticated;

-- 3) exam_session — admin manages; ANY staff reads; students of the college see
drop policy if exists exam_session_admin_manage on public.exam_session;
drop policy if exists exam_session_read         on public.exam_session;
create policy exam_session_admin_manage on public.exam_session
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_session_read on public.exam_session
  for select to authenticated using (
    public.is_exam_admin()
    or public.has_college_permission('exam.results.view_all', college_id)
    or public.is_exam_staff()                    -- D3: every staff, not per-exam
    or public.is_student_of_college(college_id)  -- D1: college students see it
  );

-- 4) exam_session_student — admin/assign manage; ANY staff read; student self.
--    (Roster rows are created lazily by start_exam_attempt below.)
drop policy if exists exam_session_student_staff_read on public.exam_session_student;
create policy exam_session_student_staff_read on public.exam_session_student
  for select to authenticated using (public.is_exam_staff());

-- 5) exam_paper / _question — admin + ANY staff ONLY (never students directly).
drop policy if exists exam_paper_staff_read on public.exam_paper;
create policy exam_paper_staff_read on public.exam_paper
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());
drop policy if exists exam_paper_question_staff_read on public.exam_paper_question;
create policy exam_paper_question_staff_read on public.exam_paper_question
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());

-- 6) exam_attempt / _question — admin + college results + ANY staff + own.
drop policy if exists exam_attempt_read on public.exam_attempt;
create policy exam_attempt_read on public.exam_attempt
  for select to authenticated using (
    public.is_exam_admin()
    or public.is_exam_staff()
    or student_id = auth.uid()
    or public.has_college_permission('exam.results.view_all', public.exam_session_college(session_id)));

drop policy if exists exam_attempt_question_read on public.exam_attempt_question;
create policy exam_attempt_question_read on public.exam_attempt_question
  for select to authenticated using (
    public.is_exam_admin()
    or public.is_exam_staff()
    or exists (select 1 from public.exam_attempt a
               where a.id = exam_attempt_question.attempt_id and a.student_id = auth.uid())
    or public.has_college_permission('exam.results.view_all', public.exam_attempt_college(attempt_id)));

-- 7) start_exam_attempt — gate on the TIME WINDOW (not status), auto-enrol the
--    caller (lazy roster), students of the session's college only. (D1/D2)
create or replace function public.start_exam_attempt(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_session record; v_paper_id uuid; v_attempt record; v_duration int; v_ends_at timestamptz;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into v_session from public.exam_session where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  -- Any student of the session's college may take it (no pre-enrolment).
  if not public.is_student_of_college(v_session.college_id) then
    raise exception 'This exam is not available to you';
  end if;

  -- Openness is purely time-based (auto-open at opens_at).
  if v_session.opens_at is null or now() < v_session.opens_at then
    raise exception 'This exam has not opened yet';
  end if;
  if v_session.closes_at is not null and now() > v_session.closes_at then
    raise exception 'This exam has closed';
  end if;

  select id into v_paper_id from public.exam_paper where session_id = p_session_id limit 1;
  if v_paper_id is null then raise exception 'No paper has been generated for this exam'; end if;

  select duration_minutes into v_duration from public.exam where id = v_session.exam_id;

  -- Lazily create the roster row on first start.
  insert into public.exam_session_student (session_id, student_id, status)
  values (p_session_id, uid, 'started')
  on conflict (session_id, student_id) do nothing;

  select * into v_attempt from public.exam_attempt
    where session_id = p_session_id and student_id = uid;
  if found then
    if v_attempt.status <> 'in_progress' then raise exception 'You have already submitted this exam'; end if;
  else
    insert into public.exam_attempt (session_id, student_id, status)
    values (p_session_id, uid, 'in_progress') returning * into v_attempt;
    insert into public.exam_attempt_question
      (attempt_id, question_id, question_version, section_id, position)
    select v_attempt.id, pq.question_id, pq.question_version, pq.section_id, pq.position
    from public.exam_paper_question pq where pq.paper_id = v_paper_id;
    update public.exam_session_student set status = 'started'
      where session_id = p_session_id and student_id = uid and status = 'invited';
  end if;

  v_ends_at := v_attempt.started_at + make_interval(mins => v_duration);
  if v_session.closes_at is not null and v_session.closes_at < v_ends_at then
    v_ends_at := v_session.closes_at;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'duration_minutes', v_duration,
    'ends_at', v_ends_at,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', aq.position, 'question_id', q.id, 'section_id', aq.section_id,
          'kind', q.kind, 'answer_type', q.answer_type, 'stem', q.stem,
          'stem_image_url', q.stem_image_url,
          'passage', case when q.passage_id is not null then (
              select jsonb_build_object('title', p.title, 'body', p.body)
              from public.passage p where p.id = q.passage_id) else null end,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
            from public.question_option o where o.question_id = q.id), '[]'::jsonb),
          'selected_option_ids', aq.selected_option_ids
        ) order by aq.position)
      from public.exam_attempt_question aq join public.question q on q.id = aq.question_id
      where aq.attempt_id = v_attempt.id
    ), '[]'::jsonb));
end;
$$;
