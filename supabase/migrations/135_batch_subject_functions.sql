-- ============================================================================
-- 135_batch_subject_functions.sql
-- RPCs behind the batch "Subjects & mentors" screen (GitHub #64). Same pattern
-- as replace_batch_children (130): the write is one transactional SECURITY
-- DEFINER function so a failed reinsert can't leave a batch half-configured.
--
-- These functions read tables that RLS locks away from finance staff — `subject`
-- (exam admins/staff only, migration 100) and `mentor_profile` (user.manage /
-- college-scoped, 017) — so they run SECURITY DEFINER and each GUARDS on
-- has_permission('finance.manage') internally (evaluated for the CALLER via
-- auth.uid(), even inside a definer function). They expose only names/emails a
-- batch manager legitimately needs, never the exam question bank.
-- ============================================================================

begin;

-- Candidate subjects for a batch = the subjects of its course's competitive
-- exam(s). Feeds the "add subject" picker.
create or replace function public.batch_syllabus_subjects(p_batch_id uuid)
returns table (subject_id uuid, subject_name text, competitive_exam_id uuid, exam_code text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ces.subject_id, s.name, ce.id, ce.code
  from public.batch b
  join public.course_competitive_exam cce on cce.course_id = b.course_id
  join public.competitive_exam ce         on ce.id = cce.competitive_exam_id
  join public.competitive_exam_subject ces on ces.competitive_exam_id = ce.id
  join public.subject s                    on s.id = ces.subject_id
  where b.id = p_batch_id
    and public.has_permission('finance.manage')
  order by s.name;
$$;

-- Approved mentors available to assign (id + name + account email).
create or replace function public.batch_eligible_mentors()
returns table (mentor_id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select mp.user_id, mp.full_name, au.email
  from public.mentor_profile mp
  join public.app_user au on au.id = mp.user_id
  where mp.status = 'approved'
    and public.has_permission('finance.manage')
  order by mp.full_name nulls last;
$$;

-- Replace a batch's subject set + per-subject mentor assignments transactionally.
-- p_subjects: [{ "subject_id": uuid, "sort_order": int, "mentor_ids": [uuid,…] }]
-- Refuses to remove a subject that still has scheduled/live/completed classes
-- (their Zoom meetings + history would be cascade-deleted) — cancel those first.
create or replace function public.replace_batch_subjects(p_batch_id uuid, p_subjects jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec         jsonb;
  v_subject   uuid;
  v_sort      int;
  v_name      text;
  v_mentor    uuid;
  v_new_ids   uuid[];
  v_removed   uuid;
  v_mentors   uuid[];
begin
  if not public.has_permission('finance.manage') then
    raise exception 'Forbidden';
  end if;
  if p_subjects is null or jsonb_typeof(p_subjects) <> 'array' then
    raise exception 'subjects must be a JSON array';
  end if;

  select coalesce(array_agg((e->>'subject_id')::uuid), '{}')
    into v_new_ids
    from jsonb_array_elements(p_subjects) e;

  -- Guard: don't strip a subject that still has real classes.
  for v_removed in
    select bs.subject_id from public.batch_subject bs
    where bs.batch_id = p_batch_id and not (bs.subject_id = any (v_new_ids))
  loop
    if exists (
      select 1 from public.batch_session ss
      where ss.batch_id = p_batch_id and ss.subject_id = v_removed
        and ss.status in ('scheduled', 'live', 'completed')
    ) then
      raise exception
        'Cannot remove a subject that still has scheduled or past classes — cancel its classes first.';
    end if;
  end loop;

  delete from public.batch_subject
   where batch_id = p_batch_id and not (subject_id = any (v_new_ids));

  for rec in select value from jsonb_array_elements(p_subjects) as t(value)
  loop
    v_subject := (rec->>'subject_id')::uuid;
    v_sort    := coalesce((rec->>'sort_order')::int, 0);

    select name into v_name from public.subject where id = v_subject;
    if v_name is null then
      raise exception 'Unknown subject %', v_subject;
    end if;

    insert into public.batch_subject (batch_id, subject_id, subject_name, sort_order)
    values (p_batch_id, v_subject, v_name, v_sort)
    on conflict (batch_id, subject_id)
      do update set subject_name = excluded.subject_name, sort_order = excluded.sort_order;

    delete from public.batch_subject_mentor
     where batch_id = p_batch_id and subject_id = v_subject;

    select coalesce(array_agg(m::uuid), '{}')
      into v_mentors
      from jsonb_array_elements_text(coalesce(rec->'mentor_ids', '[]'::jsonb)) m;

    foreach v_mentor in array v_mentors
    loop
      if not exists (
        select 1 from public.mentor_profile
        where user_id = v_mentor and status = 'approved'
      ) then
        raise exception 'Mentor % is not an approved mentor', v_mentor;
      end if;
      insert into public.batch_subject_mentor
        (batch_id, subject_id, mentor_id, mentor_name, assigned_by)
      select p_batch_id, v_subject, v_mentor, mp.full_name, auth.uid()
      from public.mentor_profile mp where mp.user_id = v_mentor
      on conflict (batch_id, subject_id, mentor_id)
        do update set mentor_name = excluded.mentor_name;
    end loop;
  end loop;
end $$;

grant execute on function public.batch_syllabus_subjects(uuid) to authenticated;
grant execute on function public.batch_eligible_mentors()      to authenticated;
grant execute on function public.replace_batch_subjects(uuid, jsonb) to authenticated;

commit;
