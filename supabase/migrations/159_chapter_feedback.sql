-- ============================================================================
-- 159_chapter_feedback.sql
-- Post-chapter student feedback (issue #84). Spec: docs/CHAPTER_FEEDBACK_ANALYSIS.md
--
-- WHAT THIS ADDS
--   A student rates a chapter once its mentor marks it completed. The trainer sees
--   combined results with no names; academic staff see everything and act on it
--   through action items that can be published back to the batch.
--
-- SIX TABLES
--   feedback_form / feedback_form_item     — the VERSIONED instrument (§F9). Answers
--     reference an item id, never a loose string key, so re-wording an item in a new
--     version can never silently rewrite history.
--   chapter_feedback_request               — one per chapter completion. The
--     load-bearing table: eligible_count is the response-rate DENOMINATOR, without
--     which "47% responded" and "who stayed silent" are both unanswerable.
--   chapter_feedback_response / _answer    — one response per student per request.
--   feedback_action_item                   — the staff todo list, with the source
--     that produced it (batch/subject/chapter/dimension) so a closed item is
--     reviewable six months later.
--
-- THE OWNER DECISION THAT SHAPES THE READ PATH (§2 F3, O-2)
--   Nothing is suppressed for a low response count. Standard practice withholds
--   results below ~5 responses; here a single response is shown in full and
--   triaged, because one student's feedback is still feedback that needs
--   addressing. low_confidence is therefore a LABEL, not a gate, and every trip
--   rule below is deliberately n-independent. The privacy that a threshold used to
--   provide is carried instead by the SHAPE of the mentor read: no identity, no
--   timestamps, no submission order, moderation before release. Those hold at n=1.
--
-- WHY THE MENTOR PATH IS A SEPARATE FUNCTION FROM THE STAFF PATH
--   mentor_chapter_feedback() cannot return a per-student row in any shape — it
--   aggregates and returns remark text only. Identity lives exclusively in
--   batch_feedback_responses(), which requires feedback.view.identified. Two
--   functions, not one with a flag, so a future edit cannot leak names into the
--   trainer's screen by flipping a boolean.
--
-- Follows the established pattern: writes go through SECURITY DEFINER RPCs that
-- authorize the CALLER internally (chapter names and the enrolment graph are
-- RLS-locked), tables carry read policies only.
-- ============================================================================

begin;

-- ============================================================================
-- 1) The versioned instrument
-- ============================================================================
create table if not exists public.feedback_form (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null default 'chapter' check (scope in ('chapter')),
  version      int  not null check (version > 0),
  status       text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  published_at timestamptz,
  created_by   uuid references public.app_user(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (scope, version)
);

-- Only one active form per scope: a request must never be ambiguous about which
-- instrument it opened with.
create unique index if not exists feedback_form_one_active_idx
  on public.feedback_form (scope) where status = 'active';

create table if not exists public.feedback_form_item (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references public.feedback_form(id) on delete cascade,
  dimension_key text not null,
  prompt        text not null,
  -- A 1-2 word label for the compact form. The full `prompt` stays the accessible
  -- name (aria-label), so screen readers still hear the whole question while the
  -- visual form fits one question per ROW instead of four lines per question.
  short_label   text,
  item_group    text not null check (item_group in ('teaching', 'content', 'logistics', 'screening')),
  sort_order    int  not null default 0,
  response_type text not null default 'rating5' check (response_type in ('rating5', 'choice')),
  -- Choice items carry their options here (screening only in v1).
  choices       text[],
  required      boolean not null default true,
  allow_na      boolean not null default true,
  unique (form_id, dimension_key)
);
create index if not exists feedback_form_item_form_idx
  on public.feedback_form_item (form_id, sort_order);

-- SELF-HEALING, not decoration. `create table if not exists` is a no-op where the
-- table already exists, so a database that received an earlier copy of THIS file
-- would otherwise never get short_label and the seed below would fail on it. Every
-- statement in this migration is written to be safe to re-run for the same reason.
alter table public.feedback_form_item add column if not exists short_label text;

-- ============================================================================
-- 2) A feedback request — opened by chapter completion
-- ============================================================================
create table if not exists public.chapter_feedback_request (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.batch(id) on delete cascade,
  subject_id     uuid not null,
  chapter_id     uuid not null,
  form_id        uuid not null references public.feedback_form(id) on delete restrict,
  opened_at      timestamptz not null default now(),
  closes_at      timestamptz not null,
  status         text not null default 'open' check (status in ('open', 'closed')),
  -- Enrolled students at open time = the response-rate denominator. Frozen, so a
  -- later enrolment or withdrawal can't retroactively move a historical rate.
  eligible_count int  not null default 0,
  -- Who was assigned to teach this subject when the window opened (§G5). A chapter
  -- taught by two mentors must not attribute a score to either one of them.
  mentor_snapshot text[] not null default '{}',
  -- The trainer's right of reply (§G7) — context, not a rebuttal channel.
  mentor_note    text,
  mentor_note_at timestamptz,
  foreign key (batch_id, subject_id)
    references public.batch_subject (batch_id, subject_id) on delete cascade
);
create index if not exists chapter_feedback_request_batch_idx
  on public.chapter_feedback_request (batch_id, subject_id, chapter_id);
create index if not exists chapter_feedback_request_open_idx
  on public.chapter_feedback_request (status, closes_at);

-- At most one OPEN request per chapter: re-completing a reverted chapter must
-- resume the existing window rather than fragment responses across two rows.
create unique index if not exists chapter_feedback_request_one_open_idx
  on public.chapter_feedback_request (batch_id, subject_id, chapter_id)
  where status = 'open';

-- ============================================================================
-- 3) Responses + answers
-- ============================================================================
create table if not exists public.chapter_feedback_response (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.chapter_feedback_request(id) on delete cascade,
  student_id   uuid not null references public.app_user(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  remark       text check (remark is null or length(remark) <= 1000),
  -- §V9 opt-in. Without it there is no contactable path to this student, which is
  -- what lets the promise on the form ("your trainer sees no names") stay true
  -- while staff still follow up on the ones who agreed to be contacted.
  contact_ok   boolean not null default false,
  -- Data-quality marker, not a judgement of the student: 'straightlined' means every
  -- rating was identical, which the satisficing literature predicts when a form is
  -- coerced. 'too_fast' is reserved for a future client-timed signal.
  quality_flag text check (quality_flag in ('straightlined', 'too_fast')),
  -- Staff can hide a remark that names a person or is abusive. Hiding removes it
  -- from the MENTOR read only — staff always see it, and nothing is deleted.
  moderation   text not null default 'ok' check (moderation in ('ok', 'hidden')),
  unique (request_id, student_id)
);
create index if not exists chapter_feedback_response_request_idx
  on public.chapter_feedback_response (request_id);
create index if not exists chapter_feedback_response_student_idx
  on public.chapter_feedback_response (student_id);

create table if not exists public.chapter_feedback_answer (
  response_id uuid not null references public.chapter_feedback_response(id) on delete cascade,
  item_id     uuid not null references public.feedback_form_item(id) on delete restrict,
  rating      smallint check (rating between 1 and 5),
  choice      text,
  primary key (response_id, item_id),
  -- A rating item stores a rating, a choice item stores a choice, and an N/A stores
  -- neither. Two populated columns would make every average ambiguous.
  check (rating is null or choice is null)
);

-- ============================================================================
-- 4) Action items — the todo list, with provenance
-- ============================================================================
create table if not exists public.feedback_action_item (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.batch(id) on delete cascade,
  subject_id    uuid,
  chapter_id    uuid,
  request_id    uuid references public.chapter_feedback_request(id) on delete set null,
  dimension_key text,
  title         text not null check (length(trim(title)) > 0),
  detail        text,
  owner_user_id uuid references public.app_user(id) on delete set null,
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_on        date,
  status        text not null default 'open'
                  check (status in ('open', 'in_progress', 'done', 'dropped')),
  resolution_note text,
  -- Closing the loop (§F6): a student sees the title + status of published items on
  -- their assessments hub. Nothing else about this table is student-visible.
  published_to_students boolean not null default false,
  created_by    uuid references public.app_user(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references public.app_user(id) on delete set null
);
create index if not exists feedback_action_item_batch_idx
  on public.feedback_action_item (batch_id, status, due_on);
create index if not exists feedback_action_item_request_idx
  on public.feedback_action_item (request_id);

-- ============================================================================
-- 5) Permissions (data)
-- ============================================================================
insert into public.permission (key, description) values
  ('feedback.submit',          'Submit chapter feedback as an enrolled student.'),
  ('feedback.view.identified', 'See chapter feedback with the responding student''s identity.'),
  ('feedback.action.manage',   'Create, own and close feedback action items.'),
  ('feedback.form.manage',     'Publish a new version of the feedback form.')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on p.key = 'feedback.submit'
where r.key = 'student'
on conflict do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on p.key = 'feedback.view.identified'
where r.key in ('platform_admin', 'coordinator', 'support', 'college_admin')
on conflict do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on p.key = 'feedback.action.manage'
where r.key in ('platform_admin', 'coordinator', 'support')
on conflict do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on p.key = 'feedback.form.manage'
where r.key = 'platform_admin'
on conflict do nothing;

-- ============================================================================
-- 6) Seed form v1 — six rating items + one screening item (§4.2)
--    'confidence' is self-efficacy, not satisfaction: it is the item that pairs
--    against the chapter's quiz outcome, which is the whole point of §G6.
-- ============================================================================
insert into public.feedback_form (scope, version, status, published_at)
select 'chapter', 1, 'active', now()
where not exists (select 1 from public.feedback_form where scope = 'chapter' and version = 1);

insert into public.feedback_form_item
  (form_id, dimension_key, prompt, short_label, item_group, sort_order, response_type, choices, required, allow_na)
select f.id, v.key, v.prompt, v.short_label, v.grp, v.ord, v.rtype, v.choices, v.required, v.allow_na
from public.feedback_form f
cross join (values
  ('clarity',    'The trainer explained this chapter''s concepts clearly.', 'Explained clearly', 'teaching',  1, 'rating5', null::text[], true, true),
  ('pace',       'The pace of this chapter suited me.',                     'Pace suited me',    'teaching',  2, 'rating5', null,         true, true),
  ('doubts',     'My questions and doubts were addressed.',                 'Doubts answered',   'teaching',  3, 'rating5', null,         true, true),
  ('material',   'The notes, examples and practice were useful.',           'Notes & practice',  'content',   4, 'rating5', null,         true, true),
  ('confidence', 'I feel ready to attempt questions from this chapter.',    'I feel ready',      'content',   5, 'rating5', null,         true, true),
  ('logistics',  'Class timing, audio/video and joining worked fine.',      'Timing & audio',    'logistics', 6, 'rating5', null,         true, true),
  ('attended',   'How much of this chapter did you attend?',                'I attended',        'screening', 7, 'choice',
     array['none', 'some', 'most', 'all'], true, false)
) as v(key, prompt, short_label, grp, ord, rtype, choices, required, allow_na)
where f.scope = 'chapter' and f.version = 1
on conflict (form_id, dimension_key) do nothing;

-- Backfill the short labels onto rows seeded before the column existed. Scoped to
-- `is null` so it never overwrites a label an admin has since edited, and it does
-- NOT touch `prompt` — re-wording a live question would break trend comparability
-- (§F9), which is the whole reason the form is versioned.
update public.feedback_form_item i
   set short_label = v.short_label
from (values
  ('clarity', 'Explained clearly'), ('pace', 'Pace suited me'), ('doubts', 'Doubts answered'),
  ('material', 'Notes & practice'), ('confidence', 'I feel ready'),
  ('logistics', 'Timing & audio'),  ('attended', 'I attended')
) as v(key, short_label)
where i.dimension_key = v.key and i.short_label is null;

-- ============================================================================
-- 7) RPCs
-- ============================================================================

-- 7a) Open a request for a completed chapter. Called by set_batch_chapter_progress
--     (7b) as a consequence of an already-authorized progress write, so it is NOT
--     permission-guarded — like sync_batch_chapters (143 §7a) it only derives rows
--     from data the caller was allowed to change, and exposes nothing.
--     Idempotent via the one-open-per-chapter index: a revert → re-complete resumes
--     the existing window instead of splitting responses across two requests.
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

  -- Resume an open window rather than opening a second one.
  select id into v_id from public.chapter_feedback_request
   where batch_id = p_batch_id and subject_id = p_subject_id
     and chapter_id = p_chapter_id and status = 'open';
  if v_id is not null then return v_id; end if;

  select count(*) into v_eligible
  from public.student_enrollment e
  where e.batch_id = p_batch_id and e.status in ('pending', 'active');

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
  -- Two concurrent completions race for the partial unique index; the loser reads
  -- the winner's row instead of surfacing a 500 to whoever clicked second.
  when unique_violation then
    select id into v_id from public.chapter_feedback_request
     where batch_id = p_batch_id and subject_id = p_subject_id
       and chapter_id = p_chapter_id and status = 'open';
    return v_id;
end $$;

-- 7b) Supersedes 143 §7c. Same body and authorization; the only change is that
--     completing a chapter now also opens its feedback window. Restated in full
--     because Postgres has no way to append to an existing function body.
create or replace function public.set_batch_chapter_progress(
  p_batch_id uuid, p_subject_id uuid, p_chapter_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_batch_status text;
begin
  if p_status not in ('not_started', 'in_progress', 'completed') then
    raise exception 'Invalid status %', p_status;
  end if;

  if not (
    public.has_permission('batch.progress.manage')
    or exists (select 1 from public.batch_subject_mentor m
               where m.batch_id = p_batch_id and m.subject_id = p_subject_id
                 and m.mentor_id = v_uid)
  ) then
    raise exception 'Forbidden';
  end if;

  select status into v_batch_status from public.batch where id = p_batch_id;
  if v_batch_status is null then raise exception 'Batch not found'; end if;
  if v_batch_status not in ('open', 'running') then
    raise exception 'Progress can only change while the batch is open or running';
  end if;

  update public.batch_chapter
     set status = p_status,
         started_at   = case when p_status = 'in_progress' and started_at is null then now() else started_at end,
         started_by   = case when p_status = 'in_progress' and started_by is null then v_uid else started_by end,
         completed_at = case when p_status = 'completed' then now()
                             when p_status = 'not_started' then null else completed_at end,
         completed_by = case when p_status = 'completed' then v_uid
                             when p_status = 'not_started' then null else completed_by end,
         updated_at   = now()
   where batch_id = p_batch_id and subject_id = p_subject_id and chapter_id = p_chapter_id;
  if not found then raise exception 'Chapter not found in this batch'; end if;

  -- Completion opens the feedback window (#84). Reverting does NOT close it:
  -- responses already given stay valid, and the window expires on its own date.
  if p_status = 'completed' then
    perform public.open_chapter_feedback_request(p_batch_id, p_subject_id, p_chapter_id);
  end if;
end $$;

-- 7c) Expire windows past their date. Correctness does NOT depend on this running:
--     every read below treats (status='open' and closes_at <= now()) as closed. This
--     exists so the stored status eventually matches, for cron (mirrors
--     111_auto_close_expired_exams.sql) or a manual sweep.
create or replace function public.close_expired_feedback_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  update public.chapter_feedback_request
     set status = 'closed'
   where status = 'open' and closes_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 7d) The calling student's open feedback requests, with the form inlined so the
--     prompt renders in one round trip. Includes an already-answered request while
--     the 24h edit window is live, so the student can correct a mis-tap.
drop function if exists public.student_pending_feedback();
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
    and exists (
      select 1 from public.student_enrollment e
      where e.batch_id = r.batch_id and e.student_id = auth.uid()
        and e.status in ('pending', 'active')
    )
    -- Unanswered, or answered but still inside the edit window.
    and (resp.id is null or resp.submitted_at > now() - interval '24 hours')
  order by r.closes_at, bc.chapter_name;
$$;

-- 7e) Submit (or correct) a response. p_answers: [{item_id, rating} | {item_id, choice}]
--     Guards: enrolled, window open, every required item answered, and one response
--     per student per request — a re-submit inside 24h REPLACES, it does not stack.
create or replace function public.submit_chapter_feedback(
  p_request_id uuid,
  p_answers    jsonb,
  p_remark     text default null,
  p_contact_ok boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_req      record;
  v_resp     uuid;
  v_existing record;
  rec        jsonb;
  v_item     record;
  v_missing  int;
  v_ratings  int[];
  v_flag     text := null;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(p_answers) <> 'array' then raise exception 'answers must be an array'; end if;

  select * into v_req from public.chapter_feedback_request where id = p_request_id;
  if v_req.id is null then raise exception 'Feedback request not found'; end if;
  if v_req.status <> 'open' or v_req.closes_at <= now() then
    raise exception 'This feedback window has closed';
  end if;

  if not exists (
    select 1 from public.student_enrollment e
    where e.batch_id = v_req.batch_id and e.student_id = v_uid
      and e.status in ('pending', 'active')
  ) then
    raise exception 'You are not enrolled in this batch';
  end if;

  select id, submitted_at into v_existing
  from public.chapter_feedback_response
  where request_id = p_request_id and student_id = v_uid;

  if v_existing.id is not null then
    if v_existing.submitted_at <= now() - interval '24 hours' then
      raise exception 'Your feedback can no longer be edited';
    end if;
    v_resp := v_existing.id;
    update public.chapter_feedback_response
       set remark = nullif(trim(coalesce(p_remark, '')), ''),
           contact_ok = coalesce(p_contact_ok, false),
           updated_at = now()
     where id = v_resp;
    delete from public.chapter_feedback_answer where response_id = v_resp;
  else
    insert into public.chapter_feedback_response (request_id, student_id, remark, contact_ok)
    values (p_request_id, v_uid,
            nullif(trim(coalesce(p_remark, '')), ''), coalesce(p_contact_ok, false))
    returning id into v_resp;
  end if;

  -- Answers. Each item is validated against the form the REQUEST opened with, so a
  -- payload can't smuggle in an item from another version.
  for rec in select * from jsonb_array_elements(p_answers) loop
    select * into v_item from public.feedback_form_item
     where id = (rec->>'item_id')::uuid and form_id = v_req.form_id;
    if v_item.id is null then
      raise exception 'Unknown feedback item %', rec->>'item_id';
    end if;

    if v_item.response_type = 'rating5' then
      if rec->>'rating' is not null then
        if (rec->>'rating')::int not between 1 and 5 then
          raise exception 'Rating for % must be 1-5', v_item.dimension_key;
        end if;
        insert into public.chapter_feedback_answer (response_id, item_id, rating)
        values (v_resp, v_item.id, (rec->>'rating')::int);
      elsif v_item.allow_na then
        -- Explicit N/A: the row exists with neither value, which is how "asked and
        -- declined" stays distinguishable from "never asked".
        insert into public.chapter_feedback_answer (response_id, item_id) values (v_resp, v_item.id);
      end if;
    else
      if rec->>'choice' is not null then
        if not (rec->>'choice' = any (coalesce(v_item.choices, '{}'))) then
          raise exception 'Invalid choice for %', v_item.dimension_key;
        end if;
        insert into public.chapter_feedback_answer (response_id, item_id, choice)
        values (v_resp, v_item.id, rec->>'choice');
      end if;
    end if;
  end loop;

  -- Every required item must carry an answer row (an N/A row counts).
  select count(*) into v_missing
  from public.feedback_form_item i
  where i.form_id = v_req.form_id and i.required
    and not exists (
      select 1 from public.chapter_feedback_answer a
      where a.response_id = v_resp and a.item_id = i.id
    );
  if v_missing > 0 then
    raise exception 'Please answer all % remaining question(s)', v_missing;
  end if;

  -- Straightlining (§F5): four or more ratings, all identical. Recorded, never
  -- rejected — the student still gets their say, and a rising share of these is a
  -- signal that the prompt is being experienced as compulsory.
  select array_agg(a.rating) into v_ratings
  from public.chapter_feedback_answer a
  where a.response_id = v_resp and a.rating is not null;
  if coalesce(array_length(v_ratings, 1), 0) >= 4
     and (select count(distinct x) from unnest(v_ratings) x) = 1 then
    v_flag := 'straightlined';
  end if;
  update public.chapter_feedback_response set quality_flag = v_flag where id = v_resp;

  return v_resp;
end $$;

-- 7f) Aggregated feedback for the CALLING MENTOR's assigned subjects.
--     Deliberately incapable of returning a per-student row: it emits group scores,
--     item scores and remark text only. Scores are withheld while the window is
--     OPEN (O-5) — a live-updating score invites watching rather than teaching —
--     but the response count is always visible so participation can be chased.
--     No suppression at low n (O-2): low_confidence labels it instead.
drop function if exists public.mentor_chapter_feedback();
create or replace function public.mentor_chapter_feedback()
returns table (
  request_id      uuid,
  batch_id        uuid,
  batch_name      text,
  subject_id      uuid,
  subject_name    text,
  chapter_id      uuid,
  chapter_name    text,
  opened_at       timestamptz,
  closes_at       timestamptz,
  is_open         boolean,
  eligible_count  int,
  response_count  int,
  low_confidence  boolean,
  group_scores    jsonb,
  item_scores     jsonb,
  remarks         text[],
  quiz_attempted  int,
  quiz_pass_pct   numeric,
  mentor_note     text
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.*, b.name as batch_name, bs.subject_name, bc.chapter_name,
           (r.status = 'open' and r.closes_at > now()) as open_now
    from public.chapter_feedback_request r
    join public.batch_subject_mentor m
      on m.batch_id = r.batch_id and m.subject_id = r.subject_id and m.mentor_id = auth.uid()
    join public.batch b on b.id = r.batch_id
    join public.batch_subject bs on bs.batch_id = r.batch_id and bs.subject_id = r.subject_id
    left join public.batch_chapter bc
           on bc.batch_id = r.batch_id and bc.subject_id = r.subject_id
          and bc.chapter_id = r.chapter_id
  )
  select mine.id, mine.batch_id, mine.batch_name, mine.subject_id, mine.subject_name,
         mine.chapter_id, mine.chapter_name, mine.opened_at, mine.closes_at, mine.open_now,
         mine.eligible_count,
         coalesce(rc.n, 0)::int,
         (coalesce(rc.n, 0) < 5),
         case when mine.open_now then null else grp.scores end,
         case when mine.open_now then null else itm.scores end,
         case when mine.open_now then null else rm.remarks end,
         coalesce(qz.attempted, 0)::int,
         qz.pass_pct,
         mine.mentor_note
  from mine
  left join lateral (
    select count(*) as n from public.chapter_feedback_response resp
    where resp.request_id = mine.id
  ) rc on true
  -- Top-2-box per group: ratings of 4-5 over non-N/A ratings. Percentage AND raw
  -- counts, because "79%" without "11 of 14" is the number that misleads.
  left join lateral (
    select jsonb_object_agg(g.item_group, jsonb_build_object(
             'top2', g.top2, 'rated', g.rated,
             'pct', case when g.rated > 0 then round(100.0 * g.top2 / g.rated, 0) end,
             'mean', case when g.rated > 0 then round(g.total::numeric / g.rated, 2) end)) as scores
    from (
      select i.item_group,
             count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             coalesce(sum(a.rating), 0) as total
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = mine.id and i.response_type = 'rating5'
      group by i.item_group
    ) g
  ) grp on true
  left join lateral (
    select jsonb_object_agg(s.dimension_key, jsonb_build_object(
             'prompt', s.prompt, 'group', s.item_group,
             'rated', s.rated, 'top2', s.top2,
             'pct', case when s.rated > 0 then round(100.0 * s.top2 / s.rated, 0) end,
             'mean', case when s.rated > 0 then round(s.total::numeric / s.rated, 2) end,
             'dist', s.dist)) as scores
    from (
      select i.dimension_key, i.prompt, i.item_group,
             count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             coalesce(sum(a.rating), 0) as total,
             jsonb_build_object(
               '1', count(*) filter (where a.rating = 1),
               '2', count(*) filter (where a.rating = 2),
               '3', count(*) filter (where a.rating = 3),
               '4', count(*) filter (where a.rating = 4),
               '5', count(*) filter (where a.rating = 5)) as dist
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = mine.id and i.response_type = 'rating5'
      group by i.dimension_key, i.prompt, i.item_group
    ) s
  ) itm on true
  -- Remarks in RANDOM order with no timestamps. With names already gone, order of
  -- submission is the remaining re-identification vector in a small batch.
  left join lateral (
    select array_agg(resp.remark order by random()) as remarks
    from public.chapter_feedback_response resp
    where resp.request_id = mine.id
      and resp.moderation = 'ok' and resp.remark is not null
  ) rm on true
  -- The learning half (§G6): what the chapter's quiz actually says. A rating read
  -- without this cannot separate "enjoyed it" from "learned it".
  left join lateral (
    select count(distinct qa.student_id) as attempted,
           case when count(distinct qa.student_id) > 0
                then round(100.0 * count(distinct qa.student_id) filter (where qa.passed)
                           / count(distinct qa.student_id), 0) end as pass_pct
    from public.chapter_quiz_attempt qa
    where qa.batch_id = mine.batch_id and qa.chapter_id = mine.chapter_id
      and qa.status = 'submitted'
  ) qz on true
  order by mine.opened_at desc;
$$;

-- 7g) The trainer's context note (§G7). Assigned mentor, or staff on their behalf.
create or replace function public.set_chapter_feedback_note(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_req record;
begin
  select * into v_req from public.chapter_feedback_request where id = p_request_id;
  if v_req.id is null then raise exception 'Feedback request not found'; end if;

  if not (
    public.has_permission('batch.progress.manage')
    or exists (select 1 from public.batch_subject_mentor m
               where m.batch_id = v_req.batch_id and m.subject_id = v_req.subject_id
                 and m.mentor_id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  update public.chapter_feedback_request
     set mentor_note = nullif(trim(coalesce(p_note, '')), ''),
         mentor_note_at = now()
   where id = p_request_id;
end $$;

-- 7h) Staff overview for one batch: every request with its aggregates, the response
--     rate, and the TRIP FLAGS that earn triage. The rules are n-independent by
--     design (O-2) — one rating of 1-2, or one remark, is enough.
drop function if exists public.batch_feedback_overview(uuid);
create or replace function public.batch_feedback_overview(p_batch_id uuid)
returns table (
  request_id     uuid,
  subject_id     uuid,
  subject_name   text,
  chapter_id     uuid,
  chapter_name   text,
  opened_at      timestamptz,
  closes_at      timestamptz,
  is_open        boolean,
  eligible_count int,
  response_count int,
  response_pct   numeric,
  low_confidence boolean,
  group_scores   jsonb,
  item_scores    jsonb,
  remark_count   int,
  flagged_count  int,
  trips          text[],
  quiz_attempted int,
  quiz_pass_pct  numeric,
  mentor_note    text,
  mentor_snapshot text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_permission('feedback.view.identified')
    or public.has_permission('batch.progress.manage')
    or exists (
      select 1 from public.batch_college bcol
      where bcol.batch_id = p_batch_id
        and public.has_college_permission('feedback.view.identified', bcol.college_id)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  with reqs as (
    select r.*, bs.subject_name, bc.chapter_name,
           (r.status = 'open' and r.closes_at > now()) as open_now
    from public.chapter_feedback_request r
    join public.batch_subject bs on bs.batch_id = r.batch_id and bs.subject_id = r.subject_id
    left join public.batch_chapter bc
           on bc.batch_id = r.batch_id and bc.subject_id = r.subject_id
          and bc.chapter_id = r.chapter_id
    where r.batch_id = p_batch_id
  )
  select reqs.id, reqs.subject_id, reqs.subject_name, reqs.chapter_id, reqs.chapter_name,
         reqs.opened_at, reqs.closes_at, reqs.open_now, reqs.eligible_count,
         coalesce(rc.n, 0)::int,
         case when reqs.eligible_count > 0
              then round(100.0 * coalesce(rc.n, 0) / reqs.eligible_count, 0) end,
         (coalesce(rc.n, 0) < 5),
         grp.scores, itm.scores,
         coalesce(rc.remarks, 0)::int,
         coalesce(rc.flagged, 0)::int,
         -- Trip rules (§4.8). Any one of these puts the chapter on the triage list.
         (select coalesce(array_agg(t), '{}') from (
            select 'low_rating'::text as t where rc.low_rating > 0
            union all
            select 'low_mean' where itm.min_mean is not null and itm.min_mean < 3.0
            union all
            select 'has_remark' where coalesce(rc.remarks, 0) > 0
            union all
            select 'low_turnout'
             where not reqs.open_now and reqs.eligible_count > 0
               and (100.0 * coalesce(rc.n, 0) / reqs.eligible_count) < 40
          ) tr),
         coalesce(qz.attempted, 0)::int, qz.pass_pct,
         reqs.mentor_note, reqs.mentor_snapshot
  from reqs
  left join lateral (
    select count(*) as n,
           count(*) filter (where resp.remark is not null) as remarks,
           count(*) filter (where resp.quality_flag is not null) as flagged,
           (select count(*)
              from public.chapter_feedback_response r2
              join public.chapter_feedback_answer a2 on a2.response_id = r2.id
              join public.feedback_form_item i2 on i2.id = a2.item_id
             where r2.request_id = reqs.id and a2.rating between 1 and 2
               and i2.item_group in ('teaching', 'content')) as low_rating
    from public.chapter_feedback_response resp
    where resp.request_id = reqs.id
  ) rc on true
  left join lateral (
    select jsonb_object_agg(g.item_group, jsonb_build_object(
             'top2', g.top2, 'rated', g.rated,
             'pct', case when g.rated > 0 then round(100.0 * g.top2 / g.rated, 0) end,
             'mean', case when g.rated > 0 then round(g.total::numeric / g.rated, 2) end)) as scores
    from (
      select i.item_group, count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             coalesce(sum(a.rating), 0) as total
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = reqs.id and i.response_type = 'rating5'
      group by i.item_group
    ) g
  ) grp on true
  left join lateral (
    select jsonb_object_agg(s.dimension_key, jsonb_build_object(
             'prompt', s.prompt, 'group', s.item_group, 'rated', s.rated, 'top2', s.top2,
             'pct', case when s.rated > 0 then round(100.0 * s.top2 / s.rated, 0) end,
             'mean', s.mean)) as scores,
           min(s.mean) as min_mean
    from (
      select i.dimension_key, i.prompt, i.item_group,
             count(a.rating) as rated,
             count(*) filter (where a.rating >= 4) as top2,
             case when count(a.rating) > 0
                  then round(sum(a.rating)::numeric / count(a.rating), 2) end as mean
      from public.chapter_feedback_response resp
      join public.chapter_feedback_answer a on a.response_id = resp.id
      join public.feedback_form_item i on i.id = a.item_id
      where resp.request_id = reqs.id and i.response_type = 'rating5'
      group by i.dimension_key, i.prompt, i.item_group
    ) s
  ) itm on true
  left join lateral (
    select count(distinct qa.student_id) as attempted,
           case when count(distinct qa.student_id) > 0
                then round(100.0 * count(distinct qa.student_id) filter (where qa.passed)
                           / count(distinct qa.student_id), 0) end as pass_pct
    from public.chapter_quiz_attempt qa
    where qa.batch_id = reqs.batch_id and qa.chapter_id = reqs.chapter_id
      and qa.status = 'submitted'
  ) qz on true
  order by reqs.opened_at desc;
end $$;

-- 7i) The IDENTIFIED per-response rows for one request. This is the only function
--     in the file that returns a student's name, and it requires
--     feedback.view.identified (globally, or college-scoped on one of the batch's
--     colleges). Non-responders are included with a null response so "who stayed
--     silent" is answerable — that list is the point of the eligible_count freeze.
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
  attended     text
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
  -- TWO ARMS, NOT ONE JOIN OFF student_enrollment.
  --   Arm 1 is every response that exists. Driving the query off the enrolment table
  --   instead would silently DROP a response whose author later withdrew or was
  --   cancelled — the count would read 14 while 13 rows rendered, and a real piece of
  --   feedback would become invisible at exactly the moment it matters most.
  --   Arm 2 is the currently-enrolled students who did NOT respond, because
  --   non-response is half the signal.
  -- Name comes from the student's own profile first (what staff recognise), then the
  -- account name, then the email — a row must never render blank.
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
           where a.response_id = resp.id and i.dimension_key = 'attended')
  from public.chapter_feedback_response resp
  join public.app_user u on u.id = resp.student_id
  left join public.student_profile sp on sp.user_id = resp.student_id
  where resp.request_id = p_request_id

  union all

  select null::uuid, e.student_id,
         coalesce(sp.full_name, u.full_name, u.email), sp.roll_number, u.email,
         null::timestamptz, null::jsonb, null::text, false, null::text, 'ok', null::text
  from public.student_enrollment e
  join public.app_user u on u.id = e.student_id
  left join public.student_profile sp on sp.user_id = e.student_id
  where e.batch_id = v_req.batch_id and e.status in ('pending', 'active')
    and not exists (
      select 1 from public.chapter_feedback_response r2
      where r2.request_id = p_request_id and r2.student_id = e.student_id
    )

  -- Responders first, then the silent ones.
  order by 6 desc nulls last, 3;
end $$;

-- 7j) Hide or restore a remark for the mentor read. Staff only; never deletes.
create or replace function public.set_feedback_moderation(p_response_id uuid, p_moderation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_moderation not in ('ok', 'hidden') then
    raise exception 'Invalid moderation state %', p_moderation;
  end if;
  if not public.has_permission('feedback.view.identified') then
    raise exception 'Forbidden';
  end if;
  update public.chapter_feedback_response set moderation = p_moderation, updated_at = now()
   where id = p_response_id;
  if not found then raise exception 'Response not found'; end if;
end $$;

-- ============================================================================
-- 8) RLS
-- ============================================================================
alter table public.feedback_form              enable row level security;
alter table public.feedback_form_item         enable row level security;
alter table public.chapter_feedback_request   enable row level security;
alter table public.chapter_feedback_response  enable row level security;
alter table public.chapter_feedback_answer    enable row level security;
alter table public.feedback_action_item       enable row level security;

-- The instrument itself is not secret — the prompts are shown to every student.
drop policy if exists feedback_form_read on public.feedback_form;
create policy feedback_form_read on public.feedback_form
  for select to authenticated using (true);
drop policy if exists feedback_form_manage on public.feedback_form;
create policy feedback_form_manage on public.feedback_form
  for all to authenticated
  using (public.has_permission('feedback.form.manage'))
  with check (public.has_permission('feedback.form.manage'));

drop policy if exists feedback_form_item_read on public.feedback_form_item;
create policy feedback_form_item_read on public.feedback_form_item
  for select to authenticated using (true);
drop policy if exists feedback_form_item_manage on public.feedback_form_item;
create policy feedback_form_item_manage on public.feedback_form_item
  for all to authenticated
  using (public.has_permission('feedback.form.manage'))
  with check (public.has_permission('feedback.form.manage'));

-- Requests: staff and assigned mentors may read the row (dates, counts, note).
-- Students reach requests only through student_pending_feedback(). Writes are
-- RPC-only — no write policy on purpose.
drop policy if exists chapter_feedback_request_staff_read on public.chapter_feedback_request;
create policy chapter_feedback_request_staff_read on public.chapter_feedback_request
  for select to authenticated
  using (public.has_permission('batch.progress.manage')
         or public.has_permission('feedback.view.identified'));

drop policy if exists chapter_feedback_request_mentor_read on public.chapter_feedback_request;
create policy chapter_feedback_request_mentor_read on public.chapter_feedback_request
  for select to authenticated
  using (exists (
    select 1 from public.batch_subject_mentor m
    where m.batch_id = chapter_feedback_request.batch_id
      and m.subject_id = chapter_feedback_request.subject_id
      and m.mentor_id = auth.uid()
  ));

-- Responses: a student reads their OWN; staff with feedback.view.identified read
-- all. There is deliberately NO mentor policy — a mentor's only path is the
-- aggregating definer function, which cannot emit a student row.
drop policy if exists chapter_feedback_response_self_read on public.chapter_feedback_response;
create policy chapter_feedback_response_self_read on public.chapter_feedback_response
  for select to authenticated using (student_id = auth.uid());

drop policy if exists chapter_feedback_response_staff_read on public.chapter_feedback_response;
create policy chapter_feedback_response_staff_read on public.chapter_feedback_response
  for select to authenticated
  using (public.has_permission('feedback.view.identified'));

drop policy if exists chapter_feedback_answer_self_read on public.chapter_feedback_answer;
create policy chapter_feedback_answer_self_read on public.chapter_feedback_answer
  for select to authenticated
  using (exists (
    select 1 from public.chapter_feedback_response resp
    where resp.id = chapter_feedback_answer.response_id and resp.student_id = auth.uid()
  ));

drop policy if exists chapter_feedback_answer_staff_read on public.chapter_feedback_answer;
create policy chapter_feedback_answer_staff_read on public.chapter_feedback_answer
  for select to authenticated
  using (public.has_permission('feedback.view.identified'));

-- Action items: staff manage. Mentors and students read only the ones explicitly
-- PUBLISHED (§F6 closing the loop).
--
-- WHY A MENTOR IS NOT GIVEN THEIR SUBJECT'S FULL ACTION LIST
--   title/detail/resolution_note are staff-authored free text on a screen where
--   naming a student is natural ("call Rahul about DI"). Handing a mentor every
--   item for their subject would therefore reintroduce, through a side door, the
--   identity that mentor_chapter_feedback() is built to withhold. Published items
--   are written FOR a student audience, so they are name-free by construction —
--   that is exactly the subset a trainer can safely be shown.
drop policy if exists feedback_action_item_staff_all on public.feedback_action_item;
create policy feedback_action_item_staff_all on public.feedback_action_item
  for all to authenticated
  using (public.has_permission('feedback.action.manage'))
  with check (public.has_permission('feedback.action.manage'));

drop policy if exists feedback_action_item_mentor_read on public.feedback_action_item;
create policy feedback_action_item_mentor_read on public.feedback_action_item
  for select to authenticated
  using (published_to_students and exists (
    select 1 from public.batch_subject_mentor m
    where m.batch_id = feedback_action_item.batch_id
      and (feedback_action_item.subject_id is null or m.subject_id = feedback_action_item.subject_id)
      and m.mentor_id = auth.uid()
  ));

drop policy if exists feedback_action_item_student_read on public.feedback_action_item;
create policy feedback_action_item_student_read on public.feedback_action_item
  for select to authenticated
  using (published_to_students and exists (
    select 1 from public.student_enrollment e
    where e.batch_id = feedback_action_item.batch_id
      and e.student_id = auth.uid()
      and e.status in ('pending', 'active', 'completed')
  ));

-- ============================================================================
-- 9) Grants
-- ============================================================================
grant select on public.feedback_form                      to authenticated;
grant select on public.feedback_form_item                 to authenticated;
grant select, insert, update, delete on public.feedback_form      to authenticated;
grant select, insert, update, delete on public.feedback_form_item to authenticated;
grant select on public.chapter_feedback_request            to authenticated;
grant select on public.chapter_feedback_response           to authenticated;
grant select on public.chapter_feedback_answer             to authenticated;
grant select, insert, update, delete on public.feedback_action_item to authenticated;

-- open_chapter_feedback_request and close_expired_feedback_requests are NOT granted
-- to authenticated: the first runs only from set_batch_chapter_progress (as the
-- definer), the second only from cron / a maintenance session.
grant execute on function public.student_pending_feedback()                        to authenticated;
grant execute on function public.submit_chapter_feedback(uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.mentor_chapter_feedback()                        to authenticated;
grant execute on function public.set_chapter_feedback_note(uuid, text)            to authenticated;
grant execute on function public.batch_feedback_overview(uuid)                    to authenticated;
grant execute on function public.request_feedback_responses(uuid)                 to authenticated;
grant execute on function public.set_feedback_moderation(uuid, text)              to authenticated;

commit;
