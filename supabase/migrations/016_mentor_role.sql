-- ============================================================================
-- 016_mentor_role.sql
-- The Mentor role + its permissions (spec §3: roles are DATA, so a new role is
-- just INSERTs — see 007's note "adding a fifth role later (e.g. 'mentor') is
-- just more INSERTs"). The mentor reference tables (ref_industry,
-- ref_mentoring_area, ref_mentor_mode, ref_contribution_type) were already
-- seeded in 010; this wires up the role that uses them.
--
-- Mentor is an ADDITIVE role: a placed student, an owner/admin, or an external
-- professional all gain `mentor` on top of (or instead of) whatever they are.
-- user_role is many-to-many, so a user can hold student + mentor at once and
-- auth_context() unions both permission sets — no engine change needed.
--
-- Vetting: new mentor profiles start 'pending_review' and must be approved by a
-- reviewer (Owner via '*', CareerLaunchpad Admin via mentor.review). The
-- college-scoped variant of mentor.review is honored by RLS/RPCs for a future
-- "principal approves their own alumni mentors" flow, but is NOT granted here.
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- ============================================================================

-- ---- role --------------------------------------------------------------------
insert into public.role (key, name, description, is_system) values
  ('mentor', 'Mentor',
   'Industry professional, alumnus, or staff member who guides students. Additive — held alongside student/owner/admin.',
   true)
on conflict (key) do nothing;

-- ---- permissions -------------------------------------------------------------
insert into public.permission (key, description) values
  ('mentor.profile.manage_own', 'Create and manage own mentor profile.'),
  ('mentor.dashboard.view',     'View the mentor dashboard / hub.'),
  ('mentor.review',             'Review, approve and suspend mentor registrations.')
on conflict (key) do nothing;

-- ---- mentor -> permission bundle ---------------------------------------------
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on (
  r.key = 'mentor' and p.key in ('mentor.profile.manage_own', 'mentor.dashboard.view')
)
on conflict do nothing;

-- ---- reviewers: CareerLaunchpad Admin (platform_admin). Owner holds '*'. -----
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on (r.key = 'platform_admin' and p.key = 'mentor.review')
on conflict do nothing;
