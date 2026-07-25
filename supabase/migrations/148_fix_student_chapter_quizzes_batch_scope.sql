-- ============================================================================
-- 148_fix_student_chapter_quizzes_batch_scope.sql
-- Redeploys student_chapter_quizzes with the correct PER-BATCH scoping.
--
-- Symptom: a student enrolled in several batches of the same course (e.g. ICET +
-- MAT, or two ICET batches) saw a chapter's assessment as available under a batch
-- where it was NOT completed — because the deployed function returned every
-- completed chapter across all the student's batches, attributing them to whatever
-- batch id was passed. Assessments must be tightly coupled to the batch: a chapter
-- completed in Batch A unlocks its quiz for Batch A only, never Batch B.
--
-- Root cause: an earlier build of student_chapter_quizzes filtered enrollment by
-- p_batch_id but not the batch_chapter ROWS themselves. The fix (add
-- `bc.batch_id = p_batch_id`) shipped as a `create or replace` inside migration 143,
-- so a DB that had already applied 143 never picked it up. This standalone forward
-- migration guarantees the corrected function is deployed.
--
-- Also swaps max(qa.id) (uuid) for an array_agg expression — min/max aggregates on
-- uuid aren't universally available and this is version-safe. Idempotent.
-- ============================================================================

begin;

create or replace function public.student_chapter_quizzes(p_batch_id uuid)
returns table (
  chapter_id         uuid,
  chapter_name       text,
  subject_id         uuid,
  subject_name       text,
  attempts_used      int,
  attempts_remaining int,
  best_pct           numeric,
  best_passed        boolean,
  question_count     bigint,
  available          boolean,
  resume_attempt_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select bc.chapter_id, bc.chapter_name, bc.subject_id, bs.subject_name,
         coalesce(a.used, 0)::int,
         greatest(0, 3 - coalesce(a.used, 0))::int,
         a.best_pct, a.best_passed,
         coalesce(qc.qcount, 0),
         (bc.status = 'completed' and coalesce(qc.qcount, 0) > 0),
         a.resume_attempt_id
  from public.batch_chapter bc
  join public.batch_subject bs
        on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
  left join lateral (
    -- Only SUBMITTED attempts count toward the cap; surface any in-progress one to resume.
    select count(*) filter (where qa.status = 'submitted') as used,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2))
             filter (where qa.status = 'submitted') as best_pct,
           bool_or(qa.passed) filter (where qa.status = 'submitted') as best_passed,
           (array_agg(qa.id) filter (where qa.status = 'in_progress'))[1] as resume_attempt_id
    from public.chapter_quiz_attempt qa
    where qa.batch_id = bc.batch_id and qa.chapter_id = bc.chapter_id
      and qa.student_id = auth.uid()
  ) a on true
  left join lateral (
    select count(*) as qcount
    from public.assessment_question q
    where q.chapter_id = bc.chapter_id and q.status = 'active'
  ) qc on true
  where bc.batch_id = p_batch_id          -- the fix: rows scoped to THIS batch
    and bc.status = 'completed'
    and exists (
      select 1 from public.student_enrollment e
      where e.batch_id = p_batch_id and e.student_id = auth.uid()
        and e.status in ('pending', 'active', 'completed')
    )
  order by bs.subject_name, bc.sort_order;
$$;

grant execute on function public.student_chapter_quizzes(uuid) to authenticated;

commit;
