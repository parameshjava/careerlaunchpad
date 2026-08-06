-- ============================================================================
-- 167_feedback_outreach.sql
-- Record the follow-up conversation (issue #84: "the trainer or staff connects to
-- students to understand the pain points for negative reviews").
--
-- WHAT WAS MISSING
--   159 built the permission to contact — the student's own `contact_ok` opt-in, and
--   a mailto: button that appears only for opted-in rows. What it never built was any
--   trace that the conversation happened. So "did anyone actually follow up on those
--   two 1-star ratings?" was unanswerable, which makes the outreach half of #84
--   unmanageable: you cannot chase what you cannot see.
--
-- WHAT THIS ADDS
--   Three columns on the response and one RPC to write them. Deliberately small:
--   this is a log, not a CRM. Who spoke to the student, when, and what came of it.
--
-- THE ONE RULE IT ENFORCES IN SQL, NOT IN THE UI
--   Outreach can only be logged against a response whose author ticked contact_ok.
--   159 kept that promise by hiding a button; a hidden button is a UI decision that
--   a future refactor can undo. Now the database refuses, so the promise printed
--   above the submit button ("only if you say we may") is enforced where it counts.
--
--   The mentor read is untouched — mentor_chapter_feedback() returns aggregates and
--   remark text only, so nothing here can reach a trainer's screen.
-- ============================================================================

begin;

alter table public.chapter_feedback_response
  add column if not exists contacted_at   timestamptz,
  add column if not exists contacted_by   uuid references public.app_user(id) on delete set null,
  add column if not exists outreach_note  text;

comment on column public.chapter_feedback_response.outreach_note is
  'What the student said when staff followed up. Staff-visible only; never returned '
  'by mentor_chapter_feedback(), and never shown to the student.';

-- ============================================================================
-- 1) Log (or clear) the follow-up on one response.
--
--    Scoped like request_feedback_responses(): a global feedback.view.identified, or
--    the same permission granted on one of the batch's colleges. p_clear exists
--    because a mis-click on the wrong row must be undoable — the alternative is
--    staff learning to distrust the log.
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
    public.has_permission('feedback.view.identified')
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

grant execute on function public.record_feedback_outreach(uuid, text, boolean) to authenticated;

-- ============================================================================
-- 2) Supersedes 159 §7j. Same behaviour plus the college-scoped grant, which was
--    missing: a college admin could READ the remarks (request_feedback_responses
--    accepts a scoped grant) but not hide one, so the one role most likely to be
--    handed a batch's moderation could not do it.
-- ============================================================================
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
    public.has_permission('feedback.view.identified')
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
-- 3) Supersedes 159 §7i. Same two arms, same authorization; the identified read now
--    carries the outreach log so the staff screen can show "already spoken to"
--    instead of offering the same student a second cold email.
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

  select null::uuid, e.student_id,
         coalesce(sp.full_name, u.full_name, u.email), sp.roll_number, u.email,
         null::timestamptz, null::jsonb, null::text, false, null::text, 'ok', null::text,
         null::timestamptz, null::text, null::text
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

grant execute on function public.request_feedback_responses(uuid) to authenticated;

commit;
