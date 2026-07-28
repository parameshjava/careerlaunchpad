-- Persist "Mark for review" to the attempt so the admin's live monitoring board
-- (issue #78) can show, per student per section, how many questions were
-- attempted / flagged for review / answered correctly — in real time while the
-- sitting is running. Until now the review flag lived only in the student's
-- localStorage, so it never reached the server.
--
-- Correctness and "attempted" are already derivable live from
-- exam_attempt_question.selected_option_ids (written by save_exam_answer) joined
-- to question_option.is_correct — no new storage needed for those. This migration
-- adds only the missing review flag + its writer RPC.

-- 1) Storage: one boolean per attempt-question. Defaults false so start_exam_attempt
--    (which pre-creates the rows) needs no change, and re-running is idempotent.
alter table public.exam_attempt_question
  add column if not exists marked_for_review boolean not null default false;

-- 2) Writer RPC — mirrors save_exam_answer's guards (own, in-progress, within the
--    time window). Fire-and-forget from the runner when the student toggles the
--    flag; SECURITY DEFINER so a student can update only their own row via this
--    narrow path (the table itself stays admin-read / RPC-write, like answers).
create or replace function public.save_exam_review_flag(
  p_attempt_id uuid, p_question_id uuid, p_marked boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); v record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select a.student_id, a.status, a.started_at, e.duration_minutes, s.closes_at into v
  from public.exam_attempt a
  join public.exam_session s on s.id = a.session_id
  join public.exam e on e.id = s.exam_id
  where a.id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if v.student_id <> uid then raise exception 'Not your attempt'; end if;
  if v.status <> 'in_progress' then raise exception 'This attempt is no longer open'; end if;
  -- +1 min grace, matching save_exam_answer (migration 102) so a last-second
  -- toggle during the auto-submit flush still persists.
  if now() > v.started_at + make_interval(mins => v.duration_minutes) + interval '1 minute'
     or (v.closes_at is not null and now() > v.closes_at + interval '1 minute') then
    raise exception 'Time is up';
  end if;

  update public.exam_attempt_question set marked_for_review = coalesce(p_marked, false)
    where attempt_id = p_attempt_id and question_id = p_question_id;
end;
$$;

grant execute on function public.save_exam_review_flag(uuid, uuid, boolean) to authenticated;
