-- ============================================================================
-- 149_student_review_notes.sql
-- Registration review communication (issue #82). Lets a reviewer comment on a
-- student's profile and send it back for corrections; the student is emailed the
-- remarks and fixes their form. Also supports a plain remark/notification to ANY
-- profile (including approved students) WITHOUT changing their access.
--
-- Design (docs/REGISTRATION_REVIEW_COMMUNICATION_SPEC.md):
--   • student_review_note — a thread of remarks (history, not one column).
--   • status gains 'changes_requested' — used ONLY pre-approval for a send-back.
--   • add_student_review_note()      — reviewer posts a note (+ optional send-back).
--   • mark_registration_resubmitted() — student re-submit flips changes_requested
--                                        back to pending_review + resolves notes.
-- Remarks are decoupled from approval: an approved student stays approved.
-- ============================================================================

-- 1) The review-note thread.
create table if not exists public.student_review_note (
  id              uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_user(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id),
  body            text not null check (length(trim(body)) > 0),
  kind            text not null default 'changes_requested'
                    check (kind in ('changes_requested', 'note')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz  -- stamped when the student next re-submits
);

create index if not exists student_review_note_student_idx
  on public.student_review_note (student_user_id, created_at desc);

-- RLS: reviewers (student.review global, or college-scoped on the student's
-- college) read/write every note; a student may READ their own notes (to display
-- them in-app) but never write.
alter table public.student_review_note enable row level security;

drop policy if exists student_review_note_reviewer_all on public.student_review_note;
create policy student_review_note_reviewer_all on public.student_review_note
  for all to authenticated
  using (
    public.has_permission('student.review')
    or public.has_college_permission(
         'student.review',
         (select college_id from public.student_profile where user_id = student_user_id))
  )
  with check (
    public.has_permission('student.review')
    or public.has_college_permission(
         'student.review',
         (select college_id from public.student_profile where user_id = student_user_id))
  );

drop policy if exists student_review_note_self_read on public.student_review_note;
create policy student_review_note_self_read on public.student_review_note
  for select to authenticated
  using (student_user_id = auth.uid());

-- 2) Add 'changes_requested' to the review-state check constraint. The guard
--    trigger (migration 020) pins the column for non-reviewers regardless of the
--    allowed set, so only the constraint needs widening here.
alter table public.student_profile drop constraint if exists student_profile_status_check;
alter table public.student_profile
  add constraint student_profile_status_check
  check (status in ('pending_review', 'changes_requested', 'approved', 'suspended'));

-- 3) add_student_review_note(student, body, request_changes) -> note id.
--    SECURITY DEFINER so it can insert the note + (optionally) flip status under
--    the caller's student.review authorization. Sending a note NEVER demotes an
--    approved/suspended student — the send-back flip applies only when the target
--    is still 'pending_review'.
create or replace function public.add_student_review_note(
  p_student uuid,
  p_body text,
  p_request_changes boolean default false
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

  insert into public.student_review_note (student_user_id, author_user_id, body, kind)
  values (
    p_student, auth.uid(), trim(p_body),
    case when p_request_changes and v_status = 'pending_review' then 'changes_requested' else 'note' end
  )
  returning id into v_note_id;

  -- Send-back: only a not-yet-approved student is bounced back into the queue.
  if p_request_changes and v_status = 'pending_review' then
    update public.student_profile
    set status = 'changes_requested', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where user_id = p_student;
  end if;

  return v_note_id;
end;
$$;

grant execute on function public.add_student_review_note(uuid, text, boolean) to authenticated;

-- 4) mark_registration_resubmitted() -> resulting review status.
--    Called by the student's submit route AFTER it writes registration_status.
--    If the student was sent back (changes_requested), flips them back to
--    pending_review (re-entering the review queue) and resolves their open
--    change-request notes. The status guard (migration 020) blocks a student from
--    changing their own status, so this runs SECURITY DEFINER under the
--    provisioning GUC. No-op (returns the current status) otherwise.
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

  if v_status = 'changes_requested' then
    perform set_config('app.provisioning', 'on', true);  -- txn-local; lets the guard accept the flip
    update public.student_profile
    set status = 'pending_review', updated_at = now()
    where user_id = uid;
    perform set_config('app.provisioning', 'off', true);

    update public.student_review_note
    set resolved_at = now()
    where student_user_id = uid and kind = 'changes_requested' and resolved_at is null;

    return 'pending_review';
  end if;

  return v_status;
end;
$$;

grant execute on function public.mark_registration_resubmitted() to authenticated;
