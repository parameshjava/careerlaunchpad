-- ============================================================================
-- 171_feedback_minors_and_retention.sql
-- The two decisions 159 left open (docs/CHAPTER_FEEDBACK_ANALYSIS.md §8).
--
-- O-11 — UNDER-18 STUDENTS ARE NOT ASKED.  (owner decision)
--   India's DPDP Act 2023 §9 treats an under-18 as a child: processing needs
--   verifiable parental consent, and there is no consent mechanism in this product.
--   Registration already requires a student to be 17 (lib/registration.ts
--   MIN_AGE_YEARS), so 17-year-olds are a real, ordinary case rather than a corner
--   one, and "ask everyone and hope" was not a defensible answer.
--
--   Enforced in FIVE places, because a rule enforced only where the prompt renders
--   is a rule that the API, the reminder mail and the denominator all break:
--     · open_chapter_feedback_request — excluded from eligible_count, so the
--       response rate is a percentage of the students we actually asked.
--     · student_pending_feedback       — no card, no route, nothing to open.
--     · submit_chapter_feedback        — refuses a hand-crafted POST.
--     · request_feedback_responses     — absent from the non-responder list; they
--       did not "stay silent", they were never asked.
--     · enqueue_feedback_reminders     — no email.
--
--   UNKNOWN DATE OF BIRTH COUNTS AS ADULT. date_of_birth is optional on
--   student_profile (migration 121), so excluding on null would silently switch the
--   whole feature off for every student who skipped that field — a compliance posture
--   that quietly deletes the feature is not one. The consequence is stated plainly:
--   this control is only as good as DOB capture, and making DOB mandatory is the
--   follow-up that would close it fully.
--
-- O-12 — RESPONSES ARE KEPT FOR 24 MONTHS.  (owner decision)
--   Two academic years: enough for year-on-year comparison of the same chapter,
--   short enough to be a purpose limit rather than a habit. After that the responses
--   and their answers are DELETED — including the remarks, which are the personal
--   data in this feature (about the student who wrote them, and about the trainer
--   they describe).
--
--   The request row SURVIVES the prune, so "we asked 84 chapters in 2026" stays true
--   while what individuals said does not. That means aggregates for a pruned window
--   read as zero responses, which is the intended cost of a retention period. If
--   longer-range trend is wanted later, the answer is to snapshot the aggregate onto
--   the request row BEFORE pruning — not to keep the raw text.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The age predicate. One definition, five callers.
--    SECURITY DEFINER because student_profile is RLS-protected and this must answer
--    the same way for a student, a staff member, and cron.
-- ---------------------------------------------------------------------------
create or replace function public._feedback_age_eligible(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- true when the student is 18+, OR when we don't know (see O-11 note above).
  select coalesce(
    (select sp.date_of_birth is null
         or sp.date_of_birth <= (current_date - interval '18 years')
       from public.student_profile sp
      where sp.user_id = p_student_id),
    true);
$$;

comment on function public._feedback_age_eligible(uuid) is
  'DPDP O-11: under-18 students are not asked for chapter feedback. Unknown DOB is '
  'treated as adult, so this is only as strong as date-of-birth capture.';

grant execute on function public._feedback_age_eligible(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Supersedes 164 §1. Only change: the eligible_count subquery now filters minors.
-- ---------------------------------------------------------------------------
create or replace function public.open_chapter_feedback_request(
  p_batch_id uuid, p_subject_id uuid, p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form     uuid;
  v_eligible int;
  v_mentors  text[];
  v_id       uuid;
begin
  select id into v_form from public.feedback_form
   where scope = 'chapter' and status = 'active';
  if v_form is null then return null; end if;   -- no active instrument: nothing to ask

  -- Expire a lapsed window for THIS chapter before touching the unique index (164).
  update public.chapter_feedback_request
     set status = 'closed'
   where batch_id = p_batch_id and subject_id = p_subject_id
     and chapter_id = p_chapter_id and status = 'open' and closes_at <= now();

  select id into v_id from public.chapter_feedback_request
   where batch_id = p_batch_id and subject_id = p_subject_id
     and chapter_id = p_chapter_id and status = 'open' and closes_at > now();
  if v_id is not null then return v_id; end if;

  -- The denominator counts only students who will actually be asked (O-11).
  select count(*) into v_eligible
  from public.student_enrollment e
  where e.batch_id = p_batch_id and e.status in ('pending', 'active')
    and public._feedback_age_eligible(e.student_id);

  -- Nobody to ask ⇒ no request. An empty denominator would render as "0 of 0",
  -- which reads as a failure to collect rather than as nobody being enrolled.
  if coalesce(v_eligible, 0) = 0 then return null; end if;

  select coalesce(array_agg(m.mentor_name order by m.mentor_name), '{}')
    into v_mentors
  from public.batch_subject_mentor m
  where m.batch_id = p_batch_id and m.subject_id = p_subject_id
    and m.mentor_name is not null;

  insert into public.chapter_feedback_request
    (batch_id, subject_id, chapter_id, form_id, closes_at, eligible_count, mentor_snapshot)
  values
    (p_batch_id, p_subject_id, p_chapter_id, v_form,
     now() + interval '14 days', v_eligible, coalesce(v_mentors, '{}'))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    select id into v_id from public.chapter_feedback_request
     where batch_id = p_batch_id and subject_id = p_subject_id
       and chapter_id = p_chapter_id and status = 'open' and closes_at > now();
    return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Supersedes 159 §7d. Only change: an under-18 student is shown nothing.
-- ---------------------------------------------------------------------------
create or replace function public.student_pending_feedback()
returns table (
  request_id     uuid,
  batch_id       uuid,
  batch_name     text,
  subject_id     uuid,
  subject_name   text,
  chapter_id     uuid,
  chapter_name   text,
  closes_at      timestamptz,
  submitted_at   timestamptz,
  editable_until timestamptz,
  items          jsonb,
  answers        jsonb,
  remark         text,
  contact_ok     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.batch_id, b.name, r.subject_id, bs.subject_name,
         r.chapter_id, bc.chapter_name, r.closes_at,
         resp.submitted_at,
         resp.submitted_at + interval '24 hours',
         (select jsonb_agg(jsonb_build_object(
                   'itemId', i.id, 'key', i.dimension_key, 'prompt', i.prompt,
                   'shortLabel', i.short_label,
                   'group', i.item_group, 'type', i.response_type,
                   'choices', i.choices, 'required', i.required, 'allowNa', i.allow_na)
                 order by i.sort_order)
            from public.feedback_form_item i where i.form_id = r.form_id),
         -- Keyed by ITEM ID, not dimension_key: the form the student is looking at
         -- addresses its rows by item id (159 §F9), so keying by anything else would
         -- silently stop pre-filling their answers during the 24h edit window.
         (select jsonb_object_agg(a.item_id::text,
                   jsonb_build_object('rating', a.rating, 'choice', a.choice))
            from public.chapter_feedback_answer a where a.response_id = resp.id),
         resp.remark, coalesce(resp.contact_ok, false)
  from public.chapter_feedback_request r
  join public.batch b on b.id = r.batch_id
  join public.batch_subject bs on bs.batch_id = r.batch_id and bs.subject_id = r.subject_id
  left join public.batch_chapter bc
         on bc.batch_id = r.batch_id and bc.subject_id = r.subject_id
        and bc.chapter_id = r.chapter_id
  left join public.chapter_feedback_response resp
         on resp.request_id = r.id and resp.student_id = auth.uid()
  where r.status = 'open' and r.closes_at > now()
    -- O-11: under-18 students are never asked.
    and public._feedback_age_eligible(auth.uid())
    and exists (
      select 1 from public.student_enrollment e
      where e.batch_id = r.batch_id and e.student_id = auth.uid()
        and e.status in ('pending', 'active')
    )
    -- Unanswered, or answered but still inside the edit window.
    and (resp.id is null or resp.submitted_at > now() - interval '24 hours')
  order by r.closes_at, bc.chapter_name;
$$;

grant execute on function public.student_pending_feedback() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The submit guard. One inserted check rather than a restatement of the whole
--    120-line function: a trigger sees every write path, including any future RPC.
-- ---------------------------------------------------------------------------
create or replace function public._feedback_response_age_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._feedback_age_eligible(new.student_id) then
    raise exception 'Feedback is not collected from students under 18';
  end if;
  return new;
end $$;

drop trigger if exists chapter_feedback_response_age_guard on public.chapter_feedback_response;
create trigger chapter_feedback_response_age_guard
  before insert on public.chapter_feedback_response
  for each row execute function public._feedback_response_age_guard();

-- ---------------------------------------------------------------------------
-- 5. Supersedes 167 §3. Only change: arm 2 (the non-responders) excludes minors —
--    a student who was never asked has not stayed silent, and listing them would
--    invite staff to go and chase them.
-- ---------------------------------------------------------------------------
drop function if exists public.request_feedback_responses(uuid);
create or replace function public.request_feedback_responses(p_request_id uuid)
returns table (
  response_id  uuid,
  student_id   uuid,
  student_name text,
  roll_number  text,
  student_email text,
  submitted_at timestamptz,
  answers      jsonb,
  remark       text,
  contact_ok   boolean,
  quality_flag text,
  moderation   text,
  attended     text,
  contacted_at timestamptz,
  contacted_by_name text,
  outreach_note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_req record;
begin
  select * into v_req from public.chapter_feedback_request where id = p_request_id;
  if v_req.id is null then raise exception 'Feedback request not found'; end if;

  if not (
    public.has_permission('feedback.view.identified')
    or exists (
      select 1 from public.batch_college bcol
      where bcol.batch_id = v_req.batch_id
        and public.has_college_permission('feedback.view.identified', bcol.college_id)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  -- Arm 1: every response that exists. Driving off student_enrollment instead would
  -- silently DROP a response whose author later withdrew.
  select resp.id, resp.student_id,
         coalesce(sp.full_name, u.full_name, u.email), sp.roll_number, u.email,
         resp.submitted_at,
         (select jsonb_object_agg(i.dimension_key,
                   jsonb_build_object('rating', a.rating, 'choice', a.choice,
                                      'group', i.item_group, 'prompt', i.prompt))
            from public.chapter_feedback_answer a
            join public.feedback_form_item i on i.id = a.item_id
           where a.response_id = resp.id),
         resp.remark, resp.contact_ok, resp.quality_flag, resp.moderation,
         (select a.choice
            from public.chapter_feedback_answer a
            join public.feedback_form_item i on i.id = a.item_id
           where a.response_id = resp.id and i.dimension_key = 'attended'),
         resp.contacted_at,
         coalesce(cu.full_name, cu.email),
         resp.outreach_note
  from public.chapter_feedback_response resp
  join public.app_user u on u.id = resp.student_id
  left join public.student_profile sp on sp.user_id = resp.student_id
  left join public.app_user cu on cu.id = resp.contacted_by
  where resp.request_id = p_request_id

  union all

  -- Arm 2: enrolled students who did NOT respond. Non-response is half the signal —
  -- but only for students we actually asked (O-11).
  select null::uuid, e.student_id,
         coalesce(sp.full_name, u.full_name, u.email), sp.roll_number, u.email,
         null::timestamptz, null::jsonb, null::text, false, null::text, 'ok', null::text,
         null::timestamptz, null::text, null::text
  from public.student_enrollment e
  join public.app_user u on u.id = e.student_id
  left join public.student_profile sp on sp.user_id = e.student_id
  where e.batch_id = v_req.batch_id and e.status in ('pending', 'active')
    and public._feedback_age_eligible(e.student_id)
    and not exists (
      select 1 from public.chapter_feedback_response r2
      where r2.request_id = p_request_id and r2.student_id = e.student_id
    )

  order by 6 desc nulls last, 3;
end $$;

grant execute on function public.request_feedback_responses(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Supersedes 168 §2. Only change: minors are not emailed either.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_feedback_reminders(p_after_days int default 3)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_days int := greatest(coalesce(p_after_days, 3), 1);
        v_n int;
begin
  with queued as (
    insert into public.feedback_reminder_notification
      (request_id, student_id, email, status, last_error)
    select r.id, e.student_id, lower(u.email),
           case when u.email is null then 'skipped' else 'pending' end,
           case when u.email is null then 'No email address on the student account' end
    from public.chapter_feedback_request r
    join public.student_enrollment e
      on e.batch_id = r.batch_id and e.status in ('pending', 'active')
    join public.app_user u on u.id = e.student_id
    where r.status = 'open'
      and r.closes_at > now()
      and r.opened_at <= now() - make_interval(days => v_days)
      and u.status = 'active'
      and public._feedback_age_eligible(e.student_id)   -- O-11
      and not exists (
        select 1 from public.chapter_feedback_response resp
        where resp.request_id = r.id and resp.student_id = e.student_id
      )
    on conflict (request_id, student_id) do nothing
    returning 1
  )
  select count(*)::int into v_n from queued;
  return v_n;
end $$;

revoke all on function public.enqueue_feedback_reminders(int) from public, anon, authenticated;
grant execute on function public.enqueue_feedback_reminders(int) to service_role;

-- ---------------------------------------------------------------------------
-- 7. O-12: the 24-month prune, and the cron that runs it.
--
--    Daily at 03:20, not hourly: this is a retention boundary measured in months, so
--    a few hours' latency at the edge is immaterial, and a destructive job should run
--    as rarely as its purpose allows. Deleting a response cascades to its answers
--    (chapter_feedback_answer's FK is ON DELETE CASCADE).
-- ---------------------------------------------------------------------------
create or replace function public.prune_old_feedback(p_keep_months int default 24)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_n int;
        v_months int := greatest(coalesce(p_keep_months, 24), 1);
begin
  with gone as (
    delete from public.chapter_feedback_response resp
    using public.chapter_feedback_request r
    where r.id = resp.request_id
      and r.closes_at < now() - make_interval(months => v_months)
    returning 1
  )
  select count(*)::int into v_n from gone;

  -- Reminder rows are the audit trail of asking, not of what was said, and they
  -- carry an email address — so they go on the same clock.
  delete from public.feedback_reminder_notification n
  using public.chapter_feedback_request r
  where r.id = n.request_id
    and r.closes_at < now() - make_interval(months => v_months);

  return v_n;
end $$;

revoke all on function public.prune_old_feedback(int) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('cl-prune-old-feedback');
exception when others then
  null;
end $$;

select cron.schedule(
  'cl-prune-old-feedback',
  '20 3 * * *',
  $cron$ select public.prune_old_feedback(24); $cron$
);

commit;
