-- ============================================================================
-- 117_resume_college_admin.sql
-- Fix: a college admin could not resume an aborted attempt. resume_exam_attempt
-- (migration 115) authorized only via is_exam_staff_for_session — i.e.
-- is_exam_admin() (owner/platform_admin) OR an assigned exam_staff row. A plain
-- college_admin holds exam.assign for their college, sees the roster Resume
-- button, and passes the /api/exam/attempts/[id]/resume route's
-- requirePermission("exam.assign") — but the RPC then rejected them with
-- Forbidden. Accept has_college_permission('exam.assign', <sitting college>) too,
-- matching the route and the button. Everything else is identical to the 115
-- version (closed-sitting guard + atomic cap). Idempotent.
--
-- Note: this is a NEW migration rather than an edit to 115 because 115 is already
-- merged and applied; CI does not re-run an applied migration.
-- ============================================================================

create or replace function public.resume_exam_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attempt record;
begin
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  -- Authorized = platform admin / assigned exam staff (is_exam_staff_for_session)
  -- OR a college admin holding exam.assign for this sitting's college.
  if not (
       public.is_exam_staff_for_session(v_attempt.session_id)
       or public.has_college_permission('exam.assign', public.exam_session_college(v_attempt.session_id))
     ) then raise exception 'Forbidden'; end if;
  if v_attempt.status <> 'aborted' then raise exception 'This attempt is not awaiting resume'; end if;
  -- Never resume into a closed/graded sitting: the student can't re-enter
  -- (start_exam_attempt rejects a closed window), so the attempt would strand
  -- in_progress and ungraded in a closed session.
  if exists (select 1 from public.exam_session
             where id = v_attempt.session_id and status in ('closed','graded')) then
    raise exception 'This sitting is closed — resume is no longer possible.';
  end if;

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
