-- ============================================================================
-- 105_student_sessions_difficulty.sql
-- The student print-paper cover reproduces the "Question Paper Pattern" table
-- (section, question range, count, difficulty split), so list_my_exam_sessions
-- (102) gains the per-section difficulty percentages. Otherwise unchanged.
-- Idempotent.
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
             'marks_per_question', sec.marks_per_question,
             'pct_easy',           sec.pct_easy,
             'pct_medium',         sec.pct_medium,
             'pct_hard',           sec.pct_hard,
             'pct_very_hard',      sec.pct_very_hard
           ) order by sec.position), '[]'::jsonb)                         as sections
    from public.exam_section sec
    join public.subject subj on subj.id = sec.subject_id
    where sec.exam_id = e.id
  ) p
  where public.is_student_of_college(s.college_id);
$$;
grant execute on function public.list_my_exam_sessions() to authenticated;
