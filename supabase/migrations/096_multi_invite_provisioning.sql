-- ============================================================================
-- 095_multi_invite_provisioning.sql
-- Invite provisioning fixes (spec docs/superpowers/specs/2026-07-13-multi-invite-
-- provisioning-design.md):
--   1. handle_new_user() now consumes EVERY live pending invite for the email
--      (was `limit 1`), so one email can be granted all its invited roles.
--   2. New consume_pending_invites() RPC does the same for the CURRENT signed-in
--      user, idempotently — called from the OAuth callback on every sign-in, so
--      an invite created AFTER the account already exists is honored on next
--      sign-in (the trigger only fires at account creation).
-- A caller can only ever consume invites addressed to their own verified email.
-- Idempotent (on conflict do nothing). Run `supabase db advisors` after applying.
-- ============================================================================

-- 1) Trigger: grant/consume ALL pending invites at first sign-in ----------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  rk  text;
begin
  for inv in
    select * from public.invite
    where lower(email) = lower(new.email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id)
    values (new.id, new.email, inv.employer_id)
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (new.id, inv.role_id,
            case when rk = 'college_admin' then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (new.id, inv.scope_college_id,
              coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
      on conflict (user_id) do nothing;
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;

  return new;  -- no invite → nothing granted → user stays unprovisioned (denied)
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Sign-in-time re-check for the CURRENT user --------------------------------
-- Consumes any live pending invites addressed to the caller's own verified email
-- (auth.users.email). Handles invites created after the account already existed.
create or replace function public.consume_pending_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_email text;
  inv public.invite%rowtype;
  rk  text;
begin
  if uid is null then return; end if;
  select email into v_email from auth.users where id = uid;
  if v_email is null then return; end if;

  for inv in
    select * from public.invite
    where lower(email) = lower(v_email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id)
    values (uid, v_email, inv.employer_id)
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (uid, inv.role_id,
            case when rk = 'college_admin' then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (uid, inv.scope_college_id, null)
      on conflict (user_id) do nothing;
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;
end;
$$;

grant execute on function public.consume_pending_invites() to authenticated;
