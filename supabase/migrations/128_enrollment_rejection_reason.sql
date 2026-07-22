-- ============================================================================
-- 128_enrollment_rejection_reason.sql
-- When an admin rejects a (self-enrolled) enrolment, capture why. Shown back to
-- the student under My fees. Idempotent.
-- ============================================================================

alter table public.student_enrollment
  add column if not exists rejection_reason text;
