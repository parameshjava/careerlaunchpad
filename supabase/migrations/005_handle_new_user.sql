-- ============================================================================
-- 20260622000005_handle_new_user.sql
-- Invite-gated provisioning (spec §5.1). Fires when Supabase Auth inserts a new
-- auth.users row (first social sign-in). Consumes a matching pending invite and
-- provisions the account. NO matching invite => no app_user/user_role created,
-- so the user has zero permissions and is denied everywhere (invite-only).
-- ============================================================================

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
  -- Find a live invite for this verified email (case-insensitive).
  select * into inv
  from public.invite
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if not found then
    -- No invite: do not provision. (User exists in auth.users but has no
    -- app_user row, so every RLS policy denies them.)
    return new;
  end if;

  select key into inv_role_key from public.role where id = inv.role_id;

  -- Provision the platform account.
  insert into public.app_user (id, email, employer_id)
  values (new.id, new.email, inv.employer_id)
  on conflict (id) do update set employer_id = excluded.employer_id;

  -- Assign the invited role. scope_college_id is the AUTHORIZATION scope and is
  -- meaningful only for College Admins; a student's college lives solely on
  -- student_profile.college_id (single source of truth), so leave it NULL here.
  insert into public.user_role (user_id, role_id, scope_college_id)
  values (
    new.id,
    inv.role_id,
    case when inv_role_key = 'college_admin' then inv.scope_college_id else null end
  )
  on conflict do nothing;

  -- Students get a stub profile pre-linked to their college.
  if inv_role_key = 'student' then
    insert into public.student_profile (user_id, college_id, full_name)
    values (new.id, inv.scope_college_id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
    on conflict (user_id) do nothing;
  end if;

  -- Mark the invite consumed.
  update public.invite
  set status = 'consumed', consumed_at = now()
  where id = inv.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
