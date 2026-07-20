-- ============================================================================
-- 115_exam_abort_resume.sql
-- Anti-cheat close becomes recoverable. A second switch-away no longer grades
-- the paper — it marks the attempt `aborted` (locked, no score, answers kept).
-- The student may self-resume ONCE from My exams (resume_count 0 -> 1, via
-- start_exam_attempt); any further resume is admin-only (resume_exam_attempt),
-- capped at 2 total resumes. After 2 resumes the next abort finalizes (grades).
-- Also tracks leave_count (Alt-Tab metric) and abort_count for staff.
-- Idempotent.
-- ============================================================================

-- 1. Columns + status ---------------------------------------------------------
alter table public.exam_attempt add column if not exists leave_count  int not null default 0;
alter table public.exam_attempt add column if not exists abort_count  int not null default 0;
alter table public.exam_attempt add column if not exists resume_count int not null default 0;

alter table public.exam_attempt drop constraint if exists exam_attempt_status_check;
alter table public.exam_attempt add  constraint exam_attempt_status_check
  check (status in ('in_progress','submitted','graded','aborted'));

-- 2. record_exam_leave: count every switch-away (fire-and-forget) -------------
create or replace function public.record_exam_leave(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_attempt record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.student_id <> uid then raise exception 'Not your attempt'; end if;
  if v_attempt.status <> 'in_progress' then return; end if;
  update public.exam_attempt set leave_count = leave_count + 1 where id = p_attempt_id;
end;
$$;
grant execute on function public.record_exam_leave(uuid) to authenticated;

-- 3. abort_exam_attempt: 2nd strike. Recoverable unless resumes are exhausted --
create or replace function public.abort_exam_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_attempt record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.student_id <> uid then raise exception 'Not your attempt'; end if;
  if v_attempt.status <> 'in_progress' then
    -- Already aborted/graded (e.g. concurrent double-fire) — report current state.
    return jsonb_build_object('final', v_attempt.status <> 'aborted', 'resume_count', v_attempt.resume_count);
  end if;

  if v_attempt.resume_count >= 2 then
    -- No resumes left: finalize as a graded submission.
    perform public._grade_attempts(array[p_attempt_id]);
    return jsonb_build_object('final', true, 'resume_count', v_attempt.resume_count);
  end if;

  update public.exam_attempt
    set status = 'aborted', abort_count = abort_count + 1
    where id = p_attempt_id;
  return jsonb_build_object('final', false, 'resume_count', v_attempt.resume_count);
end;
$$;
grant execute on function public.abort_exam_attempt(uuid) to authenticated;

-- 4. resume_exam_attempt: admin-granted resume (staff only) -------------------
create or replace function public.resume_exam_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attempt record;
begin
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if not public.is_exam_staff_for_session(v_attempt.session_id) then raise exception 'Forbidden'; end if;
  if v_attempt.status <> 'aborted' then raise exception 'This attempt is not awaiting resume'; end if;

  -- Atomic cap enforcement: the guard lives in the UPDATE's WHERE so two
  -- concurrent resume calls (e.g. a double-click) can't both push past 2.
  update public.exam_attempt
    set status = 'in_progress', resume_count = resume_count + 1
    where id = p_attempt_id and status = 'aborted' and resume_count < 2
    returning * into v_attempt;
  if not found then raise exception 'Resume limit reached for this attempt'; end if;
  return jsonb_build_object('resume_count', v_attempt.resume_count);
end;
$$;
grant execute on function public.resume_exam_attempt(uuid) to authenticated;

-- 5. start_exam_attempt: fold in first-time self-resume -----------------------
-- Identical to migration 113 except the "attempt already exists" branch, which
-- now allows a self-resume when status='aborted' and resume_count=0.
create or replace function public.start_exam_attempt(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_session record; v_paper_id uuid; v_attempt record; v_duration int; v_ends_at timestamptz;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into v_session from public.exam_session where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_student_of_college(v_session.college_id) then
    raise exception 'This exam is not available to you';
  end if;

  if v_session.opens_at is null or now() < v_session.opens_at - interval '1 minute' then
    raise exception 'This exam has not opened yet';
  end if;
  if v_session.closes_at is not null and now() > v_session.closes_at + interval '1 minute' then
    raise exception 'This exam has closed';
  end if;

  select id into v_paper_id from public.exam_paper where session_id = p_session_id limit 1;
  if v_paper_id is null then raise exception 'No paper has been generated for this exam'; end if;

  select duration_minutes into v_duration from public.exam where id = v_session.exam_id;

  select * into v_attempt from public.exam_attempt
    where session_id = p_session_id and student_id = uid;
  if found then
    if v_attempt.status = 'aborted' then
      if v_attempt.resume_count = 0 then
        -- First-time self-resume: flip back to in_progress and hand it back.
        update public.exam_attempt set status = 'in_progress', resume_count = 1
          where id = v_attempt.id
          returning * into v_attempt;
      else
        raise exception 'This exam was closed and is awaiting review by your administrator.';
      end if;
    elsif v_attempt.status <> 'in_progress' then
      raise exception 'You have already submitted this exam';
    end if;
  else
    if v_session.status in ('closed', 'graded') then raise exception 'This exam is closed'; end if;

    insert into public.exam_session_student (session_id, student_id, status)
    values (p_session_id, uid, 'started')
    on conflict (session_id, student_id) do nothing;

    insert into public.exam_attempt (session_id, student_id, status)
    values (p_session_id, uid, 'in_progress')
    on conflict (session_id, student_id) do nothing
    returning * into v_attempt;

    if not found then
      select * into v_attempt from public.exam_attempt
        where session_id = p_session_id and student_id = uid;
    else
      insert into public.exam_attempt_question
        (attempt_id, question_id, question_version, section_id, position)
      select v_attempt.id, pq.question_id, pq.question_version, pq.section_id, pq.position
      from public.exam_paper_question pq where pq.paper_id = v_paper_id;
      update public.exam_session_student set status = 'started'
        where session_id = p_session_id and student_id = uid and status = 'invited';
    end if;
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

-- 6. grade_session_in_progress: also finalize aborted attempts on close -------
create or replace function public.grade_session_in_progress(p_session_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if not exists (select 1 from public.exam_session where id = p_session_id) then raise exception 'Session not found'; end if;
  if not public.is_exam_staff_for_session(p_session_id) then raise exception 'Forbidden'; end if;
  select array_agg(id) into v_ids from public.exam_attempt
    where session_id = p_session_id and status in ('in_progress','aborted');
  if v_ids is null then return 0; end if;
  perform public._grade_attempts(v_ids);
  return array_length(v_ids, 1);
end;
$$;

-- 7. list_my_exam_sessions: expose attempt_status + resume_count --------------
-- Identical to migration 114 plus two keys.
create or replace function public.list_my_exam_sessions()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id',        s.id,
    'label',             s.label,
    'status',            s.status,
    'opens_at',          s.opens_at,
    'closes_at',         s.closes_at,
    'results_published', s.results_published,
    'roster_status',     coalesce(r.status, 'invited'),
    'exam_title',        e.title,
    'duration_minutes',  e.duration_minutes,
    'negative_mark_per_wrong', e.negative_mark_per_wrong,
    'total_questions',   p.total_questions,
    'total_marks',       p.total_marks,
    'sections',          p.sections,
    'score',             case when s.results_published then a.score else null end,
    'attempt_status',    a.status,
    'resume_count',      coalesce(a.resume_count, 0)
  ) order by s.opens_at asc nulls last, s.created_at asc), '[]'::jsonb)
  from public.exam_session s
  join public.exam e on e.id = s.exam_id
  left join public.exam_session_student r
    on r.session_id = s.id and r.student_id = auth.uid()
  left join public.exam_attempt a
    on a.session_id = s.id and a.student_id = auth.uid()
  cross join lateral (
    select coalesce(sum(sec.num_questions), 0)                            as total_questions,
           coalesce(sum(sec.num_questions * sec.marks_per_question), 0)   as total_marks,
           coalesce(jsonb_agg(jsonb_build_object(
             'subject',            subj.name,
             'num_questions',      sec.num_questions,
             'marks_per_question', sec.marks_per_question
           ) order by sec.position), '[]'::jsonb)                         as sections
    from public.exam_section sec
    join public.subject subj on subj.id = sec.subject_id
    where sec.exam_id = e.id
  ) p
  where public.is_student_of_college(s.college_id)
    and (
      coalesce(r.status, 'invited') in ('started', 'submitted')
      or (s.status not in ('closed', 'graded') and s.opens_at is not null)
    );
$$;
grant execute on function public.list_my_exam_sessions() to authenticated;
