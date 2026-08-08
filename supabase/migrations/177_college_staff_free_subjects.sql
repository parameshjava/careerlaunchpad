-- ============================================================================
-- 177_college_staff_free_subjects.sql
-- College staff type their subjects FREELY; the platform list becomes a
-- suggestion, not the vocabulary.
--
-- WHY 175's MODEL WAS WRONG
--   college_staff_subject.subject_id is a FK to public.subject — the platform's
--   ~15 aptitude/exam subjects (Arithmetic, Reasoning, Verbal Ability, …). That
--   is the right vocabulary for a BATCH, which is what 140 built it for. It is
--   the wrong vocabulary for a syllabus: a B.Tech is four years and forty-odd
--   subjects, and no faculty member's actual load — Discrete Mathematics,
--   Compiler Design, Thermodynamics — appears in that list at all. So the
--   picker offered a lecturer a set of chips that could not describe what they
--   teach, which is worse than an empty field: it invites a wrong answer.
--
--   Worse, subject NAMING is university-specific. "DBMS", "Database Management
--   Systems" and "Database Systems" are one subject under three affiliations,
--   and "Data Structures" vs "Data Structures & Algorithms" differ by JNTUK vs
--   Anna University. A single global list cannot be authoritative about any of
--   it, and forcing one would silently mis-attribute what someone teaches.
--
-- WHAT CHANGES
--   subject_id becomes NULLABLE and a free-text `subject_name` is added, with a
--   constraint that exactly one is present. A row is therefore either
--     · LINKED   — subject_id set, the same subject a batch teaches; still
--                  answers "who can take this batch's Quant?"; or
--     · FREE     — subject_name set, whatever the person actually calls it.
--
--   This is the pattern #99 already established for degree/branch write-ins:
--   capture the real answer rather than forcing it into the nearest listed
--   option, and let an admin promote recurring write-ins later. Nothing is lost —
--   the linked case is unchanged — and the free case starts recording the
--   syllabus vocabulary we currently have no view of at all.
--
--   PK: (user_id, subject_id, relation) cannot survive a nullable subject_id —
--   Postgres forces every PRIMARY KEY column NOT NULL. So a surrogate key plus
--   two partial unique indexes, exactly as 001_rbac_core.sql:44-65 does for
--   user_role and for the same reason. Free names are unique per person
--   case-insensitively, so "DBMS" and "dbms" cannot both be added.
--
-- Idempotent, and safe on a database where 175 is already applied (their
-- college_staff_subject rows are all linked, and stay valid untouched).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------
alter table public.college_staff_subject
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.college_staff_subject
  add column if not exists subject_name text;

-- Bounded so one paste can't fill the column; trimmed non-empty enforced below.
alter table public.college_staff_subject
  drop constraint if exists college_staff_subject_name_len;
alter table public.college_staff_subject
  add constraint college_staff_subject_name_len
  check (subject_name is null or length(btrim(subject_name)) between 1 and 120);

-- Swap the composite PK for the surrogate one. Dropping it also drops the
-- uniqueness it provided, which the partial indexes below restore.
do $$
declare pk text;
begin
  select conname into pk
  from pg_constraint
  where conrelid = 'public.college_staff_subject'::regclass and contype = 'p';
  if pk is not null and pk <> 'college_staff_subject_pkey_id' then
    execute format('alter table public.college_staff_subject drop constraint %I', pk);
  end if;
end $$;

alter table public.college_staff_subject alter column subject_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.college_staff_subject'::regclass and contype = 'p'
  ) then
    alter table public.college_staff_subject
      add constraint college_staff_subject_pkey_id primary key (id);
  end if;
end $$;

-- Exactly one of the two, never both and never neither. `both` would make the
-- row ambiguous to every reader; `neither` is a subject with no identity.
alter table public.college_staff_subject
  drop constraint if exists college_staff_subject_one_of;
alter table public.college_staff_subject
  add constraint college_staff_subject_one_of
  check ((subject_id is not null) <> (subject_name is not null));

-- One row per (person, subject, relation) for LINKED rows…
create unique index if not exists college_staff_subject_linked_uniq
  on public.college_staff_subject (user_id, subject_id, relation)
  where subject_id is not null;

-- …and one per (person, name, relation) for FREE ones, case-insensitively, so
-- "DBMS" and "dbms" are the same entry rather than two.
create unique index if not exists college_staff_subject_free_uniq
  on public.college_staff_subject (user_id, lower(btrim(subject_name)), relation)
  where subject_name is not null;

-- Reporting index for the free half — "which subject names keep coming up?" is
-- the question that tells us what to add to the platform list.
create index if not exists college_staff_subject_name_idx
  on public.college_staff_subject (lower(btrim(subject_name)), relation)
  where subject_name is not null;

comment on column public.college_staff_subject.subject_id is
  'Set when the person picked a PLATFORM subject (public.subject) — links their '
  'declaration to the batch vocabulary. Mutually exclusive with subject_name.';
comment on column public.college_staff_subject.subject_name is
  'Set when the person typed their own subject, because a college syllabus is not '
  'in public.subject and its naming is university-specific. Mutually exclusive '
  'with subject_id.';

-- ---------------------------------------------------------------------------
-- 2) staff_subject_suggestions() — what the free-text input suggests as you type
-- ---------------------------------------------------------------------------
-- Two sources, in order of usefulness:
--   1. platform subjects (public.subject) — picking one LINKS the row to batches;
--   2. names other staff have already typed, so a department converges on one
--      spelling instead of five, without anyone maintaining a list.
--
-- SECURITY DEFINER for the same reason as mentor_teachable_subjects (140):
-- `subject` RLS is exam-staff-only, and a self-registering staff member is not
-- exam staff. Only a name and a flag leave the function.
--
-- The typed-name half is deliberately NOT scoped to the caller's college: subject
-- naming follows the affiliating UNIVERSITY, not the college, so the useful
-- neighbours are usually at a different college under the same university. Only
-- names already entered by ≥2 people are shared, so one person's typo does not
-- become everyone's suggestion.
create or replace function public.staff_subject_suggestions(p_query text default null)
returns table (subject_id uuid, name text, linked boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select nullif(btrim(coalesce(p_query, '')), '') as term)
  select s.id, s.name, true
  from public.subject s, q
  where s.status = 'active'
    and (q.term is null or s.name ilike '%' || q.term || '%')

  union all

  select null::uuid, n.name, false
  from (
    select btrim(css.subject_name) as name, count(distinct css.user_id) as people
    from public.college_staff_subject css, q
    where css.subject_name is not null
      and (q.term is null or css.subject_name ilike '%' || q.term || '%')
      -- Never suggest a name that is already a platform subject: it would appear
      -- twice, once linked and once not, and the unlinked one is the wrong pick.
      and not exists (
        select 1 from public.subject s2
        where lower(s2.name) = lower(btrim(css.subject_name))
      )
    group by btrim(css.subject_name)
  ) n
  where n.people >= 2
  order by 3 desc, 2
  limit 30;
$$;

grant execute on function public.staff_subject_suggestions(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Provisioning: staged invite subjects may now be free-text too
-- ---------------------------------------------------------------------------
-- Supersedes 175 §9. The ONLY change is the college_staff_subject insert, which
-- now takes either `subject_id` or `subject_name` from each staged entry; every
-- other line is 175's, restated because create-or-replace has no partial form.
create or replace function public._provision_from_invites(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.invite%rowtype;
  rk   text;
  meta jsonb;
  rel  text;
  item jsonb;
  v_subject uuid;
  v_name    text;
begin
  if p_user_id is null or p_email is null then return; end if;
  select raw_user_meta_data into meta from auth.users where id = p_user_id;

  for inv in
    select * from public.invite
    where lower(email) = lower(p_email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id, full_name)
    values (
      p_user_id, p_email, inv.employer_id,
      coalesce(inv.staged_profile->>'full_name', meta->>'full_name', meta->>'name')
    )
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id),
          full_name   = coalesce(public.app_user.full_name, excluded.full_name);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (p_user_id, inv.role_id,
            case when rk in ('college_admin', 'college_staff')
                 then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (p_user_id, inv.scope_college_id,
              coalesce(meta->>'full_name', meta->>'name'))
      on conflict (user_id) do nothing;
    end if;

    if rk = 'mentor' and inv.staged_profile is not null then
      insert into public.mentor_profile (
        user_id, full_name, phone, linkedin_url, bio,
        college_id, graduation_year, degree, branch,
        current_company, current_title, industry_id, years_experience,
        mentoring_area_ids, skills, teachable_subject_ids, career_goal_ids,
        mentor_mode_id, contribution_type_id, availability,
        registration_status, last_completed_step, registration_submitted_at
      )
      values (
        p_user_id,
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
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'teachable_subject_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'career_goal_ids') x), '{}'),
        nullif(inv.staged_profile->>'mentor_mode_id', '')::uuid,
        nullif(inv.staged_profile->>'contribution_type_id', '')::uuid,
        inv.staged_profile->>'availability',
        'submitted', 3, now()
      )
      on conflict (user_id) do nothing;
    end if;

    if rk = 'college_staff' and inv.scope_college_id is not null then
      insert into public.college_staff_profile (
        user_id, full_name, phone, linkedin_url, college_id,
        employee_code, designation_id, designation_other, department, department_other,
        office_email, bio,
        highest_qualification, highest_qualification_other, specialization, specialization_other,
        other_qualifications, years_teaching_total, years_at_this_college, joined_year,
        years_industry, previous_institutions, certifications, achievements,
        teaching_year_ids, instruction_language_ids, support_area_ids, contribution_type_ids,
        availability, open_to_mentoring, notes,
        registration_status, last_completed_step, registration_submitted_at,
        status, staff_source, reviewed_by, reviewed_at
      )
      values (
        p_user_id,
        coalesce(inv.staged_profile->>'full_name', meta->>'full_name', meta->>'name'),
        inv.staged_profile->>'phone',
        inv.staged_profile->>'linkedin_url',
        inv.scope_college_id,
        inv.staged_profile->>'employee_code',
        nullif(inv.staged_profile->>'designation_id', '')::uuid,
        inv.staged_profile->>'designation_other',
        inv.staged_profile->>'department',
        inv.staged_profile->>'department_other',
        inv.staged_profile->>'office_email',
        inv.staged_profile->>'bio',
        inv.staged_profile->>'highest_qualification',
        inv.staged_profile->>'highest_qualification_other',
        inv.staged_profile->>'specialization',
        inv.staged_profile->>'specialization_other',
        inv.staged_profile->>'other_qualifications',
        nullif(inv.staged_profile->>'years_teaching_total', '')::int,
        nullif(inv.staged_profile->>'years_at_this_college', '')::int,
        nullif(inv.staged_profile->>'joined_year', '')::int,
        nullif(inv.staged_profile->>'years_industry', '')::int,
        coalesce(inv.staged_profile->'previous_institutions', '[]'::jsonb),
        coalesce(inv.staged_profile->'certifications', '[]'::jsonb),
        coalesce(inv.staged_profile->'achievements', '[]'::jsonb),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'teaching_year_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'instruction_language_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'support_area_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'contribution_type_ids') x), '{}'),
        inv.staged_profile->>'availability',
        coalesce((inv.staged_profile->>'open_to_mentoring')::boolean, false),
        inv.staged_profile->>'notes',
        'submitted', 3, now(),
        'approved', 'invited', inv.invited_by, now()
      )
      on conflict (user_id) do nothing;

      -- Staged subjects: [{subject_id | subject_name, relation, since_year, last_year}]
      for item in
        select * from jsonb_array_elements(coalesce(inv.staged_profile->'subjects', '[]'::jsonb))
      loop
        rel       := item->>'relation';
        v_subject := nullif(item->>'subject_id', '')::uuid;
        v_name    := nullif(btrim(coalesce(item->>'subject_name', '')), '');
        -- Exactly one, matching the table constraint. A staged entry carrying
        -- both is treated as LINKED, the more specific of the two.
        if v_subject is not null then v_name := null; end if;

        if rel in ('teaching', 'taught', 'can_teach')
           and (v_subject is not null or v_name is not null) then
          insert into public.college_staff_subject
            (user_id, subject_id, subject_name, relation, since_year, last_year, is_primary)
          values (
            p_user_id, v_subject, v_name, rel,
            nullif(item->>'since_year', '')::int,
            nullif(item->>'last_year', '')::int,
            coalesce((item->>'is_primary')::boolean, false)
          )
          on conflict do nothing;
        end if;
      end loop;
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;
end;
$$;

commit;
