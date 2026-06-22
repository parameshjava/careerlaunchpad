-- ============================================================================
-- 20260622000001_rbac_core.sql
-- RBAC core: role, permission, role_permission, app_user, user_role.
-- Roles & permissions are DATA, not code (spec §3) — a new role is an INSERT.
-- ============================================================================

-- gen_random_bytes() (used for invite tokens) comes from pgcrypto.
create extension if not exists pgcrypto;

-- role -- one row per role; extend by inserting a new row.
create table if not exists public.role (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,            -- owner | student | college_admin | employer
  name        text not null,                   -- human label, e.g. "College Admin"
  description text,
  is_system   boolean not null default false,  -- true for the four seeded roles (cannot be deleted)
  created_at  timestamptz not null default now()
);

-- permission -- one row per granular capability (the §3.1 strings, incl. '*').
create table if not exists public.permission (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,            -- e.g. student.profile.view, user.invite, *
  description text
);

-- role_permission -- which permissions each role bundles.
create table if not exists public.role_permission (
  role_id       uuid not null references public.role(id)       on delete cascade,
  permission_id uuid not null references public.permission(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- app_user -- the platform account, 1:1 with the Supabase auth.users row.
create table if not exists public.app_user (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- user_role -- assigns roles to users, with optional college scope.
-- scope_college_id is set for College Admins / Students, NULL for Owner / Employer.
-- The spec calls for PK (user_id, role_id, scope_college_id), but a Postgres
-- PRIMARY KEY forces every column NOT NULL — which would forbid unscoped grants.
-- So we use a surrogate PK and enforce the intended uniqueness with two partial
-- indexes (one for scoped rows, one for unscoped).
-- NOTE: college is created in the next migration; the FK is added there.
create table if not exists public.user_role (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.app_user(id) on delete cascade,
  role_id          uuid not null references public.role(id),
  scope_college_id uuid
);

-- One grant per (user, role, college) for scoped roles…
create unique index if not exists user_role_scoped_uniq
  on public.user_role (user_id, role_id, scope_college_id)
  where scope_college_id is not null;
-- …and one grant per (user, role) for unscoped (Owner/Employer) roles.
create unique index if not exists user_role_unscoped_uniq
  on public.user_role (user_id, role_id)
  where scope_college_id is null;

create index if not exists user_role_user_idx on public.user_role (user_id);
create index if not exists role_permission_role_idx on public.role_permission (role_id);
