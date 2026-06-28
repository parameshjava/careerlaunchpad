-- ============================================================================
-- 021_exam_core.sql  (clean, final model)
-- Exam module schema. Two clearly separated halves:
--
--   GLOBAL QUESTION BANK — a CareerLaunchPad asset, NOT tied to any college:
--     subject -> chapter -> question -> question_option, plus passage.
--     Curated centrally (Owner / platform admin). Read by exam staff; students
--     never read it directly (they go through the SECURITY DEFINER RPCs in 022).
--
--   PER-COLLEGE EXAMS — exam (blueprint) -> exam_session (a sitting) -> paper /
--     roster / attempts. These carry college_id and are RLS-scoped to a college.
--
-- Reference, never copy: generated papers store question_id references (+ version),
-- not question text. Editing a referenced question is blocked (archive + recreate).
--
-- This migration is idempotent: it DROPs the exam objects and recreates them, so
-- it can be re-run to rebuild the module cleanly.
-- ============================================================================

-- ---- clean slate (children first) -------------------------------------------
drop table if exists public.exam_attempt_question  cascade;
drop table if exists public.exam_attempt           cascade;
drop table if exists public.exam_paper_question    cascade;
drop table if exists public.exam_paper             cascade;
drop table if exists public.exam_session_student   cascade;
drop table if exists public.exam_session           cascade;
drop table if exists public.exam_section_chapter   cascade;
drop table if exists public.exam_section           cascade;
drop table if exists public.exam                    cascade;
drop table if exists public.question_option         cascade;
drop table if exists public.question                cascade;
drop table if exists public.passage                 cascade;
drop table if exists public.chapter                 cascade;
drop table if exists public.subject                 cascade;

-- ---------------------------------------------------------------------------
-- 1) GLOBAL QUESTION BANK (no college_id anywhere)
-- ---------------------------------------------------------------------------

create table public.subject (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);
create unique index subject_name_uniq on public.subject (lower(name));

create table public.chapter (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subject(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (id, subject_id)               -- target for question's composite FK
);
create index chapter_subject_idx on public.chapter (subject_id);
create unique index chapter_subject_name_uniq on public.chapter (subject_id, lower(name));

create table public.passage (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subject(id) on delete cascade,
  title      text,
  body       text not null,            -- Markdown + LaTeX + code
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);
create index passage_subject_idx on public.passage (subject_id);

create table public.question (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null,        -- denormalized from chapter for the generator's hot query
  chapter_id     uuid not null,
  passage_id     uuid references public.passage(id),
  kind           text not null default 'standard'
                   check (kind in ('standard','passage','data_sufficiency')),
  difficulty     text not null check (difficulty in ('easy','medium','hard','very_hard')),
  answer_type    text not null check (answer_type in ('single','multi')),
  stem           text not null,        -- Markdown + LaTeX + code
  stem_image_url text,
  explanation    text,
  version        int  not null default 1,
  status         text not null default 'active' check (status in ('active','archived')),
  created_by     uuid references public.app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- (chapter, subject) must match a real chapter row, so subject_id can't drift.
  foreign key (chapter_id, subject_id) references public.chapter (id, subject_id)
);
create index question_chapter_idx on public.question (chapter_id);
create index question_passage_idx on public.question (passage_id);
create index question_gen_idx     on public.question (subject_id, difficulty, status);

create table public.question_option (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question(id) on delete cascade,
  label       text not null,
  is_correct  boolean not null default false,
  position    int not null,
  unique (question_id, position)
);
create index question_option_question_idx on public.question_option (question_id);

-- ---------------------------------------------------------------------------
-- 2) PER-COLLEGE EXAMS
-- ---------------------------------------------------------------------------

create table public.exam (
  id                      uuid primary key default gen_random_uuid(),
  college_id              uuid not null references public.college(id) on delete cascade,
  title                   text not null,
  duration_minutes        int not null,
  generation_strategy     text not null default 'fixed'
                            check (generation_strategy in ('fixed','per_student')),
  shuffle_questions       boolean not null default true,
  shuffle_options         boolean not null default true,
  negative_mark_per_wrong numeric(4,2) not null default 0,
  status                  text not null default 'draft' check (status in ('draft','published','archived')),
  created_by              uuid references public.app_user(id),
  created_at              timestamptz not null default now()
);
create index exam_college_idx on public.exam (college_id);

create table public.exam_section (
  id                 uuid primary key default gen_random_uuid(),
  exam_id            uuid not null references public.exam(id) on delete cascade,
  subject_id         uuid not null references public.subject(id),
  num_questions      int not null check (num_questions > 0),
  marks_per_question numeric(4,2) not null default 1,
  pct_easy           int not null default 0,
  pct_medium         int not null default 0,
  pct_hard           int not null default 0,
  pct_very_hard      int not null default 0,
  position           int not null,
  check (pct_easy + pct_medium + pct_hard + pct_very_hard = 100),
  unique (id, subject_id)
);
create index exam_section_exam_idx on public.exam_section (exam_id);

create table public.exam_section_chapter (
  section_id uuid not null,
  subject_id uuid not null,
  chapter_id uuid not null,
  pct        int not null check (pct >= 0 and pct <= 100),
  primary key (section_id, chapter_id),
  foreign key (section_id, subject_id) references public.exam_section (id, subject_id) on delete cascade,
  foreign key (chapter_id, subject_id) references public.chapter (id, subject_id)
);

create table public.exam_session (
  id                uuid primary key default gen_random_uuid(),
  exam_id           uuid not null references public.exam(id) on delete cascade,
  college_id        uuid not null references public.college(id) on delete cascade,
  label             text not null,
  mode              text not null default 'online' check (mode in ('online','offline')),
  opens_at          timestamptz,
  closes_at         timestamptz,
  status            text not null default 'scheduled'
                      check (status in ('scheduled','open','closed','graded')),
  results_published boolean not null default false,
  created_by        uuid references public.app_user(id),
  created_at        timestamptz not null default now()
);
create index exam_session_exam_idx    on public.exam_session (exam_id);
create index exam_session_college_idx on public.exam_session (college_id);

create table public.exam_session_student (
  session_id uuid not null references public.exam_session(id) on delete cascade,
  student_id uuid not null references public.app_user(id) on delete cascade,
  status     text not null default 'invited' check (status in ('invited','started','submitted')),
  primary key (session_id, student_id)
);
create index exam_session_student_student_idx on public.exam_session_student (student_id);

create table public.exam_paper (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_session(id) on delete cascade,
  seed       bigint not null,
  created_at timestamptz not null default now()
);
create index exam_paper_session_idx on public.exam_paper (session_id);

create table public.exam_paper_question (
  paper_id         uuid not null references public.exam_paper(id) on delete cascade,
  question_id      uuid not null references public.question(id),
  question_version int not null,
  section_id       uuid not null references public.exam_section(id),
  position         int not null,
  primary key (paper_id, position)
);

create table public.exam_attempt (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.exam_session(id),
  student_id   uuid not null references public.app_user(id),
  status       text not null default 'in_progress'
                 check (status in ('in_progress','submitted','graded')),
  seed         bigint,
  score        numeric(6,2),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  unique (session_id, student_id)
);
create index exam_attempt_session_idx on public.exam_attempt (session_id);
create index exam_attempt_student_idx on public.exam_attempt (student_id);

create table public.exam_attempt_question (
  attempt_id          uuid not null references public.exam_attempt(id) on delete cascade,
  question_id         uuid not null references public.question(id),
  question_version    int not null,
  section_id          uuid not null references public.exam_section(id),
  position            int not null,
  selected_option_ids uuid[] not null default '{}',
  awarded_marks       numeric(4,2),
  primary key (attempt_id, position)
);

-- ---------------------------------------------------------------------------
-- 3) Permissions (data). Bank = central team; exams = college admins.
-- ---------------------------------------------------------------------------

insert into public.permission (key, description) values
  ('exam.subject.manage',   'Create/edit subjects, chapters & passages (global bank).'),
  ('exam.question.manage',  'Author/edit/version questions (global bank).'),
  ('exam.blueprint.manage', 'Create and edit exam blueprints (own college).'),
  ('exam.paper.generate',   'Generate a paper from a blueprint (own college).'),
  ('exam.paper.export_pdf', 'Export a generated paper to PDF for offline conduct.'),
  ('exam.assign',           'Create exam sessions and assign students (own college).'),
  ('exam.attempt.take',     'Sit an assigned exam.'),
  ('exam.results.view_all', 'View all results / analytics for own college.'),
  ('exam.results.view_own', 'View own exam results when published.')
on conflict (key) do nothing;

-- Central team curates the global bank.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on (
  r.key = 'platform_admin' and p.key in ('exam.subject.manage', 'exam.question.manage')
)
on conflict do nothing;

-- College admins conduct exams (per-college) drawing from the global bank.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on (
  r.key = 'college_admin' and p.key in (
    'exam.blueprint.manage', 'exam.paper.generate', 'exam.paper.export_pdf',
    'exam.assign', 'exam.results.view_all'
  )
)
on conflict do nothing;

-- Students sit exams and see their own published results.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on (
  r.key = 'student' and p.key in ('exam.attempt.take', 'exam.results.view_own')
)
on conflict do nothing;

-- The global bank is central-only. Strip any stale grants from a prior (per-college)
-- schema so re-running this migration converges to the correct state: college
-- admins must NOT hold the bank-management permissions.
delete from public.role_permission rp
using public.role r, public.permission p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key = 'college_admin'
  and p.key in ('exam.subject.manage', 'exam.question.manage');

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER → bypass RLS, so cross-table policy
-- checks never recurse). Defined after the tables they read.
-- ---------------------------------------------------------------------------

-- True if the caller is exam staff (any exam authoring/conducting permission).
-- Gates READ of the global bank so students can't enumerate it directly.
create or replace function public.is_exam_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission('exam.subject.manage')
      or public.has_permission('exam.question.manage')
      or public.has_permission('exam.blueprint.manage')
      or public.has_permission('exam.paper.generate')
      or public.has_permission('exam.paper.export_pdf')
      or public.has_permission('exam.assign')
      or public.has_permission('exam.results.view_all');
$$;

create or replace function public.exam_session_college(p_session_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select college_id from public.exam_session where id = p_session_id;
$$;

create or replace function public.exam_paper_college(p_paper_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.college_id from public.exam_paper p join public.exam_session s on s.id = p.session_id
  where p.id = p_paper_id;
$$;

create or replace function public.exam_attempt_college(p_attempt_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.college_id from public.exam_attempt a join public.exam_session s on s.id = a.session_id
  where a.id = p_attempt_id;
$$;

create or replace function public.exam_is_rostered(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.exam_session_student
                 where session_id = p_session_id and student_id = auth.uid());
$$;

grant execute on function public.is_exam_staff()            to authenticated;
grant execute on function public.exam_session_college(uuid) to authenticated;
grant execute on function public.exam_paper_college(uuid)   to authenticated;
grant execute on function public.exam_attempt_college(uuid) to authenticated;
grant execute on function public.exam_is_rostered(uuid)     to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.subject               enable row level security;
alter table public.chapter               enable row level security;
alter table public.passage               enable row level security;
alter table public.question              enable row level security;
alter table public.question_option       enable row level security;
alter table public.exam                  enable row level security;
alter table public.exam_section          enable row level security;
alter table public.exam_section_chapter  enable row level security;
alter table public.exam_session          enable row level security;
alter table public.exam_session_student  enable row level security;
alter table public.exam_paper            enable row level security;
alter table public.exam_paper_question   enable row level security;
alter table public.exam_attempt          enable row level security;
alter table public.exam_attempt_question enable row level security;

-- ---- Global bank: exam staff READ; central team WRITES. Students: no direct
--      access — they reach questions only via the 022 SECURITY DEFINER RPCs.
create policy subject_read on public.subject
  for select to authenticated using (public.is_exam_staff());
create policy subject_manage on public.subject
  for all to authenticated
  using (public.has_permission('exam.subject.manage'))
  with check (public.has_permission('exam.subject.manage'));

create policy chapter_read on public.chapter
  for select to authenticated using (public.is_exam_staff());
create policy chapter_manage on public.chapter
  for all to authenticated
  using (public.has_permission('exam.subject.manage'))
  with check (public.has_permission('exam.subject.manage'));

create policy passage_read on public.passage
  for select to authenticated using (public.is_exam_staff());
create policy passage_manage on public.passage
  for all to authenticated
  using (public.has_permission('exam.subject.manage'))
  with check (public.has_permission('exam.subject.manage'));

create policy question_read on public.question
  for select to authenticated using (public.is_exam_staff());
create policy question_manage on public.question
  for all to authenticated
  using (public.has_permission('exam.question.manage'))
  with check (public.has_permission('exam.question.manage'));

-- Options carry is_correct → staff only (college admins need answer keys for the
-- printed paper); students never read this table directly.
create policy question_option_read on public.question_option
  for select to authenticated using (public.is_exam_staff());
create policy question_option_manage on public.question_option
  for all to authenticated
  using (public.has_permission('exam.question.manage'))
  with check (public.has_permission('exam.question.manage'));

-- ---- exam blueprint (per college) -------------------------------------------
create policy exam_manage on public.exam
  for all to authenticated
  using (public.has_college_permission('exam.blueprint.manage', college_id))
  with check (public.has_college_permission('exam.blueprint.manage', college_id));

create policy exam_section_manage on public.exam_section
  for all to authenticated
  using (exists (select 1 from public.exam e where e.id = exam_section.exam_id
                 and public.has_college_permission('exam.blueprint.manage', e.college_id)))
  with check (exists (select 1 from public.exam e where e.id = exam_section.exam_id
                 and public.has_college_permission('exam.blueprint.manage', e.college_id)));

create policy exam_section_chapter_manage on public.exam_section_chapter
  for all to authenticated
  using (exists (select 1 from public.exam_section es join public.exam e on e.id = es.exam_id
                 where es.id = exam_section_chapter.section_id
                   and public.has_college_permission('exam.blueprint.manage', e.college_id)))
  with check (exists (select 1 from public.exam_section es join public.exam e on e.id = es.exam_id
                 where es.id = exam_section_chapter.section_id
                   and public.has_college_permission('exam.blueprint.manage', e.college_id)));

-- ---- sessions: admin manages; assigned students read (via definer helper) ----
create policy exam_session_manage on public.exam_session
  for all to authenticated
  using (public.has_college_permission('exam.assign', college_id))
  with check (public.has_college_permission('exam.assign', college_id));
create policy exam_session_student_read on public.exam_session
  for select to authenticated using (public.exam_is_rostered(id));

create policy exam_session_student_manage on public.exam_session_student
  for all to authenticated
  using (public.has_college_permission('exam.assign', public.exam_session_college(session_id)))
  with check (public.has_college_permission('exam.assign', public.exam_session_college(session_id)));
create policy exam_session_student_self_read on public.exam_session_student
  for select to authenticated using (student_id = auth.uid());

-- ---- papers (admin only) -----------------------------------------------------
create policy exam_paper_manage on public.exam_paper
  for all to authenticated
  using (public.has_college_permission('exam.paper.generate', public.exam_session_college(session_id)))
  with check (public.has_college_permission('exam.paper.generate', public.exam_session_college(session_id)));

create policy exam_paper_question_manage on public.exam_paper_question
  for all to authenticated
  using (public.has_college_permission('exam.paper.generate', public.exam_paper_college(paper_id)))
  with check (public.has_college_permission('exam.paper.generate', public.exam_paper_college(paper_id)));

-- ---- attempts: students write ONLY via RPCs (022); SELECT-own removed so score
--      can't leak before publish. Admins read for results.
create policy exam_attempt_admin_read on public.exam_attempt
  for select to authenticated
  using (public.has_college_permission('exam.results.view_all', public.exam_session_college(session_id)));

create policy exam_attempt_question_admin_read on public.exam_attempt_question
  for select to authenticated
  using (public.has_college_permission('exam.results.view_all', public.exam_attempt_college(attempt_id)));
