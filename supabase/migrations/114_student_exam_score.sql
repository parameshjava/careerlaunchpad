-- ============================================================================
-- 114_student_exam_score.sql
-- Add the student's own score to the "My exams" list so the grid can show it
-- per exam. Only exposed once the sitting's results are published (mirrors the
-- "View result" gate); before that it's null and the UI shows a dash. Everything
-- else is unchanged from 110. Idempotent.
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
    'sections',          p.sections,
    -- The student's obtained score — only after results are published.
    'score',             case when s.results_published then a.score else null end
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
