-- ============================================================================
-- 013_promote_platform_admin.sql
-- The seed in 012 provisioned paramesh.mca2006@gmail.com as `support` (help-desk
-- powers only). That role has no analytics permission, so the College Insights
-- dashboard (preview release) is hidden for it. This promotes that account to
-- `platform_admin` ("CareerLaunchpad Admin") — the role that maps to "Admin" in
-- the dashboard spec: it grants analytics.platform.view + student view + user
-- management (migration 011), so the College analytics surface appears.
--
-- Mirrors 012's two-path pattern so it works whether or not the user has signed
-- in yet, and is idempotent (safe to re-run):
--   1) Re-point any pending invite to platform_admin (fresh-env first sign-in).
--   2) If already signed in, grant platform_admin now and drop the support role
--      (the trigger won't re-fire for an existing auth.users row).
-- ============================================================================

do $$
declare
  v_email   text := 'paramesh.mca2006@gmail.com';
  v_admin   uuid;
  v_support uuid;
  v_uid     uuid;
begin
  select id into v_admin   from public.role where key = 'platform_admin';
  select id into v_support from public.role where key = 'support';
  if v_admin is null then
    raise exception 'role platform_admin not found (run migration 011 first)';
  end if;

  -- 1) Fresh environments: ensure the pending invite grants platform_admin.
  update public.invite
    set role_id = v_admin
    where lower(email) = lower(v_email) and status = 'pending';

  -- 2) Already signed in: provision directly (unscoped role -> NULL college).
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is not null then
    insert into public.user_role (user_id, role_id, scope_college_id)
    values (v_uid, v_admin, null)
    on conflict do nothing;

    if v_support is not null then
      delete from public.user_role where user_id = v_uid and role_id = v_support;
    end if;
  end if;
end $$;
