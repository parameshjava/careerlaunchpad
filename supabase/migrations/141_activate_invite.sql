-- ============================================================================
-- 141_activate_invite.sql
-- Let an Owner/Admin ACTIVATE an invited user immediately, without waiting for
-- the invitee's first sign-in. The server action mints the auth.users row via
-- the admin API; the on_auth_user_created trigger then provisions the account
-- exactly as a real first sign-in would.
--
-- Two fixes bundled so activation is correct end-to-end:
--   1. Factor the invite-consumption body out of handle_new_user() /
--      consume_pending_invites() into ONE helper, _provision_from_invites(),
--      so the three provisioning paths (first sign-in, sign-in re-check, admin
--      activation) never drift.
--   2. RESTORE the staged mentor_profile materialisation that migration 040
--      added and migration 096 (multi-invite rewrite) accidentally dropped —
--      now including teachable_subject_ids (migration 140). Without this an
--      admin-added mentor (or any mentor's normal first sign-in) provisions with
--      NO profile.
--
-- Plus admin_provision_invites(p_user_id) — the same loop keyed by a target
-- user id — so an already-existing auth user (signed in before an invite
-- existed) can also be activated on demand. Idempotent throughout.
-- ============================================================================

-- 1) Shared body: consume every live pending invite for (p_user_id, p_email). --
create or replace function public._provision_from_invites(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.invite%rowtype;
  rk   text;
  meta jsonb;
begin
  if p_user_id is null or p_email is null then return; end if;
  select raw_user_meta_data into meta from auth.users where id = p_user_id;

  for inv in
    select * from public.invite
    where lower(email) = lower(p_email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id, full_name)
    values (
      p_user_id, p_email, inv.employer_id,
      coalesce(inv.staged_profile->>'full_name', meta->>'full_name', meta->>'name')
    )
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id),
          full_name   = coalesce(public.app_user.full_name, excluded.full_name);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (p_user_id, inv.role_id,
            case when rk = 'college_admin' then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (p_user_id, inv.scope_college_id,
              coalesce(meta->>'full_name', meta->>'name'))
      on conflict (user_id) do nothing;
    end if;

    -- Admin-staged mentor profile → materialise it now. Omitted columns fall
    -- back to their table defaults; status stays pending_review (review queue).
    if rk = 'mentor' and inv.staged_profile is not null then
      insert into public.mentor_profile (
        user_id, full_name, phone, linkedin_url, bio,
        college_id, graduation_year, degree, branch,
        current_company, current_title, industry_id, years_experience,
        mentoring_area_ids, skills, teachable_subject_ids, career_goal_ids,
        mentor_mode_id, contribution_type_id, availability,
        registration_status, last_completed_step, registration_submitted_at
      )
      values (
        p_user_id,
        inv.staged_profile->>'full_name',
        inv.staged_profile->>'phone',
        inv.staged_profile->>'linkedin_url',
        inv.staged_profile->>'bio',
        nullif(inv.staged_profile->>'college_id', '')::uuid,
        nullif(inv.staged_profile->>'graduation_year', '')::int,
        inv.staged_profile->>'degree',
        inv.staged_profile->>'branch',
        inv.staged_profile->>'current_company',
        inv.staged_profile->>'current_title',
        nullif(inv.staged_profile->>'industry_id', '')::uuid,
        nullif(inv.staged_profile->>'years_experience', '')::int,
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'mentoring_area_ids') x), '{}'),
        coalesce((select array_agg(x)       from jsonb_array_elements_text(inv.staged_profile->'skills') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'teachable_subject_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'career_goal_ids') x), '{}'),
        nullif(inv.staged_profile->>'mentor_mode_id', '')::uuid,
        nullif(inv.staged_profile->>'contribution_type_id', '')::uuid,
        inv.staged_profile->>'availability',
        'submitted', 3, now()
      )
      on conflict (user_id) do nothing;
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;
end;
$$;

-- 2) Trigger: provision at first sign-in ---------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._provision_from_invites(new.id, new.email);
  return new;  -- no invite → nothing granted → user stays unprovisioned (denied)
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Sign-in-time re-check for the CURRENT user --------------------------------
create or replace function public.consume_pending_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_email text;
begin
  if uid is null then return; end if;
  select email into v_email from auth.users where id = uid;
  perform public._provision_from_invites(uid, v_email);
end;
$$;

grant execute on function public.consume_pending_invites() to authenticated;

-- 4) Admin activation: provision a target user by id (no session required) -----
-- Consumes the target's own pending invites. SECURITY DEFINER; reachable only
-- through the secret-key admin client (revoked from public/authenticated), used
-- to activate an auth user that already existed before its invite was created.
create or replace function public.admin_provision_invites(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = p_user_id;
  perform public._provision_from_invites(p_user_id, v_email);
end;
$$;

revoke execute on function public.admin_provision_invites(uuid) from public;
revoke execute on function public.admin_provision_invites(uuid) from authenticated;
grant  execute on function public.admin_provision_invites(uuid) to service_role;
