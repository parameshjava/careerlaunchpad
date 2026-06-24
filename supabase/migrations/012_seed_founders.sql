-- ============================================================================
-- 012_seed_founders.sql
-- Bootstrap the FIRST accounts. The platform is invite-only (005_handle_new_user)
-- and the only UI to create invites lives behind an owner login — a chicken/egg
-- for the very first users. This seeds them directly. Idempotent.
--
-- For each seed email it:
--   1) ensures a pending public.invite exists (normal path: provisions on first
--      social sign-in via the on_auth_user_created trigger), AND
--   2) if the user has ALREADY signed in (an auth.users row exists, so the trigger
--      already ran and found no invite), provisions them now — app_user + user_role
--      — and marks the invite consumed. This covers founders who hit
--      "Account not provisioned" before this seed existed.
--
-- Roles are DATA (see 007/009): owner | student | college_admin | employer | support.
-- "Internal employee / admin" maps to `support` (help-desk powers). Change a
-- role_key below to 'owner' to grant a seed full (wildcard) access instead.
-- ============================================================================

do $$
declare
  seed     record;
  v_role_id uuid;
  v_uid     uuid;
begin
  for seed in
    select * from (values
      ('dlnarayana.mca06@gmail.com', 'owner'),    -- Lakshmi Narayana Darisiguntla (Founder)
      ('paramesh.java5@gmail.com',   'owner'),    -- Paramesh Korrakuti (Co-Founder)
      ('paramesh.mca2006@gmail.com', 'support')   -- Paramesh Korrakuti (Employee / Admin)
    ) as t(email, role_key)
  loop
    select id into v_role_id from public.role where key = seed.role_key;
    if v_role_id is null then
      raise exception 'seed role % not found', seed.role_key;
    end if;

    -- 1) Ensure a live invite exists (no-op if one is already pending).
    insert into public.invite (email, role_id, status)
    select seed.email, v_role_id, 'pending'
    where not exists (
      select 1 from public.invite
      where lower(email) = lower(seed.email) and status = 'pending'
    );

    -- 2) If they have already signed in, provision directly (the trigger won't re-fire).
    select id into v_uid from auth.users where lower(email) = lower(seed.email);
    if v_uid is not null then
      insert into public.app_user (id, email)
      values (v_uid, seed.email)
      on conflict (id) do nothing;

      -- Owner/support are unscoped roles -> scope_college_id NULL.
      insert into public.user_role (user_id, role_id, scope_college_id)
      values (v_uid, v_role_id, null)
      on conflict do nothing;

      update public.invite
      set status = 'consumed', consumed_at = now()
      where lower(email) = lower(seed.email) and status = 'pending';
    end if;
  end loop;
end $$;
