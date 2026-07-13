-- ============================================================================
-- 101_impersonation_log.sql
-- Audit trail for platform-admin "View as user" impersonation. Every enter/exit
-- is recorded (which admin acted as which target, and when). Inserts are done by
-- the server SECRET-key client (which bypasses RLS); reads are limited to users
-- holding `user.manage` (owners / platform admins). No insert/update/delete
-- policy is granted, so the anon/authenticated roles cannot write to it.
-- Additive + idempotent.
-- ============================================================================

create table if not exists public.impersonation_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.app_user(id) on delete cascade,
  target_id  uuid not null references public.app_user(id) on delete cascade,
  action     text not null check (action in ('enter', 'exit')),
  created_at timestamptz not null default now()
);

create index if not exists impersonation_log_admin_idx  on public.impersonation_log (admin_id, created_at desc);
create index if not exists impersonation_log_target_idx on public.impersonation_log (target_id, created_at desc);

alter table public.impersonation_log enable row level security;

drop policy if exists impersonation_log_read on public.impersonation_log;
create policy impersonation_log_read on public.impersonation_log
  for select to authenticated
  using (public.has_permission('user.manage'));
