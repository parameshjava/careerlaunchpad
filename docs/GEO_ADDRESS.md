# Student address — PIN code, geo-location & map pin (issue #101)

**Status:** BUILT (2026-08-05) · migration `163_student_address.sql` · **next free migration: `164_*`**
**Provider:** Google Maps Platform. Needs two API keys — see
[`GOOGLE_MAPS_REGISTER_AND_ENV.md`](./GOOGLE_MAPS_REGISTER_AND_ENV.md). Until they are set
the map button is hidden and lookups return "not configured"; the form still works by hand.

---

## 1. What was broken

Step 1 collected the student's home town as three bare free-text inputs, validated with
nothing but `trim() || null`:

- `components/students/registration-fields.tsx` — `city_village`, `district`, `state`
- `010_registration_reference.sql:238-240,272` — three `text` columns plus an index on
  `(state, district)` that only pays off if the values are consistent

So "Gunturu", "GUNTUR (Dist)", "guntur dt" and "Gntr" were four different districts to
`ref_mentor_preference.same_district` and to every `(state, district)` report — and a
student on a phone typed all three by hand. There was no `pincode` column at all.

## 2. What a student sees now

Four ways in, all resolved server-side by Google:

| Affordance | Endpoint |
|---|---|
| Type a **PIN code** (6 digits) | `GET /api/geo/pincode/:pin` |
| **📍 Use my current location** | browser Geolocation → `GET /api/geo/reverse` |
| **🔍 Search my place** | `GET /api/geo/search?q=` → `?place_id=` |
| **🗺 Pin on map** | Google Maps JS → `GET /api/geo/reverse` |

And two address fields, split along **known-vs-unknowable**:

- **Flat / Building / Street** (`flat_building`) — typed by the student. Never
  auto-filled, and never cleared by us: no geocoder returns a flat number, and someone
  nudging the pin onto the right rooftop still lives in flat 302.
- **Address** (`address`) — the geocoder's `formatted_address`, stored **verbatim** apart
  from one strip (§5). Auto-filled on every declared location, so it always describes the
  current pin.

Plus structured `pincode`, `city_village`, `district`, `state`, and `latitude`/`longitude`
when the student drops a pin.

### Rules that are load-bearing

- **A declared location replaces the whole address.** Dropping a pin, using GPS or
  picking from search overwrites `address`, `city_village`, `pincode`, `district` and
  `state` — including overwriting with blank. A value left over from a previous location
  is worse than an empty one, because it is wrong in a way nobody can see. (A real bug: a
  student who pinned Bengaluru kept "Kadapa" as their village.)
  **Typing a PIN does none of this** — a PIN says nothing about which building you are in,
  so it only fills what is blank.
- **Prefill and ask.** Not because the geocoder is unsure where the point is, but because
  it cannot know whether that point is the student's **home**. A phone in a hostel or a
  coaching centre is not, and `city_village`/`district` are read as *home* by mentor
  matching and catchment analytics.
- **Accuracy gate.** `accuracy > 5000 m` is a wifi/IP-derived fix that can be a city out;
  it is refused, not prefilled. It does not apply to a map pin, which the student placed
  deliberately.
- **Permission denied is terminal.** iOS Safari offers no programmatic re-prompt, so the
  button hides and the PIN path takes over. The PIN path is equally prominent, not a
  fallback — students arrive from WhatsApp and Instagram webviews where geolocation is
  often blocked.
- **The map defaults to the street view**, with Satellite one tap away for layouts with
  no named roads. Street View and tilt/rotate are off; fullscreen is on, because placing
  a pin in a 256 px-tall map is fiddly. Opened with no known position it asks the device
  where you are, rather than showing the whole country.
- **A district mismatch is a warning, never a block.** Andhra Pradesh went from 13 to 26
  districts in 2022, so the geocoder and a student's lived answer legitimately differ.

## 3. Cost and safety

Geocoding and Maps JS are **Essentials** SKUs with **10,000 free calls per SKU per month**.
A student uses ~2–4 calls, and only if they use the shortcuts, so the realistic bill is
**₹0**. Three things keep it there:

1. **`geo_provider_cache`** — 30-day response cache, so a repeat PIN costs nothing.
   Students cluster by college, so the hit rate is high.
2. **`geo_provider_usage` + `geo_provider_take()`** — an atomic monthly counter
   (`GEO_PROVIDER_MONTHLY_CAP`, default 9,500). Past it the endpoint declines rather than
   spends. Atomic because on serverless every concurrent lambda would otherwise read the
   same count and each conclude it had room.
3. **Console quotas** — the only control that can actually stop billing; our counter
   cannot stop a request made with a leaked key. See the setup doc §7.

Both tables are `service_role`-only (RLS on with **zero policies**, granted to
`service_role` alone) and reached with the admin client. Granting `authenticated` would let
any signed-in student read our provider responses and — worse — forge the counter to unlock
unlimited billable calls.

### Two licence terms that shaped the code

1. **Geocoded lat/lng may be cached at most 30 consecutive days.** `expires_at` is that
   obligation, not a tunable, and `geo_provider_sweep()` runs opportunistically from the
   route handlers so compliance does not depend on a cron job nobody configured.
2. **Geocoding content must not be shown alongside a non-Google map.** That is why the
   pin-drop map is Google Maps. These are one decision, not two: an OSM basemap would
   force a non-Google geocoder.

`student_profile.latitude/longitude` is unaffected by the caching rule — that is a pin the
**student** placed, i.e. their own data. Coordinates Google returns are never persisted.

> **After changing resolution logic, clear the cache.** With a 30-day TTL you will
> otherwise be testing yesterday's answer:
> `delete from geo_provider_cache where kind = 'reverse';`

## 4. India's admin levels are not the documented European shape

Measured against the live API, not assumed — the first implementation preferred `level_2`
and gave a Bengaluru student a district of "Bangalore Division":

| | Andhra Pradesh (Tenali) | Karnataka (Varthur) |
|---|---|---|
`administrative_area_level_1` | Andhra Pradesh | Karnataka |
`administrative_area_level_2` | *absent* | "Bangalore Division" — a **group of districts** |
`administrative_area_level_3` | **Guntur** ✓ | **Bengaluru Urban** ✓ |

So **`level_3` is the district**, and `level_2` is either a division or missing. We prefer
`level_3`, and distrust any `level_2` matching `/\bdivision\b/` — using one would put every
Bengaluru student in the same "district" and silently break the district-keyed matching
this data feeds.

Two more things measured rather than assumed:

- **A PIN lookup takes two calls, and the second is the point.** A
  `components=postal_code:X` geocode is nearly useless alone (`522201` returns *no district
  at all*; `560087` only the division) but it does return a `geometry.location`, and a
  reverse lookup there returns full detail. Chained: `522201 → Guntur`,
  `560087 → Bengaluru Urban`, `583286 → Koppal`. Both legs cache under the PIN's key, so
  the second call is paid once per PIN per month.
- **No `result_type` filter on the reverse call.** Filtering to
  `postal_code|locality|sublocality|…` excluded `street_address` and `premise` — exactly
  the results carrying house numbers and landmarks. At the same coordinates the filter
  turned *"124/4, beside Vagdevi Vilas School, Bengaluru"* into *"Bengaluru"*. It was
  there to keep out one anomalous foreign result (a Bengaluru point returned a **Mumbai**
  street address among its results — Google's data, not our bug); that is now handled far
  more precisely by dropping results whose state disagrees with `results[0]`.

## 5. The one thing we strip from the address

**Google Plus Codes** — `WPQR+WHQ`, `464C+22` — an encoded coordinate Google substitutes
when it has no street name. It means nothing to a student or a courier and it was landing
at the head of the Address field.

It comes in two shapes, and a per-comma-segment match only catches the first:

```
"WPQR+WHQ, Varthur, Devasthanagalu, Bengaluru, …"   → its own segment
"464C+22 Kukkapallevaripalem, Andhra Pradesh, …"    → SPACE-separated, same segment
```

The second is the common one in villages — precisely where Google lacks street names — so
missing it would leave the junk for exactly the students most affected. The matcher uses
the real Open Location Code alphabet (`23456789CFGHJMPQRVWX`) and requires the literal
`+`, so it cannot eat a legitimate name (`C+H Colony` survives; `124/4, beside Vagdevi
Vilas School` survives).

**Nothing else is stripped.** The `, Karnataka 560087, India` tail stays even though state
and PIN have their own columns: the point of a separate `flat_building` field is that a
student never has to *edit* an address that is already correct, and an address we have
rewritten is one they feel obliged to check.

## 6. What we tried first, and why it lost

The story required zero cost, so the first cut answered everything from a local
`ref_pincode` catalogue seeded from the **All India Pincode Directory** — 19,586 rows,
3.2 MB of generated SQL, with a nearest-centroid reverse geocoder in Postgres. It worked.
It is retired, and the reasons are worth keeping because they are the argument against
rebuilding it:

- **The data is wrong in ways you cannot patch.** India Post spells Varthur "Vartur", so
  searching the name students actually type returned nothing. 9.5% of its coordinates are
  garbage — the raw p99 spread between a PIN's centre and its own farthest office was
  1,086 km. 390 PINs had to have coordinates discarded for sitting >150 km from their own
  district; one, `583286` (Koppal), was plotted in Bengaluru and offered to a Bengaluru
  student as their nearest match.
- **A PIN is a polygon and we held one point.** A student in Varthur resolved to
  Bellandur, because 560087's centroid is dragged 9.6 km off by one mislocated office and
  a neighbouring PIN with one accurate point won.
- **It did not converge.** Measured ceiling 91% district / 65% exact PIN. Switching to
  per-office points fixed the reported Varthur case and dropped overall PIN accuracy to
  **56%** — every fix traded against another case.
- **Districts keep being redrawn.** AP went 13 → 26 in 2022, so even a perfect snapshot
  decays.

Also retired with it: a self-hosted 2.6 GB Protomaps/OSM basemap (a licence violation once
geocoding moved to Google — §3) and a three-way address split (house / street / village),
which failed because it required deciding which geocoder component was a "street" versus an
"area" — a judgement about geodata that could not be made reliably. The split that survives
is known-vs-unknowable, which needs no such judgement.

All of that lived in migrations 163–171 during development. They were applied to **preview
only**, have been removed from its `schema_migrations`, and are consolidated into a single
`163_student_address.sql`. **Prod never saw them; do not resurrect them.**

## 7. Deliberately out of scope

Backfilling the existing free-text districts (a separate data-cleanup story) · mentor-side
address (the mentor form has no address fields at all, which is why `same_district`
matching cannot resolve today) · address autofill for the marketing/contact forms · storing
a Google-derived coordinate anywhere.
