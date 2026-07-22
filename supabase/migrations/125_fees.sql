-- ============================================================================
-- 125_fees.sql
-- Courses, batches, and the fees domain for issue #49 — one migration (not yet
-- deployed). Model (see docs/course-structure-design.md):
--
--   course (reusable TEMPLATE)
--     ├── course_subject          — subjects in the syllabus (reuses exam `subject`)
--     ├── course_subject_chapter  — the chapters of each subject in scope
--     │                             (same subject, different depth per course)
--     ├── course_fee_line         — DEFAULT fee template (copied into a batch)
--     └── batch (a dated RUN of the course)
--            ├── batch_college     — associated college(s), M:N
--            ├── fee_component      — the batch's actual fee lines (editable)
--            └── student_enrollment — students in the batch (free/discount)
--                   ├── payment          — full settlement or an installment
--                   └── installment      — scheduled installment plan
--
--   enrollment_balance (view) — net owed − paid-to-date = remaining balance.
--
-- Money in PAISE (bigint). Enrolment price is snapshotted (gross_fee_paise) so
-- later fee edits never change what a student owes. Batch dates are optional
-- (open-ended until an admin closes the batch). Idempotent.
-- ============================================================================

-- 0) Permission ---------------------------------------------------------------
-- Finance is a central (HQ) function: platform_admin manages courses, batches,
-- fees, enrolments, and payments; owner inherits via the '*' wildcard. Students
-- read their own rows (RLS below); college staff get read-only via their
-- existing college.students.view grant.
insert into public.permission (key, description) values
  ('finance.manage', 'Manage courses, batches, fees, enrolments, and record payments/receipts.')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on p.key = 'finance.manage'
where r.key = 'platform_admin'
on conflict do nothing;

-- ============================================================================
-- 1) Course template
-- ============================================================================
create table if not exists public.course (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  category    text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_by  uuid references public.app_user(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- NOTE: a course does NOT store its own subjects/chapters. Its syllabus is
-- INHERITED from the competitive exams it prepares for (see competitive_exam_subject /
-- competitive_exam_subject_chapter below) — the exam owns the syllabus and its depth,
-- authored once, and every course targeting it picks it up.

-- Default fee lines for the course; copied into a batch's fee_component at
-- batch creation, then editable per batch.
create table if not exists public.course_fee_line (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.course(id) on delete cascade,
  label        text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  sort_order   int not null default 0
);
create index if not exists course_fee_line_course_idx on public.course_fee_line (course_id, sort_order);

-- Target competitive exams a course prepares students for (ICET, MAT, CAT…).
-- A reference catalog (admin-extendable) — distinct from the platform's internal
-- mock-exam entity (`exam`); this names the external exam the course targets.
create table if not exists public.competitive_exam (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,            -- 'ICET', 'MAT', 'CAT'
  name        text not null,
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);
insert into public.competitive_exam (code, name, sort_order) values
  ('ICET', 'Integrated Common Entrance Test',        1),
  ('MAT',  'Management Aptitude Test',               2),
  ('CAT',  'Common Admission Test',                  3),
  ('CMAT', 'Common Management Admission Test',       4),
  ('GATE', 'Graduate Aptitude Test in Engineering',  5),
  ('BANK', 'Banking Exams (IBPS / SBI)',             6),
  ('SSC',  'Staff Selection Commission',             7),
  ('GRE',  'Graduate Record Examinations',           8)
on conflict (code) do nothing;

-- Which competitive exams a course is associated with (M:N). The course's syllabus
-- is the union of these exams' syllabi.
create table if not exists public.course_competitive_exam (
  course_id      uuid not null references public.course(id) on delete cascade,
  competitive_exam_id uuid not null references public.competitive_exam(id) on delete restrict,
  primary key (course_id, competitive_exam_id)
);
create index if not exists course_competitive_exam_exam_idx on public.course_competitive_exam (competitive_exam_id);

-- A competitive exam's OWN syllabus — subjects (reusing the exam `subject` taxonomy)
-- and the chapters of each subject in scope. This is where an exam's depth lives
-- (deeper Quant for Bank PO, fewer for ICET), authored once per exam.
create table if not exists public.competitive_exam_subject (
  competitive_exam_id uuid not null references public.competitive_exam(id) on delete cascade,
  subject_id     uuid not null references public.subject(id) on delete restrict,
  sort_order     int not null default 0,
  primary key (competitive_exam_id, subject_id)
);

create table if not exists public.competitive_exam_subject_chapter (
  competitive_exam_id uuid not null,
  subject_id     uuid not null,
  chapter_id     uuid not null,
  primary key (competitive_exam_id, subject_id, chapter_id),
  foreign key (competitive_exam_id, subject_id)
    references public.competitive_exam_subject (competitive_exam_id, subject_id) on delete cascade,
  -- chapter must belong to the subject (chapter has unique (id, subject_id)).
  foreign key (chapter_id, subject_id)
    references public.chapter (id, subject_id)
);
-- NOTE: deliberately NO direct fk from this table to competitive_exam. Adding
-- one makes PostgREST treat this table as a junction between competitive_exam
-- and competitive_exam_subject, which yields an ambiguous-embed error when
-- embedding competitive_exam_subject. Chapters are read via a filtered query
-- (eq competitive_exam_id) instead of a nested embed. The drop below removes the
-- fk if an earlier version of this migration added it.
alter table public.competitive_exam_subject_chapter
  drop constraint if exists competitive_exam_subject_chapter_exam_fk;

-- ============================================================================
-- 2) Batch — a dated run of a course
-- ============================================================================
create table if not exists public.batch (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.course(id) on delete restrict,
  name          text not null,
  code          text not null unique,
  academic_year text,                          -- e.g. '2026-27'
  delivery_mode text,                          -- 'online' | 'offline' | 'hybrid'
  start_date    date,                          -- optional (open-ended until closed)
  end_date      date,
  currency      text not null default 'INR',
  status        text not null default 'draft'
                  check (status in ('draft', 'open', 'running', 'closed', 'cancelled')),
  closed_at     timestamptz,
  closed_by     uuid references public.app_user(id) on delete set null,
  created_by    uuid references public.app_user(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists batch_course_idx on public.batch (course_id);

-- Colleges associated with a batch (M:N — a batch may serve one or several).
create table if not exists public.batch_college (
  batch_id   uuid not null references public.batch(id) on delete cascade,
  college_id uuid not null references public.college(id) on delete cascade,
  primary key (batch_id, college_id)
);
create index if not exists batch_college_college_idx on public.batch_college (college_id);

-- The batch's actual fee lines (seeded from course_fee_line, editable).
create table if not exists public.fee_component (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.batch(id) on delete cascade,
  label        text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  sort_order   int not null default 0
);
create index if not exists fee_component_batch_idx on public.fee_component (batch_id, sort_order);

-- Convenience: a batch's fee total (sum of its components).
create or replace view public.batch_fee_total
  with (security_invoker = true) as
  select b.id as batch_id,
         coalesce(sum(fc.amount_paise), 0)::bigint as total_paise
  from public.batch b
  left join public.fee_component fc on fc.batch_id = b.id
  group by b.id;

-- ============================================================================
-- 3) Enrolment — free / discount / scholarship live here
-- ============================================================================
create table if not exists public.student_enrollment (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.app_user(id) on delete restrict,
  batch_id          uuid not null references public.batch(id) on delete restrict,
  -- The student's own college (for reporting / college-scoped RLS).
  college_id        uuid references public.college(id) on delete set null,
  -- Price snapshot at enrolment (frozen against later fee edits).
  gross_fee_paise   bigint not null default 0 check (gross_fee_paise >= 0),
  concession_type   text not null default 'none'
                      check (concession_type in ('none', 'discount', 'scholarship', 'full_waiver')),
  concession_paise  bigint not null default 0 check (concession_paise >= 0),
  concession_reason text,
  -- net = gross - concession; generated so it can never drift. Free ⇒ 0.
  net_fee_paise     bigint generated always as (greatest(gross_fee_paise - concession_paise, 0)) stored,
  payment_option    text not null default 'full' check (payment_option in ('full', 'installments')),
  status            text not null default 'pending'
                      check (status in ('pending', 'active', 'completed', 'cancelled')),
  enrolled_on       date not null default current_date,
  notes             text,
  created_by        uuid references public.app_user(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id, batch_id)
);
create index if not exists enrollment_student_idx on public.student_enrollment (student_id);
create index if not exists enrollment_batch_idx   on public.student_enrollment (batch_id);
create index if not exists enrollment_college_idx on public.student_enrollment (college_id);

-- ============================================================================
-- 4) Payments — full settlement or an installment
-- ============================================================================
-- Monotonic receipt number: "CL/FR/<academic-year>/<00001>".
create sequence if not exists public.fee_receipt_seq;

create or replace function public.next_fee_receipt_no(p_academic_year text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   bigint := nextval('public.fee_receipt_seq');
  v_seq text := lpad(v_n::text, 5, '0');
begin
  if p_academic_year is null or btrim(p_academic_year) = '' then
    return 'CL/FR/' || v_seq;
  end if;
  return 'CL/FR/' || regexp_replace(btrim(p_academic_year), '\s+', '', 'g') || '/' || v_seq;
end;
$$;
grant execute on function public.next_fee_receipt_no(text) to authenticated;

create table if not exists public.payment (
  id             uuid primary key default gen_random_uuid(),
  receipt_no     text not null unique,
  enrollment_id  uuid not null references public.student_enrollment(id) on delete restrict,
  -- Denormalised from the enrolment so self-read RLS is a direct auth.uid() match.
  student_id     uuid not null references public.app_user(id) on delete restrict,
  college_id     uuid references public.college(id) on delete set null,
  -- Optional link to a scheduled installment this payment settles (FK added in §5).
  installment_id uuid,
  amount_paise   bigint not null check (amount_paise > 0),
  mode           text not null check (mode in ('cash', 'upi', 'card', 'online')),
  reference_no   text,                          -- txn/auth/payment id for non-cash
  paid_on        date not null default current_date,
  issued_on      date not null default current_date,
  notes          text,
  created_by     uuid references public.app_user(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists payment_enrollment_idx on public.payment (enrollment_id);
create index if not exists payment_student_idx    on public.payment (student_id);
create index if not exists payment_college_idx    on public.payment (college_id);

-- ============================================================================
-- 5) Scheduled installment plan
-- ============================================================================
create table if not exists public.installment (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  seq           int not null,                   -- 1, 2, 3 …
  due_on        date not null,
  amount_paise  bigint not null check (amount_paise >= 0),
  status        text not null default 'pending'
                  check (status in ('pending', 'paid', 'waived', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (enrollment_id, seq)
);
create index if not exists installment_enrollment_idx on public.installment (enrollment_id, seq);

-- Wire payment → installment now that both tables exist (idempotent).
alter table public.payment drop constraint if exists payment_installment_fk;
alter table public.payment
  add constraint payment_installment_fk
  foreign key (installment_id) references public.installment(id) on delete set null;

-- ============================================================================
-- 6) Balance ledger
-- ============================================================================
-- Remaining balance = net fee owed − everything paid to date. security_invoker
-- so a student only ever sees their own enrolments through the view's RLS.
create or replace view public.enrollment_balance
  with (security_invoker = true) as
  select e.id                                                       as enrollment_id,
         e.student_id,
         e.net_fee_paise,
         coalesce(p.paid, 0)::bigint                                 as paid_to_date_paise,
         greatest(e.net_fee_paise - coalesce(p.paid, 0), 0)::bigint  as balance_paise
  from public.student_enrollment e
  left join (
    select enrollment_id, sum(amount_paise) as paid
    from public.payment
    group by enrollment_id
  ) p on p.enrollment_id = e.id;

-- ============================================================================
-- 7) RLS
-- ============================================================================
alter table public.course                      enable row level security;
alter table public.course_fee_line             enable row level security;
alter table public.competitive_exam                 enable row level security;
alter table public.course_competitive_exam          enable row level security;
alter table public.competitive_exam_subject         enable row level security;
alter table public.competitive_exam_subject_chapter enable row level security;
alter table public.batch                       enable row level security;
alter table public.batch_college           enable row level security;
alter table public.fee_component           enable row level security;
alter table public.student_enrollment      enable row level security;
alter table public.payment                 enable row level security;
alter table public.installment             enable row level security;

-- Catalog (course + syllabus + competitive exams + batch + batch's fee lines): any
-- signed-in user may read; only finance staff may write. One read + one write
-- policy per table, generated in a loop (policy name passed as its own quoted
-- identifier, e.g. course_read / course_write).
do $$
declare t text;
begin
  foreach t in array array[
    'course', 'course_fee_line', 'competitive_exam', 'course_competitive_exam',
    'competitive_exam_subject', 'competitive_exam_subject_chapter',
    'batch', 'batch_college', 'fee_component'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.has_permission(''finance.manage'')) '
      'with check (public.has_permission(''finance.manage''))',
      t || '_write', t);
  end loop;
end $$;

-- Enrolment: student reads own; finance staff manage; college staff read theirs.
drop policy if exists enrollment_self_read on public.student_enrollment;
create policy enrollment_self_read on public.student_enrollment
  for select to authenticated
  using (student_id = auth.uid());
drop policy if exists enrollment_staff_read on public.student_enrollment;
create policy enrollment_staff_read on public.student_enrollment
  for select to authenticated
  using (
    public.has_permission('finance.manage')
    or public.has_college_permission('college.students.view', college_id)
  );
drop policy if exists enrollment_write on public.student_enrollment;
create policy enrollment_write on public.student_enrollment
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- Payment: student reads own; finance staff manage; college staff read theirs.
drop policy if exists payment_self_read on public.payment;
create policy payment_self_read on public.payment
  for select to authenticated
  using (student_id = auth.uid());
drop policy if exists payment_staff_read on public.payment;
create policy payment_staff_read on public.payment
  for select to authenticated
  using (
    public.has_permission('finance.manage')
    or public.has_college_permission('college.students.view', college_id)
  );
drop policy if exists payment_write on public.payment;
create policy payment_write on public.payment
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- Installment: student reads own (via the enrolment); finance staff manage.
drop policy if exists installment_self_read on public.installment;
create policy installment_self_read on public.installment
  for select to authenticated
  using (
    exists (
      select 1 from public.student_enrollment e
      where e.id = installment.enrollment_id and e.student_id = auth.uid()
    )
  );
drop policy if exists installment_write on public.installment;
create policy installment_write on public.installment
  for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- Table access (RLS still gates rows).
grant select, insert, update, delete on
  public.course, public.course_fee_line, public.competitive_exam, public.course_competitive_exam,
  public.competitive_exam_subject, public.competitive_exam_subject_chapter,
  public.batch, public.batch_college, public.fee_component,
  public.student_enrollment, public.payment, public.installment
  to authenticated;
grant select on public.batch_fee_total, public.enrollment_balance to authenticated;
