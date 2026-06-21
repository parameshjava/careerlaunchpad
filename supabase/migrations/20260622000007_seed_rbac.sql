-- ============================================================================
-- 20260622000007_seed_rbac.sql
-- Seed the four v1 roles, the §3.1 permissions, and their mappings (§3.2).
-- Idempotent: re-running only fills gaps. Roles/permissions are DATA — adding a
-- fifth role later (e.g. "mentor") is just more INSERTs, no code change.
-- ============================================================================

-- ---- roles (is_system = true, cannot be deleted) -----------------------------
insert into public.role (key, name, description, is_system) values
  ('owner',         'Owner',         'Founders/co-founders. Unrestricted (holds the * wildcard).', true),
  ('student',       'Student',       'College student, invited and tied to a college.',             true),
  ('college_admin', 'College Admin', 'Staff who oversee their own college''s students.',            true),
  ('employer',      'Employer',      'Organization that discovers talent and posts jobs.',          true)
on conflict (key) do nothing;

-- ---- permissions (the §3.1 capability strings) -------------------------------
insert into public.permission (key, description) values
  ('*',                          'Wildcard — grants every permission (Owner).'),
  ('user.invite',                'Invite users of any role.'),
  ('user.manage',                'View, suspend, edit, re-assign, revoke any user.'),
  ('role.manage',                'Define and edit roles and their permission bundles.'),
  ('college.manage',             'Create and edit colleges.'),
  ('analytics.platform.view',    'View platform-wide analytics.'),
  ('student.profile.manage_own', 'Create and manage own student profile.'),
  ('job.browse',                 'Browse open jobs.'),
  ('job.apply',                  'Apply to jobs.'),
  ('message.respond',            'Respond to in-platform contact.'),
  ('college.students.view',      'View students of own college.'),
  ('college.analytics.view',     'View own college analytics.'),
  ('college.profile.manage',     'Manage own college profile/details.'),
  ('student.profile.search',     'Search and filter across all student profiles.'),
  ('student.profile.view',       'View full student profiles.'),
  ('student.contact.initiate',   'Initiate in-platform contact with students.'),
  ('job.post',                   'Post jobs.'),
  ('job.applicants.view',        'Review applicants for own jobs.')
on conflict (key) do nothing;

-- ---- role -> permission mappings (§3.2 seed table) ---------------------------
-- Helper: map by keys, idempotent.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on (
       (r.key = 'owner'         and p.key = '*')
    or (r.key = 'student'       and p.key in ('student.profile.manage_own', 'job.browse', 'job.apply', 'message.respond'))
    or (r.key = 'college_admin' and p.key in ('college.students.view', 'college.analytics.view', 'college.profile.manage'))
    or (r.key = 'employer'      and p.key in ('student.profile.search', 'student.profile.view', 'student.contact.initiate', 'job.post', 'job.applicants.view'))
  )
on conflict do nothing;
