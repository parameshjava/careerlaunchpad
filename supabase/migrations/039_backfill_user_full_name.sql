-- ============================================================================
-- 039_backfill_user_full_name.sql
-- The Platform-users grid reads app_user.full_name, but that column (added in
-- 036) was never populated for platform users: handle_new_user() only copied the
-- social-login name into student_profile for STUDENTS. The name actually lives in
-- auth.users.raw_user_meta_data ('full_name' / 'name').
--
-- This (1) backfills app_user.full_name from auth metadata (falling back to a
-- mentor's profile name), and (2) updates handle_new_user() to persist the name
-- on every future sign-in. A name the user later sets on /account is preserved
-- (coalesce keeps the existing value). Idempotent.
-- ============================================================================

-- (1) Backfill existing rows that have no name yet.
update public.app_user au
set full_name = sub.name
from (
  select u.id,
         coalesce(
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(btrim(mp.full_name), '')
         ) as name
  from auth.users u
  left join public.mentor_profile mp on mp.user_id = u.id
) sub
where au.id = sub.id
  and sub.name is not null
  and (au.full_name is null or btrim(au.full_name) = '');

-- (2) Persist the social-login name into app_user on provisioning going forward.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  inv_role_key text;
begin
  select * into inv
  from public.invite
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  select key into inv_role_key from public.role where id = inv.role_id;

  -- Provision the platform account, capturing the social-login name. An existing
  -- name (e.g. set later on /account) is kept.
  insert into public.app_user (id, email, employer_id, full_name)
  values (
    new.id, new.email, inv.employer_id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
    set employer_id = excluded.employer_id,
        full_name   = coalesce(app_user.full_name, excluded.full_name);

  insert into public.user_role (user_id, role_id, scope_college_id)
  values (
    new.id,
    inv.role_id,
    case when inv_role_key = 'college_admin' then inv.scope_college_id else null end
  )
  on conflict do nothing;

  if inv_role_key = 'student' then
    insert into public.student_profile (user_id, college_id, full_name)
    values (new.id, inv.scope_college_id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
    on conflict (user_id) do nothing;
  end if;

  update public.invite
  set status = 'consumed', consumed_at = now()
  where id = inv.id;

  return new;
end;
$$;
