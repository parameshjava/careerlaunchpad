-- ============================================================================
-- 137_student_batch_syllabus.sql
-- Student-facing course details (course description, competitive exams, and the
-- inherited syllabus) for the /student/courses/[batchId] page.
--
-- The catalog (course, competitive_exam, batch, fee lines) is already readable
-- to any authenticated user (migration 125), but the subject/chapter NAMES that
-- make up the syllabus live in `subject`/`chapter`, which RLS locks to exam
-- admins (migration 024). So — exactly as migration 135 does for the finance
-- batch screen — this SECURITY DEFINER function resolves the syllabus names on
-- the caller's behalf. It exposes only subject/chapter titles (never the exam
-- question bank), and is intentionally UNGATED: any signed-in user may read a
-- batch's syllabus, the same visibility the rest of the catalog already has.
-- ============================================================================

begin;

-- The syllabus a batch teaches = the subjects + chapters of its course's
-- competitive exam(s), resolved to names. One row per (exam, subject, chapter);
-- chapter columns are null for a subject with no chapters selected on the exam.
create or replace function public.batch_course_syllabus(p_batch_id uuid)
returns table (
  competitive_exam_id uuid,
  exam_code           text,
  exam_name           text,
  subject_id          uuid,
  subject_name        text,
  subject_sort        int,
  chapter_id          uuid,
  chapter_name        text
)
language sql
stable
security definer
set search_path = public
as $$
  select ce.id, ce.code, ce.name,
         s.id, s.name, ces.sort_order,
         ch.id, ch.name
  from public.batch b
  join public.course_competitive_exam cce  on cce.course_id = b.course_id
  join public.competitive_exam ce           on ce.id = cce.competitive_exam_id
  join public.competitive_exam_subject ces  on ces.competitive_exam_id = ce.id
  join public.subject s                     on s.id = ces.subject_id
  left join public.competitive_exam_subject_chapter cesc
         on cesc.competitive_exam_id = ce.id and cesc.subject_id = s.id
  left join public.chapter ch               on ch.id = cesc.chapter_id
  where b.id = p_batch_id
  order by ce.code, ces.sort_order, s.name, ch.name nulls first;
$$;

grant execute on function public.batch_course_syllabus(uuid) to authenticated;

commit;
