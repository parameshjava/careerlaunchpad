-- ============================================================================
-- 138_course_syllabus.sql
-- Course-level syllabus for the student course-details page. Supersedes the
-- batch-keyed batch_course_syllabus (137): a course's details page now shows the
-- course once with its batches listed underneath, so the syllabus is resolved by
-- COURSE id rather than by a single batch.
--
-- Same rationale as 137/135: the catalog is readable to any authenticated user,
-- but subject/chapter NAMES live in exam-admin-only tables (migration 024), so
-- this SECURITY DEFINER function resolves those names on the caller's behalf. It
-- exposes only subject/chapter titles and is intentionally ungated.
-- ============================================================================

begin;

-- The syllabus a course teaches = the subjects + chapters of its competitive
-- exam(s), resolved to names. One row per (exam, subject, chapter); chapter
-- columns are null for a subject with no chapters selected on the exam.
create or replace function public.course_syllabus(p_course_id uuid)
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
  from public.course_competitive_exam cce
  join public.competitive_exam ce           on ce.id = cce.competitive_exam_id
  join public.competitive_exam_subject ces  on ces.competitive_exam_id = ce.id
  join public.subject s                     on s.id = ces.subject_id
  left join public.competitive_exam_subject_chapter cesc
         on cesc.competitive_exam_id = ce.id and cesc.subject_id = s.id
  left join public.chapter ch               on ch.id = cesc.chapter_id
  where cce.course_id = p_course_id
  order by ce.code, ces.sort_order, s.name, ch.name nulls first;
$$;

grant execute on function public.course_syllabus(uuid) to authenticated;

commit;
