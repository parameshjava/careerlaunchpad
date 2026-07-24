-- ============================================================================
-- 142_hard_delete_member.sql
-- PERMANENT purge of a platform member — for cleaning up wrong records. Distinct
-- from soft_delete_member (migration 038), which only sets status='deleted' and
-- is reversible. This physically removes the account and everything keyed to it.
--
-- How the cascade works: app_user.id references auth.users(id) ON DELETE CASCADE
-- (migration 001), and the profile/role/notification tables reference
-- app_user(id) ON DELETE CASCADE (user_role, mentor_profile, student_profile,
-- notification_email, impersonation_log, …). So deleting the one auth.users row
-- tears down the whole tree in a single statement. The member's invite rows are
-- also removed so their email is left completely clean and re-invitable.
--
-- Guardrails are identical to soft_delete_member: needs user.manage; never
-- yourself; only an owner may delete an owner/admin; never the last owner.
--
-- Some tables reference app_user(id) WITHOUT cascade (invite.invited_by,
-- *.created_by, fees student_id ON DELETE RESTRICT). If the target authored any
-- such record the delete raises foreign_key_violation; we translate that into an
-- actionable message telling the admin to Suspend/Remove instead. Idempotent.
-- ============================================================================
create or replace function public.hard_delete_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner    boolean;
  target_rank smallint;
  v_email     text;
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

  select email into v_email from auth.users where id = p_user_id;

  begin
    -- Removing the auth row cascades to app_user and all ON DELETE CASCADE
    -- children. The app_user delete is a fallback for the (rare) case of an
    -- app_user with no matching auth.users row.
    delete from auth.users where id = p_user_id;
    delete from public.app_user where id = p_user_id;
  exception when foreign_key_violation then
    raise exception 'Cannot permanently delete this member because other records still reference them (invites they sent, content they created, or fee entries). Suspend or Remove them instead.';
  end;

  -- Leave the email fully clean so it can be re-invited without stale rows.
  if v_email is not null then
    delete from public.invite where lower(email) = lower(v_email);
  end if;
end;
$$;

grant execute on function public.hard_delete_member(uuid) to authenticated;

-- ---- RLS: allow hard-deleting an invite row (clean up wrong invites) ---------
-- invite had only read/create/update policies (migration 009); with no DELETE
-- policy a physical delete was silently blocked by RLS. Gate it on user.invite
-- (same permission that creates them), so revoke stays for the soft path and
-- delete is available for cleanup.
drop policy if exists invite_delete on public.invite;
create policy invite_delete on public.invite
  for delete to authenticated
  using (public.has_permission('user.invite'));
