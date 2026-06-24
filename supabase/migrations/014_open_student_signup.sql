-- ============================================================================
-- 014_open_student_signup.sql
-- Open self-registration (alongside invites), driven by a "choose your path"
-- screen instead of auto-provisioning.
--
-- Model:
--   * INVITES (admins / employers / college admins / pre-loaded students) keep
--     working exactly as before: handle_new_user() provisions the invited role
--     on first sign-in. This migration re-asserts that invite path unchanged.
--   * A sign-in with NO matching invite is left UNPROVISIONED on purpose, so it
--     lands on /auth/no-access — which is now a "how do you want to get started?"
--     screen (Student now; Mentor & more later). Choosing Student calls the
--     register_as_student() RPC below to provision the account on demand.
--
-- Why an RPC and not RLS inserts: an unprovisioned user has no role, so RLS
-- blocks them from inserting into app_user / user_role / student_profile. This
-- security-definer function is the single, audited gateway for self-registering
-- as a student. It refuses to touch anyone who ALREADY has a role, so an
-- employer/admin can never self-promote.
--
-- Idempotent: re-defines the function/trigger; safe to run more than once.
-- ============================================================================

-- 1) Invite-only provisioning trigger (no-invite => leave unprovisioned).
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

  -- No invite => do nothing. The user signs in but stays unprovisioned and is
  -- routed to the /auth/no-access "get started" screen, where they self-select
  -- a path (Student today) and register_as_student() provisions them.
  if not found then
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

-- 2) On-demand self-registration as a STUDENT. Called from the "get started"
--    screen by a signed-in but unprovisioned user. No-op if they already have a
--    role (so an existing employer/admin can never self-promote to student).
create or replace function public.register_as_student()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  uemail text;
  uname  text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Already provisioned with any role => leave it alone.
  if exists (select 1 from public.user_role where user_id = uid) then
    return;
  end if;

  select email,
         coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
    into uemail, uname
  from auth.users
  where id = uid;

  insert into public.app_user (id, email)
  values (uid, uemail)
  on conflict (id) do nothing;

  insert into public.user_role (user_id, role_id)
  select uid, r.id from public.role r where r.key = 'student'
  on conflict do nothing;

  insert into public.student_profile (user_id, full_name)
  values (uid, uname)
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.register_as_student() to authenticated;
