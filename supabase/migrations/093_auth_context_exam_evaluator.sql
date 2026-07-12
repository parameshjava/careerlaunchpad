-- ============================================================================
-- 093_auth_context_exam_evaluator.sql
-- Perf: fold the per-request `exam_staff` lookup into auth_context() so a
-- protected page fetches its full RBAC context in ONE round-trip instead of
-- two. Previously lib/auth.ts ran a separate `select from exam_staff` after the
-- auth_context() RPC purely to light up the "Exam evaluation" nav item.
--
-- `exam_evaluator` = the caller is assigned as staff on at least one exam.
-- SECURITY DEFINER bypasses RLS, so the auth.uid() filter is what scopes it to
-- the caller's own rows (mirrors the exam_staff_self_read policy, migration 024).
-- Uses the existing exam_staff_user_idx index on (user_id). Idempotent.
-- ============================================================================

create or replace function public.auth_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null
      or not exists (select 1 from public.app_user where id = auth.uid() and status <> 'deleted')
    then jsonb_build_object('provisioned', false)
    else jsonb_build_object(
      'provisioned',  true,
      'email',        (select email from public.app_user where id = auth.uid()),
      'name',         (select full_name from public.app_user where id = auth.uid()),
      'phone',        (select phone from public.app_user where id = auth.uid()),
      'status',       (select status from public.app_user where id = auth.uid()),
      'employer_id',  (select employer_id from public.app_user where id = auth.uid()),
      'exam_evaluator', exists(
        select 1 from public.exam_staff where user_id = auth.uid()),
      'roles', coalesce((
        select jsonb_agg(distinct r.key)
        from public.user_role ur join public.role r on r.id = ur.role_id
        where ur.user_id = auth.uid()), '[]'::jsonb),
      'permissions', coalesce((
        select jsonb_agg(distinct p.key)
        from public.user_role ur
        join public.role_permission rp on rp.role_id = ur.role_id
        join public.permission p on p.id = rp.permission_id
        where ur.user_id = auth.uid()), '[]'::jsonb),
      'college_scopes', coalesce((
        select jsonb_agg(distinct ur.scope_college_id)
        from public.user_role ur
        where ur.user_id = auth.uid() and ur.scope_college_id is not null), '[]'::jsonb)
    )
  end;
$$;
