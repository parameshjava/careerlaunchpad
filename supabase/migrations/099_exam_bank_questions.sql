-- ============================================================================
-- 099_exam_bank_questions.sql
-- Paper GENERATION must see the same bank the feasibility check does. Feasibility
-- counts via chapter_question_counts (SECURITY DEFINER, migration 098), but
-- generation (lib/exam-generate loadBank) read `question` directly — blocked by
-- the admin-only bank RLS (migration 024) for a non-platform-admin publisher.
-- Result: feasibility passed, then generation threw "need 1, have 0". This RPC
-- returns the question ROWS needed to assemble a paper (id + placement metadata
-- only — NO stem/answer content), SECURITY DEFINER + exam-staff gated, so
-- generation matches feasibility. (Publish itself is still gated on
-- exam.paper.generate at the route.)
-- ============================================================================

create or replace function public.exam_bank_questions(p_subject_ids uuid[])
returns table (
  id uuid,
  subject_id uuid,
  chapter_id uuid,
  difficulty text,
  passage_id uuid,
  version int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_exam_admin() or public.is_exam_staff()) then
    raise exception 'Forbidden';
  end if;

  return query
    select q.id, q.subject_id, q.chapter_id, q.difficulty, q.passage_id, q.version
    from public.question q
    where q.subject_id = any (p_subject_ids) and q.status = 'active';
end;
$$;

grant execute on function public.exam_bank_questions(uuid[]) to authenticated;
