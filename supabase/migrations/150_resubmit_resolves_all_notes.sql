-- ============================================================================
-- 150_resubmit_resolves_all_notes.sql
-- Refines mark_registration_resubmitted() (migration 149) so re-submitting is
-- treated as the student's RESPONSE to every open remark:
--   • On any submit, mark ALL of the student's unresolved notes resolved
--     (previously only 'changes_requested' notes were cleared, so an
--     informational 'note' to an approved student never cleared).
--   • A later remark from the admin is a fresh, unresolved row, so only THAT
--     one surfaces to the student — "surface only the uncleared remark".
--   • A sent-back (changes_requested) student still re-enters the review queue.
-- resolved_at doubles as the "student responded" flag.
-- ============================================================================

create or replace function public.mark_registration_resubmitted()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_status text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select status into v_status from public.student_profile where user_id = uid;
  if not found then return null; end if;

  -- Re-submitting IS the response to the reviewer: clear every open remark,
  -- regardless of kind. Any remark the admin adds afterwards is a new unresolved
  -- row, so the student then sees only that one.
  update public.student_review_note
  set resolved_at = now()
  where student_user_id = uid and resolved_at is null;

  -- A student who was sent back re-enters the review queue. The status guard
  -- (migration 020) blocks a student from changing their own status, so flip it
  -- under the provisioning GUC (this function is SECURITY DEFINER).
  if v_status = 'changes_requested' then
    perform set_config('app.provisioning', 'on', true);  -- txn-local
    update public.student_profile
    set status = 'pending_review', updated_at = now()
    where user_id = uid;
    perform set_config('app.provisioning', 'off', true);

    return 'pending_review';
  end if;

  return v_status;
end;
$$;

grant execute on function public.mark_registration_resubmitted() to authenticated;
