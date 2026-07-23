-- ============================================================================
-- 134_batch_session.sql
-- Per-batch, per-subject class calendar + subject mentors (GitHub #64).
--
--   batch (125)
--     ├──< batch_subject          — subjects this batch teaches (M:N → subject)
--     │       └──< batch_subject_mentor  — mentor(s) per subject (M:N)
--     └──< batch_session_series ──< batch_session ──< batch_session_invite
--          (a schedule is ALWAYS per batch + subject; one-off ⇒ series_id NULL)
--
-- A "class session" is a time-windowed online/offline class for ONE subject of a
-- batch. Students see it on their calendar automatically via student_enrollment
-- (125) — no per-student row to seed: an approved student with an active/pending
-- enrolment sees every session of that batch; an empty batch = empty calendar.
--
-- Subjects: batch_subject is materialised (seeded from the course's competitive
-- exam syllabus, then editable) so mentor assignment and a session's subject are
-- FK-enforced against the exact (batch, subject) pair — mirrors batch_college.
--
-- Mentors: batch_subject_mentor assigns one or more mentors to each subject of a
-- batch (a mentor may teach several subjects/batches). When staff schedule a
-- class, the API creates the Zoom meeting, adds each subject mentor as a Zoom
-- alternative host, and emails them an .ics calendar invite; batch_session_invite
-- logs who was invited (with a stable ics_uid so later edits send UPDATEs).
--
-- Recurrence: a series stores a weekly spec; expand_batch_session_series()
-- materialises concrete rows within a rolling horizon (same "store the rows,
-- don't compute on read" approach the exam sittings use). Hand-edited occurrences
-- are marked `overridden` and survive re-expansion.
--
-- Zoom: the Next.js server (server-to-server OAuth) writes zoom_meeting_id /
-- join_url / start_url here. join_url is the student link; start_url (host) is
-- projected out by the student API. meeting_status tracks provisioning.
--
-- Status transitions (scheduled → live → completed) run every minute via pg_cron,
-- mirroring 111_auto_close_expired_exams.sql. Idempotent.
-- ============================================================================

begin;

create extension if not exists pg_cron;

-- ============================================================================
-- 1) Subjects a batch teaches (seeded from course syllabus, editable)
-- ============================================================================
create table if not exists public.batch_subject (
  batch_id   uuid not null references public.batch(id) on delete cascade,
  subject_id uuid not null references public.subject(id) on delete restrict,
  -- Denormalised display name. `subject` is RLS-locked to exam admins/staff
  -- (migration 100), but finance staff + students need the label for the
  -- calendar. Captured from subject.name by replace_batch_subjects() (135) so
  -- this feature never depends on exam-bank read access.
  subject_name text,
  sort_order int  not null default 0,
  primary key (batch_id, subject_id)
);
create index if not exists batch_subject_subject_idx on public.batch_subject (subject_id);

-- One or more mentors per subject of a batch. A mentor may teach many subjects.
create table if not exists public.batch_subject_mentor (
  batch_id   uuid not null,
  subject_id uuid not null,
  mentor_id  uuid not null references public.mentor_profile(user_id) on delete cascade,
  -- Denormalised for display (mentor_profile is RLS-restricted); set by
  -- replace_batch_subjects(). Email is NOT stored here — students must not see
  -- mentor emails; staff get it from the batch_eligible_mentors() RPC.
  mentor_name text,
  assigned_by uuid references public.app_user(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (batch_id, subject_id, mentor_id),
  foreign key (batch_id, subject_id)
    references public.batch_subject (batch_id, subject_id) on delete cascade
);
create index if not exists batch_subject_mentor_mentor_idx
  on public.batch_subject_mentor (mentor_id);

-- ============================================================================
-- 2) Recurrence template (weekly for v1; freq reserved for future kinds)
-- ============================================================================
create table if not exists public.batch_session_series (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.batch(id) on delete cascade,
  subject_id    uuid not null,
  title         text not null,
  description   text,
  delivery_mode text not null default 'online'
                  check (delivery_mode in ('online', 'offline', 'hybrid')),
  freq          text not null default 'weekly' check (freq in ('weekly')),
  -- Postgres dow: 0 = Sunday … 6 = Saturday. At least one weekday required.
  by_weekday    smallint[] not null check (
                  array_length(by_weekday, 1) >= 1
                  and by_weekday <@ array[0,1,2,3,4,5,6]::smallint[]),
  time_of_day   time not null,
  duration_min  int  not null check (duration_min > 0 and duration_min <= 600),
  timezone      text not null default 'Asia/Kolkata',
  starts_on     date not null default current_date,
  until         date,                       -- falls back to batch.end_date, then +180d
  -- Zoom recurring meeting shared by every occurrence (nullable until created).
  zoom_meeting_id text,
  join_url        text,
  start_url       text,
  created_by    uuid references public.app_user(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (until is null or until >= starts_on),
  foreign key (batch_id, subject_id)
    references public.batch_subject (batch_id, subject_id) on delete cascade
);
create index if not exists batch_session_series_batch_idx
  on public.batch_session_series (batch_id, subject_id);

-- ============================================================================
-- 3) Concrete class sessions (one-off, or materialised from a series)
-- ============================================================================
create table if not exists public.batch_session (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.batch(id) on delete cascade,
  subject_id    uuid not null,
  series_id     uuid references public.batch_session_series(id) on delete cascade,
  title         text not null,
  description   text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  delivery_mode text not null default 'online'
                  check (delivery_mode in ('online', 'offline', 'hybrid')),
  status        text not null default 'scheduled'
                  check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  -- Set true once an occurrence is edited on its own, so re-expanding its series
  -- leaves it untouched.
  overridden    boolean not null default false,
  -- Zoom meeting for THIS occurrence (copied from the series, or per-session).
  zoom_meeting_id  text,
  meeting_provider text not null default 'zoom',
  join_url         text,               -- student join link
  start_url        text,               -- host link — never sent to students
  meeting_status   text not null default 'pending'
                     check (meeting_status in ('pending', 'created', 'failed', 'manual', 'not_required')),
  created_by    uuid references public.app_user(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  -- lets expand_batch_session_series() upsert idempotently
  unique (series_id, starts_at),
  foreign key (batch_id, subject_id)
    references public.batch_subject (batch_id, subject_id) on delete cascade
);
create index if not exists batch_session_batch_idx   on public.batch_session (batch_id, subject_id, starts_at);
create index if not exists batch_session_series_idx  on public.batch_session (series_id);
create index if not exists batch_session_window_idx  on public.batch_session (starts_at, ends_at);

-- ============================================================================
-- 4) Mentor invite log — who was invited to a given class + delivery state.
--    Snapshot per occurrence so an invite survives later mentor reassignment;
--    ics_uid is stable so an edited class sends a calendar UPDATE, not a dupe.
-- ============================================================================
create table if not exists public.batch_session_invite (
  session_id    uuid not null references public.batch_session(id) on delete cascade,
  mentor_id     uuid not null references public.mentor_profile(user_id) on delete cascade,
  ics_uid       text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'cancelled')),
  zoom_alt_host boolean not null default false,
  email_sent_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  primary key (session_id, mentor_id)
);
create index if not exists batch_session_invite_mentor_idx
  on public.batch_session_invite (mentor_id);

-- ============================================================================
-- 5) Materialise a series into future occurrences (called by the API after a
--    series is created/edited, and nightly by cron to extend the horizon).
--    Regenerates only FUTURE, non-overridden, still-scheduled rows so past and
--    hand-edited occurrences are preserved.
-- ============================================================================
create or replace function public.expand_batch_session_series(p_series_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  d        date;
  horizon  date;
  v_start  timestamptz;
  v_end    timestamptz;
  v_count  int := 0;
begin
  select * into s from public.batch_session_series where id = p_series_id;
  if not found then raise exception 'Series not found'; end if;

  delete from public.batch_session
   where series_id = p_series_id
     and status = 'scheduled'
     and not overridden
     and starts_at > now();

  horizon := coalesce(
    s.until,
    (select end_date from public.batch where id = s.batch_id),
    (current_date + 180)
  );

  d := greatest(s.starts_on, current_date);
  while d <= horizon loop
    if extract(dow from d)::smallint = any (s.by_weekday) then
      -- interpret the local wall-clock time in the series timezone
      v_start := (d + s.time_of_day) at time zone s.timezone;
      if v_start > now() then
        v_end := v_start + make_interval(mins => s.duration_min);
        insert into public.batch_session
          (batch_id, subject_id, series_id, title, description, starts_at, ends_at,
           delivery_mode, zoom_meeting_id, join_url, start_url,
           meeting_status, created_by)
        values
          (s.batch_id, s.subject_id, s.id, s.title, s.description, v_start, v_end,
           s.delivery_mode, s.zoom_meeting_id, s.join_url, s.start_url,
           case when s.delivery_mode = 'offline' then 'not_required'
                when s.join_url is not null then 'created' else 'pending' end,
           s.created_by)
        on conflict (series_id, starts_at) do nothing;
        v_count := v_count + 1;
      end if;
    end if;
    d := d + 1;
  end loop;
  return v_count;
end $$;

-- Extend every active series' horizon (nightly). Skips closed/cancelled batches.
create or replace function public.expand_all_batch_session_series()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_total int := 0;
begin
  for v_id in
    select ss.id from public.batch_session_series ss
    join public.batch b on b.id = ss.batch_id
    where b.status not in ('closed', 'cancelled')
      and (ss.until is null or ss.until >= current_date)
  loop
    v_total := v_total + public.expand_batch_session_series(v_id);
  end loop;
  return v_total;
end $$;

-- ============================================================================
-- 6) Status transitions (scheduled → live → completed), every minute via cron.
-- ============================================================================
create or replace function public.transition_batch_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed int := 0;
  v_n int;
begin
  update public.batch_session
     set status = 'live', updated_at = now()
   where status = 'scheduled' and now() >= starts_at and now() < ends_at;
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;

  update public.batch_session
     set status = 'completed', updated_at = now()
   where status in ('scheduled', 'live') and now() >= ends_at;
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;

  return v_changed;
end $$;

-- ============================================================================
-- 7) RLS
-- ============================================================================
alter table public.batch_subject         enable row level security;
alter table public.batch_subject_mentor  enable row level security;
alter table public.batch_session_series  enable row level security;
alter table public.batch_session         enable row level security;
alter table public.batch_session_invite  enable row level security;

-- batch_subject / batch_subject_mentor: readable to any authenticated user
-- (subject + mentor names aren't sensitive; batch itself is world-readable in
-- 125), managed by finance.manage.
drop policy if exists batch_subject_read on public.batch_subject;
create policy batch_subject_read on public.batch_subject
  for select to authenticated using (true);
drop policy if exists batch_subject_write on public.batch_subject;
create policy batch_subject_write on public.batch_subject
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

drop policy if exists batch_subject_mentor_read on public.batch_subject_mentor;
create policy batch_subject_mentor_read on public.batch_subject_mentor
  for select to authenticated using (true);
drop policy if exists batch_subject_mentor_write on public.batch_subject_mentor;
create policy batch_subject_mentor_write on public.batch_subject_mentor
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- Series: staff-only (students read the materialised occurrences, not templates).
drop policy if exists batch_session_series_read on public.batch_session_series;
create policy batch_session_series_read on public.batch_session_series
  for select to authenticated
  using (public.has_permission('finance.manage'));
drop policy if exists batch_session_series_write on public.batch_session_series;
create policy batch_session_series_write on public.batch_session_series
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- Occurrences: student self-read (enrolled), mentor self-read (assigned to the
-- subject), staff read + manage.
drop policy if exists batch_session_self_read on public.batch_session;
create policy batch_session_self_read on public.batch_session
  for select to authenticated
  using (
    status <> 'cancelled'
    and exists (
      select 1 from public.student_enrollment e
      where e.batch_id = batch_session.batch_id
        and e.student_id = auth.uid()
        and e.status in ('pending', 'active', 'completed')
    )
  );

drop policy if exists batch_session_mentor_read on public.batch_session;
create policy batch_session_mentor_read on public.batch_session
  for select to authenticated
  using (
    status <> 'cancelled'
    and exists (
      select 1 from public.batch_subject_mentor m
      where m.batch_id = batch_session.batch_id
        and m.subject_id = batch_session.subject_id
        and m.mentor_id = auth.uid()
    )
  );

drop policy if exists batch_session_staff_read on public.batch_session;
create policy batch_session_staff_read on public.batch_session
  for select to authenticated
  using (public.has_permission('finance.manage'));

drop policy if exists batch_session_write on public.batch_session;
create policy batch_session_write on public.batch_session
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- Invites: staff manage; a mentor reads their own.
drop policy if exists batch_session_invite_self_read on public.batch_session_invite;
create policy batch_session_invite_self_read on public.batch_session_invite
  for select to authenticated
  using (mentor_id = auth.uid());
drop policy if exists batch_session_invite_staff_read on public.batch_session_invite;
create policy batch_session_invite_staff_read on public.batch_session_invite
  for select to authenticated
  using (public.has_permission('finance.manage'));
drop policy if exists batch_session_invite_write on public.batch_session_invite;
create policy batch_session_invite_write on public.batch_session_invite
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- ============================================================================
-- 8) Grants
-- ============================================================================
grant execute on function public.expand_batch_session_series(uuid) to authenticated;
grant select, insert, update, delete on public.batch_subject         to authenticated;
grant select, insert, update, delete on public.batch_subject_mentor  to authenticated;
grant select, insert, update, delete on public.batch_session_series  to authenticated;
grant select, insert, update, delete on public.batch_session         to authenticated;
grant select, insert, update, delete on public.batch_session_invite  to authenticated;

-- ============================================================================
-- 9) Cron: transition every minute; extend horizons nightly. Idempotent
--    unschedule + reschedule (same pattern as 108/111).
-- ============================================================================
do $$ begin perform cron.unschedule('cl-transition-batch-sessions'); exception when others then null; end $$;
select cron.schedule(
  'cl-transition-batch-sessions',
  '* * * * *',
  $cron$ select public.transition_batch_sessions(); $cron$
);

do $$ begin perform cron.unschedule('cl-expand-batch-session-series'); exception when others then null; end $$;
select cron.schedule(
  'cl-expand-batch-session-series',
  '15 0 * * *',
  $cron$ select public.expand_all_batch_session_series(); $cron$
);

commit;
