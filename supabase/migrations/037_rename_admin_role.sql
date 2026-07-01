-- ============================================================================
-- 037_rename_admin_role.sql
-- Display-name only: "CareerLaunchpad Admin" → "Admin" ("CareerLaunchpad" is
-- redundant in the console). The role KEY (platform_admin) and all permissions
-- are unchanged. Idempotent.
-- ============================================================================
update public.role set name = 'Admin' where key = 'platform_admin';
