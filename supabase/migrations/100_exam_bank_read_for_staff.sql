-- ============================================================================
-- 100_exam_bank_read_for_staff.sql
-- The global question bank (subject/chapter/passage/question/option) was
-- READABLE only by platform admins (is_exam_admin, migration 024). But exam
-- staff — anyone holding an exam-management permission (is_exam_staff: subject/
-- question/blueprint manage, paper.generate, assign, results.view_all) — need to
-- read it to build blueprints, run feasibility, generate papers, and VIEW an
-- exam's paper. That admin-only read is why paper generation/preview kept
-- failing for non-platform-admin builders.
--
-- Relax READ to `is_exam_admin() OR is_exam_staff()`. WRITES stay admin-only
-- (the existing *_all policies gate insert/update/delete on is_exam_admin()).
-- College admins and students hold no exam.* permission, so they're still
-- excluded. Run `supabase db advisors` after applying.
-- ============================================================================

drop policy if exists subject_read on public.subject;
create policy subject_read on public.subject
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());

drop policy if exists chapter_read on public.chapter;
create policy chapter_read on public.chapter
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());

drop policy if exists passage_read on public.passage;
create policy passage_read on public.passage
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());

drop policy if exists question_read on public.question;
create policy question_read on public.question
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());

drop policy if exists question_option_read on public.question_option;
create policy question_option_read on public.question_option
  for select to authenticated using (public.is_exam_admin() or public.is_exam_staff());
