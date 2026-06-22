-- ============================================================================
-- 20260622000002_domain_entities.sql
-- Domain entities (spec §6): college, employer, invite, student_profile,
-- job, application, conversation, message.
-- ============================================================================

-- college ---------------------------------------------------------------------
-- Columns mirror the UGC "list of colleges" source (public/list_of_college...pdf):
-- name + place + full address + district/state + pincode + Govt/Non-Govt ownership.
-- `place` disambiguates same-named colleges in different towns; identity is the
-- (name, place, pincode) triple (NULLs distinct, so only enforced where a
-- pincode exists). Seeded in 008_college_seed.sql. Extend later as needed
-- (e.g. affiliating_university, teaching_upto, naac_grade).
create table if not exists public.college (
  id             uuid primary key default gen_random_uuid(),   -- auto-generated
  name           text not null,
  place          text,                              -- city/town (disambiguator)
  address        text,                              -- full address as printed
  district       text,
  state          text,
  pincode        text,                              -- 6-digit PIN as text (preserves leading zeros)
  established_in int,                               -- "Year of Estb."
  ownership_type text check (ownership_type in ('GOVERNMENT', 'PRIVATE')),
  status         text not null default 'active' check (status in ('active', 'archived')),
  created_by     uuid references public.app_user(id),
  created_at     timestamptz not null default now(),
  constraint college_name_place_pincode_key unique (name, place, pincode)
);
create index if not exists college_state_idx     on public.college (state);
create index if not exists college_name_idx       on public.college (name);
create index if not exists college_district_idx   on public.college (district);
create index if not exists college_place_idx       on public.college (place);
create index if not exists college_pincode_idx     on public.college (pincode);
create index if not exists college_ownership_idx   on public.college (ownership_type);

-- Now that college exists, wire user_role.scope_college_id -> college.id.
alter table public.user_role
  drop constraint if exists user_role_scope_college_id_fkey;
alter table public.user_role
  add constraint user_role_scope_college_id_fkey
  foreign key (scope_college_id) references public.college(id) on delete cascade;

-- employer (organization) -----------------------------------------------------
create table if not exists public.employer (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  website    text,
  logo_url   text,
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

-- Employer users belong to one employer org (mirrors college scoping for
-- College Admins). Set from the invite on provisioning; NULL for non-employers.
-- This refines the draft spec, which scoped only colleges on user_role — the
-- contact-reveal rule (§5.3) and applicant scoping need an employer↔user link.
alter table public.app_user
  add column if not exists employer_id uuid references public.employer(id);

-- invite -- Owner-issued; the sole entry point for account creation (spec §5.1).
-- Keyed by email + role + scope; consumed on first matching social sign-in.
create table if not exists public.invite (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  role_id          uuid not null references public.role(id),
  scope_college_id uuid references public.college(id),   -- student / college_admin
  employer_id      uuid references public.employer(id),  -- employer
  status           text not null default 'pending' check (status in ('pending', 'consumed', 'revoked')),
  token            text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by       uuid references public.app_user(id),
  expires_at       timestamptz,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- One live invite per email at a time.
create unique index if not exists invite_pending_email_uniq
  on public.invite (lower(email))
  where status = 'pending';

-- student_profile -- 1:1 with a student app_user. The four §4 groups.
create table if not exists public.student_profile (
  user_id               uuid primary key references public.app_user(id) on delete cascade,
  -- Group 1: core identity & academics
  full_name             text,
  photo_url             text,                       -- R2 object key for the profile photo (see lib/r2.ts / docs/R2_SETUP.md)
  college_id            uuid references public.college(id),
  degree                text,
  branch                text,
  graduation_year       int,
  cgpa                  numeric(4,2),
  -- Group 2: skills & resume
  skills                text[] not null default '{}',
  resume_url            text,                       -- R2 object key for the resume PDF (private; served via presigned URL)
  portfolio_url         text,
  github_url            text,
  linkedin_url          text,
  -- Group 3: projects & experience (free-form structured)
  projects              jsonb not null default '[]',
  internships           jsonb not null default '[]',
  certifications        jsonb not null default '[]',
  achievements          jsonb not null default '[]',
  -- Group 4: job preferences
  desired_roles         text[] not null default '{}',
  desired_locations     text[] not null default '{}',
  job_type              text not null default 'any' check (job_type in ('internship', 'full_time', 'any')),
  open_to_opportunities boolean not null default true,
  -- Private contact detail (revealed only per §5.3)
  phone                 text,
  updated_at            timestamptz not null default now()
);

create index if not exists student_profile_college_idx on public.student_profile (college_id);

-- job -------------------------------------------------------------------------
create table if not exists public.job (
  id          uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer(id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  job_type    text not null default 'full_time' check (job_type in ('internship', 'full_time')),
  status      text not null default 'open' check (status in ('open', 'closed')),
  posted_by   uuid references public.app_user(id),
  created_at  timestamptz not null default now()
);

create index if not exists job_employer_idx on public.job (employer_id);

-- application -----------------------------------------------------------------
create table if not exists public.application (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.job(id) on delete cascade,
  student_id uuid not null references public.app_user(id) on delete cascade,
  status     text not null default 'applied'
             check (status in ('applied', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  cover_note text,
  created_at timestamptz not null default now(),
  unique (job_id, student_id)
);

create index if not exists application_student_idx on public.application (student_id);

-- conversation -- one thread per (employer, student). contact_revealed is the
-- §5.3 privacy gate: student's email/phone surface only once this is true.
create table if not exists public.conversation (
  id               uuid primary key default gen_random_uuid(),
  employer_id      uuid not null references public.employer(id) on delete cascade,
  student_id       uuid not null references public.app_user(id) on delete cascade,
  initiated_by     uuid references public.app_user(id),
  contact_revealed boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (employer_id, student_id)
);

-- message -- lightweight in-platform messaging (spec §8: no read receipts/typing).
create table if not exists public.message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversation(id) on delete cascade,
  sender_id       uuid not null references public.app_user(id),
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists message_conversation_idx on public.message (conversation_id, created_at);
