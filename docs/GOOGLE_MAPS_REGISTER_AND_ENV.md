# Register for Google Maps Platform & configure environment variables

This guide takes you from **zero → two working API keys**, then shows how to set them
in each environment: local `.env` and **Vercel**. For *why* the app uses a provider at
all and how the fallback works, see [`GEO_ADDRESS.md`](./GEO_ADDRESS.md).

The three variables you'll end up setting:

| Variable | What it is | Exposure |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Geocoding + Places (New). Used by our route handlers. | **server-only secret** |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API, for the pin-drop map. | **public by design** |
| `GEO_PROVIDER_MONTHLY_CAP` | *(optional)* our own call ceiling. Default `9500`. | server-only |

> ⚠️ **Two keys, not one — this is not optional.** A JavaScript map cannot work without
> a key the browser can read. If you reuse one key for both, you publish your geocoding
> key to every visitor, and anyone can spend your quota. Key 1 never leaves the server;
> key 2 is locked to the Maps JS API and to your domains.

**Until both keys are set, nothing breaks — but nothing resolves either.** The "Pin on map"
button doesn't render and the lookup endpoints report "not configured", so students type
their address by hand exactly as they did before #101. There is deliberately no local
copy of Indian geodata to fall back on: serving a wrong district from data nobody
maintains is worse than asking for four fields ([`GEO_ADDRESS.md`](./GEO_ADDRESS.md) §6).

---

## 1. Create a Google Cloud project

1. Sign in at <https://console.cloud.google.com>.
2. Top bar → project picker → **New Project**.
3. Name it something identifiable, e.g. `careerlaunchpad-maps` → **Create**.
4. Make sure that project is selected in the top bar before continuing. *Every*
   step below applies to the selected project — enabling an API on the wrong project
   is the single most common reason a correct-looking key returns `REQUEST_DENIED`.

## 2. Enable billing

**Billing → Link a billing account** (create one if you have none; it needs a card).

You need this **even though we expect to pay nothing**. Google requires a billing
account before Maps Platform will serve any request; the free allowance is applied
automatically once it exists. Without it every call fails.

See §8 for what we actually expect to spend and how the caps work.

## 3. Enable exactly three APIs

**APIs & Services → Library**, search for each and click **Enable**:

| API to enable | Used by | Our code |
|---|---|---|
| **Geocoding API** | PIN → district/state, and GPS → address | `lib/geo-provider.ts` |
| **Places API (New)** | "Search my place" typeahead | `lib/geo-provider.ts` |
| **Maps JavaScript API** | the draggable pin map | `components/registration/location-map.tsx` |

> ⚠️ **Pick the entry labelled "Places API (New)"**, not "Places API". Legacy Places
> [closed to new customers on 1 March 2025](https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-autocomplete),
> so on a new project it cannot be enabled at all. Our code calls the New endpoints
> (`places.googleapis.com/v1/places:autocomplete`) for exactly this reason. If you
> enable only the legacy one, search will fail with `REQUEST_DENIED`.

Do **not** enable anything else. Every extra enabled API is another SKU someone can
bill you for with a leaked key.

## 4. Already have a key called "Maps Platform API Key"? Start here

If you reached the console through the **Maps Platform onboarding** (rather than an
empty project), Google has already created a key for you. On the Credentials page it
looks like this:

```
Name                     Restrictions
Maps Platform API Key    HTTP referrers, 35 APIs
```

Two things follow, and they change the steps below:

1. **There is nothing to create for the browser key — you already have it.** It is
   already referrer-restricted, which is exactly what a browser key needs. Skip to
   §5 and just *narrow* it.
2. **This key cannot be your server key.** A key with HTTP-referrer restrictions is
   rejected by the web-service APIs with *"API keys with referer restrictions cannot
   be used with this API"* — Geocoding and Places see no `Referer` header from our
   server. You need a **second, separate** key (§6).

Also worth doing regardless: **"35 APIs" means that key can currently call every Maps
API on the project**, so if it leaks — and it is public, in the browser, by design —
the blast radius is every SKU. Narrowing it to one API in §5 is a real reduction, not
paperwork.

> ### Getting to the right page — two easy wrong turns
>
> **Wrong turn 1: the APIs & Services dashboard.** Clicking "APIs & Services" in the
> hamburger menu lands on **Enabled APIs & services** — traffic/error charts, and a
> single **"+ Enable APIs and services"** button at the top. There is **no
> "Create credentials" button on that page.** Keys live on a different page in the
> same section: click **Credentials** (key icon) in the left sidebar.
>
> ```
> APIs & Services
>   ├── Enabled APIs & services   ← charts. "+ Enable APIs and services". NOT keys.
>   ├── Library                   ← §3 enables the three APIs here
>   ├── Credentials               ← §5 and §6 happen HERE ("+ Create credentials")
>   ├── OAuth consent screen
>   └── Page usage agreements
> ```
>
> **Wrong turn 2: the Maps Platform credentials view.** Keys created by the Maps
> onboarding appear on two surfaces, which are not equally editable:
> - <https://console.cloud.google.com/apis/credentials> — the **general** Credentials
>   page. Full control, including *Application restrictions → None*. **Use this one.**
> - <https://console.cloud.google.com/google/maps-apis/credentials> — the Maps
>   Platform view. Friendlier, but geared to map/mobile keys, and is the usual reason
>   people cannot find the "None" option.
>
> If a step below doesn't match your screen, check both of the above before anything
> else.

## 5. Narrow the existing key → the browser key

**Where:** APIs & Services → **Credentials** (left sidebar), or go directly to
<https://console.cloud.google.com/apis/credentials>. You should see an **API Keys**
table with a `Maps Platform API Key` row. Click that row's name:

1. **Name** → rename to `browser-maps-js`, so the pair is self-describing.
2. **API restrictions** → *Restrict key* → clear the 35 and tick **only
   Maps JavaScript API** → **OK**.
3. **Application restrictions** → keep **Websites**, and make sure the list contains:

   ```
   http://localhost:3000/*
   https://*.vercel.app/*
   https://YOUR-PROD-DOMAIN/*
   ```

   The `*.vercel.app` entry covers preview deployments, whose subdomain changes on
   every push. Omit it and the map works in production but is broken in every preview.
4. **Save** → this value is `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

Use **Show key** on the list row to copy the value.

## 6. Create the second key → the server key

**Where:** the same **Credentials** page as §5 —
<https://console.cloud.google.com/apis/credentials>. If you navigated away (e.g. to
the Enabled APIs dashboard), go back: **the "+ Create credentials" button exists only
on the Credentials page.**

1. **+ Create credentials** (top of the page) **→ API key**. A dialog shows the new
   key; close it, then click the new row's name (it will be called "API key 2" or
   similar) to edit it.
2. **Name** → `server-geocoding`.
3. **API restrictions** → *Restrict key* → tick **only**:
   - Geocoding API
   - Places API (New)
4. **Application restrictions** → **None**.

   That looks wrong and isn't, and it is the whole reason this must be a different key
   from §5. Vercel's egress IPs are dynamic, so an IP allow-list would break the
   deployment at random, and a referrer restriction is what breaks server-side calls
   in the first place. The key is safe because it is only ever read by server code
   (`GOOGLE_MAPS_SERVER_KEY`, no `NEXT_PUBLIC_` prefix) and never sent to a browser.
   The API restriction in step 3 is what bounds the damage if it leaks.
5. **Save** → this value is `GOOGLE_MAPS_SERVER_KEY`.

You should now have exactly two keys:

```
browser-maps-js      HTTP referrers, 1 API     → NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
server-geocoding     None, 2 APIs              → GOOGLE_MAPS_SERVER_KEY
```

## 7. Cap the spend — do this before shipping

Our `GEO_PROVIDER_MONTHLY_CAP` counter (migration 163) stops calls *we* choose to
make. It cannot stop a request made with a leaked key. **A console quota is the only
control that actually prevents a bill**, so set both.

### Use the Maps Platform quota page

<https://console.cloud.google.com/google/maps-apis/quotas>

This one has an **API dropdown** at the top and a filter box, which makes it the
easiest surface for this job.

> Note the split with §4: for **keys** you must avoid the Maps Platform console
> (it hides *Application restrictions → None*). For **quotas** it is the better page.
> The two pieces of advice are not in conflict.

Pick the API from the dropdown, then type **`per day`** into the filter box to cut the
list down.

### Which row to cap — this is the confusing part

A single API lists ~15 quota rows because it exposes **several API versions and
several operations**, and only some correspond to calls we actually make. Geocoding,
for example, shows both `v3 …` rows and `v4 GeocodeAddress …` / `v4 GeocodeLocation …`
rows.

**Our code calls the v3 web service** (`maps.googleapis.com/maps/api/geocode/json`,
see `lib/geo-provider.ts`). The v4 rows belong to the newer Geocoding v4 API, which
this app never calls.

| Our code | Endpoint it calls | Quota row to cap | Suggested |
|---|---|---|---|
| `providerPincode`, `providerReverse` | `maps.googleapis.com/maps/api/geocode/json` | **`v3 requests per day`** | `300` |
| `providerAutocomplete` | `places.googleapis.com/v1/places:autocomplete` | the **Autocomplete … per day** row | `300` |
| `providerDetails` | `places.googleapis.com/v1/places/{id}` | the **Place Details … per day** row | `300` |
| the pin map | Maps JavaScript API | **`Map loads per day`** | `200` |

`300/day` ≈ 9,000/month, just under the 10,000 free allowance.

**Leave the `v4 …` rows alone** (or set them low — we make no v4 calls, so a non-zero
v4 bill would itself be a signal something is wrong). Ignore every `… per minute` row:
they exist to stop bursts, their defaults are already sane, and they are not what
governs a monthly bill.

If a name in the middle column doesn't match exactly — Google renames these — the rule
is: **cap the `per day` rows whose names match the operations in the table above, and
ignore the rest.**

### Setting the limit

1. Find the row, e.g. `v3 requests per day`, showing **Unlimited**.
2. Click the **⋮ three-dot menu at the right of that row → Edit quota**.
   *There is no pencil icon on the row.*
3. **Untick "Unlimited"**, enter the number, **Submit**.

Changes can take a few minutes to show.

> **If a `per day` row genuinely doesn't exist** for some SKU: daily *billable* limits
> only appear on billable APIs with billing active. Cap the per-minute row instead
> (e.g. `60/min`) — that bounds a runaway loop, which is the realistic failure — and
> lean on `GEO_PROVIDER_MONTHLY_CAP` plus the budget alert below.

### Also set a budget alert

**Billing → Budgets & alerts → Create budget**, scoped to this project, amount ₹100,
alerts at 50 / 90 / 100%.

> A budget **emails you, it does not stop spending.** Budget = smoke alarm,
> quota = fire door. That is why this section asks for both.

Exceeding a quota is safe by design here: the API returns `OVER_QUERY_LIMIT`, our route
handler treats it like any other provider failure, and the endpoint tells the student to
type their address instead. Registration is never blocked.

## 8. What this actually costs

Geocoding and Maps JS are **Essentials** SKUs with **10,000 free calls per SKU per
month** ([Google](https://mapsplatform.google.com/resources/blog/start-building-today-with-up-to-10-000-monthly-free-calls-per-product/)).
Past that, Geocoding is about **$5 per 1,000**.

A student registering uses roughly:

| Action | Calls |
|---|---|
| typing a PIN code | 1 Geocoding |
| "Use my current location" | 1 Geocoding (reverse) |
| "Search my place" | 1 Autocomplete session + 1 Place Details |
| opening the map | 1 Maps JS load |

So **~2–4 calls per student**, and only for students who use the shortcuts. At 2,000
registrations/month that is well inside the free tier — **the realistic bill is ₹0**.
Three things keep it that way:

1. **The 30-day response cache** (`geo_provider_cache`) — repeat lookups of the same
   PIN cost nothing. Students cluster by college, so the hit rate is high.
2. **Our monthly counter** — refuses to exceed `GEO_PROVIDER_MONTHLY_CAP` (default
   9,500) and silently falls back to the local catalogue instead of failing.
3. **The console quotas from §7** — the hard stop.

> The 30-day cache TTL is a **licence term, not a tuning knob**. Google's Service
> Specific Terms allow geocoded latitude/longitude to be cached for at most 30
> consecutive days. Don't raise it to "save quota".

---

## 9. Local development — `.env`

```bash
# .env  (gitignored — never commit real values)

# Server-only. Note the absence of NEXT_PUBLIC_ — that is what keeps it off the client.
GOOGLE_MAPS_SERVER_KEY=AIza...server-key...

# Public by design: the browser needs to read it to load the map.
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=AIza...browser-key...

# Optional. Our own ceiling, per SKU per month. Default 9500.
GEO_PROVIDER_MONTHLY_CAP=9500
```

Restart `npm run dev` afterwards — Next.js reads env vars at boot, and a
`NEXT_PUBLIC_*` value is inlined at **build** time, so a running dev server will not
pick up the browser key on its own.

**`SUPABASE_SECRET_KEY` must also be set** — the response cache and the monthly spend
counter live in `service_role`-only tables reached with the admin client. Without it
lookups still work, but every one costs a fresh call and the app-level cap is not
enforced (a warning is logged once at startup). It is **not** set in Vercel today; note
that user impersonation needs the same key, so it is worth adding for both reasons.

## 10. Vercel (deployed app)

**Project → Settings → Environment Variables**, or via CLI:

```bash
vercel env add GOOGLE_MAPS_SERVER_KEY production
vercel env add NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY production
# repeat with `preview` so preview deployments work too
```

Then **redeploy**. `NEXT_PUBLIC_*` variables are baked into the client bundle at build
time, so adding one to an existing deployment changes nothing until you rebuild.

---

## 11. Verify

**a) The server key, before touching the app.** Should print `Bengaluru Urban`:

```bash
source .env
curl -s "https://maps.googleapis.com/maps/api/geocode/json?components=postal_code:560087|country:IN&key=$GOOGLE_MAPS_SERVER_KEY" \
  | grep -o '"long_name" : "[^"]*"'
```

**b) Places (New)** — the endpoint whose legacy twin you cannot enable. Should return
suggestions for a spelling India Post doesn't use:

```bash
curl -s -X POST "https://places.googleapis.com/v1/places:autocomplete" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $GOOGLE_MAPS_SERVER_KEY" \
  -d '{"input":"Varthur","includedRegionCodes":["in"]}' | head -c 400
```

**c) In the app** — `/student/register`, Step 1:

| Check | Expected |
|---|---|
| Type `560087` | fills **Bengaluru Urban, Karnataka** |
| Search `Varthur` | returns suggestions |
| "Pin on map" button | visible; opens a Google map, which asks for your location |
| Drop a pin → **Use this location** | Address, PIN, Village, District and State all replace together |
| Response `source` field | `"provider"` |

The last two are the real proof. Check the Network tab: `{"source":"provider"}` means
Google answered, while `"not_configured"` means the server key isn't reaching the server.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No **"+ Create credentials"** button anywhere on screen | you are on *Enabled APIs & services*, not *Credentials* | click **Credentials** in the left sidebar (§4 note) |
| Editing a key offers no *Application restrictions → **None*** option | you are on the Maps Platform credentials view | use <https://console.cloud.google.com/apis/credentials> (§4 note) |
| No edit control on a quota row | quotas are edited from the **⋮ menu → Edit quota**, then untick "Unlimited" — there is no pencil icon | §7 |
| Quota page shows only per-minute rows, no per-day | that SKU exposes no daily quota (or billing isn't active yet) | cap per-minute instead; see the note in §7 |
| ~15 quota rows for one API, unclear which to cap | the API exposes several versions/operations; we call only some | cap `v3 requests per day` for Geocoding — we make **no** v4 calls. Table in §7 |
| `REQUEST_DENIED`, message "API project is not authorized" | API not enabled on the **selected** project | §3, and confirm the project in the top bar |
| `REQUEST_DENIED` on search only | legacy "Places API" enabled instead of **Places API (New)** | §3 |
| `"error": "API keys with referer restrictions cannot be used with this API"` | the **browser** key was put in `GOOGLE_MAPS_SERVER_KEY` | swap them; the server key must have Application restrictions = None (§6) |
| Map area blank, console `RefererNotAllowedMapError` | current origin not in the referrer list | §5 — add the exact origin, including port |
| Map area blank, console `ApiNotActivatedMapError` | Maps JavaScript API not enabled | §3 |
| `ApiTargetBlockedMapError` | browser key's API restriction excludes Maps JS | §5 step 2 |
| Everything works locally, map broken on a preview URL | `https://*.vercel.app/*` missing from referrers | §5 |
| `OVER_QUERY_LIMIT` | daily console quota reached | expected and safe — it falls back to the catalogue. Raise the quota if it's legitimate traffic |
| `500` from `/api/geo/*`, "SUPABASE_SECRET_KEY is not set" in the logs | fixed — but the log warning means the cache and spend counter are disabled | set `SUPABASE_SECRET_KEY` in Vercel (preview **and** prod). Lookups still work without it; they just cost a call every time |
| Endpoint returns `"not_configured"` | server key missing or not loaded | check `.env`, then restart (env is read at boot) |
| Endpoint returns `"unavailable"` / `404` with a valid key | our monthly cap reached, or the provider errored | inspect `geo_provider_usage`; raise `GEO_PROVIDER_MONTHLY_CAP` if the traffic is legitimate |
| `ZERO_RESULTS` for a valid PIN | Google genuinely has no postal-code polygon for it | falls back to the catalogue automatically |

Useful query — what have we actually spent this month?

```sql
select kind, calls from public.geo_provider_usage
where month = date_trunc('month', now())::date;
```

## 13. Rotating a key

Keys are long-lived and have no expiry, so rotate on staff changes or suspected leaks:

1. Create the replacement key **first**, with the same restrictions (§5/§6).
2. Update `.env` and Vercel, and redeploy.
3. Confirm §11 passes on the new key.
4. **Then** delete the old key in Credentials.

Deleting first causes an outage — though a graceful one here: the app would fall back
to the local catalogue rather than erroring.
