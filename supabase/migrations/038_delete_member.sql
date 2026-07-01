-- ============================================================================
-- 038_delete_member.sql
-- Soft-delete a platform member from the Platform users grid (🗑️). Sets
-- app_user.status='deleted' (auth_context() already treats that as not
-- provisioned, so they're blocked + hidden). Guarded like role assignment:
-- needs user.manage; never yourself; only an owner may delete an owner/admin;
-- never the last owner. Office-email edits use the notification_email table
-- directly (its RLS is user.manage) — no RPC needed for that.
-- Idempotent.
-- ============================================================================
create or replace function public.soft_delete_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner    boolean;
  target_rank smallint;
begin
  if not public.has_permission('user.manage') then
    raise exception 'Forbidden: missing user.manage';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  is_owner := public.has_permission('*');
  select coalesce(max(r.rank), 0) into target_rank
  from public.user_role ur join public.role r on r.id = ur.role_id
  where ur.user_id = p_user_id;

  -- owner(3)/admin(2) can only be deleted by an owner
  if target_rank >= 2 and not is_owner then
    raise exception 'Only an owner can delete an owner or admin';
  end if;

  -- last-owner protection
  if exists (
    select 1 from public.user_role ur join public.role r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.key = 'owner'
  ) and (
    select count(distinct ur.user_id) from public.user_role ur join public.role r on r.id = ur.role_id
    where r.key = 'owner'
  ) <= 1 then
    raise exception 'Cannot delete the last owner';
  end if;

  update public.app_user set status = 'deleted' where id = p_user_id;
end;
$$;

grant execute on function public.soft_delete_member(uuid) to authenticated;
