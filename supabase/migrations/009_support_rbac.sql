-- ============================================================================
-- 009_support_rbac.sql
-- Adds the "Support Team" role and the granular permissions it needs, then
-- widens the relevant RLS policies. Roles & permissions are DATA (see 007), so
-- a new role is just INSERTs + policy tweaks — no app code changes required for
-- authorization itself.
--
-- Support = help-desk powers (NOT full user/role/college management):
--   user.view      -> see users and their roles
--   user.suspend   -> suspend / reactivate a user (status only)
--   invite.resend  -> resend or revoke an existing invite (cannot CREATE invites)
-- Owner holds '*', so it automatically satisfies all of these.
-- ============================================================================

-- ---- role --------------------------------------------------------------------
insert into public.role (key, name, description, is_system) values
  ('support', 'Support Team', 'Help-desk staff: view users, suspend/reactivate, resend invites.', true)
on conflict (key) do nothing;

-- ---- permissions -------------------------------------------------------------
insert into public.permission (key, description) values
  ('user.view',     'View users and their role assignments.'),
  ('user.suspend',  'Suspend or reactivate a user (status only).'),
  ('invite.resend', 'Resend or revoke an existing invite (not create).')
on conflict (key) do nothing;

-- ---- support -> permission mappings ------------------------------------------
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on (
  r.key = 'support' and p.key in ('user.view', 'user.suspend', 'invite.resend')
)
on conflict do nothing;

-- ---- RLS: app_user -- allow user.view to read, user.suspend to update --------
drop policy if exists app_user_self_read on public.app_user;
create policy app_user_self_read on public.app_user
  for select to authenticated
  using (
    id = auth.uid()
    or public.has_permission('user.manage')
    or public.has_permission('user.view')
  );

-- Suspend/reactivate without full user.manage. The app only changes `status`;
-- column-scoping is a future refinement.
drop policy if exists app_user_support_suspend on public.app_user;
create policy app_user_support_suspend on public.app_user
  for update to authenticated
  using (public.has_permission('user.suspend'))
  with check (public.has_permission('user.suspend'));

-- ---- RLS: user_role -- allow user.view to read ------------------------------
drop policy if exists user_role_self_read on public.user_role;
create policy user_role_self_read on public.user_role
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('user.manage')
    or public.has_permission('user.view')
  );

-- ---- RLS: invite -- split create (user.invite) from read/resend -------------
-- Replaces the single owner-only invite_manage policy so Support can
-- read + resend/revoke (update) but NOT create new invites.
drop policy if exists invite_manage on public.invite;

create policy invite_read on public.invite
  for select to authenticated
  using (public.has_permission('user.invite') or public.has_permission('invite.resend'));

create policy invite_create on public.invite
  for insert to authenticated
  with check (public.has_permission('user.invite'));

create policy invite_update on public.invite
  for update to authenticated
  using (public.has_permission('user.invite') or public.has_permission('invite.resend'))
  with check (public.has_permission('user.invite') or public.has_permission('invite.resend'));

-- ---- auth_context(): one-call RBAC snapshot for the app ----------------------
-- Returns the current user's provisioning state, roles, permission keys, college
-- scopes and employer. Used by lib/auth.ts for routing + UI gating (the DB is
-- still the real guard via RLS). NULL auth.uid() / no app_user => provisioned=false.
create or replace function public.auth_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null
      or not exists (select 1 from public.app_user where id = auth.uid())
    then jsonb_build_object('provisioned', false)
    else jsonb_build_object(
      'provisioned',  true,
      'email',        (select email from public.app_user where id = auth.uid()),
      'status',       (select status from public.app_user where id = auth.uid()),
      'employer_id',  (select employer_id from public.app_user where id = auth.uid()),
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

grant execute on function public.auth_context() to authenticated;
