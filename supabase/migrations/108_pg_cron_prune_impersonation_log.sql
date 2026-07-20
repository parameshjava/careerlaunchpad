-- ============================================================================
-- 108_pg_cron_prune_impersonation_log.sql
--
-- Single daily pg_cron heartbeat at 03:30 UTC (09:00 IST) that prunes the
-- impersonation audit trail. impersonation_log (migration 101) grows unbounded
-- — one row per enter/exit — so we keep 90 days and delete the rest. The prune
-- is a single DELETE with its own time window, so (like the fcf accrual
-- functions) it is safe to fire daily; the WHERE clause guards what actually
-- gets removed, keeping the schedule string simple.
--
-- The job runs as the role that scheduled it (postgres, the table owner), so it
-- bypasses RLS and deletes regardless of the read-only policy on 101.
--
-- pg_cron must be enabled first. `create extension if not exists` below covers
-- it, but if `supabase db push` lacks permission, enable it once in the
-- dashboard (Database → Extensions → pg_cron) — see docs/DB_BACKUP_AND_CRON.md.
-- Idempotent.
-- ============================================================================

begin;

create extension if not exists pg_cron;

-- Idempotent unschedule + re-schedule (same pattern as fcf 013).
do $$
begin
  perform cron.unschedule('cl-prune-impersonation-log');
exception when others then
  -- Job didn't exist; ignore.
  null;
end $$;

select cron.schedule(
  'cl-prune-impersonation-log',
  '30 3 * * *',
  $cron$
    delete from public.impersonation_log
    where created_at < now() - interval '90 days';
  $cron$
);

commit;
