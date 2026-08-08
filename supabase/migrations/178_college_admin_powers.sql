-- ============================================================================
-- 178_college_admin_powers.sql
-- Tighten what a college can do to results and papers, and let a College Admin
-- run their own college's people.
--
-- FOUR RULES
--   1. Neither college_admin nor college_staff may PUBLISH RESULTS.
--   2. Neither may DELETE PAPERS.
--   3. college_staff is READ-ONLY, full stop.
--   4. college_admin may INVITE college staff or another college admin (their own
--      college only), and may REMOVE staff — but never another admin.
--
-- WHY PUBLISHING GETS ITS OWN PERMISSION RATHER THAN exam.assign BEING REVOKED
--   Publishing was gated on `exam.assign`, which college_admin holds. But
--   exam.assign also gates creating a sitting, assigning students to it, closing
--   it, resuming an aborted attempt (117) and reading the live monitor — the
--   whole job 021 gave a college admin ("College admins conduct exams
--   per-college"). Revoking it to stop publishing would stop them conducting
--   exams at all, which is not what was asked. So RELEASING RESULTS TO STUDENTS
--   becomes its own permission, `exam.results.publish`, and only the platform
--   holds it.
--
--   Both routes that put results in front of a student are gated on it —
--   publish-results (the visibility flag) and notify-results (the emails).
--   Splitting only the first would leave a college admin able to email results
--   they could not publish, which is the same act by another door.
--
--   exam.blueprint.manage — which DELETE /api/exam/blueprints/:id requires — was
--   already withheld from college_admin by 024, so rule 2 is a UI fix, not a
--   permission change. The deletes below only make that convergent and cover
--   college_staff, which post-dates that migration.
--
-- Idempotent throughout.
-- ============================================================================

begin;

-- ============================================================================
-- 1) Publishing results is a platform act
-- ============================================================================
insert into public.permission (key, description) values
  ('exam.results.publish',
   'Release exam results to students — flip a sitting''s results to visible and send the result emails.')
on conflict (key) do nothing;

-- platform_admin holds every exam.% by 024's rule; owner holds '*'. Nobody else.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on r.key = 'platform_admin' and p.key = 'exam.results.publish'
on conflict do nothing;

-- Converge: a college role must hold neither publishing nor paper management,
-- however it got there (a hand edit, or a re-run of an older seed).
delete from public.role_permission rp
using public.role r, public.permission p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key in ('college_admin', 'college_staff')
  and p.key in ('exam.results.publish', 'exam.blueprint.manage',
                'exam.paper.generate', 'exam.paper.export_pdf',
                'exam.subject.manage', 'exam.question.manage');

-- Rule 3, stated as data: college_staff keeps ONLY the five read permissions 175
-- gave it. Any write permission that ever lands on the role is removed here, so
-- "read-only" is enforced by the seed rather than by remembering.
delete from public.role_permission rp
using public.role r, public.permission p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key = 'college_staff'
  and p.key not in (
    'college.students.view', 'college.analytics.view', 'exam.results.view_all',
    'feedback.view.identified', 'college.batch.progress.view'
  );

-- ============================================================================
-- 2) A College Admin invites into their own college — staff OR another admin
-- ============================================================================
-- Supersedes invite_college_staff (175 §10b), which hard-coded college_staff.
-- The role is now a parameter but still an ALLOWLIST of exactly two: the reason
-- a College Admin never gets `user.invite` is that createInvite trusts the role
-- in the request body, so this function must never widen past the two roles that
-- are scoped to one college.
create or replace function public.invite_college_member(
  p_email    text,
  p_college  uuid,
  p_role     text default 'college_staff',
  p_profile  jsonb default '{}'::jsonb,
  p_ttl_days int default 14
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_role_id uuid;
  v_id      uuid;
begin
  if p_role not in ('college_staff', 'college_admin') then
    raise exception 'You can only invite college staff or a college admin';
  end if;
  if not (public.has_global_permission('college.staff.invite')
          or public.has_college_permission('college.staff.invite', p_college)) then
    raise exception 'Forbidden: you cannot invite people for this college';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' then
    raise exception 'A valid email is required';
  end if;
  if p_college is null or not exists (select 1 from public.college where id = p_college) then
    raise exception 'College not found';
  end if;

  select id into v_role_id from public.role where key = p_role;
  if v_role_id is null then raise exception '% role not found', p_role; end if;

  if exists (select 1 from public.app_user where lower(email) = v_email and status <> 'deleted') then
    raise exception 'That email already has an account. Ask a platform admin to grant the role instead.';
  end if;
  if exists (select 1 from public.invite where lower(email) = v_email and status = 'pending') then
    raise exception 'There is already a pending invite for this email.';
  end if;

  insert into public.invite (email, role_id, scope_college_id, invited_by, expires_at, staged_profile)
  values (
    v_email, v_role_id, p_college, auth.uid(),
    now() + make_interval(days => greatest(1, coalesce(p_ttl_days, 14))),
    -- A college_admin invite carries no staged profile: there is no
    -- college_admin_profile to materialise, and _provision_from_invites only
    -- reads staged_profile for mentor / college_staff.
    case when p_role = 'college_staff' then coalesce(p_profile, '{}'::jsonb) else '{}'::jsonb end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.invite_college_member(text, uuid, text, jsonb, int) to authenticated;

-- Kept as a thin wrapper so nothing that already calls it has to change.
create or replace function public.invite_college_staff(
  p_email text, p_college uuid, p_profile jsonb default '{}'::jsonb, p_ttl_days int default 14
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.invite_college_member(p_email, p_college, 'college_staff', p_profile, p_ttl_days);
$$;

grant execute on function public.invite_college_staff(text, uuid, jsonb, int) to authenticated;

-- ============================================================================
-- 3) The invite list covers both roles
-- ============================================================================
-- Supersedes 175 §10b-ii. Adds role_key, and stops filtering to college_staff —
-- an admin who invites another admin must be able to see, fix and revoke it.
drop function if exists public.college_staff_invites(uuid);
create or replace function public.college_staff_invites(p_college uuid default null)
returns table (
  id uuid, email text, role_key text, scope_college_id uuid, college_name text,
  staged_profile jsonb, created_at timestamptz, expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.email, r.key, i.scope_college_id, c.name,
         i.staged_profile, i.created_at, i.expires_at
  from public.invite i
  join public.role r on r.id = i.role_id
  left join public.college c on c.id = i.scope_college_id
  where r.key in ('college_staff', 'college_admin')
    and i.status = 'pending'
    and (p_college is null or i.scope_college_id = p_college)
    and (public.has_global_permission('college.staff.view')
         or public.has_college_permission('college.staff.view', i.scope_college_id))
  order by i.created_at desc;
$$;

grant execute on function public.college_staff_invites(uuid) to authenticated;

-- update / revoke must accept an admin invite too, now that one can exist.
create or replace function public.update_college_staff_invite(
  p_invite  uuid,
  p_email   text,
  p_profile jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_college uuid;
  v_status  text;
  v_key     text;
begin
  select i.scope_college_id, i.status, r.key
    into v_college, v_status, v_key
  from public.invite i join public.role r on r.id = i.role_id
  where i.id = p_invite;

  if v_key is null then raise exception 'Invite not found'; end if;
  if v_key not in ('college_staff', 'college_admin') then
    raise exception 'Not a college invite';
  end if;
  if v_status <> 'pending' then raise exception 'This invite is no longer pending'; end if;
  if not (public.has_global_permission('college.staff.invite')
          or public.has_college_permission('college.staff.invite', v_college)) then
    raise exception 'Forbidden: you cannot edit invites for this college';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' then
    raise exception 'A valid email is required';
  end if;
  if exists (
    select 1 from public.invite
    where lower(email) = v_email and status = 'pending' and id <> p_invite
  ) then
    raise exception 'Another pending invite already uses this email.';
  end if;

  update public.invite
    set email = v_email,
        -- Only a staff invite carries a profile; an admin invite keeps none.
        staged_profile = case when v_key = 'college_staff'
                              then coalesce(p_profile, '{}'::jsonb) else '{}'::jsonb end
  where id = p_invite;
end;
$$;

grant execute on function public.update_college_staff_invite(uuid, text, jsonb) to authenticated;

create or replace function public.revoke_college_staff_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college uuid;
  v_key     text;
begin
  select i.scope_college_id, r.key into v_college, v_key
  from public.invite i join public.role r on r.id = i.role_id
  where i.id = p_invite;

  if v_key is null then raise exception 'Invite not found'; end if;
  if v_key not in ('college_staff', 'college_admin') then
    raise exception 'Not a college invite';
  end if;
  if not (public.has_global_permission('college.staff.invite')
          or public.has_college_permission('college.staff.invite', v_college)) then
    raise exception 'Forbidden: you cannot revoke invites for this college';
  end if;

  update public.invite set status = 'revoked' where id = p_invite and status = 'pending';
end;
$$;

grant execute on function public.revoke_college_staff_invite(uuid) to authenticated;

-- ============================================================================
-- 4) Seeing the college's people, and removing staff (never an admin)
-- ============================================================================
-- A College Admin holds neither user.view nor user.manage, so app_user_self_read
-- (009) shows them only themselves — they cannot read their own college's admins
-- or staff from the tables. Without this they could invite a colleague and then
-- never see them.
create or replace function public.college_members(p_college uuid default null)
returns table (
  user_id uuid, email text, full_name text, role_key text,
  account_status text, staff_status text, college_id uuid, college_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select au.id, au.email, coalesce(au.full_name, csp.full_name), r.key,
         au.status, csp.status, ur.scope_college_id, c.name
  from public.user_role ur
  join public.role r      on r.id = ur.role_id
  join public.app_user au on au.id = ur.user_id
  left join public.college c on c.id = ur.scope_college_id
  left join public.college_staff_profile csp on csp.user_id = au.id
  where r.key in ('college_staff', 'college_admin')
    and ur.scope_college_id is not null
    and au.status <> 'deleted'
    and (p_college is null or ur.scope_college_id = p_college)
    and (public.has_global_permission('college.staff.view')
         or public.has_college_permission('college.staff.view', ur.scope_college_id))
  order by r.key, coalesce(au.full_name, csp.full_name, au.email);
$$;

grant execute on function public.college_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_college_member() — rule 4's second half.
--
-- Revokes a STAFF member's scoped grant and closes their registration. REFUSES a
-- college_admin target outright: a college admin may add a peer but not unseat
-- one, so removing an admin stays a platform action (set_college_admin, 097).
-- Refuses self for the same reason set_member_roles does — no self-lockout.
-- ---------------------------------------------------------------------------
create or replace function public.remove_college_member(
  p_user    uuid,
  p_college uuid,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_role uuid;
  v_actor      uuid := public.acting_user();
begin
  if not (public.has_global_permission('college.staff.review')
          or public.has_college_permission('college.staff.review', p_college)) then
    raise exception 'Forbidden: you cannot manage people for this college';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;

  -- An admin of this college is off limits to a college-scoped caller. A GLOBAL
  -- holder (platform admin / owner) is allowed, since they manage admins anyway.
  if exists (
    select 1 from public.user_role ur join public.role r on r.id = ur.role_id
    where ur.user_id = p_user and r.key = 'college_admin' and ur.scope_college_id = p_college
  ) and not public.has_global_permission('college.staff.review') then
    raise exception 'You cannot remove another college admin. Ask the CareerLaunchpad team.';
  end if;

  select id into v_staff_role from public.role where key = 'college_staff';

  delete from public.user_role
  where user_id = p_user and role_id = v_staff_role and scope_college_id = p_college;

  -- Mirror the status so the roster reflects it and the person is told why.
  update public.college_staff_profile
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = now(), updated_at = now()
  where user_id = p_user and college_id = p_college;

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.college_staff_review_note (staff_user_id, author_user_id, body, kind)
    values (p_user, v_actor, btrim(p_note), 'rejected');
  end if;
end;
$$;

grant execute on function public.remove_college_member(uuid, uuid, text) to authenticated;

commit;
