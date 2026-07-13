-- ============================================================================
-- 096_set_college_admin.sql
-- Directly grant/revoke a scoped College Admin role for an existing user (spec
-- 2026-07-13 multi-invite, item #3) — powers the "College Admin access" section
-- of the Manage-member dialog. Gated on role.assign (mirrors set_member_roles).
-- The user must already be provisioned (have an app_user row). Idempotent.
-- ============================================================================

create or replace function public.set_college_admin(
  p_user_id uuid,
  p_college_id uuid,
  p_grant boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if not public.has_permission('role.assign') then
    raise exception 'Forbidden: missing role.assign';
  end if;

  select id into v_role_id from public.role where key = 'college_admin';
  if v_role_id is null then raise exception 'college_admin role not found'; end if;

  if not exists (select 1 from public.college where id = p_college_id) then
    raise exception 'College not found';
  end if;

  if p_grant then
    if not exists (select 1 from public.app_user where id = p_user_id) then
      raise exception 'User is not provisioned yet — invite them first';
    end if;
    insert into public.user_role (user_id, role_id, scope_college_id)
    values (p_user_id, v_role_id, p_college_id)
    on conflict do nothing;
  else
    delete from public.user_role
    where user_id = p_user_id and role_id = v_role_id and scope_college_id = p_college_id;
  end if;
end;
$$;

grant execute on function public.set_college_admin(uuid, uuid, boolean) to authenticated;
