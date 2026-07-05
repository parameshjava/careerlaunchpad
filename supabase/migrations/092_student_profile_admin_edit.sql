-- ============================================================================
-- 092_student_profile_admin_edit.sql
-- Let platform staff (Owner, Platform Admin, Coordinator) edit any student's
-- registration profile from the console.
--
--  * New permission student.profile.manage — edit any student_profile row.
--  * Granted to platform_admin + coordinator (owner holds '*', already covered).
--  * RLS: staff SELECT + UPDATE on student_profile gated by that permission.
--    The SELECT policy also closes an existing gap — a Coordinator previously had
--    no SELECT on the base table (only college.students.view / user.manage did),
--    so registered students didn't load for them.
--  * No INSERT/DELETE policy: staff can't create rows or hard-delete; soft-delete
--    stays on soft_delete_student() (SECURITY DEFINER).
--
-- Idempotent + re-runnable.
-- ============================================================================

-- ---- new permission --------------------------------------------------------
insert into public.permission (key, description) values
  ('student.profile.manage', 'Edit any student''s registration profile.')
on conflict (key) do nothing;

-- ---- grant to platform staff -----------------------------------------------
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p
  on r.key in ('platform_admin', 'coordinator')
 and p.key = 'student.profile.manage'
on conflict do nothing;

-- ---- RLS: staff read + update ----------------------------------------------
drop policy if exists student_profile_staff_read on public.student_profile;
create policy student_profile_staff_read on public.student_profile
  for select to authenticated
  using (public.has_permission('student.profile.manage'));

drop policy if exists student_profile_staff_update on public.student_profile;
create policy student_profile_staff_update on public.student_profile
  for update to authenticated
  using (public.has_permission('student.profile.manage'))
  with check (public.has_permission('student.profile.manage'));
