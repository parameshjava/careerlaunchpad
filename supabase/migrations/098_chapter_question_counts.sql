-- ============================================================================
-- 098_chapter_question_counts.sql
-- One RPC for active-question counts per (subject, chapter, difficulty). Used by
-- BOTH:
--   • Subjects & Chapters page — "VH n · H n · M n · E n" per chapter.
--   • Blueprint feasibility check — count availability WITHOUT the caller needing
--     bank-read rights (the question bank is admin-only, migration 024, so a
--     non-admin blueprint builder would otherwise read zero → false "has 0").
-- Cross-joins every chapter × difficulty and LEFT JOINs questions, so empty
-- chapters/cells appear with n = 0 (the even-spread planner must see them).
-- SECURITY DEFINER (counts only, non-sensitive); gated to exam staff, which
-- covers subject/question managers and blueprint builders alike.
-- ============================================================================

create or replace function public.chapter_question_counts(p_subject_ids uuid[])
returns table (subject_id uuid, chapter_id uuid, difficulty text, n bigint)
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
    select c.subject_id, c.id, d.difficulty, count(q.id)::bigint
    from public.chapter c
    cross join (values ('easy'), ('medium'), ('hard'), ('very_hard')) as d(difficulty)
    left join public.question q
      on q.chapter_id = c.id and q.difficulty = d.difficulty and q.status = 'active'
    where c.subject_id = any (p_subject_ids)
    group by c.subject_id, c.id, d.difficulty;
end;
$$;

grant execute on function public.chapter_question_counts(uuid[]) to authenticated;
