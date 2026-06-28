-- ============================================================================
-- 034_degree_college_seed_01.sql  -  AP degree colleges (OAMDC / APSCHE)
-- Each degree college is inserted as a NEW row, carrying its OAMDC institute
-- code and linked to its affiliating university (seeded in 033) by name.
-- Untargeted ON CONFLICT DO NOTHING makes this re-runnable: a row that collides
-- on EITHER unique key — college_code OR (name, place, pincode) — is skipped, so
-- it never errors and never touches the existing UGC 008_* rows.
--
-- NOTE: this is the first batch, transcribed from the OAMDC institute report.
-- The remaining colleges are appended as 034_degree_college_seed_02.sql, _03 …
-- (one INSERT per college, same shape). university_id resolves via a subquery so
-- the link survives regardless of the university row's generated id.
-- ============================================================================

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10140', 'ADITYA DEGREE COLLEGE RAJAHMUNDRY', 'RAJAHMUNDRY(URBAN)', 'EAST GODAVARI', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Adikavi Nannaya University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10141', 'ADITYA DEGREE COLLEGE SRINAGAR ASILMETTA VISAKHAPATNAM', 'VISAKHAPATNAM(U)', 'VISAKHAPATNAM', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Andhra University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10142', 'ADITYA DEGREE COLLEGE KAKINADA', 'KAKINADA (URBAN)', 'KAKINADA', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Adikavi Nannaya University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10143', 'AADITYA DEGREE COLLEGE NELLORE', 'NELLORE', 'SRI POTTI SRIRAMULU NELLORE', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Vikrama Simhapuri University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10144', 'VEDA DEGREE COLLEGE TATIPAKA', 'RAZOLE', 'KONASEEMA', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Adikavi Nannaya University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10145', 'ADITYA DEGREE COLLEGE GOPALAPATNAM', 'VISAKHAPATNAM', 'VISAKHAPATNAM', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Andhra University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10146', 'A V N SCIENCE AND ARTS DEGREE COLLEGE S KOTA', 'SRUNGAVARAPUKOTA', 'VIZIANAGARAM', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Andhra University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10147', 'ADITYA DEGREE COLLEGE SRIKAKULAM', 'SRIKAKULAM', 'SRIKAKULAM', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Dr. B.R. Ambedkar University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10173', 'ADITYA DEGREE COLLEG FOR WOMEN RAJAHMUNDRY', 'RAJAHMUNDRY(URBAN)', 'EAST GODAVARI', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Adikavi Nannaya University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('10174', 'The adoni arts and science college adoni (degree)', 'ADONI', 'KURNOOL', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Rayalaseema University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('17614', 'SEETHARAMA DEGREE COLLEGE SEETHARAMAPURAM 134', 'SEETHARAMAPURAM', 'SRI POTTI SRIRAMULU NELLORE', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Vikrama Simhapuri University' and u.university_id = u.id limit 1))
on conflict do nothing;

insert into public.college (college_code, name, place, district, state, ownership_type, university_id) values
  ('19353', 'SRI VENKATA SEETHARAMA DEGREE COLLEGE PUSAPATIREGA', 'PUSAPATIREGA', 'VIZIANAGARAM', 'Andhra Pradesh', null,
   (select id from public.college u where u.name = 'Andhra University' and u.university_id = u.id limit 1))
on conflict do nothing;

-- 10033 — from the detail view (has address / pincode / year / ownership).
-- University not shown on the detail page; fill from the list's University Name.
insert into public.college (college_code, name, place, address, district, state, pincode, established_in, ownership_type, university_id) values
  ('10033', 'A.A.R. AND B.M.R. DEGREE COLLEGE NUNNA', 'VIJAYAWADA RURAL',
   'D.NO:4-166/A, NUNNA(P.O), VIJAYAWADA (RURAL), KRISHNA (Dt) - 521212', 'NTR', 'Andhra Pradesh', '521212', 2005, 'PRIVATE',
   null)
on conflict do nothing;
