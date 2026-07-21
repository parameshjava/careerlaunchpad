-- ============================================================================
-- 123_exam_access_requires_approval.sql
-- Hardening for #45: unapproved students could see AND start exams.
--
-- Root cause: every student-facing exam surface routes its access check through
-- is_student_of_college() (migration 095) — the exam list RPC, the start/resume/
-- score/last-position RPCs, and the exam_session_read RLS policy. That helper
-- checked college membership ONLY, so a self-registered student still in
-- 'pending_review' (student_profile.status) could list, read, start and submit
-- any open sitting for their college by calling the SECURITY DEFINER RPCs
-- directly with their browser session — bypassing the app-layer UI guards.
--
-- Fix: require an APPROVED profile in that single helper. Because it's the sole
-- gate for all exam surfaces, this one change closes visibility AND execution in
-- one place. Imported/invited students are auto-approved (migration 020), so only
-- self-registered students awaiting review are affected — exactly the intent.
--
-- Note: student_profile.status ('pending_review' | 'approved' | 'suspended') is
-- distinct from app_user.status ('active' | 'suspended'); this gates on the
-- former (approval), which the exam guards were previously ignoring.
-- Idempotent (create or replace). Run `supabase db advisors` after applying.
-- ============================================================================

create or replace function public.is_student_of_college(p_college uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_profile
    where user_id = auth.uid()
      and college_id = p_college
      and status = 'approved'   -- exam access requires an approved profile (#45)
  );
$$;
grant execute on function public.is_student_of_college(uuid) to authenticated;
