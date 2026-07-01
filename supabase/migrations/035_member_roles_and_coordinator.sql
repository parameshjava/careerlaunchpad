-- ============================================================================
-- 035_member_roles_and_coordinator.sql
-- Member role management + the Coordinator role.
--
--  * role.rank encodes the privilege ladder: owner(3) > platform_admin(2) >
--    coordinator/support(1). mentor(0) is orthogonal (the "Trainer" dimension)
--    and the context roles (student/college_admin/employer) stay 0.
--  * New role `coordinator`: day-to-day ops (colleges, question bank, students
--    register/delete, offline exam scores) — but NOT member management.
--  * New permissions: student.delete, role.assign.
--  * platform_admin is granted Coordinator's extra perms so "Admin ⊇ Coordinator"
--    stays true (the redundancy rule depends on it).
--  * set_member_roles() grants/revokes roles in user_role with escalation
--    guardrails (only an owner grants owner/admin; last-owner protected).
--  * soft_delete_student() hides a student (status='deleted') from both sources.
--  * auth_context() now treats a status='deleted' app_user as not provisioned,
--    so soft-deleted users are blocked everywhere the app checks `provisioned`.
--
-- Idempotent + re-runnable (roles/permissions are data; on conflict do nothing).
-- ============================================================================

-- ---- ladder rank -----------------------------------------------------------
alter table public.role add column if not exists rank smallint not null default 0;

-- ---- new role: Coordinator -------------------------------------------------
insert into public.role (key, name, description, is_system) values
  ('coordinator', 'Coordinator',
   'Day-to-day operations: manage colleges, the question bank, and students (register/delete), and record offline exam scores. Cannot manage platform members.',
   true)
on conflict (key) do nothing;

update public.role set rank = 3 where key = 'owner';
update public.role set rank = 2 where key = 'platform_admin';
update public.role set rank = 1 where key in ('coordinator', 'support');

-- ---- new permissions -------------------------------------------------------
insert into public.permission (key, description) values
  ('student.delete', 'Soft-delete students (hide them from the platform).'),
  ('role.assign',    'Grant and revoke roles on existing platform members.')
on conflict (key) do nothing;

-- ---- Coordinator permission bundle -----------------------------------------
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on r.key = 'coordinator' and p.key in (
  'college.manage',
  'exam.subject.manage', 'exam.question.manage',
  'student.intake.import', 'student.profile.view', 'student.profile.search',
  'student.review', 'student.delete',
  'exam.evaluate', 'exam.results.view_all'
)
on conflict do nothing;

-- ---- platform_admin: role.assign + the Coordinator perms it lacked ---------
-- (owner holds '*', so it already satisfies role.assign / student.delete.)
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on r.key = 'platform_admin' and p.key in (
  'role.assign', 'student.delete', 'student.review', 'exam.evaluate', 'exam.results.view_all'
)
on conflict do nothing;

-- ---- soft-delete status values ---------------------------------------------
alter table public.student_intake drop constraint if exists student_intake_status_check;
alter table public.student_intake add constraint student_intake_status_check
  check (status in ('pending', 'invited', 'claimed', 'deleted'));

alter table public.app_user drop constraint if exists app_user_status_check;
alter table public.app_user add constraint app_user_status_check
  check (status in ('active', 'suspended', 'deleted'));

-- ---- auth_context(): a soft-deleted user is treated as not provisioned -----
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

-- ---- set_member_roles(): manage a member's UNSCOPED staff roles ------------
-- Replaces the member's set of {owner, platform_admin, coordinator, support,
-- mentor} rows with p_role_keys. Scoped roles (student/college_admin/employer,
-- which carry a college/employer) are never touched — those stay with invites.
create or replace function public.set_member_roles(p_user_id uuid, p_role_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  managed constant text[] := array['owner','platform_admin','coordinator','support','mentor'];
  caller_rank  smallint;
  is_owner     boolean;
  wanted       text[];
  max_ladder   smallint;
  current_keys text[];
  diff_keys    text[];
  k            text;
  krank        smallint;
begin
  if not public.has_permission('role.assign') then
    raise exception 'Forbidden: missing role.assign';
  end if;

  is_owner := public.has_permission('*');
  select coalesce(max(r.rank), 0) into caller_rank
  from public.user_role ur join public.role r on r.id = ur.role_id
  where ur.user_id = auth.uid();

  -- Keep only managed keys that actually exist.
  select coalesce(array_agg(r.key), '{}') into wanted
  from public.role r
  where r.key = any (coalesce(p_role_keys, '{}')) and r.key = any (managed);

  -- Redundancy: if a ladder role (rank>=1) is present, drop strictly-lower
  -- ladder roles. Peers at the same rank (coordinator/support) both survive.
  select coalesce(max(r.rank), 0) into max_ladder
  from public.role r where r.key = any (wanted) and r.rank >= 1;

  if max_ladder >= 1 then
    select coalesce(array_agg(r.key), '{}') into wanted
    from public.role r
    where r.key = any (wanted) and (r.rank = 0 or r.rank >= max_ladder);
  end if;

  -- The member's current unscoped staff roles.
  select coalesce(array_agg(r.key), '{}') into current_keys
  from public.user_role ur join public.role r on r.id = ur.role_id
  where ur.user_id = p_user_id and ur.scope_college_id is null and r.key = any (managed);

  -- Symmetric difference: the roles actually being added or removed.
  select coalesce(array_agg(x), '{}') into diff_keys from (
    (select unnest(wanted) except select unnest(current_keys))
    union
    (select unnest(current_keys) except select unnest(wanted))
  ) d(x);

  -- Escalation guardrail: for every role being added OR removed, the caller must
  -- be allowed to manage it (owner manages anything; others only ranks below own).
  foreach k in array diff_keys loop
    select r.rank into krank from public.role r where r.key = k;
    if not (is_owner or krank < caller_rank) then
      raise exception 'You are not allowed to assign or revoke the % role', k;
    end if;
    -- Don't let a caller strip owner/admin off THEMSELVES (self-lockout).
    if p_user_id = auth.uid() and k in ('owner','platform_admin')
       and k = any (current_keys) and not (k = any (wanted)) then
      raise exception 'You cannot remove your own % role', k;
    end if;
  end loop;

  -- Last-owner protection.
  if ('owner' = any (current_keys)) and not ('owner' = any (wanted)) then
    if (select count(*) from public.user_role ur join public.role r on r.id = ur.role_id
        where r.key = 'owner') <= 1 then
      raise exception 'Cannot remove the last owner';
    end if;
  end if;

  -- Apply: remove dropped managed roles, add new ones (all unscoped).
  delete from public.user_role ur
  using public.role r
  where ur.role_id = r.id
    and ur.user_id = p_user_id
    and ur.scope_college_id is null
    and r.key = any (managed)
    and not (r.key = any (wanted));

  insert into public.user_role (user_id, role_id, scope_college_id)
  select p_user_id, r.id, null
  from public.role r
  where r.key = any (wanted)
  on conflict do nothing;
end;
$$;

-- ---- soft_delete_student() -------------------------------------------------
create or replace function public.soft_delete_student(p_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('student.delete') then
    raise exception 'Forbidden: missing student.delete';
  end if;

  if p_kind = 'intake' then
    update public.student_intake set status = 'deleted'
    where id = p_id and status in ('pending', 'invited');
  elsif p_kind = 'registered' then
    -- Student-only guard: never soft-delete someone holding a non-student role.
    if exists (
      select 1 from public.user_role ur join public.role r on r.id = ur.role_id
      where ur.user_id = p_id and r.key <> 'student'
    ) then
      raise exception 'Refusing to delete a user who holds non-student roles';
    end if;
    update public.app_user set status = 'deleted' where id = p_id;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
end;
$$;

grant execute on function public.set_member_roles(uuid, text[]) to authenticated;
grant execute on function public.soft_delete_student(uuid, text) to authenticated;
