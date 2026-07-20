-- ============================================================================
-- 119_resume_cap_three.sql
-- Raise the resume budget to 3 total: student self-resumes ONCE (resume_count
-- 0→1, in start_exam_attempt — unchanged), then an admin may resume up to TWICE
-- more (resume_count 1→2, 2→3). The 4th abort finalizes (grades). Previously the
-- cap was 2 total (1 self + 1 admin), which finalized on the 3rd abort and left
-- admins unable to grant a second chance.
--
-- Re-defines abort_exam_attempt (finalize threshold 2→3) and resume_exam_attempt
-- (cap 2→3, keeping the college-admin auth from 117 and the closed-sitting guard
-- from 115). New migration because 115/117 are already applied.
--
-- Cap value (3) is mirrored in the roster Resume button
-- (session-detail-client.tsx: resumeCount < 3). Keep them in sync.
-- Idempotent.
-- ============================================================================

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

  if v_attempt.resume_count >= 3 then
    -- Budget spent (1 self + 2 admin resumes used): count this final abort, grade.
    update public.exam_attempt set abort_count = abort_count + 1 where id = p_attempt_id;
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

create or replace function public.resume_exam_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attempt record;
begin
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  -- Authorized = platform admin / assigned exam staff, OR a college admin holding
  -- exam.assign for this sitting's college (matches the API route + roster button).
  if not (
       public.is_exam_staff_for_session(v_attempt.session_id)
       or public.has_college_permission('exam.assign', public.exam_session_college(v_attempt.session_id))
     ) then raise exception 'Forbidden'; end if;
  if v_attempt.status <> 'aborted' then raise exception 'This attempt is not awaiting resume'; end if;
  -- Never resume into a closed/graded sitting (the student can't re-enter).
  if exists (select 1 from public.exam_session
             where id = v_attempt.session_id and status in ('closed','graded')) then
    raise exception 'This sitting is closed — resume is no longer possible.';
  end if;

  -- Atomic cap enforcement (total resumes < 3): the guard is in the UPDATE's WHERE
  -- so two concurrent resume calls can't both push past the cap.
  update public.exam_attempt
    set status = 'in_progress', resume_count = resume_count + 1
    where id = p_attempt_id and status = 'aborted' and resume_count < 3
    returning * into v_attempt;
  if not found then raise exception 'Resume limit reached for this attempt'; end if;
  return jsonb_build_object('resume_count', v_attempt.resume_count);
end;
$$;
grant execute on function public.resume_exam_attempt(uuid) to authenticated;
