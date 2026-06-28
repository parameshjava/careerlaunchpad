-- ============================================================================
-- 027_exam_evaluator_role.sql
-- Blanket evaluator access. Mentors and Employers can view & evaluate ANY exam
-- (answer keys, all results, enter marks) without being assigned per-exam.
--
-- Implemented as a global permission exam.evaluate folded into the existing
-- is_exam_staff_for_exam() check — so every RLS policy and RPC that already gates
-- on is_exam_staff_for_* (papers, attempts, get_exam_answer_key, set_attempt_marks,
-- get_exam_session_results, get_attempt_for_review) grants it automatically.
-- Per-exam exam_staff assignment still works for anyone else.
-- ============================================================================

insert into public.permission (key, description) values
  ('exam.evaluate', 'Evaluate any exam: view answer keys, all results, and enter/adjust marks.')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on (r.key in ('mentor', 'employer') and p.key = 'exam.evaluate')
on conflict do nothing;

-- Anyone who can evaluate a specific exam: admin, holder of the blanket
-- exam.evaluate permission, or explicitly assigned staff for that exam.
create or replace function public.is_exam_staff_for_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_exam_admin()
      or public.has_permission('exam.evaluate')
      or exists (select 1 from public.exam_staff where exam_id = p_exam_id and user_id = auth.uid());
$$;
