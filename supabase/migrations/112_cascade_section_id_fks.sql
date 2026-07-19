-- ============================================================================
-- 112_cascade_section_id_fks.sql
-- Deleting an exam cascades to exam_section (via exam_id), but
-- exam_paper_question.section_id and exam_attempt_question.section_id referenced
-- exam_section WITHOUT on delete cascade. Postgres doesn't guarantee it clears
-- those child rows before removing the sections, so tearing an exam down failed
-- with: violates foreign key constraint "exam_paper_question_section_id_fkey".
-- Make both section_id FKs cascade so removing an exam cleanly removes its
-- paper/attempt question rows regardless of cascade order. Idempotent.
-- ============================================================================

alter table public.exam_paper_question
  drop constraint if exists exam_paper_question_section_id_fkey;
alter table public.exam_paper_question
  add constraint exam_paper_question_section_id_fkey
    foreign key (section_id) references public.exam_section(id) on delete cascade;

alter table public.exam_attempt_question
  drop constraint if exists exam_attempt_question_section_id_fkey;
alter table public.exam_attempt_question
  add constraint exam_attempt_question_section_id_fkey
    foreign key (section_id) references public.exam_section(id) on delete cascade;
