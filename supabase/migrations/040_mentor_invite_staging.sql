-- ============================================================================
-- 040_mentor_invite_staging.sql
-- Let an Owner/Admin add a mentor WITH their full profile (skills, mentoring
-- areas, experience…) up front. The profile is staged on the invite row; the
-- mentor gets the normal invite email, shows as Pending until first sign-in, and
-- on that sign-in handle_new_user() materialises their mentor_profile from the
-- staged JSON (so they never re-enter anything). Idempotent.
--
-- staged_profile keys mirror mentor_profile columns. Omitted columns fall back
-- to their table defaults (status=pending_review, timestamps=now()), so an
-- admin-added mentor still goes through the normal review queue.
-- ============================================================================

alter table public.invite add column if not exists staged_profile jsonb;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  inv_role_key text;
begin
  select * into inv
  from public.invite
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  select key into inv_role_key from public.role where id = inv.role_id;

  insert into public.app_user (id, email, employer_id, full_name)
  values (
    new.id, new.email, inv.employer_id,
    coalesce(inv.staged_profile->>'full_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
    set employer_id = excluded.employer_id,
        full_name   = coalesce(app_user.full_name, excluded.full_name);

  insert into public.user_role (user_id, role_id, scope_college_id)
  values (
    new.id,
    inv.role_id,
    case when inv_role_key = 'college_admin' then inv.scope_college_id else null end
  )
  on conflict do nothing;

  if inv_role_key = 'student' then
    insert into public.student_profile (user_id, college_id, full_name)
    values (new.id, inv.scope_college_id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
    on conflict (user_id) do nothing;
  end if;

  -- Admin-staged mentor profile → materialise it now. Omitted columns use table
  -- defaults; status stays pending_review (normal review queue).
  if inv_role_key = 'mentor' and inv.staged_profile is not null then
    insert into public.mentor_profile (
      user_id, full_name, phone, linkedin_url, bio,
      college_id, graduation_year, degree, branch,
      current_company, current_title, industry_id, years_experience,
      mentoring_area_ids, skills, career_goal_ids,
      mentor_mode_id, contribution_type_id, availability,
      registration_status, last_completed_step, registration_submitted_at
    )
    values (
      new.id,
      inv.staged_profile->>'full_name',
      inv.staged_profile->>'phone',
      inv.staged_profile->>'linkedin_url',
      inv.staged_profile->>'bio',
      nullif(inv.staged_profile->>'college_id', '')::uuid,
      nullif(inv.staged_profile->>'graduation_year', '')::int,
      inv.staged_profile->>'degree',
      inv.staged_profile->>'branch',
      inv.staged_profile->>'current_company',
      inv.staged_profile->>'current_title',
      nullif(inv.staged_profile->>'industry_id', '')::uuid,
      nullif(inv.staged_profile->>'years_experience', '')::int,
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'mentoring_area_ids') x), '{}'),
      coalesce((select array_agg(x)       from jsonb_array_elements_text(inv.staged_profile->'skills') x), '{}'),
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'career_goal_ids') x), '{}'),
      nullif(inv.staged_profile->>'mentor_mode_id', '')::uuid,
      nullif(inv.staged_profile->>'contribution_type_id', '')::uuid,
      inv.staged_profile->>'availability',
      'submitted', 3, now()
    )
    on conflict (user_id) do nothing;
  end if;

  update public.invite
  set status = 'consumed', consumed_at = now()
  where id = inv.id;

  return new;
end;
$$;
