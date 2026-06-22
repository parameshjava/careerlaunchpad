-- ============================================================================
-- 20260622000003_auth_helpers.sql
-- Authorization helpers (spec §3, §3.1 scoping note). Used by RLS policies and
-- app code. SECURITY DEFINER so they can read RBAC tables regardless of the
-- caller's own RLS, while only ever answering for the *current* user.
-- ============================================================================

-- The current platform user id (= auth.users.id).
create or replace function public.current_app_user()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- True if the current user has `perm` via any of their roles, or holds '*'.
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.permission p       on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and (p.key = perm or p.key = '*')
  );
$$;

-- True if the current user has `perm` scoped to `college` (or holds '*').
-- Enforces the §3.1 rule: College-Admin grants are resource-scoped, not global.
create or replace function public.has_college_permission(perm text, college uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.permission p       on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and (
        p.key = '*'
        or (p.key = perm and ur.scope_college_id = college)
      )
  );
$$;

grant execute on function public.current_app_user()                to authenticated;
grant execute on function public.has_permission(text)              to authenticated;
grant execute on function public.has_college_permission(text,uuid) to authenticated;
