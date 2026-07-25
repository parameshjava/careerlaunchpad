-- ============================================================================
-- 148_fix_student_reregister.sql
-- Fix: a soft-deleted student is permanently stuck in a register → no-access
-- redirect loop and cannot sign back in (GitHub issue #79, "unable to register").
--
-- The loop:
--   * soft_delete_student() (registered kind) sets app_user.status='deleted'
--     but LEAVES the student's user_role rows in place (migration 035).
--   * auth_context() treats status='deleted' as provisioned=false (035) → the
--     user is routed to /auth/no-access.
--   * register_as_student() (migration 014) early-returned whenever ANY user_role
--     existed — so for a soft-deleted student (whose 'student' role still exists)
--     it did nothing: it never flipped status back to 'active'.
--   * /student/register's guard bounces provisioned=false back to /auth/no-access
--     → infinite loop; the student can never re-register.
--
-- The fix (product decision: re-activate, consistent with open self-signup):
--   * The self-promote guard now only refuses holders of a NON-student role
--     (an existing employer/admin still can't self-mint a student role).
--   * Otherwise (re)provision as an ACTIVE student — the ON CONFLICT ... DO UPDATE
--     un-deletes a previously soft-deleted student so they can register again.
--
-- Idempotent (create or replace). No data backfill here: existing soft-deleted
-- students simply un-delete themselves the next time they self-register.
-- ============================================================================
create or replace function public.register_as_student()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  uemail text;
  uname  text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Refuse only holders of a NON-student role (they can't self-promote to
  -- student). A soft-deleted student — who still holds only the 'student' role —
  -- falls through and gets re-activated below.
  if exists (
    select 1 from public.user_role ur
    join public.role r on r.id = ur.role_id
    where ur.user_id = uid and r.key <> 'student'
  ) then
    return;
  end if;

  select email,
         coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
    into uemail, uname
  from auth.users
  where id = uid;

  -- (Re)provision as an ACTIVE student. DO UPDATE un-deletes a soft-deleted
  -- app_user (status='deleted' → 'active'); on a fresh row it inserts as active.
  insert into public.app_user (id, email, status)
  values (uid, uemail, 'active')
  on conflict (id) do update set status = 'active';

  insert into public.user_role (user_id, role_id)
  select uid, r.id from public.role r where r.key = 'student'
  on conflict do nothing;

  insert into public.student_profile (user_id, full_name)
  values (uid, uname)
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.register_as_student() to authenticated;
