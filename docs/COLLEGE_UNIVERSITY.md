# Colleges ↔ Universities

How a college is linked to its affiliating university, and how to import the AP
degree-college list (OAMDC / APSCHE).

## Data model

A **university is itself a college row** — it admits students like any
institution. So rather than a separate table, `public.college` self-references:

| `university_id` | meaning |
|---|---|
| `NULL` | unknown / not set (the default — **optional**) |
| `= some other college id` | this college is **affiliated** to that university |
| `= its own id` | this row **is a university** (self-association) |

The set of universities is therefore `{ c | c.university_id = c.id }`, exposed as
the `public.university` view for the dropdown/filter API.

Migration: `032_college_university.sql` (column + index + view).

## API (`/api/colleges`)

- `GET /api/colleges?…&university=<id>` — list; each row embeds
  `university: { id, name }`. `university=<id>` filters to that university's
  colleges.
- `POST` / `PATCH /api/colleges/:id` — accept `university_id`, which may be:
  a university's uuid, `"self"` (the `SELF_UNIVERSITY` sentinel → the server
  self-associates the row), or `null`.
- `GET /api/colleges/universities?q=` — the university list for the dropdown.

The manage UI (`/dashboard/colleges`) has a **University** column, a university
filter, and in the add/edit form a "This institution is itself a university"
checkbox plus an "Affiliating university" dropdown.

## Seeding

1. **Universities** — `033_university_seed.sql` seeds the 10 AP state
   universities OAMDC affiliates to, self-associated. Run it once.
2. **Degree colleges** — generated from the OAMDC institute export:

   ```bash
   # Export the OAMDC institute report (login-gated) to CSV first, then:
   node scripts/generate-degree-college-seed.mjs path/to/oamdc.csv --start 34
   ```

   This emits `034_degree_college_seed_*.sql` (chunked). Each row is an **upsert**
   on `(name, place, pincode)`:
   - new colleges are inserted with `university_id` resolved by university name;
   - colleges already present (e.g. from the UGC `008_*` seed) get their
     `university_id` **back-filled only when still NULL** — existing data is never
     overwritten. This is how existing colleges gain a university.

   Recognised CSV columns (case-insensitive): `name`/`college name`, `place`,
   `address`, `district`, `state`, `pincode`, `established`/`year`,
   `ownership`/`type`, `university`. Unknown university spellings are left NULL and
   reported — add them to `UNIVERSITY_ALIASES` in the script. Rows without a
   pincode can't be de-duped by the DB (the unique key treats NULLs as distinct)
   and are counted in the run's warnings.
