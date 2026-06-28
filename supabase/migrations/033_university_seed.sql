-- ============================================================================
-- 033_university_seed.sql
-- Seed the AFFILIATING UNIVERSITIES used by AP degree admissions (OAMDC / APSCHE)
-- as self-associated college rows (see 032_college_university.sql: a university
-- IS a college whose university_id points at itself).
--
-- These are the 10 state universities OAMDC affiliates degree colleges to. The
-- per-college degree seed (a later 034_degree_college_seed_*.sql, generated from
-- the OAMDC institute export) links each college's university_id to one of these
-- rows by name — so they must exist first.
--
-- Idempotent: the INSERT skips rows already present (ON CONFLICT on the
-- (name, place, pincode) identity), and the UPDATE only self-associates rows not
-- already self-associated, so re-running is harmless. If a university already
-- exists from the UGC seed (008_*) under the same name+place+pincode, this just
-- self-associates that existing row instead of duplicating it.
-- ============================================================================

insert into public.college (name, place, address, district, state, pincode, established_in, ownership_type) values
  ('Andhra University',                'Visakhapatnam',  'Andhra University, Visakhapatnam - 530003, Andhra Pradesh',                 'Visakhapatnam', 'Andhra Pradesh', '530003', 1926, 'GOVERNMENT'),
  ('Adikavi Nannaya University',       'Rajamahendravaram', 'Adikavi Nannaya University, Rajamahendravaram - 533296, Andhra Pradesh',  'East Godavari', 'Andhra Pradesh', '533296', 2006, 'GOVERNMENT'),
  ('Acharya Nagarjuna University',     'Guntur',         'Nagarjuna Nagar, Guntur - 522510, Andhra Pradesh',                          'Guntur',        'Andhra Pradesh', '522510', 1976, 'GOVERNMENT'),
  ('Krishna University',               'Machilipatnam',  'Krishna University, Machilipatnam - 521004, Andhra Pradesh',                'Krishna',       'Andhra Pradesh', '521004', 2008, 'GOVERNMENT'),
  ('Sri Venkateswara University',      'Tirupati',       'Sri Venkateswara University, Tirupati - 517502, Andhra Pradesh',            'Tirupati',      'Andhra Pradesh', '517502', 1954, 'GOVERNMENT'),
  ('Vikrama Simhapuri University',     'Nellore',        'Vikrama Simhapuri University, Nellore - 524324, Andhra Pradesh',            'SPSR Nellore',  'Andhra Pradesh', '524324', 2008, 'GOVERNMENT'),
  ('Yogi Vemana University',           'Kadapa',         'Yogi Vemana University, Kadapa - 516005, Andhra Pradesh',                   'YSR Kadapa',    'Andhra Pradesh', '516005', 2006, 'GOVERNMENT'),
  ('Rayalaseema University',           'Kurnool',        'Rayalaseema University, Kurnool - 518007, Andhra Pradesh',                  'Kurnool',       'Andhra Pradesh', '518007', 2008, 'GOVERNMENT'),
  ('Sri Krishnadevaraya University',   'Anantapur',      'Sri Krishnadevaraya University, Anantapur - 515003, Andhra Pradesh',        'Anantapur',     'Andhra Pradesh', '515003', 1981, 'GOVERNMENT'),
  ('Dr. B.R. Ambedkar University',     'Srikakulam',     'Etcherla, Srikakulam - 532410, Andhra Pradesh',                            'Srikakulam',    'Andhra Pradesh', '532410', 2008, 'GOVERNMENT')
on conflict (name, place, pincode) do nothing;

-- Self-associate: mark each as a university (university_id = its own id).
update public.college
set university_id = id
where status = 'active'
  and university_id is distinct from id
  and (name, place, pincode) in (
    ('Andhra University',              'Visakhapatnam',     '530003'),
    ('Adikavi Nannaya University',     'Rajamahendravaram', '533296'),
    ('Acharya Nagarjuna University',   'Guntur',            '522510'),
    ('Krishna University',             'Machilipatnam',     '521004'),
    ('Sri Venkateswara University',    'Tirupati',          '517502'),
    ('Vikrama Simhapuri University',   'Nellore',           '524324'),
    ('Yogi Vemana University',         'Kadapa',            '516005'),
    ('Rayalaseema University',         'Kurnool',           '518007'),
    ('Sri Krishnadevaraya University', 'Anantapur',         '515003'),
    ('Dr. B.R. Ambedkar University',   'Srikakulam',        '532410')
  );
