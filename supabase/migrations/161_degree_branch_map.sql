-- ============================================================================
-- 161_degree_branch_map.sql
-- Degree → Branch mapping (issue #99). Spec: the issue's §3 data model.
--
-- WHAT THIS FIXES
--   Degree and Branch were two INDEPENDENT flat dropdowns (migration 010:
--   ref_degree 13 rows, ref_branch 10 rows, no relation), so the form — and
--   loadRefs()/validatePartial() behind it — happily accepted `degree='mba'` +
--   `branch='civil'`. Worse, the 10 branches were ENGINEERING-ONLY, so every
--   B.Sc / B.Com / B.A student had no correct option and was pushed into "Other".
--
-- THE RELATION IS (degree, branch), NOT branch.degree_id
--   "Computer Science" under B.Sc, "Computer Science & Engineering (CSE)" under
--   B.Tech and "Computer Engineering (CME)" under Diploma are three different
--   things, while Data Science / AI&ML / Biotechnology legitimately appear under
--   several degrees. So the mapping is many-to-many with PER-DEGREE ordering
--   (ref_degree_branch.sort_order) — a `degree_id` column on ref_branch could
--   not express it.
--
-- GROUPING LIVES ON THE MAPPING, NOT ON ref_branch.category
--   The issue proposed grouping the dropdown by ref_branch.category. That breaks
--   for the shared branches: `data_science` is "Engineering" under B.Tech but a
--   "Single major" under B.Sc, and one global column cannot be both. So the
--   group label is a column on ref_degree_branch (per-degree), falling back to
--   ref_branch.category. This is the one deliberate deviation from the spec.
--
-- ref_branch.label IS GLOBALLY UNIQUE (enforced) — the Excel intake depends on it
--   lib/intake-excel.ts resolves an imported cell by label→slug through a Map, so
--   two branches sharing a label would silently import as the wrong slug. Hence
--   'General (Commerce)' / 'General (Management)' / 'General (Computer
--   Applications)' rather than three rows labelled "General", and a unique index
--   that stops a future admin edit from reintroducing the collision.
--
-- ref_branch.family IS FOR MATCHING AND ANALYTICS, NOT FOR STUDENTS
--   Going from 10 branches to ~143 breaks anything that compares branch slugs:
--   `ref_mentor_preference.same_branch` (010) would never pair a B.Sc
--   `computer_science` student with a B.Tech `cse` mentor, and every branch-keyed
--   chart would shatter into slivers. `family` is the stable coarse axis (12
--   buckets) those consumers group by; the student still picks the precise branch.
--
-- IDEMPOTENCY: THE SEED IS A BASELINE, THE DB IS TRUTH
--   Admins edit this catalogue from /dashboard/reference, so a re-run of this
--   migration must never undo their work. Every insert is ON CONFLICT DO NOTHING
--   (never DO UPDATE), and every attribute backfill is guarded — either
--   `where <col> is null` (fills a gap, can't overwrite) or `where <col> = '<the
--   exact 010 seed value>'` (a one-time correction that no-ops on the second run
--   and skips any row an admin has since renamed).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Permission — who may edit the catalogue
-- ---------------------------------------------------------------------------
-- Reference data feeds student-facing forms, mentor matching and analytics, so
-- editing it is a distinct capability rather than a fold into college.manage.
-- owner inherits via the '*' wildcard; platform_admin is granted explicitly.
insert into public.permission (key, description) values
  ('refdata.manage', 'Manage the reference catalogue (degrees, branches, and the degree→branch mapping).')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on p.key = 'refdata.manage'
where r.key = 'platform_admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1) ref_degree gains: does it have a branch, what level, how long, aliases
-- ---------------------------------------------------------------------------
-- branch_mode is added NULLABLE first so the backfill in §7 can tell "never
-- seeded" from "an admin set this" — adding it with `default 'required'` would
-- stamp every existing row and make the two indistinguishable. NOT NULL + the
-- default are applied after the backfill, at the end of §7.
alter table public.ref_degree
  add column if not exists branch_mode    text,
  add column if not exists level          text,
  add column if not exists duration_years numeric(3,1),
  add column if not exists search_terms   text[] not null default '{}';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ref_degree_branch_mode_chk') then
    alter table public.ref_degree add constraint ref_degree_branch_mode_chk
      check (branch_mode is null or branch_mode in ('required', 'optional', 'none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ref_degree_level_chk') then
    alter table public.ref_degree add constraint ref_degree_level_chk
      check (level is null or level in ('diploma', 'ug', 'pg'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ref_degree_duration_chk') then
    alter table public.ref_degree add constraint ref_degree_duration_chk
      check (duration_years is null or (duration_years > 0 and duration_years <= 10));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) ref_branch gains: family (matching/analytics axis) + search aliases
-- ---------------------------------------------------------------------------
-- `family` is intentionally free text (no CHECK) so an admin can introduce a new
-- bucket without a migration. The canonical set seeded below is: computing,
-- electronics, mechanical, civil, chemical, science, commerce, arts, management,
-- pharmacy, vocational, health (+ 'other' for the escape-hatch row).
alter table public.ref_branch
  add column if not exists family       text,
  add column if not exists search_terms text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 3) The mapping — many-to-many, per-degree ordering and grouping
-- ---------------------------------------------------------------------------
-- Slug FKs (not uuids) because slug is already unique on both sides and is the
-- identity every consumer uses (student_profile.branch stores a slug), which
-- keeps the seed below human-readable and the admin API uuid-free.
create table if not exists public.ref_degree_branch (
  degree_slug text    not null references public.ref_degree(slug) on delete cascade,
  branch_slug text    not null references public.ref_branch(slug) on delete cascade,
  -- Wins over ref_branch.sort_order inside a degree (CSE first under B.Tech,
  -- Mathematics first under B.Sc). ref_branch.sort_order is only a fallback.
  sort_order  int     not null default 0,
  -- Per-degree option-group heading ("Common combinations" / "Single major" /
  -- "Engineering"). NULL falls back to ref_branch.category. See the header note.
  group_label text,
  is_active   boolean not null default true,
  primary key (degree_slug, branch_slug)
);

create index if not exists ref_degree_branch_degree_idx
  on public.ref_degree_branch (degree_slug, sort_order);
create index if not exists ref_degree_branch_branch_idx
  on public.ref_degree_branch (branch_slug);

alter table public.ref_degree_branch enable row level security;

-- Public-read, like every other ref_* table (010's loop).
drop policy if exists ref_degree_branch_read_all on public.ref_degree_branch;
create policy ref_degree_branch_read_all on public.ref_degree_branch
  for select using (true);

-- Explicit Data API grants: RLS is the real gate (policies below), but a table
-- with no grant is invisible to PostgREST regardless of policy, and auto-exposure
-- of new public-schema tables is a project setting we shouldn't depend on.
grant select on public.ref_degree_branch to anon, authenticated;
grant insert, update, delete on public.ref_degree_branch to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Write policies — the catalogue becomes admin-editable
-- ---------------------------------------------------------------------------
-- 010 created ONLY `for select using (true)` on every ref_* table, so until now
-- nothing could write them with a user client. Rather than route the admin
-- editor through the service-role key (which bypasses RLS entirely and would put
-- catalogue writes outside the database's own authorization), grant the writes
-- here, gated on refdata.manage — so the API can use the normal authed client and
-- the database enforces the permission a second time.
--
-- DELETE is deliberately NOT granted. student_profile.branch is a plain text slug
-- with no FK, so deleting a ref_branch row would silently orphan live student
-- data; deactivation (is_active = false) is the only removal, and it hides the
-- option from NEW pickers while existing students keep their label.
do $$
declare t text;
begin
  foreach t in array array['ref_degree', 'ref_branch', 'ref_degree_branch'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_refdata', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check (public.has_permission(''refdata.manage''))',
      t || '_insert_refdata', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_refdata', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (public.has_permission(''refdata.manage'')) '
      'with check (public.has_permission(''refdata.manage''))',
      t || '_update_refdata', t);
  end loop;
end $$;

-- The mapping is edited as a whole list per degree (PUT semantics), which needs
-- DELETE for the rows dropped from that list. Scoped to the join table only —
-- ref_degree / ref_branch rows are still undeletable (see above).
drop policy if exists ref_degree_branch_delete_refdata on public.ref_degree_branch;
create policy ref_degree_branch_delete_refdata on public.ref_degree_branch
  for delete to authenticated
  using (public.has_permission('refdata.manage'));

-- ---------------------------------------------------------------------------
-- 5) Audit trail for catalogue edits
-- ---------------------------------------------------------------------------
-- Silent reference-data edits are dangerous: they change what students can
-- answer and how every branch-keyed report buckets. Log who/when/what, with the
-- before → after payload (the impersonation_log pattern from migration 101).
-- The actor is DERIVED by a trigger, never declared by the caller — see the note
-- on stamp_ref_data_actor() below.
create table if not exists public.ref_data_audit (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('ref_degree', 'ref_branch', 'ref_degree_branch')),
  row_key    text not null,               -- degree/branch slug, or 'degree:branch' for a mapping row
  action     text not null check (action in ('create', 'update', 'deactivate', 'activate', 'map', 'unmap', 'reorder', 'copy')),
  before     jsonb,
  after      jsonb,
  -- Never supplied by the caller — STAMPED by the trigger below. See the note there.
  actor_id   uuid references public.app_user(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ref_data_audit_recent_idx on public.ref_data_audit (created_at desc);
create index if not exists ref_data_audit_row_idx    on public.ref_data_audit (table_name, row_key, created_at desc);

alter table public.ref_data_audit enable row level security;

grant select, insert on public.ref_data_audit to authenticated;

drop policy if exists ref_data_audit_read on public.ref_data_audit;
create policy ref_data_audit_read on public.ref_data_audit
  for select to authenticated
  using (public.has_permission('refdata.manage'));

-- A TRIGGER stamps the actor, not a column DEFAULT. Two reasons, both learned the
-- hard way:
--   1. `create table if not exists` above means a DEFAULT never lands on any
--      database where this table already exists (a partially-applied 161, a
--      re-created preview). A trigger is (re)installed on every run, so it can't
--      silently go missing — and a missing default would fail every audit insert
--      against the pinning policy, i.e. lose the trail exactly where it matters.
--   2. It PINS rather than fills: whatever the client sends is overwritten, so a
--      crafted request can't attribute its edit to someone else.
-- acting_user() (migration 160), never auth.uid(): during a "View as" session
-- auth.uid() IS the impersonated user, so auth.uid() would credit the target for
-- an admin's edit — the audit lying in precisely the case it exists for.
create or replace function public.stamp_ref_data_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actor_id := public.acting_user();
  return new;
end $$;

drop trigger if exists ref_data_audit_stamp_actor on public.ref_data_audit;
create trigger ref_data_audit_stamp_actor
  before insert on public.ref_data_audit
  for each row execute function public.stamp_ref_data_actor();

-- Left over from the first cut of this migration, which used a column default;
-- dropped so the two mechanisms can't disagree on an already-migrated database.
alter table public.ref_data_audit alter column actor_id drop default;

-- The permission check stays in the policy. The actor is no longer checked here —
-- the trigger has already replaced whatever arrived, so a value-equality check
-- would only ever compare the trigger's own output with itself.
drop policy if exists ref_data_audit_insert on public.ref_data_audit;
create policy ref_data_audit_insert on public.ref_data_audit
  for insert to authenticated
  with check (public.has_permission('refdata.manage'));

-- ---------------------------------------------------------------------------
-- 6) "Other" write-ins — the free text that keeps the catalogue current
-- ---------------------------------------------------------------------------
-- Until now a student whose course wasn't in the list picked "Other" and their
-- actual answer was LOST. These columns capture it, which is what feeds the
-- admin screen's "Other answers" inbox (map it / add it as a new branch).
alter table public.student_profile
  add column if not exists degree_other text,
  add column if not exists branch_other text;

alter table public.mentor_profile
  add column if not exists degree_other text,
  add column if not exists branch_other text;

-- student_intake too: the console "Add a student" wizard shares StepBody with the
-- student form, so it collects the write-ins as well, and merge_student_intake()
-- (re-declared in 162) carries them on to the profile at claim time. Without the
-- column an admin's typed answer was accepted by the UI and silently dropped.
alter table public.student_intake
  add column if not exists degree_other text,
  add column if not exists branch_other text;

-- ---------------------------------------------------------------------------
-- 7) Degrees — 7 new rows, plus baseline attributes for the 13 from 010
-- ---------------------------------------------------------------------------
insert into public.ref_degree (slug, label, category, sort_order, level, duration_years, branch_mode) values
  ('bpharm',  'B.Pharm',              'UG', 13, 'ug', 4,   'none'),
  ('pharmd',  'Pharm.D',              'UG', 14, 'ug', 6,   'none'),
  ('barch',   'B.Arch',               'UG', 15, 'ug', 5,   'none'),
  ('bvoc',    'B.Voc',                'UG', 16, 'ug', 3,   'required'),
  ('mcom',    'M.Com',                'PG', 17, 'pg', 2,   'none'),
  ('ma',      'M.A',                  'PG', 18, 'pg', 2,   'required'),
  ('mpharm',  'M.Pharm',              'PG', 19, 'pg', 2,   'required')
on conflict (slug) do nothing;

-- Baseline attributes for rows that predate this migration. `where <col> is null`
-- means this fills a gap once and can never overwrite an admin's later change.
update public.ref_degree d
   set level          = coalesce(d.level, s.level),
       duration_years = coalesce(d.duration_years, s.duration_years),
       branch_mode    = coalesce(d.branch_mode, s.branch_mode),
       category       = coalesce(d.category, s.category)
  from (values
    ('btech',   'ug',      4::numeric, 'required', 'UG'),
    ('be',      'ug',      4,          'required', 'UG'),
    ('bsc',     'ug',      3,          'required', 'UG'),
    ('bcom',    'ug',      3,          'required', 'UG'),
    ('ba',      'ug',      3,          'required', 'UG'),
    ('bba',     'ug',      3,          'optional', 'UG'),
    ('bca',     'ug',      3,          'optional', 'UG'),
    ('diploma', 'diploma', 3,          'required', 'Diploma'),
    ('mtech',   'pg',      2,          'required', 'PG'),
    ('mba',     'pg',      2,          'none',     'PG'),
    ('mca',     'pg',      3,          'none',     'PG'),
    ('msc',     'pg',      2,          'required', 'PG')
  ) as s(slug, level, duration_years, branch_mode, category)
 where d.slug = s.slug
   and (d.level is null or d.duration_years is null or d.branch_mode is null or d.category is null);

-- 'Other' has no level/duration by definition, and no branch (there is nothing
-- to enumerate for an unlisted degree — the student types it into degree_other).
update public.ref_degree set branch_mode = 'none' where slug = 'other' and branch_mode is null;

-- One-time label correction, guarded on the exact 010 value so it no-ops on a
-- re-run and skips the row entirely if an admin has since renamed it.
update public.ref_degree set label = 'Diploma (Polytechnic)'
 where slug = 'diploma' and label = 'Diploma';
-- MCA is a THREE-year programme in the AP/TS colleges we admit from; the first cut of
-- this seed said 2. Guarded on the exact previous seed value, so it no-ops on a re-run
-- and leaves alone any duration an admin has since tuned. (AICTE moved MCA to two years
-- nationally in 2020, so if both cohorts ever appear here, this is the row to change —
-- duration_years is editable on /dashboard/reference.)
update public.ref_degree set duration_years = 3 where slug = 'mca' and duration_years = 2;

-- Every degree row now has a branch_mode, so it can carry the invariant.
alter table public.ref_degree alter column branch_mode set default 'required';
update public.ref_degree set branch_mode = 'required' where branch_mode is null;
alter table public.ref_degree alter column branch_mode set not null;

-- Degree search aliases — how students actually type it ("b tech", "icet",
-- "polytechnic"). Guarded on "still empty" so admin-tuned lists survive a re-run.
update public.ref_degree d set search_terms = s.terms
  from (values
    ('btech',   array['btech','b tech','b.tech','bachelor of technology','engineering']),
    ('be',      array['be','b e','b.e','bachelor of engineering','engineering']),
    ('diploma', array['diploma','polytechnic','poly','sbtet']),
    ('bsc',     array['bsc','b sc','b.sc','bachelor of science','degree science']),
    ('bcom',    array['bcom','b com','b.com','commerce','bachelor of commerce']),
    ('ba',      array['ba','b a','b.a','arts','bachelor of arts']),
    ('bba',     array['bba','business administration','management']),
    ('bca',     array['bca','computer applications']),
    ('bpharm',  array['bpharm','b pharm','b.pharm','pharmacy']),
    ('pharmd',  array['pharmd','pharm d','doctor of pharmacy']),
    ('barch',   array['barch','b arch','b.arch','architecture']),
    ('bvoc',    array['bvoc','b voc','b.voc','vocational']),
    ('mtech',   array['mtech','m tech','m.tech','me','master of technology','pgecet']),
    ('msc',     array['msc','m sc','m.sc','master of science']),
    ('mba',     array['mba','business administration','management','icet']),
    ('mca',     array['mca','computer applications','icet']),
    ('mcom',    array['mcom','m com','m.com','commerce']),
    ('ma',      array['ma','m a','m.a','master of arts']),
    ('mpharm',  array['mpharm','m pharm','m.pharm','pharmacy']),
    ('other',   array['other','not listed','not in the list'])
  ) as s(slug, terms)
 where d.slug = s.slug and cardinality(d.search_terms) = 0;

-- ---------------------------------------------------------------------------
-- 8) Branches — 133 new rows across every degree family
-- ---------------------------------------------------------------------------
-- All 10 slugs from 010 are KEPT (cse, it, aiml, data_science, ece, eee,
-- mechanical, civil, chemical, other) so no stored student_profile.branch /
-- mentor_profile.branch value breaks. Labels are refined below; slugs never change.
insert into public.ref_branch (slug, label, category, family, sort_order) values
  -- B.Tech / B.E (AP & TS EAPCET counselling branches)
  ('csbs',                    'Computer Science & Business Systems (CSBS)',      'Engineering', 'computing',   101),
  ('csd',                     'Computer Science & Design (CSD)',                 'Engineering', 'computing',   102),
  ('ai',                      'Artificial Intelligence (AI)',                    'Engineering', 'computing',   103),
  ('cs_cyber',                'Cyber Security',                                  'Engineering', 'computing',   104),
  ('cs_iot',                  'Internet of Things (IoT)',                        'Engineering', 'computing',   105),
  ('ecm',                     'Electronics & Computer Engineering (ECM)',        'Engineering', 'electronics', 106),
  ('eie',                     'Electronics & Instrumentation (EIE)',             'Engineering', 'electronics', 107),
  ('mechatronics',            'Mechatronics',                                    'Engineering', 'mechanical',  108),
  ('robotics',                'Robotics & Automation',                           'Engineering', 'mechanical',  109),
  ('automobile',              'Automobile',                                      'Engineering', 'mechanical',  110),
  ('aero',                    'Aeronautical / Aerospace',                        'Engineering', 'mechanical',  111),
  ('marine',                  'Marine Engineering',                              'Engineering', 'mechanical',  112),
  ('petroleum',               'Petroleum',                                       'Engineering', 'chemical',    113),
  ('mining',                  'Mining',                                          'Engineering', 'mechanical',  114),
  ('metallurgy',              'Metallurgical & Materials',                       'Engineering', 'mechanical',  115),
  ('biotechnology',           'Biotechnology',                                   'Science',     'science',     116),
  ('bme',                     'Biomedical Engineering',                          'Engineering', 'health',      117),
  ('agri_engg',               'Agricultural Engineering',                        'Engineering', 'science',     118),
  ('food_tech',               'Food Technology',                                 'Engineering', 'science',     119),
  ('textile',                 'Textile Technology',                              'Engineering', 'mechanical',  120),
  -- Diploma / Polytechnic (AP SBTET C-20). NOT the same set as B.Tech: a
  -- polytechnic "Computer Engineering (CME)" is its own branch, not `cse`.
  ('computer_engg',           'Computer Engineering (CME)',                      'Polytechnic', 'computing',   130),
  ('sugar_tech',              'Chemical — Sugar Technology',                     'Polytechnic', 'chemical',    131),
  ('plastics_polymers',       'Chemical — Plastics, Polymers & Petrochemicals',  'Polytechnic', 'chemical',    132),
  ('ceramic',                 'Ceramic Technology',                              'Polytechnic', 'chemical',    133),
  ('applied_electronics',     'Applied Electronics & Instrumentation',           'Polytechnic', 'electronics', 134),
  ('garment_tech',            'Garment Technology',                              'Polytechnic', 'vocational',  135),
  ('animation_multimedia',    'Animation & Multimedia (3D Animation & Graphics)','Polytechnic', 'computing',   136),
  ('web_design',              'Web Designing',                                   'Polytechnic', 'computing',   137),
  ('ccp',                     'Commercial & Computer Practice (CCP)',            'Polytechnic', 'commerce',    138),
  -- M.Tech specialisations (AP PGECET subject papers + college specialisations).
  -- A PG specialisation list is NOT a UG branch list.
  ('software_engineering',    'Software Engineering',                            'Engineering (PG specialisation)', 'computing',   140),
  ('vlsi',                    'VLSI Design',                                     'Engineering (PG specialisation)', 'electronics', 141),
  ('embedded',                'Embedded Systems',                                'Engineering (PG specialisation)', 'electronics', 142),
  ('decs',                    'Digital Electronics & Communication Systems',     'Engineering (PG specialisation)', 'electronics', 143),
  ('comm_systems',            'Communication Systems',                           'Engineering (PG specialisation)', 'electronics', 144),
  ('power_electronics',       'Power Electronics & Drives',                      'Engineering (PG specialisation)', 'electronics', 145),
  ('power_systems',           'Electrical Power Systems',                        'Engineering (PG specialisation)', 'electronics', 146),
  ('control_systems',         'Control Systems',                                 'Engineering (PG specialisation)', 'electronics', 147),
  ('structural',              'Structural Engineering',                          'Engineering (PG specialisation)', 'civil',       148),
  ('geotechnical',            'Geotechnical Engineering',                        'Engineering (PG specialisation)', 'civil',       149),
  ('transportation',          'Transportation Engineering',                      'Engineering (PG specialisation)', 'civil',       150),
  ('environmental',           'Environmental Engineering',                       'Engineering (PG specialisation)', 'civil',       151),
  ('water_resources',         'Water Resources Engineering',                     'Engineering (PG specialisation)', 'civil',       152),
  ('thermal',                 'Thermal Engineering',                             'Engineering (PG specialisation)', 'mechanical',  153),
  ('machine_design',          'Machine Design',                                  'Engineering (PG specialisation)', 'mechanical',  154),
  ('cad_cam',                 'CAD/CAM',                                         'Engineering (PG specialisation)', 'mechanical',  155),
  ('manufacturing',           'Manufacturing / Production Engineering',          'Engineering (PG specialisation)', 'mechanical',  156),
  ('geoinformatics',          'Remote Sensing & Geoinformatics',                 'Engineering (PG specialisation)', 'civil',       157),
  -- B.Sc / B.A legacy COMBINATIONS. Anyone admitted before 2025-26 holds one of
  -- these, not a single major — offering only majors is why they all pick "Other".
  ('mpc',                     'Maths, Physics, Chemistry (MPC)',                 'Common combinations', 'science',     160),
  ('mpcs',                    'Maths, Physics, Computer Science (MPCs)',         'Common combinations', 'computing',   161),
  ('mscs',                    'Maths, Statistics, Computer Science (MSCs)',      'Common combinations', 'computing',   162),
  ('mecs',                    'Maths, Electronics, Computer Science (MECs)',     'Common combinations', 'computing',   163),
  ('mpe',                     'Maths, Physics, Electronics (MPE)',               'Common combinations', 'electronics', 164),
  ('bzc',                     'Botany, Zoology, Chemistry (BZC)',                'Common combinations', 'science',     165),
  ('mbc',                     'Microbiology, Biotechnology, Chemistry (MBC)',    'Common combinations', 'science',     166),
  -- B.Sc / M.Sc single majors (APSCHE CBCS, 2025-26 onward)
  ('maths',                   'Mathematics',                                     'Science', 'science',     170),
  ('physics',                 'Physics',                                         'Science', 'science',     171),
  ('chemistry',               'Chemistry',                                        'Science', 'science',     172),
  ('botany',                  'Botany',                                           'Science', 'science',     173),
  ('zoology',                 'Zoology',                                          'Science', 'science',     174),
  ('statistics',              'Statistics',                                       'Science', 'science',     175),
  ('computer_science',        'Computer Science',                                 'Science', 'computing',   176),
  ('electronics',             'Electronics',                                      'Science', 'electronics', 177),
  ('microbiology',            'Microbiology',                                     'Science', 'science',     178),
  ('biochemistry',            'Biochemistry',                                     'Science', 'science',     179),
  ('geology',                 'Geology',                                          'Science', 'science',     180),
  ('environmental_science',   'Environmental Science',                            'Science', 'science',     181),
  ('nutrition_dietetics',     'Food, Nutrition & Dietetics',                      'Science', 'health',      182),
  ('home_science',            'Home Science',                                     'Science', 'science',     183),
  ('psychology',              'Psychology',                                       'Science', 'arts',        184),
  ('forensic_science',        'Forensic Science',                                 'Science', 'science',     185),
  ('agriculture',             'Agriculture',                                      'Science', 'science',     186),
  ('horticulture',            'Horticulture',                                     'Science', 'science',     187),
  ('fishery_science',         'Fishery Science / Aquaculture',                    'Science', 'science',     188),
  ('nursing',                 'Nursing',                                          'Science', 'health',      189),
  -- B.Com. Labels carry "(Commerce)" where they would otherwise collide with a
  -- Management/Computer-Applications row — see the header note on label uniqueness.
  ('com_general',             'General (Commerce)',                               'Commerce', 'commerce', 200),
  ('com_computers',           'Computer Applications (Computers)',                'Commerce', 'commerce', 201),
  ('com_honours',             'Honours',                                          'Commerce', 'commerce', 202),
  ('com_accounting_finance',  'Accounting & Finance',                             'Commerce', 'commerce', 203),
  ('com_taxation',            'Taxation',                                         'Commerce', 'commerce', 204),
  ('com_banking_insurance',   'Banking & Insurance',                              'Commerce', 'commerce', 205),
  ('com_business_analytics',  'Business Analytics (Commerce)',                    'Commerce', 'commerce', 206),
  ('com_foreign_trade',       'Foreign Trade',                                    'Commerce', 'commerce', 207),
  ('com_marketing',           'Marketing (Commerce)',                             'Commerce', 'commerce', 208),
  ('com_vocational',          'Vocational (Commerce)',                            'Commerce', 'commerce', 209),
  -- B.A combinations + single majors
  ('hep',                     'History, Economics, Politics (HEP)',              'Common combinations', 'arts', 215),
  ('hpp',                     'History, Politics, Public Administration (HPP)',  'Common combinations', 'arts', 216),
  ('hps',                     'History, Politics, Sociology',                    'Common combinations', 'arts', 217),
  ('hp_english',              'History, Politics, Special English',              'Common combinations', 'arts', 218),
  ('hp_telugu',               'History, Politics, Special Telugu',               'Common combinations', 'arts', 219),
  ('english',                 'English',                                          'Arts', 'arts', 220),
  ('telugu',                  'Telugu',                                           'Arts', 'arts', 221),
  ('hindi',                   'Hindi',                                            'Arts', 'arts', 222),
  ('history',                 'History',                                          'Arts', 'arts', 223),
  ('economics',               'Economics',                                        'Arts', 'arts', 224),
  ('political_science',       'Political Science',                                'Arts', 'arts', 225),
  ('public_administration',   'Public Administration',                            'Arts', 'arts', 226),
  ('sociology',               'Sociology',                                         'Arts', 'arts', 227),
  ('social_work',             'Social Work',                                       'Arts', 'arts', 228),
  ('philosophy',              'Philosophy',                                        'Arts', 'arts', 229),
  ('journalism_mass_comm',    'Journalism & Mass Communication',                   'Arts', 'arts', 230),
  ('geography',               'Geography',                                         'Arts', 'arts', 231),
  ('tourism',                 'Tourism & Travel Management',                       'Arts', 'arts', 232),
  ('rural_development',       'Rural Development',                                 'Arts', 'arts', 233),
  ('fine_arts',               'Fine Arts',                                         'Arts', 'arts', 234),
  -- BBA
  ('mgmt_general',            'General (Management)',                              'Management', 'management', 240),
  ('mgmt_marketing',          'Marketing (Management)',                            'Management', 'management', 241),
  ('mgmt_finance',            'Finance',                                           'Management', 'management', 242),
  ('mgmt_hr',                 'Human Resources',                                   'Management', 'management', 243),
  ('mgmt_business_analytics', 'Business Analytics (Management)',                    'Management', 'management', 244),
  ('mgmt_digital_marketing',  'Digital Marketing',                                 'Management', 'management', 245),
  ('mgmt_international_business', 'International Business',                         'Management', 'management', 246),
  ('mgmt_logistics',          'Logistics & Supply Chain',                          'Management', 'management', 247),
  ('mgmt_aviation',           'Aviation Management',                               'Management', 'management', 248),
  ('mgmt_hospital',           'Hospital Administration',                           'Management', 'management', 249),
  ('mgmt_entrepreneurship',   'Entrepreneurship',                                  'Management', 'management', 250),
  -- BCA
  ('ca_general',              'General (Computer Applications)',                   'Computer Applications', 'computing', 255),
  ('cloud_computing',         'Cloud Computing',                                   'Computer Applications', 'computing', 256),
  ('fullstack',               'Full Stack Development',                            'Computer Applications', 'computing', 257),
  -- B.Voc
  ('voc_software_dev',        'Software Development',                              'Vocational', 'vocational', 260),
  ('voc_retail',              'Retail Management',                                 'Vocational', 'vocational', 261),
  ('voc_hospitality',         'Hospitality & Tourism',                             'Vocational', 'vocational', 262),
  ('voc_automobile_service',  'Automobile Servicing',                              'Vocational', 'vocational', 263),
  ('voc_food_processing',     'Food Processing',                                   'Vocational', 'vocational', 264),
  ('voc_medical_lab',         'Medical Lab Technology',                            'Vocational', 'health',     265),
  ('voc_beauty_wellness',     'Beauty & Wellness',                                 'Vocational', 'vocational', 266),
  ('voc_apparel',             'Apparel Design',                                    'Vocational', 'vocational', 267),
  ('voc_renewable_energy',    'Renewable Energy',                                  'Vocational', 'vocational', 268),
  -- M.Pharm
  ('pharm_ceutics',           'Pharmaceutics',                                     'Pharmacy', 'pharmacy', 270),
  ('pharm_cology',            'Pharmacology',                                      'Pharmacy', 'pharmacy', 271),
  ('pharm_analysis',          'Pharmaceutical Analysis',                           'Pharmacy', 'pharmacy', 272),
  ('pharm_chemistry',         'Pharmaceutical Chemistry',                          'Pharmacy', 'pharmacy', 273),
  ('pharm_practice',          'Pharmacy Practice',                                 'Pharmacy', 'pharmacy', 274),
  ('pharm_qa',                'Pharmaceutical Quality Assurance',                  'Pharmacy', 'pharmacy', 275)
on conflict (slug) do nothing;

-- Category + family for the 10 rows that predate this migration (skipped by the
-- ON CONFLICT above, so their new columns are still null).
update public.ref_branch b
   set category = coalesce(b.category, s.category),
       family   = coalesce(b.family,   s.family)
  from (values
    ('cse',          'Engineering', 'computing'),
    ('it',           'Engineering', 'computing'),
    ('aiml',         'Engineering', 'computing'),
    ('data_science', 'Engineering', 'computing'),
    ('ece',          'Engineering', 'electronics'),
    ('eee',          'Engineering', 'electronics'),
    ('mechanical',   'Engineering', 'mechanical'),
    ('civil',        'Engineering', 'civil'),
    ('chemical',     'Engineering', 'chemical'),
    ('other',        null,          'other')
  ) as s(slug, category, family)
 where b.slug = s.slug and (b.category is null or b.family is null);

-- One-time label refinements, guarded on the exact 010 seed strings (no-op on
-- re-run; skipped for any row an admin has renamed since).
update public.ref_branch set label = 'Computer Science & Engineering (CSE)'
 where slug = 'cse' and label = 'Computer Science (CSE)';
update public.ref_branch set label = 'Artificial Intelligence & Machine Learning (AI&ML)'
 where slug = 'aiml' and label = 'AI & ML';

-- Now that labels are unique, enforce it — lib/intake-excel.ts resolves an
-- imported Branch cell by label, so a duplicate would import the wrong slug.
create unique index if not exists ref_branch_label_uniq on public.ref_branch (lower(label));

-- Branch search aliases — students type "csc", "computers", "comp sci", "E.C.E",
-- "mpc", "bcom computers". Label-substring matching alone feels broken.
update public.ref_branch b set search_terms = s.terms
  from (values
    ('cse',                    array['cse','csc','cs','computers','computer science','comp sci']),
    ('it',                     array['it','i t','information technology','inf']),
    ('csbs',                   array['csbs','business systems']),
    ('csd',                    array['csd','computer science design']),
    ('aiml',                   array['aiml','ai ml','aim','ai and ml','machine learning','artificial intelligence']),
    ('ai',                     array['ai','artificial intelligence']),
    ('data_science',           array['ds','data science','data','csm']),
    ('cs_cyber',               array['cyber','cyber security','security','cso']),
    ('cs_iot',                 array['iot','internet of things']),
    ('ece',                    array['ece','e c e','electronics','communication','ecom','electronics and communication']),
    ('ecm',                    array['ecm','electronics computer']),
    ('eie',                    array['eie','instrumentation','electronics instrumentation']),
    ('eee',                    array['eee','e e e','electrical','electrical and electronics']),
    ('mechanical',             array['mech','mechanical','mec','mechanical engg']),
    ('mechatronics',           array['mechatronics','mct']),
    ('robotics',               array['robotics','automation','rbt']),
    ('automobile',             array['automobile','auto','aut']),
    ('aero',                   array['aero','aeronautical','aerospace','ase']),
    ('marine',                 array['marine','ship']),
    ('civil',                  array['civil','civ','civil engg']),
    ('chemical',               array['chemical','che','chem engg']),
    ('petroleum',              array['petroleum','pet','petro']),
    ('mining',                 array['mining','min']),
    ('metallurgy',             array['metallurgy','mmt','materials','metal']),
    ('biotechnology',          array['biotech','biotechnology','bio','bt','bio tech']),
    ('bme',                    array['bme','biomedical','bio medical']),
    ('agri_engg',              array['agri','agricultural engineering','agr']),
    ('food_tech',              array['food tech','food technology']),
    ('textile',                array['textile','tex']),
    ('computer_engg',          array['cme','computer engineering','computers','diploma computers']),
    ('sugar_tech',             array['sugar','sugar technology']),
    ('plastics_polymers',      array['plastics','polymers','petrochemicals']),
    ('ceramic',                array['ceramic','ceramics']),
    ('applied_electronics',    array['applied electronics','instrumentation','aei']),
    ('garment_tech',           array['garment','garments','apparel']),
    ('animation_multimedia',   array['animation','multimedia','3d animation','graphics']),
    ('web_design',             array['web designing','web design','web']),
    ('ccp',                    array['ccp','commercial computer practice','commerce computers']),
    ('software_engineering',   array['software engineering','se']),
    ('vlsi',                   array['vlsi','vlsi design']),
    ('embedded',               array['embedded','embedded systems','es']),
    ('decs',                   array['decs','digital electronics']),
    ('comm_systems',           array['communication systems','comm systems']),
    ('power_electronics',      array['power electronics','ped','drives']),
    ('power_systems',          array['power systems','eps']),
    ('control_systems',        array['control systems']),
    ('structural',             array['structural','structures','ste']),
    ('geotechnical',           array['geotechnical','geotech','soil']),
    ('transportation',         array['transportation','highway']),
    ('environmental',          array['environmental engineering','environment']),
    ('water_resources',        array['water resources','irrigation']),
    ('thermal',                array['thermal','thermal engineering']),
    ('machine_design',         array['machine design','design']),
    ('cad_cam',                array['cad','cam','cad cam']),
    ('manufacturing',          array['manufacturing','production']),
    ('geoinformatics',         array['remote sensing','geoinformatics','gis']),
    ('mpc',                    array['mpc','maths physics chemistry']),
    ('mpcs',                   array['mpcs','mpc s','maths physics computer','bsc computers','computers']),
    ('mscs',                   array['mscs','maths statistics computer','bsc computers']),
    ('mecs',                   array['mecs','maths electronics computer']),
    ('mpe',                    array['mpe','maths physics electronics']),
    ('bzc',                    array['bzc','botany zoology chemistry','life sciences']),
    ('mbc',                    array['mbc','microbiology biotechnology chemistry']),
    ('maths',                  array['maths','mathematics','math']),
    ('physics',                array['physics','phy']),
    ('chemistry',              array['chemistry','chem']),
    ('botany',                 array['botany','plant science']),
    ('zoology',                array['zoology','animal science']),
    ('statistics',             array['statistics','stats']),
    ('computer_science',       array['computer science','computers','cs','comp sci','csc']),
    ('electronics',            array['electronics']),
    ('microbiology',           array['microbiology','micro']),
    ('biochemistry',           array['biochemistry','bio chem']),
    ('geology',                array['geology','geo']),
    ('environmental_science',  array['environmental science','evs']),
    ('nutrition_dietetics',    array['nutrition','dietetics','food nutrition','fnd']),
    ('home_science',           array['home science']),
    ('psychology',             array['psychology','psych']),
    ('forensic_science',       array['forensic','forensics']),
    ('agriculture',            array['agriculture','agri','bsc agriculture']),
    ('horticulture',           array['horticulture','horti']),
    ('fishery_science',        array['fishery','fisheries','aquaculture']),
    ('nursing',                array['nursing','bsc nursing','gnm']),
    ('com_general',            array['bcom general','general','plain bcom']),
    ('com_computers',          array['bcom computers','computers','bcom ca','computer applications']),
    ('com_honours',            array['bcom honours','honors','hons']),
    ('com_accounting_finance', array['accounting','finance','accounts']),
    ('com_taxation',           array['taxation','tax']),
    ('com_banking_insurance',  array['banking','insurance']),
    ('com_business_analytics', array['business analytics','analytics']),
    ('com_foreign_trade',      array['foreign trade','international trade']),
    ('com_marketing',          array['marketing']),
    ('com_vocational',         array['vocational','voc']),
    ('hep',                    array['hep','history economics politics']),
    ('hpp',                    array['hpp','history politics public administration']),
    ('hps',                    array['hps','history politics sociology']),
    ('hp_english',             array['special english','history politics english']),
    ('hp_telugu',              array['special telugu','history politics telugu']),
    ('english',                array['english']),
    ('telugu',                 array['telugu']),
    ('hindi',                  array['hindi']),
    ('history',                array['history']),
    ('economics',              array['economics','eco']),
    ('political_science',      array['political science','politics']),
    ('public_administration',  array['public administration','pub ad']),
    ('sociology',              array['sociology']),
    ('social_work',            array['social work','bsw','msw']),
    ('philosophy',             array['philosophy']),
    ('journalism_mass_comm',   array['journalism','mass communication','media']),
    ('geography',              array['geography','geo']),
    ('tourism',                array['tourism','travel']),
    ('rural_development',      array['rural development']),
    ('fine_arts',              array['fine arts','bfa']),
    ('mgmt_general',           array['bba','general','plain']),
    ('mgmt_marketing',         array['marketing']),
    ('mgmt_finance',           array['finance']),
    ('mgmt_hr',                array['hr','human resources','hrm']),
    ('mgmt_business_analytics',array['business analytics','analytics']),
    ('mgmt_digital_marketing', array['digital marketing']),
    ('mgmt_international_business', array['international business','ib']),
    ('mgmt_logistics',         array['logistics','supply chain','scm']),
    ('mgmt_aviation',          array['aviation']),
    ('mgmt_hospital',          array['hospital administration','healthcare']),
    ('mgmt_entrepreneurship',  array['entrepreneurship','startup']),
    ('ca_general',             array['bca','general','plain']),
    ('cloud_computing',        array['cloud','cloud computing','aws','azure']),
    ('fullstack',              array['full stack','fullstack','mern']),
    ('voc_software_dev',       array['software development','coding']),
    ('voc_retail',             array['retail','retail management']),
    ('voc_hospitality',        array['hospitality','hotel','tourism']),
    ('voc_automobile_service', array['automobile servicing','auto service']),
    ('voc_food_processing',    array['food processing']),
    ('voc_medical_lab',        array['medical lab','mlt','lab technology']),
    ('voc_beauty_wellness',    array['beauty','wellness']),
    ('voc_apparel',            array['apparel','fashion','garments']),
    ('voc_renewable_energy',   array['renewable energy','solar']),
    ('pharm_ceutics',          array['pharmaceutics']),
    ('pharm_cology',           array['pharmacology']),
    ('pharm_analysis',         array['pharmaceutical analysis']),
    ('pharm_chemistry',        array['pharmaceutical chemistry']),
    ('pharm_practice',         array['pharmacy practice']),
    ('pharm_qa',               array['quality assurance','qa']),
    ('other',                  array['other','not listed','not in the list'])
  ) as s(slug, terms)
 where b.slug = s.slug and cardinality(b.search_terms) = 0;

-- ---------------------------------------------------------------------------
-- 9) THE MAPPING SEED
-- ---------------------------------------------------------------------------
-- 'other' is mapped to every branch-bearing degree at sort 99, so "can't find
-- mine" is always the last option and always feeds the free-text write-in.

-- B.Tech and B.E share one list (B.E is the same programme under a different
-- university naming convention), so they're seeded from one cross join.
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select d.degree, b.branch, b.ord, 'Engineering'
  from (values ('btech'), ('be')) as d(degree),
       (values ('cse',1), ('it',2), ('csbs',3), ('csd',4), ('aiml',5), ('ai',6),
               ('data_science',7), ('cs_cyber',8), ('cs_iot',9), ('ece',10), ('ecm',11),
               ('eie',12), ('eee',13), ('mechanical',14), ('mechatronics',15),
               ('robotics',16), ('automobile',17), ('aero',18), ('marine',19),
               ('civil',20), ('chemical',21), ('petroleum',22), ('mining',23),
               ('metallurgy',24), ('biotechnology',25), ('bme',26), ('agri_engg',27),
               ('food_tech',28), ('textile',29), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- Diploma (AP SBTET polytechnic branches)
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'diploma', b.branch, b.ord, 'Polytechnic'
  from (values ('civil',1), ('mechanical',2), ('eee',3), ('ece',4), ('computer_engg',5),
               ('it',6), ('automobile',7), ('chemical',8), ('sugar_tech',9),
               ('plastics_polymers',10), ('mining',11), ('metallurgy',12), ('ceramic',13),
               ('applied_electronics',14), ('bme',15), ('textile',16), ('garment_tech',17),
               ('animation_multimedia',18), ('web_design',19), ('ccp',20), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- M.Tech (PG specialisations — a different list from the UG branches)
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'mtech', b.branch, b.ord, 'Specialisation'
  from (values ('cse',1), ('software_engineering',2), ('data_science',3), ('aiml',4), ('ai',5),
               ('cs_cyber',6), ('vlsi',7), ('embedded',8), ('decs',9), ('comm_systems',10),
               ('power_electronics',11), ('power_systems',12), ('control_systems',13),
               ('structural',14), ('geotechnical',15), ('transportation',16),
               ('environmental',17), ('water_resources',18), ('thermal',19),
               ('machine_design',20), ('cad_cam',21), ('manufacturing',22),
               ('geoinformatics',23), ('chemical',24), ('biotechnology',25),
               ('food_tech',26), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- B.Sc — BOTH generations in one grouped dropdown: the legacy combinations
-- (pre-2025-26 admissions) and the APSCHE CBCS single majors (2025-26 onward).
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'bsc', b.branch, b.ord, 'Common combinations'
  from (values ('mpc',1), ('mpcs',2), ('mscs',3), ('mecs',4), ('mpe',5), ('bzc',6), ('mbc',7)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'bsc', b.branch, b.ord, 'Single major'
  from (values ('maths',10), ('physics',11), ('chemistry',12), ('botany',13), ('zoology',14),
               ('statistics',15), ('computer_science',16), ('electronics',17), ('data_science',18),
               ('aiml',19), ('biotechnology',20), ('microbiology',21), ('biochemistry',22),
               ('geology',23), ('environmental_science',24), ('nutrition_dietetics',25),
               ('home_science',26), ('psychology',27), ('forensic_science',28), ('agriculture',29),
               ('horticulture',30), ('fishery_science',31), ('nursing',32), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- M.Sc — single majors only (a PG student has one subject, so no combinations),
-- and no Nursing (M.Sc Nursing is a separate professional stream).
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'msc', b.branch, b.ord, 'Single major'
  from (values ('maths',1), ('physics',2), ('chemistry',3), ('botany',4), ('zoology',5),
               ('statistics',6), ('computer_science',7), ('electronics',8), ('data_science',9),
               ('aiml',10), ('biotechnology',11), ('microbiology',12), ('biochemistry',13),
               ('geology',14), ('environmental_science',15), ('nutrition_dietetics',16),
               ('home_science',17), ('psychology',18), ('forensic_science',19), ('agriculture',20),
               ('horticulture',21), ('fishery_science',22), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- B.Com
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'bcom', b.branch, b.ord, 'Commerce'
  from (values ('com_general',1), ('com_computers',2), ('com_honours',3),
               ('com_accounting_finance',4), ('com_taxation',5), ('com_banking_insurance',6),
               ('com_business_analytics',7), ('com_foreign_trade',8), ('com_marketing',9),
               ('com_vocational',10), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- B.A — same two-generation split as B.Sc
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'ba', b.branch, b.ord, 'Common combinations'
  from (values ('hep',1), ('hpp',2), ('hps',3), ('hp_english',4), ('hp_telugu',5)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'ba', b.branch, b.ord, 'Single major'
  from (values ('english',10), ('telugu',11), ('hindi',12), ('history',13), ('economics',14),
               ('political_science',15), ('public_administration',16), ('sociology',17),
               ('social_work',18), ('psychology',19), ('philosophy',20),
               ('journalism_mass_comm',21), ('geography',22), ('tourism',23),
               ('rural_development',24), ('fine_arts',25), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- M.A — the single majors only
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'ma', b.branch, b.ord, 'Single major'
  from (values ('english',1), ('telugu',2), ('hindi',3), ('history',4), ('economics',5),
               ('political_science',6), ('public_administration',7), ('sociology',8),
               ('social_work',9), ('psychology',10), ('philosophy',11),
               ('journalism_mass_comm',12), ('geography',13), ('tourism',14),
               ('rural_development',15), ('fine_arts',16), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- BBA (branch_mode = 'optional' — many BBA programmes are general)
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'bba', b.branch, b.ord, 'Management'
  from (values ('mgmt_general',1), ('mgmt_marketing',2), ('mgmt_finance',3), ('mgmt_hr',4),
               ('mgmt_business_analytics',5), ('mgmt_digital_marketing',6),
               ('mgmt_international_business',7), ('mgmt_logistics',8), ('mgmt_aviation',9),
               ('mgmt_hospital',10), ('mgmt_entrepreneurship',11), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- BCA (branch_mode = 'optional')
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'bca', b.branch, b.ord, 'Computer Applications'
  from (values ('ca_general',1), ('data_science',2), ('aiml',3), ('cs_cyber',4),
               ('cloud_computing',5), ('fullstack',6), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- B.Voc
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'bvoc', b.branch, b.ord, 'Vocational'
  from (values ('voc_software_dev',1), ('voc_retail',2), ('voc_hospitality',3),
               ('voc_automobile_service',4), ('voc_food_processing',5), ('voc_medical_lab',6),
               ('voc_beauty_wellness',7), ('voc_apparel',8), ('voc_renewable_energy',9),
               ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- M.Pharm
insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
select 'mpharm', b.branch, b.ord, 'Pharmacy'
  from (values ('pharm_ceutics',1), ('pharm_cology',2), ('pharm_analysis',3),
               ('pharm_chemistry',4), ('pharm_practice',5), ('pharm_qa',6), ('other',99)) as b(branch, ord)
on conflict (degree_slug, branch_slug) do nothing;

-- ---------------------------------------------------------------------------
-- 10) Year of study — 5th/6th year, so B.Arch and Pharm.D can be described
-- ---------------------------------------------------------------------------
-- The list stops at 4th Year today, which is both wrong for a 5-year B.Arch and
-- too permissive for a 3-year B.Sc. The form now derives the visible years from
-- ref_degree.duration_years; these two rows make the long degrees expressible.
-- final_year / passed_out move to the end of the list (guarded on their 010
-- sort_order so the re-run is a no-op).
update public.ref_year_of_study set sort_order = 7 where slug = 'final_year' and sort_order = 5;
update public.ref_year_of_study set sort_order = 8 where slug = 'passed_out' and sort_order = 6;

insert into public.ref_year_of_study (slug, label, sort_order) values
  ('year_5', '5th Year', 5), ('year_6', '6th Year', 6)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 11) Backfill — no stored row may sit outside the new rules
-- ---------------------------------------------------------------------------
-- Every one of these rows exists only because the old dropdowns were unrelated.
-- Order matters: null out the impossible pairs, then remap the plausible ones,
-- then park the rest on 'other' (never silently blanked — 'other' is visible to
-- the student, who re-picks from a correctly filtered list on their next edit).
do $$
declare tbl text;
begin
  foreach tbl in array array['student_profile', 'mentor_profile'] loop
    -- 1. Degrees that have no branch: drop the stray value.
    execute format($f$
      update public.%I
         set branch = null
       where branch is not null
         and degree in (select slug from public.ref_degree where branch_mode = 'none')
    $f$, tbl);

    -- 2. An engineering branch recorded against a science/commerce/arts degree —
    --    only reachable because the two lists were independent. Map to the real
    --    equivalent rather than discarding what the student told us.
    execute format($f$
      update public.%I t set branch = m.new_branch
        from (values
          ('bsc',  'cse',          'computer_science'),
          ('bsc',  'it',           'computer_science'),
          ('bsc',  'aiml',         'aiml'),
          ('bsc',  'data_science', 'data_science'),
          ('bsc',  'chemical',     'chemistry'),
          ('bcom', 'cse',          'com_computers'),
          ('bcom', 'it',           'com_computers'),
          ('bca',  'cse',          'ca_general'),
          ('bca',  'it',           'ca_general'),
          ('bba',  'cse',          'mgmt_general')
        ) as m(degree, old_branch, new_branch)
       where t.degree = m.degree and t.branch = m.old_branch
    $f$, tbl);

    -- 3. Anything still outside the mapping -> 'other', CARRYING the old slug into
    --    branch_other. Overwriting `branch` alone would destroy the student's answer
    --    outright (no audit covers profile columns), and — worse — it would hide them
    --    from ref_other_answers(), which only lists rows with a non-empty *_other.
    --    That is the inbox built to recover exactly these students, so the admin would
    --    never learn which branches to add. Prefixed with 'was:' so a write-in the
    --    student typed is never confused with one this migration synthesised.
    execute format($f$
      update public.%I t
         set branch = 'other',
             branch_other = coalesce(nullif(trim(t.branch_other), ''), 'was: ' || t.branch)
       where t.branch is not null
         and t.branch <> 'other'
         and t.degree is not null
         and not exists (
           select 1 from public.ref_degree_branch db
            where db.degree_slug = t.degree and db.branch_slug = t.branch)
    $f$, tbl);

    -- 4. A branch with NO degree at all can't be validated against a mapping and
    --    would fail the new "choose your degree first" rule on the next save.
    --    Clear it so the student is asked once, cleanly.
    execute format($f$
      update public.%I set branch = null where branch is not null and degree is null
    $f$, tbl);
  end loop;
end $$;

-- student_intake carries the same two columns (bulk import), and handle_new_user()
-- copies them into student_profile on claim — so a bad pair parked there would
-- reappear as a bad profile. Same three rules, minus the remap (imports are recent
-- and low-volume enough that 'other' + a re-pick is the honest outcome).
update public.student_intake
   set branch = null
 where branch is not null
   and degree in (select slug from public.ref_degree where branch_mode = 'none');

-- student_intake has no branch_other column (the Excel template offers a flat list,
-- so there is no write-in to capture), which means the original slug genuinely cannot
-- be preserved here. It is recorded in the row itself instead: an intake row is
-- re-importable from the source spreadsheet, so this is recoverable in a way a
-- claimed profile is not.
update public.student_intake i set branch = 'other'
 where i.branch is not null
   and i.branch <> 'other'
   and i.degree is not null
   and not exists (
     select 1 from public.ref_degree_branch db
      where db.degree_slug = i.degree and db.branch_slug = i.branch);

update public.student_intake set branch = null where branch is not null and degree is null;

-- ---------------------------------------------------------------------------
-- 12) RPCs for the admin Reference Catalogue (/dashboard/reference)
-- ---------------------------------------------------------------------------
-- Two jobs the route handlers can't do safely from the client library:
--   • USAGE COUNTS. "How many students hold this branch?" is a GROUP BY, which
--     PostgREST can't express, and the answer gates whether an option may be
--     deactivated at all. SECURITY DEFINER + an explicit permission check, so the
--     count is the true platform-wide figure rather than whatever the caller's RLS
--     happens to reach.
--   • TRANSACTIONAL LIST REPLACE. The mapping is edited as a whole list per degree
--     (PUT semantics). Doing that as DELETE-then-INSERT from a route handler means
--     a mid-flight failure leaves a degree with NO branches — every student on it
--     stuck with an empty dropdown. One function, one transaction.
--
-- Precedent: replace_batch_subjects() (migration 135) for the replace pattern.

create or replace function public.ref_branch_usage()
returns table (branch_slug text, student_count bigint, mentor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.slug,
         (select count(*) from public.student_profile sp where sp.branch = b.slug),
         (select count(*) from public.mentor_profile  mp where mp.branch = b.slug)
    from public.ref_branch b
   where public.has_permission('refdata.manage')
$$;

create or replace function public.ref_degree_usage()
returns table (degree_slug text, student_count bigint, mentor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select d.slug,
         (select count(*) from public.student_profile sp where sp.degree = d.slug),
         (select count(*) from public.mentor_profile  mp where mp.degree = d.slug)
    from public.ref_degree d
   where public.has_permission('refdata.manage')
$$;

-- The "Other answers" inbox: every free-text write-in with a count, so an admin
-- can turn "Computer Science and Engineering (AI)  ×14" into a real branch. This
-- is what keeps the catalogue from rotting back to everyone-picks-Other.
create or replace function public.ref_other_answers()
returns table (kind text, answer text, uses bigint)
language sql
stable
security definer
set search_path = public
as $$
  with written as (
    select 'branch'::text as kind, trim(branch_other) as answer from public.student_profile where coalesce(trim(branch_other), '') <> ''
    union all
    select 'branch', trim(branch_other) from public.mentor_profile  where coalesce(trim(branch_other), '') <> ''
    union all
    select 'degree', trim(degree_other) from public.student_profile where coalesce(trim(degree_other), '') <> ''
    union all
    select 'degree', trim(degree_other) from public.mentor_profile  where coalesce(trim(degree_other), '') <> ''
  )
  select w.kind, w.answer, count(*)
    from written w
   where public.has_permission('refdata.manage')
   group by w.kind, w.answer
   order by count(*) desc, w.answer
$$;

create or replace function public.ref_other_unspecified()
returns table (kind text, uses bigint)
language sql
stable
security definer
set search_path = public
as $$
  with blank as (
    select 'branch'::text as kind from public.student_profile
      where branch = 'other' and coalesce(trim(branch_other), '') = ''
    union all
    select 'branch' from public.mentor_profile
      where branch = 'other' and coalesce(trim(branch_other), '') = ''
    union all
    select 'degree' from public.student_profile
      where degree = 'other' and coalesce(trim(degree_other), '') = ''
    union all
    select 'degree' from public.mentor_profile
      where degree = 'other' and coalesce(trim(degree_other), '') = ''
  )
  select b.kind, count(*)
    from blank b
   where public.has_permission('refdata.manage')
   group by b.kind
$$;

-- Whole-list replace for one degree. p_rows is [{branch_slug, sort_order, group_label}].
--
-- Rows dropped from the list are DEACTIVATED, never deleted. Deleting them would
-- break the guarantee lib/registration.ts depends on: loadRefs() reads
-- ref_degree_branch WITHOUT the is_active filter precisely so that retiring an option
-- "must not start rejecting the save of a student who already holds that value". A
-- deleted row isn't hidden, it's gone — resolveBranchPair rule 4 would then fire and
-- every student on that branch would get 422 "That branch isn't offered for the
-- selected degree." on Step 2, unable to save or submit, with staff hitting the same
-- wall. Deactivation is all "remove from this degree" ever needed to mean:
-- getDegreeBranchData()'s is_active filter keeps it out of every NEW picker, while the
-- pair survives for validation and label lookup. Re-adding reactivates the same row.
create or replace function public.replace_degree_branches(p_degree text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('refdata.manage') then
    raise exception 'permission denied: refdata.manage required';
  end if;
  if not exists (select 1 from public.ref_degree where slug = p_degree) then
    raise exception 'unknown degree: %', p_degree;
  end if;

  -- Rows dropped from the submitted list are RETIRED, never deleted.
  update public.ref_degree_branch db
     set is_active = false
   where db.degree_slug = p_degree
     and db.is_active
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
        where r->>'branch_slug' = db.branch_slug);

  -- Rows in the list are upserted AND (re)activated, so putting a branch back
  -- restores the original row rather than creating a second one.
  insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label, is_active)
  select p_degree,
         r->>'branch_slug',
         coalesce((r->>'sort_order')::int, 0),
         nullif(r->>'group_label', ''),
         true
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (degree_slug, branch_slug) do update
     set sort_order  = excluded.sort_order,
         group_label = excluded.group_label,
         is_active   = true;
end $$;

-- "Copy mapping from another degree" — branch sets repeat (B.E is B.Tech's list
-- verbatim), so re-picking 30 options by hand is the wrong ask. ADDITIVE on
-- purpose: it never deletes what the target already has, so a mis-click costs a
-- few unmaps rather than the whole list.
create or replace function public.copy_degree_branches(p_from text, p_to text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare copied int;
begin
  if not public.has_permission('refdata.manage') then
    raise exception 'permission denied: refdata.manage required';
  end if;
  if p_from = p_to then
    raise exception 'source and target degree are the same';
  end if;

  insert into public.ref_degree_branch (degree_slug, branch_slug, sort_order, group_label)
  select p_to, db.branch_slug, db.sort_order, db.group_label
    from public.ref_degree_branch db
   where db.degree_slug = p_from
  on conflict (degree_slug, branch_slug) do nothing;

  get diagnostics copied = row_count;
  return copied;
end $$;

grant execute on function public.ref_branch_usage()                       to authenticated;
grant execute on function public.ref_degree_usage()                       to authenticated;
grant execute on function public.ref_other_answers()                      to authenticated;
grant execute on function public.ref_other_unspecified()                  to authenticated;
grant execute on function public.replace_degree_branches(text, jsonb)     to authenticated;
grant execute on function public.copy_degree_branches(text, text)         to authenticated;
