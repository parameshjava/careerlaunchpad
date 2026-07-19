-- ============================================================================
-- 110_hide_closed_unattempted_exams.sql
-- Trim the student "My exams" list. Admins create and close sittings freely, so
-- a student's college accumulates many sittings they were never part of. Show a
-- sitting only if it is still relevant to THIS student:
--   • they attempted it (roster_status started/submitted) — keep it, whatever
--     its status, so they can resume or view their result; OR
--   • it is scheduled/open (status not 'closed'/'graded') AND has a start time
--     set (opens_at not null) — a live or upcoming exam they can still take.
-- Hidden (with no attempt): admin-closed/graded sittings, and published-but-
-- unscheduled sittings (opens_at null — nothing for the student to do yet).
-- Only the filter is added; the shape is unchanged. Idempotent.
-- ============================================================================

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
    'sections',          p.sections
  ) order by s.opens_at asc nulls last, s.created_at asc), '[]'::jsonb)
  from public.exam_session s
  join public.exam e on e.id = s.exam_id
  left join public.exam_session_student r
    on r.session_id = s.id and r.student_id = auth.uid()
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
      -- Attempted (in-progress or submitted): always keep — resume / view result.
      coalesce(r.status, 'invited') in ('started', 'submitted')
      -- Or a scheduled/open sitting that has a start time set — a live or upcoming
      -- exam the student can take. Unscheduled (opens_at null) or admin-closed/
      -- graded sittings with no attempt are hidden.
      or (s.status not in ('closed', 'graded') and s.opens_at is not null)
    );
$$;
grant execute on function public.list_my_exam_sessions() to authenticated;
