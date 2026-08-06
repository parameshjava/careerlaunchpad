-- ============================================================================
-- 174_feedback_review_fixes.sql
-- Code-review fixes for 164–173 (PR #106). Six defects, four of them mine, two
-- inherited from an idiom 159 established and my new functions copied.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 1) CROSS-COLLEGE LEAK: `has_permission()` DOES NOT MEAN "GLOBALLY".
--
--    has_permission (003_auth_helpers.sql) never looks at ur.scope_college_id, so it
--    is TRUE for a college_admin whose grant is scoped to one college. Every function
--    written as
--        has_permission('feedback.view.identified')  -- "global?"
--        or exists (… has_college_permission(…, that batch's college) …)
--    therefore short-circuits on the first branch, the scoped branch is dead code, and
--    a college admin reads every college's data. That idiom is in 159 and I copied it
--    into feedback_triage_overview (166) and students_missing_dob (173), where the blast
--    radius is largest: a cross-batch inbox and a cross-college student roster.
--
--    Fix: has_global_permission(), which requires an UNSCOPED grant. Role assignment
--    only ever sets scope_college_id for college_admin (106 §4/§5), so owner,
--    platform_admin, coordinator and support keep exactly the reach they have today
--    and only the scoped roles are narrowed — to what their scope already said.
--
--    Every reader I restated in 164–173 is corrected here, not just the two the review
--    flagged, because the same one-line mistake sits in all of them.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 2) THE FAIL-CLOSED AGE GATE BROKE TWO THINGS 173 DID NOT ACCOUNT FOR.
--
--    a) A batch where nobody has a date of birth opened NO window at all: 171 returns
--       null when the age-eligible count is 0. Silent, and unrecoverable — a window
--       only ever opens on a fresh completion — and it disarmed the very prompt 173
--       added to explain the situation, because that prompt requires an open window.
--       Fix: the "is there anybody here?" test counts ENROLLED students; eligible_count
--       still counts only those who may be asked. A window can now exist with
--       eligible_count = 0, which every reader already handles (response_pct and the
--       low_turnout trip are both guarded on eligible_count > 0).
--
--    b) eligible_count is FROZEN at open time, so flipping the rule silently changed
--       the meaning of every existing row's denominator: students who could answer
--       yesterday are ineligible today but still counted, collapsing response rates and
--       tripping low_turnout on windows that closed perfectly well — which
--       propose_feedback_actions (166) then converts into false action items within
--       five minutes of deploy. Fix: recompute the denominator once, as
--       (age-eligible enrolled) + (responses already given by now-ineligible students),
--       so no rate can exceed 100% and no existing response falls outside it.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 3) THE FORM INSTRUMENT HAS A CONTRACT; 170 LET THE EDITOR BREAK IT SILENTLY.
--
--    Five consumers key off specific items — dimension_key 'attended' (169's mix,
--    167's per-response column), 'confidence' (the mentor board's reaction-vs-learning
--    pair) and item_group 'teaching'/'content' (165's low_rating trip). Before 170 the
--    seven seeded items were an effective invariant because only hand-written SQL could
--    change them. publish_feedback_form checked "≥1 item, ≥1 rating item", so deleting
--    or renaming the screener published cleanly and reporting quietly went blank.
--    Fix: publish validates the contract and names precisely what is missing.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 4) "ALREADY ASKED" MATCHED ANY OPEN NOTE.
--
--    students_missing_dob's asked_recently looked for any unresolved student_review_note
--    from the last 14 days, so a student sent back last week over a roll number counted
--    as already asked for their date of birth — reported to staff as asked, never
--    actually asked, and excluded from feedback indefinitely. Fix: notes carry a topic,
--    and only a 'dob' note counts.
-- ============================================================================

begin;

-- ============================================================================
-- 1) The helper the rest of this file turns on.
-- ============================================================================
create or replace function public.has_global_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- UNSCOPED grant only. `ur.scope_college_id is null` is the whole difference from
  -- has_permission(), and the reason a college_admin no longer passes for "global".
  select exists (
    select 1
    from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.permission p       on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.scope_college_id is null
      and (p.key = perm or p.key = '*')
  );
$$;

comment on function public.has_global_permission(text) is
  'True only for an UNSCOPED grant. Use instead of has_permission() wherever the next '
  'branch is a has_college_permission() fallback — has_permission() is true for a '
  'college-scoped grant and makes that fallback dead code (see 174).';

grant execute on function public.has_global_permission(text) to authenticated;

-- ============================================================================
-- 2) Supersedes 166 §4. Only change: v_global now needs an unscoped grant, so the
--    college-scoped branch below it is reachable.
-- ============================================================================
drop function if exists public.feedback_triage_overview(boolean, int);
create or replace function public.feedback_triage_overview(
  p_only_trips boolean default true,
  p_limit int default 200
)
returns table (
  request_id     uuid,
  batch_id       uuid,
  batch_name     text,
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
  mentor_snapshot text[],
  open_action_count int,
  open_claimed_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_batches uuid[];
  v_global  boolean;
  v_limit   int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  v_global := public.has_global_permission('feedback.view.identified')
           or public.has_global_permission('batch.progress.manage');

  -- Authorize on the GRANT, not on the result: a college admin whose colleges run no
  -- batches yet gets an empty inbox, and someone with no grant at all gets the 403,
  -- even though both produce zero rows. Scoped grants count here — they just don't
  -- make you global.
  if not v_global and not exists (
    select 1 from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.permission p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.key in ('*', 'feedback.view.identified')
  ) then
    raise exception 'Forbidden';
  end if;

  if v_global then
    select coalesce(array_agg(b.id), '{}') into v_batches from public.batch b;
  else
    select coalesce(array_agg(distinct bcol.batch_id), '{}') into v_batches
    from public.batch_college bcol
    where public.has_college_permission('feedback.view.identified', bcol.college_id);
  end if;

  if v_batches = '{}' then return; end if;

  return query
  select o.request_id, o.batch_id, o.batch_name, o.subject_id, o.subject_name,
         o.chapter_id, o.chapter_name, o.opened_at, o.closes_at, o.is_open,
         o.eligible_count, o.response_count, o.response_pct, o.low_confidence,
         o.group_scores, o.item_scores, o.remark_count, o.flagged_count, o.trips,
         o.quiz_attempted, o.quiz_pass_pct, o.mentor_note, o.mentor_snapshot,
         coalesce(act.n, 0)::int, coalesce(act.claimed, 0)::int
  from public._feedback_overview_rows(v_batches) o
  left join lateral (
    select count(*) as n,
           count(*) filter (
             where ai.auto_source is null
                or ai.owner_user_id is not null
                or ai.status = 'in_progress'
           ) as claimed
    from public.feedback_action_item ai
    where ai.request_id = o.request_id and ai.status in ('open', 'in_progress')
  ) act on true
  where not p_only_trips or cardinality(o.trips) > 0
  order by (coalesce(act.claimed, 0) = 0) desc,
           cardinality(o.trips) desc,
           ('low_rating' = any(o.trips)) desc,
           o.closes_at asc
  limit v_limit;
end $$;

grant execute on function public.feedback_triage_overview(boolean, int) to authenticated;

-- ============================================================================
-- 3) Supersedes 165 §2 — the same one-line scope fix on the per-batch reader.
--    Inherited from 159: a college admin could read ANY batch's aggregates.
-- ============================================================================
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
    public.has_global_permission('feedback.view.identified')
    or public.has_global_permission('batch.progress.manage')
    or exists (
      select 1 from public.batch_college bcol
      where bcol.batch_id = p_batch_id
        and (public.has_college_permission('feedback.view.identified', bcol.college_id)
             or public.has_college_permission('batch.progress.manage', bcol.college_id))
    )
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select o.request_id, o.subject_id, o.subject_name, o.chapter_id, o.chapter_name,
         o.opened_at, o.closes_at, o.is_open, o.eligible_count, o.response_count,
         o.response_pct, o.low_confidence, o.group_scores, o.item_scores,
         o.remark_count, o.flagged_count, o.trips, o.quiz_attempted, o.quiz_pass_pct,
         o.mentor_note, o.mentor_snapshot
  from public._feedback_overview_rows(array[p_batch_id]) o;
end $$;

-- ============================================================================
-- 4) Supersedes 167 §1/§2 — the two response writers, same scope fix. A college
--    admin could moderate, and log outreach against, another college's response.
-- ============================================================================
create or replace function public.record_feedback_outreach(
  p_response_id uuid,
  p_note text default null,
  p_clear boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch    uuid;
  v_contact  boolean;
begin
  select r.batch_id, resp.contact_ok
    into v_batch, v_contact
  from public.chapter_feedback_response resp
  join public.chapter_feedback_request r on r.id = resp.request_id
  where resp.id = p_response_id;

  if v_batch is null then raise exception 'Response not found'; end if;

  if not (
    public.has_global_permission('feedback.view.identified')
    or exists (
      select 1 from public.batch_college bcol
      where bcol.batch_id = v_batch
        and public.has_college_permission('feedback.view.identified', bcol.college_id)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  -- The student's promise, enforced server-side. Clearing is always allowed: it only
  -- ever removes data.
  if not p_clear and not coalesce(v_contact, false) then
    raise exception 'This student did not agree to be contacted about their feedback';
  end if;

  update public.chapter_feedback_response
     set contacted_at  = case when p_clear then null else now() end,
         contacted_by  = case when p_clear then null else auth.uid() end,
         outreach_note = case when p_clear then null
                              else nullif(trim(coalesce(p_note, '')), '') end,
         updated_at    = now()
   where id = p_response_id;
end $$;

create or replace function public.set_feedback_moderation(p_response_id uuid, p_moderation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_batch uuid;
begin
  if p_moderation not in ('ok', 'hidden') then
    raise exception 'Invalid moderation state %', p_moderation;
  end if;

  select r.batch_id into v_batch
  from public.chapter_feedback_response resp
  join public.chapter_feedback_request r on r.id = resp.request_id
  where resp.id = p_response_id;
  if v_batch is null then raise exception 'Response not found'; end if;

  if not (
    public.has_global_permission('feedback.view.identified')
    or exists (
      select 1 from public.batch_college bcol
      where bcol.batch_id = v_batch
        and public.has_college_permission('feedback.view.identified', bcol.college_id)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  update public.chapter_feedback_response set moderation = p_moderation, updated_at = now()
   where id = p_response_id;
end $$;

-- ============================================================================
-- 5) Supersedes 171 §5 — the identified read, same scope fix. This is the one
--    function in the feature that returns a student's NAME, so it matters most here.
-- ============================================================================
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
    public.has_global_permission('feedback.view.identified')
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

  -- Responders first, then the silent ones.
  order by 6 desc nulls last, 3;
end $$;

grant execute on function public.request_feedback_responses(uuid) to authenticated;

-- ============================================================================
-- 6) Supersedes 171 §2 — a window now OPENS even when nobody is currently
--    age-eligible, so the chapter is not silently un-askable forever and the
--    "add your date of birth" prompt (which needs an open window) can fire.
-- ============================================================================
create or replace function public.open_chapter_feedback_request(
  p_batch_id uuid, p_subject_id uuid, p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form     uuid;
  v_enrolled int;
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

  -- TWO COUNTS, AND THE DIFFERENCE MATTERS.
  --   v_enrolled decides whether a window exists at all: "is there a class here?"
  --   v_eligible is the response-rate denominator: "how many may we ask?" (O-11)
  -- Conflating them (171) meant a cohort with no dates of birth on file — the bulk
  -- import supplies none — got NO window, silently and permanently, since a window
  -- only opens on a fresh completion. It also disabled the prompt that tells those
  -- students a date of birth would unlock it, because that prompt looks for an open
  -- window. eligible_count = 0 is safe: response_pct and the low_turnout trip are
  -- both already guarded on eligible_count > 0.
  select count(*) into v_enrolled
  from public.student_enrollment e
  where e.batch_id = p_batch_id and e.status in ('pending', 'active');

  if coalesce(v_enrolled, 0) = 0 then return null; end if;

  select count(*) into v_eligible
  from public.student_enrollment e
  where e.batch_id = p_batch_id and e.status in ('pending', 'active')
    and public._feedback_age_eligible(e.student_id);

  select coalesce(array_agg(m.mentor_name order by m.mentor_name), '{}')
    into v_mentors
  from public.batch_subject_mentor m
  where m.batch_id = p_batch_id and m.subject_id = p_subject_id
    and m.mentor_name is not null;

  insert into public.chapter_feedback_request
    (batch_id, subject_id, chapter_id, form_id, closes_at, eligible_count, mentor_snapshot)
  values
    (p_batch_id, p_subject_id, p_chapter_id, v_form,
     now() + interval '14 days', coalesce(v_eligible, 0), coalesce(v_mentors, '{}'))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    select id into v_id from public.chapter_feedback_request
     where batch_id = p_batch_id and subject_id = p_subject_id
       and chapter_id = p_chapter_id and status = 'open' and closes_at > now();
    return v_id;
end $$;

-- ============================================================================
-- 7) One-off: re-base the FROZEN denominators onto the new eligibility rule.
--
--    Without this, every request that existed before 173 counts students who may no
--    longer answer, so rates collapse and propose_feedback_actions() files false
--    "fewer than 40% responded" items on its next 5-minute run.
--
--    The formula keeps every response already given inside the denominator, so no
--    rate can read above 100%: students who answered under the old rule stay counted
--    even though they would not be asked today.
-- ============================================================================
update public.chapter_feedback_request r
   set eligible_count = sub.n
from (
  select r2.id,
         (
           select count(*)
           from public.student_enrollment e
           where e.batch_id = r2.batch_id
             and e.status in ('pending', 'active')
             and public._feedback_age_eligible(e.student_id)
         )
         + (
           select count(*)
           from public.chapter_feedback_response resp
           where resp.request_id = r2.id
             and not public._feedback_age_eligible(resp.student_id)
         ) as n
  from public.chapter_feedback_request r2
) sub
where sub.id = r.id and r.eligible_count <> sub.n;

-- ============================================================================
-- 8) Supersedes 170 §3 — publish now enforces the instrument contract instead of
--    only counting items, so the editor cannot silently blank the reporting.
-- ============================================================================
create or replace function public.publish_feedback_form(p_form_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_scope  text;
  v_status text;
  v_items  int;
begin
  if not public.has_permission('feedback.form.manage') then
    raise exception 'Forbidden';
  end if;

  select scope, status into v_scope, v_status
  from public.feedback_form where id = p_form_id;
  if v_scope is null then raise exception 'Form version not found'; end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be published (this one is %)', v_status;
  end if;

  select count(*) into v_items from public.feedback_form_item where form_id = p_form_id;
  if v_items = 0 then
    raise exception 'Add at least one question before publishing';
  end if;

  -- THE CONTRACT THE REST OF THE SYSTEM READS BY NAME.
  -- Five consumers key off these exact items, and none of them can fail loudly —
  -- they just return nothing. Publishing is the only moment we can catch it, so each
  -- check names the item AND what breaks without it.
  if not exists (
    select 1 from public.feedback_form_item
    where form_id = p_form_id and response_type = 'rating5'
  ) then
    raise exception 'A feedback form needs at least one rating question';
  end if;

  if not exists (
    select 1 from public.feedback_form_item
    where form_id = p_form_id and dimension_key = 'attended'
  ) then
    raise exception
      'Keep a question with the key "attended" — the attendance mix shown beside every '
      'trainer''s scores is read from it, and without it those scores cannot be told '
      'apart from a half-empty room';
  end if;

  if not exists (
    select 1 from public.feedback_form_item
    where form_id = p_form_id and dimension_key = 'confidence'
  ) then
    raise exception
      'Keep a question with the key "confidence" — it is the half of '
      '"felt ready vs actually passed" that comes from the student';
  end if;

  if not exists (
    select 1 from public.feedback_form_item
    where form_id = p_form_id and response_type = 'rating5' and item_group = 'teaching'
  ) or not exists (
    select 1 from public.feedback_form_item
    where form_id = p_form_id and response_type = 'rating5' and item_group = 'content'
  ) then
    raise exception
      'Keep at least one rating question in "teaching" and one in "content" — a rating '
      'of 1-2 only reaches the triage inbox from those two groups';
  end if;

  -- Retire first: 159's feedback_form_one_active_idx allows exactly one active row
  -- per scope, so the order here is the difference between a switch and an error.
  update public.feedback_form
     set status = 'retired'
   where scope = v_scope and status = 'active';

  update public.feedback_form
     set status = 'active', published_at = now()
   where id = p_form_id;
end $$;

-- ============================================================================
-- 9) Review notes gain a TOPIC, so "already asked for a date of birth" stops
--    matching a note about a roll number.
--
--    add_student_review_note is DROPPED and recreated rather than overloaded: two
--    versions differing only by a defaulted 4th parameter make every existing
--    three-argument call ambiguous. Existing callers pass named parameters, so they
--    keep working unchanged.
-- ============================================================================
alter table public.student_review_note
  add column if not exists topic text;

comment on column public.student_review_note.topic is
  'What the note is about, when something needs to find it again later '
  '(''dob'' = the "add your date of birth" request from 173). Null for ordinary remarks.';

create index if not exists student_review_note_topic_idx
  on public.student_review_note (student_user_id, topic, created_at desc)
  where topic is not null;

drop function if exists public.add_student_review_note(uuid, text, boolean);
create or replace function public.add_student_review_note(
  p_student uuid,
  p_body text,
  p_request_changes boolean default false,
  p_topic text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college uuid;
  v_status  text;
  v_note_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Remark cannot be empty'; end if;

  select college_id, status into v_college, v_status
  from public.student_profile where user_id = p_student;
  if not found then raise exception 'No student profile for %', p_student; end if;

  if not (
    public.has_permission('student.review')
    or (v_college is not null and public.has_college_permission('student.review', v_college))
  ) then
    raise exception 'Forbidden: missing student.review';
  end if;

  insert into public.student_review_note (student_user_id, author_user_id, body, kind, topic)
  values (
    p_student, auth.uid(), trim(p_body),
    case when p_request_changes and v_status = 'pending_review' then 'changes_requested' else 'note' end,
    nullif(trim(coalesce(p_topic, '')), '')
  )
  returning id into v_note_id;

  -- Send-back: only a not-yet-approved student is bounced back into the queue.
  if p_request_changes and v_status = 'pending_review' then
    update public.student_profile
    set status = 'changes_requested', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where user_id = p_student;
  end if;

  return v_note_id;
end $$;

grant execute on function public.add_student_review_note(uuid, text, boolean, text) to authenticated;

-- ============================================================================
-- 10) Supersedes 173 §3 — scope fix (§1) AND asked_recently now looks only for a
--     'dob' note, so an unrelated open remark no longer reports a student as asked.
-- ============================================================================
drop function if exists public.students_missing_dob();
create or replace function public.students_missing_dob()
returns table (
  student_id    uuid,
  full_name     text,
  email         text,
  college_id    uuid,
  asked_recently boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Either permission opens the list: student.review because it owns the channel used
  -- to ask, feedback.view.identified because the coordinator who notices the shortfall
  -- is usually not the person who reviews registrations. Scoped grants count for
  -- ENTRY; the row filter below is what limits them to their own college.
  if not exists (
    select 1 from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.permission p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.key in ('*', 'student.review', 'feedback.view.identified')
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select sp.user_id,
         coalesce(sp.full_name, u.full_name, u.email),
         u.email,
         sp.college_id,
         exists (
           select 1 from public.student_review_note n
           where n.student_user_id = sp.user_id
             and n.topic = 'dob'
             and n.resolved_at is null
             and n.created_at > now() - interval '14 days'
         )
  from public.student_profile sp
  join public.app_user u on u.id = sp.user_id
  where sp.date_of_birth is null
    and u.status = 'active'
    and exists (
      select 1 from public.student_enrollment e
      where e.student_id = sp.user_id and e.status in ('pending', 'active')
    )
    and (
      public.has_global_permission('student.review')
      or public.has_global_permission('feedback.view.identified')
      or (sp.college_id is not null and (
            public.has_college_permission('student.review', sp.college_id)
            or public.has_college_permission('feedback.view.identified', sp.college_id)))
    )
  order by 2;
end $$;

grant execute on function public.students_missing_dob() to authenticated;

commit;
