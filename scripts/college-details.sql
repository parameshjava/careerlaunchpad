-- ============================================================================
-- college-details.sql — inspect the colleges + their university association.
-- Run any block in the Supabase SQL editor. Read-only (no data is changed).
-- Depends on 032_college_university.sql (the university_id column / view).
-- ============================================================================

-- 1) ALL college details, with the affiliating university resolved by name.
--    "University (self)" marks rows that ARE a university (university_id = id).
select
  c.id,
  c.name,
  c.place,
  c.district,
  c.state,
  c.pincode,
  c.established_in,
  c.ownership_type,
  c.status,
  case
    when c.university_id is null      then null
    when c.university_id = c.id       then 'University (self)'
    else u.name
  end                                  as university,
  c.created_at
from public.college c
left join public.college u on u.id = c.university_id
order by c.name;

-- ----------------------------------------------------------------------------
-- 2) Quick totals: how many colleges, how many universities, how many linked.
select
  count(*)                                                  as total_colleges,
  count(*) filter (where university_id = id)                as universities,
  count(*) filter (where university_id is not null
                     and university_id <> id)               as affiliated_colleges,
  count(*) filter (where university_id is null)             as unlinked_colleges,
  count(*) filter (where status = 'active')                 as active,
  count(*) filter (where status = 'archived')               as archived
from public.college;

-- ----------------------------------------------------------------------------
-- 3) Just the universities (the self-associated rows), via the 032 view.
select id, name, place, district, state, status
from public.university
order by name;

-- ----------------------------------------------------------------------------
-- 4) College count per university (universities with no affiliates show 0).
select
  u.name                                   as university,
  count(c.id) filter (where c.id <> u.id)  as affiliated_colleges
from public.university u
left join public.college c on c.university_id = u.id
group by u.id, u.name
order by affiliated_colleges desc, u.name;

-- ----------------------------------------------------------------------------
-- 5) Colleges still missing a university link (the ones an import would fill).
select id, name, place, district, state, pincode
from public.college
where university_id is null
order by state, district, name;
