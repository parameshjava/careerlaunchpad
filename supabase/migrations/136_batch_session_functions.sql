-- ============================================================================
-- 136_batch_session_functions.sql
-- Support RPC for class scheduling (GitHub #64). When staff schedule a class the
-- server must email the subject's mentors an .ics invite + add them as Zoom
-- alternative hosts — which needs their account email. mentor_profile / app_user
-- are RLS-locked away from finance staff, so this SECURITY DEFINER function
-- returns just the mentor contact for one (batch, subject), guarded on
-- has_permission('finance.manage') for the caller.
-- ============================================================================

begin;

create or replace function public.batch_subject_mentor_contacts(
  p_batch_id uuid, p_subject_id uuid
)
returns table (mentor_id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select m.mentor_id, mp.full_name, au.email
  from public.batch_subject_mentor m
  join public.mentor_profile mp on mp.user_id = m.mentor_id
  join public.app_user au       on au.id = m.mentor_id
  where m.batch_id = p_batch_id
    and m.subject_id = p_subject_id
    and public.has_permission('finance.manage')
  order by mp.full_name nulls last;
$$;

grant execute on function public.batch_subject_mentor_contacts(uuid, uuid) to authenticated;

commit;
