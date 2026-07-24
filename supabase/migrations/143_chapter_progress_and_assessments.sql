-- ============================================================================
-- 143_chapter_progress_and_assessments.sql
-- Batch chapter progress + per-chapter assessment quizzes (GitHub #72).
--
--   batch (125)
--     └──< batch_subject (134)  ── +progress_status/started/completed (this file)
--            └──< batch_chapter (NEW)      — per-batch chapter progress
--
--   chapter (021, RLS-locked to exam staff)
--     ├──< assessment_question (NEW)  ──< assessment_question_option (NEW)
--     │       (mirror question/question_option 021; a SEPARATE bank, not the exam bank)
--     └──< chapter_quiz (NEW · optional config, else platform defaults)
--            └──< chapter_quiz_attempt (NEW · per student+batch, ≤3)
--                   └──< chapter_quiz_attempt_question (NEW)
--
-- Flow: a mentor (assigned via batch_subject_mentor) or staff/admin
-- (batch.progress.manage) marks a subject/chapter in_progress then completed.
-- Completing a chapter unlocks its quiz for the batch's enrolled students, who
-- self-serve up to 3 attempts (D2). Progression is free/any-order (D3).
--
-- Locked decisions (OPEN_DECISIONS_CHECKLIST): Q6 pass_pct default 40 / configurable;
-- Q7 chapter_quiz optional (RPCs fall back to defaults); Q9 closed batches block new
-- attempts; Q10 standalone MCQs (no passage); Q3 subject completed is an explicit flag.
--
-- Chapter/subject/question names are RLS-locked to exam staff (021), so every
-- mentor/student read+write path runs through SECURITY DEFINER RPCs that guard on
-- has_permission(...) / assignment / enrollment for the CALLER (auth.uid()) — the
-- same pattern as 134/135. Idempotent (create ... if not exists / or replace).
-- ============================================================================

begin;

-- ============================================================================
-- 1) Subject-level progress on batch_subject (Q3: explicit flag)
-- ============================================================================
alter table public.batch_subject
  add column if not exists progress_status text not null default 'not_started'
    check (progress_status in ('not_started', 'in_progress', 'completed'));
alter table public.batch_subject
  add column if not exists started_at   timestamptz;
alter table public.batch_subject
  add column if not exists started_by   uuid references public.app_user(id) on delete set null;
alter table public.batch_subject
  add column if not exists completed_at timestamptz;
alter table public.batch_subject
  add column if not exists completed_by uuid references public.app_user(id) on delete set null;

-- ============================================================================
-- 2) Per-batch chapter list + progress
-- ============================================================================
create table if not exists public.batch_chapter (
  batch_id     uuid not null references public.batch(id) on delete cascade,
  subject_id   uuid not null,
  chapter_id   uuid not null,
  -- Denormalised: chapter.name is RLS-locked to exam staff (021); staff/mentors/
  -- students need the label. Captured by sync_batch_chapters() below.
  chapter_name text,
  sort_order   int  not null default 0,   -- display order (chapters have no native ordering)
  status       text not null default 'not_started'
                 check (status in ('not_started', 'in_progress', 'completed')),
  started_at   timestamptz,
  started_by   uuid references public.app_user(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.app_user(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (batch_id, subject_id, chapter_id),
  foreign key (batch_id, subject_id)
    references public.batch_subject (batch_id, subject_id) on delete cascade
);
create index if not exists batch_chapter_batch_idx
  on public.batch_chapter (batch_id, subject_id, sort_order);

-- ============================================================================
-- 3) Dedicated assessment question bank — mirrors question/question_option (021).
--    A SEPARATE bank from the exam question bank (Q10: standalone MCQs, no passage).
-- ============================================================================
create table if not exists public.assessment_question (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null,                       -- denormalised from chapter (as in question)
  chapter_id     uuid not null,
  kind           text not null default 'standard'
                   check (kind in ('standard', 'data_sufficiency')),
  difficulty     text not null check (difficulty in ('easy', 'medium', 'hard', 'very_hard')),
  answer_type    text not null check (answer_type in ('single', 'multi')),
  stem           text not null,
  stem_image_url text,
  explanation    text,
  version        int  not null default 1,
  status         text not null default 'active' check (status in ('active', 'archived')),
  created_by     uuid references public.app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- (chapter, subject) must match a real chapter so subject_id can't drift.
  foreign key (chapter_id, subject_id) references public.chapter (id, subject_id)
);
create index if not exists assessment_question_chapter_idx on public.assessment_question (chapter_id);
create index if not exists assessment_question_gen_idx     on public.assessment_question (subject_id, difficulty, status);

create table if not exists public.assessment_question_option (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_question(id) on delete cascade,
  label       text not null,
  is_correct  boolean not null default false,
  position    int not null,
  unique (question_id, position)
);
create index if not exists assessment_question_option_question_idx
  on public.assessment_question_option (question_id);

-- ============================================================================
-- 4) Chapter quiz config (Q7: OPTIONAL per chapter; RPCs default when absent).
--    Q6: pass_pct default 40, configurable.
-- ============================================================================
create table if not exists public.chapter_quiz (
  id                      uuid primary key default gen_random_uuid(),
  subject_id              uuid not null,
  chapter_id              uuid not null unique,     -- one active config per chapter
  title                   text,
  num_questions           int  not null default 10  check (num_questions > 0),
  pass_pct                int  not null default 40  check (pass_pct between 0 and 100),
  duration_minutes        int,                       -- null = untimed
  shuffle                 boolean not null default true,
  negative_mark_per_wrong numeric(4,2) not null default 0,
  status                  text not null default 'active' check (status in ('active', 'archived')),
  created_by              uuid references public.app_user(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (chapter_id, subject_id) references public.chapter (id, subject_id)
);

-- ============================================================================
-- 5) Attempts (batch-scoped, ≤3) + per-attempt question snapshot (references the
--    assessment bank, never copies text — mirrors exam_attempt_question).
-- ============================================================================
create table if not exists public.chapter_quiz_attempt (
  id           uuid primary key default gen_random_uuid(),
  chapter_id   uuid not null,
  batch_id     uuid not null references public.batch(id) on delete cascade,
  student_id   uuid not null references public.app_user(id) on delete cascade,
  attempt_no   int  not null check (attempt_no between 1 and 3),   -- hard cap 3 (D2)
  status       text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  score        numeric(6,2),
  total_marks  numeric(6,2),
  passed       boolean,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  unique (chapter_id, batch_id, student_id, attempt_no)
);
create index if not exists chapter_quiz_attempt_student_idx
  on public.chapter_quiz_attempt (student_id, chapter_id, submitted_at);
create index if not exists chapter_quiz_attempt_batch_idx
  on public.chapter_quiz_attempt (batch_id, chapter_id);

create table if not exists public.chapter_quiz_attempt_question (
  attempt_id          uuid not null references public.chapter_quiz_attempt(id) on delete cascade,
  question_id         uuid not null references public.assessment_question(id),
  question_version    int  not null,
  position            int  not null,
  selected_option_ids uuid[] not null default '{}',
  awarded_marks       numeric(4,2),
  primary key (attempt_id, position)
);

-- ============================================================================
-- 6) Permissions (data). Progress management for staff/admin; taking quizzes for
--    students. Mentors are gated by assignment (batch_subject_mentor), not a perm.
-- ============================================================================
insert into public.permission (key, description) values
  ('batch.progress.manage', 'Start/complete subjects & chapters for any batch.'),
  ('chapter.quiz.take',     'Take per-chapter assessment quizzes.')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on p.key = 'batch.progress.manage'
where r.key in ('platform_admin', 'coordinator', 'support')
on conflict do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on p.key = 'chapter.quiz.take'
where r.key = 'student'
on conflict do nothing;

-- ============================================================================
-- 7) RPCs (SECURITY DEFINER — cross the exam-staff RLS boundary; each guards the
--    CALLER internally). Defined before the RLS section that references them.
-- ============================================================================

-- 7a) Materialise/prune a batch's chapters from its course's competitive-exam
--     syllabus. Called after a batch's subjects change (see replace_batch_subjects
--     below). Staff-only (finance.manage). Stale chapters are pruned only when they
--     carry no attempts (honours Q4's "don't silently discard work").
create or replace function public.sync_batch_chapters(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count int := 0;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'Forbidden';
  end if;

  insert into public.batch_chapter (batch_id, subject_id, chapter_id, chapter_name, sort_order)
  select bs.batch_id, bs.subject_id, ch.id, ch.name,
         row_number() over (partition by bs.subject_id order by lower(ch.name))
  from public.batch_subject bs
  join public.batch b                          on b.id = bs.batch_id
  join public.course_competitive_exam cce      on cce.course_id = b.course_id
  join public.competitive_exam_subject_chapter cesc
        on cesc.competitive_exam_id = cce.competitive_exam_id
       and cesc.subject_id = bs.subject_id
  join public.chapter ch                        on ch.id = cesc.chapter_id
  where bs.batch_id = p_batch_id
  on conflict (batch_id, subject_id, chapter_id)
    do update set chapter_name = excluded.chapter_name;

  -- prune chapters no longer in the syllabus AND with no attempts recorded
  delete from public.batch_chapter bc
  where bc.batch_id = p_batch_id
    and not exists (
      select 1
      from public.batch_subject bs
      join public.batch b                     on b.id = bs.batch_id
      join public.course_competitive_exam cce on cce.course_id = b.course_id
      join public.competitive_exam_subject_chapter cesc
            on cesc.competitive_exam_id = cce.competitive_exam_id
           and cesc.subject_id = bc.subject_id
           and cesc.chapter_id = bc.chapter_id
      where bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    )
    and not exists (
      select 1 from public.chapter_quiz_attempt qa
      where qa.batch_id = bc.batch_id and qa.chapter_id = bc.chapter_id
    );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 7b) Set a subject's progress. Assigned mentor OR batch.progress.manage; only
--     while the batch is open/running.
create or replace function public.set_batch_subject_progress(
  p_batch_id uuid, p_subject_id uuid, p_status text)
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

  update public.batch_subject
     set progress_status = p_status,
         started_at   = case when p_status = 'in_progress' and started_at is null then now() else started_at end,
         started_by   = case when p_status = 'in_progress' and started_by is null then v_uid else started_by end,
         completed_at = case when p_status = 'completed' then now()
                             when p_status = 'not_started' then null else completed_at end,
         completed_by = case when p_status = 'completed' then v_uid
                             when p_status = 'not_started' then null else completed_by end
   where batch_id = p_batch_id and subject_id = p_subject_id;
  if not found then raise exception 'Subject not found in this batch'; end if;
end $$;

-- 7c) Set a chapter's progress. Same guard. Completing unlocks the quiz (checked
--     at start_chapter_quiz_attempt). Mentors may revert their own (Q2).
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
end $$;

-- 7d) The completed chapters + quiz availability for the CALLING student in a batch.
--     best_pct = best of their ≤3 attempts (Q12). available = completed AND the
--     assessment bank has active questions.
create or replace function public.student_chapter_quizzes(p_batch_id uuid)
returns table (
  chapter_id         uuid,
  chapter_name       text,
  subject_id         uuid,
  subject_name       text,
  attempts_used      int,
  attempts_remaining int,
  best_pct           numeric,
  best_passed        boolean,
  question_count     bigint,
  available          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select bc.chapter_id, bc.chapter_name, bc.subject_id, bs.subject_name,
         coalesce(a.used, 0)::int,
         greatest(0, 3 - coalesce(a.used, 0))::int,
         a.best_pct, a.best_passed,
         coalesce(qc.qcount, 0),
         (bc.status = 'completed' and coalesce(qc.qcount, 0) > 0)
  from public.batch_chapter bc
  join public.batch_subject bs
        on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
  left join lateral (
    select count(*) as used,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2))
             filter (where qa.status = 'submitted') as best_pct,
           bool_or(qa.passed) as best_passed
    from public.chapter_quiz_attempt qa
    where qa.batch_id = bc.batch_id and qa.chapter_id = bc.chapter_id
      and qa.student_id = auth.uid()
  ) a on true
  left join lateral (
    select count(*) as qcount
    from public.assessment_question q
    where q.chapter_id = bc.chapter_id and q.status = 'active'
  ) qc on true
  where bc.status = 'completed'
    and exists (
      select 1 from public.student_enrollment e
      where e.batch_id = p_batch_id and e.student_id = auth.uid()
        and e.status in ('pending', 'active', 'completed')
    )
  order by bs.subject_name, bc.sort_order;
$$;

-- 7e) Start an attempt. Guards: enrolled, chapter completed, batch not closed (Q9),
--     < 3 attempts, bank has questions. Snapshots a random question set. The 3-cap
--     is backstopped by the unique(chapter,batch,student,attempt_no) constraint, so
--     two concurrent starts can't both create attempt_no = N.
create or replace function public.start_chapter_quiz_attempt(
  p_batch_id uuid, p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_status  text;
  v_num     int;
  v_used    int;
  v_attempt uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from public.student_enrollment e
    where e.batch_id = p_batch_id and e.student_id = v_uid
      and e.status in ('pending', 'active', 'completed')
  ) then
    raise exception 'You are not enrolled in this batch';
  end if;

  select bc.status into v_status
  from public.batch_chapter bc
  where bc.batch_id = p_batch_id and bc.chapter_id = p_chapter_id;
  if v_status is null then raise exception 'Chapter not found in this batch'; end if;
  if v_status <> 'completed' then
    raise exception 'This chapter''s assessment is not available yet';
  end if;

  -- Q9: no new attempts once the batch is closed/cancelled.
  if exists (select 1 from public.batch b
             where b.id = p_batch_id and b.status in ('closed', 'cancelled')) then
    raise exception 'This batch is closed — no new attempts';
  end if;

  -- config (Q7 optional; defaults when absent)
  select coalesce(cq.num_questions, 10) into v_num
  from (select p_chapter_id as cid) x
  left join public.chapter_quiz cq on cq.chapter_id = x.cid and cq.status = 'active';
  v_num := coalesce(v_num, 10);

  -- serialise this student's attempts for this chapter to make the cap race-safe
  perform 1 from public.chapter_quiz_attempt
   where batch_id = p_batch_id and chapter_id = p_chapter_id and student_id = v_uid
   for update;

  select count(*) into v_used from public.chapter_quiz_attempt
   where batch_id = p_batch_id and chapter_id = p_chapter_id and student_id = v_uid;
  if v_used >= 3 then
    raise exception 'You have used all 3 attempts for this chapter';
  end if;

  insert into public.chapter_quiz_attempt (chapter_id, batch_id, student_id, attempt_no, status)
  values (p_chapter_id, p_batch_id, v_uid, v_used + 1, 'in_progress')
  returning id into v_attempt;

  insert into public.chapter_quiz_attempt_question (attempt_id, question_id, question_version, position)
  select v_attempt, q.id, q.version, row_number() over (order by random())
  from public.assessment_question q
  where q.chapter_id = p_chapter_id and q.status = 'active'
  order by random()
  limit v_num;

  if not exists (select 1 from public.chapter_quiz_attempt_question where attempt_id = v_attempt) then
    raise exception 'No assessment questions available for this chapter yet';
  end if;

  return v_attempt;
end $$;

-- 7f) Read an attempt's questions + options (NO is_correct) + saved selections, for
--     the owner — powers the runner and resume. Stems live in the RLS-locked bank,
--     so this definer read is how the student sees them.
create or replace function public.get_chapter_quiz_attempt(p_attempt_id uuid)
returns table (
  position        int,
  question_id     uuid,
  stem            text,
  stem_image_url  text,
  answer_type     text,
  option_id       uuid,
  option_label    text,
  option_position int,
  selected        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select aq.position, q.id, q.stem, q.stem_image_url, q.answer_type,
         o.id, o.label, o.position,
         (o.id = any (aq.selected_option_ids))
  from public.chapter_quiz_attempt a
  join public.chapter_quiz_attempt_question aq on aq.attempt_id = a.id
  join public.assessment_question q            on q.id = aq.question_id
  join public.assessment_question_option o     on o.question_id = q.id
  where a.id = p_attempt_id and a.student_id = auth.uid()
  order by aq.position, o.position;
$$;

-- 7g) Save answers for an in-progress attempt. p_answers: [{position, option_ids:[uuid]}]
create or replace function public.save_chapter_quiz_answers(
  p_attempt_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare rec jsonb;
begin
  if not exists (
    select 1 from public.chapter_quiz_attempt
    where id = p_attempt_id and student_id = auth.uid() and status = 'in_progress'
  ) then
    raise exception 'Attempt not found or not editable';
  end if;

  for rec in select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) t(value)
  loop
    update public.chapter_quiz_attempt_question
       set selected_option_ids = coalesce(
             (select array_agg(x::uuid) from jsonb_array_elements_text(rec->'option_ids') x),
             '{}')
     where attempt_id = p_attempt_id and position = (rec->>'position')::int;
  end loop;
end $$;

-- 7h) Submit + grade. 1 mark for an exactly-correct answer set; a wrong (non-empty)
--     answer costs negative_mark_per_wrong (0 by default). Pass = score% >= pass_pct
--     (Q6, default 40). Returns the result for the student.
create or replace function public.submit_chapter_quiz_attempt(p_attempt_id uuid)
returns table (score numeric, total_marks numeric, passed boolean, pass_pct int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_chapter uuid;
  v_neg     numeric := 0;
  v_pass    int := 40;
  v_total   numeric;
  v_score   numeric;
begin
  select chapter_id into v_chapter
  from public.chapter_quiz_attempt
  where id = p_attempt_id and student_id = v_uid and status = 'in_progress';
  if v_chapter is null then
    raise exception 'Attempt not found or already submitted';
  end if;

  select coalesce(cq.negative_mark_per_wrong, 0), coalesce(cq.pass_pct, 40)
    into v_neg, v_pass
  from (select v_chapter as cid) x
  left join public.chapter_quiz cq on cq.chapter_id = x.cid and cq.status = 'active';
  v_neg  := coalesce(v_neg, 0);
  v_pass := coalesce(v_pass, 40);

  with graded as (
    select aq.position,
      case
        when (select array_agg(o.id order by o.id)
              from public.assessment_question_option o
              where o.question_id = aq.question_id and o.is_correct)
             = (select array_agg(s order by s) from unnest(aq.selected_option_ids) s)
        then 1::numeric
        when cardinality(aq.selected_option_ids) > 0 then -v_neg
        else 0::numeric
      end as marks
    from public.chapter_quiz_attempt_question aq
    where aq.attempt_id = p_attempt_id
  )
  update public.chapter_quiz_attempt_question aq
     set awarded_marks = g.marks
    from graded g
   where aq.attempt_id = p_attempt_id and aq.position = g.position;

  select count(*)::numeric, coalesce(sum(awarded_marks), 0)
    into v_total, v_score
  from public.chapter_quiz_attempt_question
  where attempt_id = p_attempt_id;
  if v_score < 0 then v_score := 0; end if;   -- clamp negatives for display/pass

  update public.chapter_quiz_attempt
     set status = 'submitted', submitted_at = now(),
         score = v_score, total_marks = v_total,
         passed = (v_total > 0 and (100 * v_score / v_total) >= v_pass)
   where id = p_attempt_id;

  return query
    select v_score, v_total,
           (v_total > 0 and (100 * v_score / v_total) >= v_pass), v_pass;
end $$;

-- 7i) Re-point replace_batch_subjects (135) so editing a batch's subjects also
--     materialises its chapters. Body copied from 135 with a trailing
--     sync_batch_chapters() call — keep in step if 135 changes.
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

  -- NEW (143): keep batch_chapter in step with the batch's subjects.
  perform public.sync_batch_chapters(p_batch_id);
end $$;

-- ============================================================================
-- 8) RLS
-- ============================================================================
alter table public.batch_chapter                 enable row level security;
alter table public.assessment_question           enable row level security;
alter table public.assessment_question_option    enable row level security;
alter table public.chapter_quiz                   enable row level security;
alter table public.chapter_quiz_attempt          enable row level security;
alter table public.chapter_quiz_attempt_question enable row level security;

-- batch_chapter: read for staff / assigned mentor / enrolled student. Writes are
-- RPC-only (SECURITY DEFINER bypasses RLS) — no write policy on purpose.
drop policy if exists batch_chapter_staff_read on public.batch_chapter;
create policy batch_chapter_staff_read on public.batch_chapter
  for select to authenticated
  using (public.has_permission('batch.progress.manage'));

drop policy if exists batch_chapter_mentor_read on public.batch_chapter;
create policy batch_chapter_mentor_read on public.batch_chapter
  for select to authenticated
  using (exists (
    select 1 from public.batch_subject_mentor m
    where m.batch_id = batch_chapter.batch_id
      and m.subject_id = batch_chapter.subject_id
      and m.mentor_id = auth.uid()
  ));

drop policy if exists batch_chapter_student_read on public.batch_chapter;
create policy batch_chapter_student_read on public.batch_chapter
  for select to authenticated
  using (exists (
    select 1 from public.student_enrollment e
    where e.batch_id = batch_chapter.batch_id
      and e.student_id = auth.uid()
      and e.status in ('pending', 'active', 'completed')
  ));

-- assessment bank: exam staff read; exam.question.manage writes (mirror 021).
drop policy if exists assessment_question_read on public.assessment_question;
create policy assessment_question_read on public.assessment_question
  for select to authenticated using (public.is_exam_staff());
drop policy if exists assessment_question_manage on public.assessment_question;
create policy assessment_question_manage on public.assessment_question
  for all to authenticated
  using (public.has_permission('exam.question.manage'))
  with check (public.has_permission('exam.question.manage'));

drop policy if exists assessment_question_option_read on public.assessment_question_option;
create policy assessment_question_option_read on public.assessment_question_option
  for select to authenticated using (public.is_exam_staff());
drop policy if exists assessment_question_option_manage on public.assessment_question_option;
create policy assessment_question_option_manage on public.assessment_question_option
  for all to authenticated
  using (public.has_permission('exam.question.manage'))
  with check (public.has_permission('exam.question.manage'));

-- chapter_quiz: config (no answers) readable by any authenticated; staff manages.
drop policy if exists chapter_quiz_read on public.chapter_quiz;
create policy chapter_quiz_read on public.chapter_quiz
  for select to authenticated using (true);
drop policy if exists chapter_quiz_manage on public.chapter_quiz;
create policy chapter_quiz_manage on public.chapter_quiz
  for all to authenticated
  using (public.has_permission('exam.question.manage'))
  with check (public.has_permission('exam.question.manage'));

-- attempts: a student reads their OWN (score + their own answers); no is_correct is
-- ever in these tables. Writes are RPC-only.
drop policy if exists chapter_quiz_attempt_self_read on public.chapter_quiz_attempt;
create policy chapter_quiz_attempt_self_read on public.chapter_quiz_attempt
  for select to authenticated using (student_id = auth.uid());

drop policy if exists chapter_quiz_attempt_question_self_read on public.chapter_quiz_attempt_question;
create policy chapter_quiz_attempt_question_self_read on public.chapter_quiz_attempt_question
  for select to authenticated
  using (exists (
    select 1 from public.chapter_quiz_attempt a
    where a.id = chapter_quiz_attempt_question.attempt_id
      and a.student_id = auth.uid()
  ));

-- ============================================================================
-- 9) Grants
-- ============================================================================
grant select on public.batch_chapter                 to authenticated;
grant select, insert, update, delete on public.assessment_question        to authenticated;
grant select, insert, update, delete on public.assessment_question_option to authenticated;
grant select, insert, update, delete on public.chapter_quiz               to authenticated;
grant select on public.chapter_quiz_attempt          to authenticated;
grant select on public.chapter_quiz_attempt_question to authenticated;

grant execute on function public.sync_batch_chapters(uuid)                        to authenticated;
grant execute on function public.set_batch_subject_progress(uuid, uuid, text)     to authenticated;
grant execute on function public.set_batch_chapter_progress(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.student_chapter_quizzes(uuid)                    to authenticated;
grant execute on function public.start_chapter_quiz_attempt(uuid, uuid)           to authenticated;
grant execute on function public.get_chapter_quiz_attempt(uuid)                   to authenticated;
grant execute on function public.save_chapter_quiz_answers(uuid, jsonb)           to authenticated;
grant execute on function public.submit_chapter_quiz_attempt(uuid)               to authenticated;

commit;
