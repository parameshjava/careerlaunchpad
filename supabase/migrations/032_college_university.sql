-- ============================================================================
-- 032_college_university.sql
-- Associate each college with its affiliating UNIVERSITY (spec extension flagged
-- back in 002_domain_entities.sql: "Extend later ... e.g. affiliating_university").
--
-- A university is itself a college row — it admits students like any institution.
-- So instead of a separate `university` table we self-reference `public.college`:
--
--   * a regular college  -> university_id points to its affiliating university row
--   * a university itself -> university_id = its own id  (self-association)
--   * unknown / not set   -> university_id is NULL        (optional)
--
-- The set of universities is therefore exactly { c | c.university_id = c.id }.
-- on delete set null: we never hard-delete colleges (soft-archive only), but if a
-- university row were ever removed, its affiliates simply lose the link rather
-- than cascading away.
-- ============================================================================

alter table public.college
  add column if not exists university_id uuid references public.college(id) on delete set null;

-- Source-system identifier (e.g. the OAMDC / APSCHE "Institute Code"). Optional —
-- the UGC 008_* rows have none. A unique index lets a degree-college seed upsert
-- on the code (its natural key); NULLs are distinct, so the many code-less UGC
-- rows don't collide.
alter table public.college
  add column if not exists college_code text;
create unique index if not exists college_code_key on public.college (college_code);

-- Look up affiliates of a university, and find the university rows themselves
-- (university_id = id), without a full table scan.
create index if not exists college_university_idx on public.college (university_id);

-- The universities are exactly the self-associated rows. PostgREST can't express
-- a column = column filter, so expose them as a view for the dropdown/filter API.
-- security_invoker: the view runs with the caller's RLS (college is read-open to
-- signed-in users), not the definer's, so it never widens access.
create or replace view public.university
  with (security_invoker = true) as
  select id, name, place, district, state, status
  from public.college
  where university_id = id;
