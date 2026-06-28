-- ============================================================================
-- 025_exam_staff_rpcs.sql
-- Read helpers for the exam-staff picker. Both need to read app_user (which is
-- self/`user.manage`-gated by RLS), so they are SECURITY DEFINER and instead
-- check is_exam_admin() — only the central team assigns exam staff.
--
--   search_exam_staff_candidates(q) -> [{ user_id, email, roles[] }]
--   list_exam_staff(exam_id)        -> [{ user_id, email }]
-- ============================================================================

create or replace function public.search_exam_staff_candidates(p_q text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_exam_admin() then raise exception 'Forbidden'; end if;
  if coalesce(trim(p_q), '') = '' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(sub.obj order by sub.email)
    from (
      select au.email,
             jsonb_build_object(
               'user_id', au.id,
               'email', au.email,
               'roles', coalesce((
                 select jsonb_agg(distinct ro.key)
                 from public.user_role ur join public.role ro on ro.id = ur.role_id
                 where ur.user_id = au.id), '[]'::jsonb)
             ) as obj
      from public.app_user au
      where au.email ilike '%' || p_q || '%'
      order by au.email
      limit 20
    ) sub
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_exam_staff(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_exam_admin() then raise exception 'Forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', es.user_id, 'email', au.email) order by au.email)
    from public.exam_staff es join public.app_user au on au.id = es.user_id
    where es.exam_id = p_exam_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.search_exam_staff_candidates(text) to authenticated;
grant execute on function public.list_exam_staff(uuid)              to authenticated;
