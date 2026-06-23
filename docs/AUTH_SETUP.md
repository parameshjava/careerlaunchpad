# Authentication & social sign-in setup

CareerLaunchpad is **invite-only with social login** (no passwords):

1. The **Owner** adds a user via the console (`/dashboard/users`) → a row in `public.invite`.
2. The user signs in with **Google / GitHub / LinkedIn / Facebook**.
3. On their first sign-in, the `handle_new_user()` trigger
   (`supabase/migrations/005_handle_new_user.sql`) finds a **pending invite whose
   email matches the verified provider email** and provisions their account
   (`app_user` + `user_role`, plus a student stub). No matching invite → no
   account → they land on `/auth/no-access`.

> **The invited email must equal the email on the social account.** That match is
> the security boundary for the social flow. Invite `person@gmail.com` → they must
> sign in with the Google/GitHub/etc. account that owns `person@gmail.com`.

## Roles
`owner`, `student`, `college_admin`, `employer`, and `support` (Support Team —
added in `009_support_rbac.sql`: view users, suspend/reactivate, resend invites).
Roles & permissions are data — add more with INSERTs, no code change.

Post-login landing (see `lib/auth.ts`): owner / college_admin / support → `/dashboard`;
student → `/student`; employer → `/employer`.

---

## Our two environments — exact values

Everything below is filled in from `.env`. There are **two Supabase projects**; do
each step in **both** (or just the one you're configuring).

| | Preview | Production |
|---|---|---|
| **Project ref** | `etzfcktxzfttgcqbjgyu` | `zwvcsvbjmmbnoroasgim` |
| **Supabase URL** | `https://etzfcktxzfttgcqbjgyu.supabase.co` | `https://zwvcsvbjmmbnoroasgim.supabase.co` |
| **Publishable key** | `sb_publishable_PJA69Byy77-2OD-AmNxD7A_h8iY-HU_` | `sb_publishable_8JyKoHF-vkMJaS0X3GoMaQ_pCol82xu` |
| **App domain** | `https://preview.careerlaunchpad.ai` | `https://careerlaunchpad.ai` |
| **Provider callback** (register at each provider) | `https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback` | `https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback` |

Supabase dashboard deep-links (sign in first):

| | Preview | Production |
|---|---|---|
| **URL Configuration** | https://supabase.com/dashboard/project/etzfcktxzfttgcqbjgyu/auth/url-configuration | https://supabase.com/dashboard/project/zwvcsvbjmmbnoroasgim/auth/url-configuration |
| **Providers** | https://supabase.com/dashboard/project/etzfcktxzfttgcqbjgyu/auth/providers | https://supabase.com/dashboard/project/zwvcsvbjmmbnoroasgim/auth/providers |

---

## 1. Supabase project config (once per project)

Open **URL Configuration** for the project (links above).

**Preview** — `https://supabase.com/dashboard/project/etzfcktxzfttgcqbjgyu/auth/url-configuration`:
- **Site URL:**
  ```
  https://preview.careerlaunchpad.ai
  ```
  (For local dev, paste `http://localhost:3000` instead.)
- **Redirect URLs** — click *Add URL* and paste each of these:
  ```
  http://localhost:3000/**
  https://preview.careerlaunchpad.ai/**
  ```

> `preview.careerlaunchpad.ai` is a **subdomain of the domain you already own** — no
> new domain to buy. See [§Reusing the same domain for preview](#reusing-the-same-domain-for-preview-vercel) below for the one-time Vercel + DNS wiring.

**Production** — `https://supabase.com/dashboard/project/zwvcsvbjmmbnoroasgim/auth/url-configuration`:
- **Site URL:**
  ```
  https://careerlaunchpad.ai
  ```
- **Redirect URLs** — click *Add URL* and paste:
  ```
  https://careerlaunchpad.ai/**
  https://www.careerlaunchpad.ai/**
  ```

This app always sends the browser to `…/auth/callback` (see
`app/auth/login/page.tsx` → `redirectTo: ${window.location.origin}/auth/callback`),
so the `/**` wildcard above is what allows it back.

## 2. Register & enable each provider

For each provider you create an OAuth app, register the **Supabase** callback URL at
the provider, then paste the client id/secret into **Supabase → Authentication →
Providers**. The callback to register at every provider:

| Environment | Register this redirect URL at the provider |
|---|---|
| Preview | `https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback` |
| Production | `https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback` |

> The provider only ever needs the **Supabase** callback above — never `localhost`
> or this app's `/auth/callback`. This app's URLs go in the redirect allow-list (§1).
> Two Supabase projects = register **both** callback URLs in each provider app (or
> keep one provider app per environment).

For full click-by-click detail (consent screens, scopes, where each field lives, and
a troubleshooting table) see **[`OAUTH_PROVIDERS.md`](./OAUTH_PROVIDERS.md)**.

### Google
1. Google Cloud Console → **APIs & Services → OAuth consent screen** (External; add
   `email`, `profile`, `openid` scopes; add test users while unpublished).
2. **Credentials → Create Credentials → OAuth client ID → Web application**.
3. **Authorized JavaScript origins** — add:
   ```
   https://careerlaunchpad.ai
   http://localhost:3000
   ```
4. **Authorized redirect URIs** — add both Supabase callbacks:
   ```
   https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback
   https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback
   ```
5. Copy **Client ID + Secret** → Supabase → Auth → Providers → **Google** (toggle on,
   paste, Save) — in **both** projects (links in §0).

### GitHub
1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Homepage URL:**
   ```
   https://careerlaunchpad.ai
   ```
3. **Authorization callback URL** (GitHub allows one per app — make a second app for
   the other env, or use the prod one):
   ```
   https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback
   ```
   (Preview app callback: `https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback`)
4. **Generate a new client secret**, copy **Client ID + Secret** → Supabase → **GitHub**.
5. Email scope (`user:email`) is requested by default — needed because the invite
   matches on email; a fully-private GitHub email yields no address.

### LinkedIn  — provider id `linkedin_oidc`
1. LinkedIn → **Developer Portal → Create app** (requires an associated Company Page).
2. **Products** → request **"Sign In with LinkedIn using OpenID Connect"**.
3. **Auth** tab → under **Authorized redirect URLs for your app** add both:
   ```
   https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback
   https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback
   ```
   Scopes: `openid profile email`.
4. Copy **Client ID + Secret** → Supabase → **LinkedIn (OIDC)** (not legacy LinkedIn).
   The app already calls the `linkedin_oidc` provider in `app/auth/login/page.tsx`.

### Facebook  (Meta)
1. Meta for Developers → **Create App** → add the **Facebook Login** product (Web).
2. **Facebook Login → Settings → Valid OAuth Redirect URIs** — add both:
   ```
   https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback
   https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback
   ```
3. **Settings → Basic → App domains:**
   ```
   careerlaunchpad.ai
   ```
   then copy **App ID + App Secret** → Supabase → **Facebook**.
4. In Development mode only **Testers/Admins** (App Roles) can sign in; for the public,
   set the app **Live** and complete **App Review** for `email` + `public_profile`
   (Business verification). Email is required for the invite match.

## 3. App environment

The Supabase client (`lib/supabase/{client,server,middleware}.ts`) reads **exactly
these two variable names** — they must match character-for-character:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

> ⚠️ **`NEXT_PUBLIC_*` vars are baked into the bundle at BUILD time, not read at
> runtime.** Two consequences that cause the
> *"@supabase/ssr: Your project's URL and API key are required…"* error:
> 1. **Locally:** after editing `.env` / `.env.local` you must **restart**
>    `npm run dev` (it only reads env at startup). A running server won't pick up
>    new vars.
> 2. **On Vercel:** `.env` is git-ignored and **never** reaches Vercel. You must set
>    the vars in **Project → Settings → Environment Variables**, then **redeploy** —
>    existing deployments were built without them and stay broken until rebuilt.
>    (A minified stack trace like `613-….js` means you're on a built/deployed bundle,
>    so this is the Vercel path.)

### Local (`.env.local`, gitignored — preferred over `.env`)
```
NEXT_PUBLIC_SUPABASE_URL=https://etzfcktxzfttgcqbjgyu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_PJA69Byy77-2OD-AmNxD7A_h8iY-HU_
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
Then **stop and restart** `npm run dev`. Verify it loaded:
```bash
# in the running app, open the browser console on /auth/login:
#   the "URL and API key are required" error should be gone.
# or check the value is inlined into the client bundle after a build:
npm run build && grep -rl "etzfcktxzfttgcqbjgyu.supabase.co" .next/static/ | head -1
```

### Vercel (per environment) — fixes the deployed-site error
1. **Project → Settings → Environment Variables.**
2. Add each variable below, ticking the matching **Environment** checkbox
   (Production vs. Preview) — see the scoping table in
   [§Reusing the same domain for preview](#per-environment-env-scoping-in-vercel).
3. **Redeploy** (Deployments → ⋯ → Redeploy, or push a commit). Env changes only
   take effect on a **new build** — the currently-live deployment will keep throwing
   the "URL and API key are required" error until you redeploy.

The values to paste:

**Production deploy env:**
```
NEXT_PUBLIC_SUPABASE_URL=https://zwvcsvbjmmbnoroasgim.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_8JyKoHF-vkMJaS0X3GoMaQ_pCol82xu
NEXT_PUBLIC_SITE_URL=https://careerlaunchpad.ai
```

**Preview deploy env** (`preview.careerlaunchpad.ai`):
```
NEXT_PUBLIC_SUPABASE_URL=https://etzfcktxzfttgcqbjgyu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_PJA69Byy77-2OD-AmNxD7A_h8iY-HU_
NEXT_PUBLIC_SITE_URL=https://preview.careerlaunchpad.ai
```

(Local values are in the **Local** block above.) No provider secrets live in the
app — they're stored in Supabase (step 2).

### Troubleshooting: "Your project's URL and API key are required to create a Supabase client"
This means the browser received empty `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Walk these in order:

| Check | Fix |
|---|---|
| **Var names** match exactly (incl. `NEXT_PUBLIC_` prefix and `_PUBLISHABLE_KEY`, not `_ANON_KEY`) | Rename to the two names in §3. |
| **Local:** vars in `.env.local`/`.env` but error persists | The dev server caches env at startup — **stop and re-run `npm run dev`**. |
| **Deployed (minified `…js` in the stack):** vars never set on Vercel | Add them in Project → Settings → Environment Variables, scoped to that environment. |
| **Deployed:** vars set, still failing | They were added **after** the live build — **redeploy** so they're inlined. |
| Set only for Production, but error is on the **preview** URL (or vice-versa) | Each var must be ticked for the environment that's actually serving — set both scopes. |

---

## Reusing the same domain for preview (Vercel)

You do **not** need to buy a second domain. `preview.careerlaunchpad.ai` is just a
**subdomain** of the `careerlaunchpad.ai` you already own — one DNS record points it
at Vercel, and Vercel pins it to a branch.

> Note the spelling: `preview.careerlaunchpad.ai` (a **dot** — free subdomain) vs.
> `preview-careerlaunchpad.ai` (a **hyphen** — a different domain you'd have to buy).
> Use the dotted subdomain.

### One-time setup
1. **Vercel → project → Settings → Domains → Add** `preview.careerlaunchpad.ai`.
2. Click **Edit** on that domain → set **Git Branch** to your preview branch
   (e.g. `develop` or `staging`). Now every push to that branch redeploys this
   stable URL.
3. **DNS** — at the registrar/DNS host for `careerlaunchpad.ai`, add the record
   Vercel shows (a subdomain, so it's a `CNAME`):
   ```
   Type:  CNAME
   Name:  preview            (i.e. preview.careerlaunchpad.ai)
   Value: cname.vercel-dns.com
   ```
   Production stays as-is — `careerlaunchpad.ai` (apex) and `www` already point at
   Vercel; you're only **adding** the `preview` record alongside them.
4. Vercel auto-provisions the TLS cert for `preview.careerlaunchpad.ai` once DNS
   resolves (usually minutes).
5. Set the **Preview deploy env** vars above on that branch/environment in Vercel
   (Settings → Environment Variables → scope to **Preview**).

### Per-environment env scoping in Vercel
Set each `NEXT_PUBLIC_*` var twice, scoped by environment, so prod and preview hit
their own Supabase project:

| Variable | Production scope | Preview scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zwvcsvbjmmbnoroasgim.supabase.co` | `https://etzfcktxzfttgcqbjgyu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_8JyKoHF-vkMJaS0X3GoMaQ_pCol82xu` | `sb_publishable_PJA69Byy77-2OD-AmNxD7A_h8iY-HU_` |
| `NEXT_PUBLIC_SITE_URL` | `https://careerlaunchpad.ai` | `https://preview.careerlaunchpad.ai` |

> Want a unique URL per pull request on your own domain
> (`pr-123.preview.careerlaunchpad.ai`)? Add a **wildcard** domain
> `*.preview.careerlaunchpad.ai` in Vercel with a `CNAME` for `*.preview` →
> `cname.vercel-dns.com`, and add `https://*.preview.careerlaunchpad.ai/**` to the
> Supabase preview Redirect URLs. The single pinned subdomain above is simpler and
> enough for OAuth, since one stable URL means one redirect entry to register.

---

## How it maps to the code
| Piece | Path |
|---|---|
| Login page (4 social buttons) | `app/auth/login/page.tsx` |
| OAuth callback (code → session → role routing) | `app/auth/callback/route.ts` |
| Not-provisioned / error pages | `app/auth/no-access/page.tsx`, `app/auth/auth-code-error/page.tsx` |
| Sign-out | `app/auth/signout/route.ts` |
| Session refresh + route gating | `middleware.ts` + `lib/supabase/middleware.ts` |
| RBAC context (roles/permissions/home) | `lib/auth.ts` ← `auth_context()` SQL (migration 009) |
| Owner "add users" / invites | `app/dashboard/users/` |
| Provisioning trigger | `supabase/migrations/005_handle_new_user.sql` |
| Per-provider registration guide | [`OAUTH_PROVIDERS.md`](./OAUTH_PROVIDERS.md) |

## Add another provider later
1. Enable it in Supabase (step 2) and register the Supabase callback at the provider:
   - Preview: `https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback`
   - Production: `https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback`
2. Add one entry to the `PROVIDERS` array in `app/auth/login/page.tsx` (provider id +
   label + icon). That's it — the callback and provisioning are provider-agnostic.

## Local testing without provider apps
You can validate the invite/provisioning logic without OAuth apps by enabling the
**Email** provider (magic link) in Supabase temporarily, or by inserting an
`auth.users` row in a test DB — the `handle_new_user` trigger fires either way.

## Quick smoke test (after wiring a provider)
1. Run `npm run dev` and open `http://localhost:3000/auth/login`.
2. In Supabase → `/dashboard/users` (signed in as owner) invite **your own**
   provider email.
3. Click the matching social button → you should land on your role's home
   (`/dashboard`, `/student`, or `/employer`).
4. Invite a different email than the one you sign in with → expect `/auth/no-access`
   (confirms the email-match security boundary).
