-- ============================================================================
-- 132_backfill_waived_completed.sql
-- Fix (code review #8): a fully-waived (net 0) enrolment never had a payment
-- recorded, and status only advanced to 'completed' inside payment recording —
-- so waived enrolments stayed 'active' forever. New enrolments now mark net-0
-- as 'completed' at enrol time (lib/enrollment-write.ts); this backfills any
-- existing rows that are settled (nothing left to pay) but still 'active'.
-- Idempotent.
-- ============================================================================

update public.student_enrollment e
   set status = 'completed', updated_at = now()
 where e.status = 'active'
   and e.net_fee_paise = 0;
