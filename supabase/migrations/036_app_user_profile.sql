-- ============================================================================
-- 036_app_user_profile.sql
-- Editable self-profile fields on app_user for the /account page (the avatar →
-- Profile flow). Every provisioned user can edit their own display name + phone;
-- name/photo otherwise come from social login. auth_context() now returns the
-- stored name so the app can prefer it over the OAuth name for display.
-- Idempotent.
-- ============================================================================

alter table public.app_user add column if not exists full_name text;
alter table public.app_user add column if not exists phone text;

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

-- Self-edit of ONLY name + phone (never status/roles). SECURITY DEFINER so it
-- works without a broad self-UPDATE RLS policy on app_user (which would also
-- expose status). Writes for the calling user only.
create or replace function public.update_own_profile(p_full_name text, p_phone text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.app_user
  set full_name = nullif(btrim(coalesce(p_full_name, '')), ''),
      phone     = nullif(btrim(coalesce(p_phone, '')), '')
  where id = auth.uid();
$$;

grant execute on function public.update_own_profile(text, text) to authenticated;
