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

## 1. Supabase project config (once)
Dashboard → **Authentication → URL Configuration**:
- **Site URL:** your prod URL (e.g. `https://careerlaunchpad.ai`); use
  `http://localhost:3000` while developing.
- **Redirect URLs (allow-list):** add `http://localhost:3000/**` and
  `https://YOUR-PROD-DOMAIN/**`. Our app redirects to `…/auth/callback`.

The provider callback that you register at each provider is **always the Supabase
one**: `https://<project-ref>.supabase.co/auth/v1/callback`.

## 2. Register & enable each provider
For each provider you create an OAuth app, register the Supabase callback URL at the
provider, then paste the client id/secret into **Supabase → Authentication →
Providers**. Your exact callback URLs (from `NEXT_PUBLIC_SUPABASE_URL`):

| Environment | Register this redirect URL at the provider |
|---|---|
| Preview | `https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback` |
| Production | `https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback` |

> The provider only ever needs the **Supabase** callback above — never `localhost`
> or this app's `/auth/callback`. This app's URLs go in the redirect allow-list (§1).

For full click-by-click detail (consent screens, scopes, where each field lives, and
a troubleshooting table) see **[`OAUTH_PROVIDERS.md`](./OAUTH_PROVIDERS.md)**.

### Google
1. Google Cloud Console → **APIs & Services → OAuth consent screen** (External; add
   `email`, `profile`, `openid` scopes; add test users while unpublished).
2. **Credentials → Create Credentials → OAuth client ID → Web application**.
3. **Authorized redirect URIs:** add the Supabase callback URL(s) above.
4. Copy **Client ID + Secret** → Supabase → Authentication → Providers → **Google**.

### GitHub
1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL = your app URL; **Authorization callback URL** = the Supabase callback above.
3. **Generate a new client secret**, copy **Client ID + Secret** → Supabase → **GitHub**.
4. Email scope (`user:email`) is requested by default — needed because the invite
   matches on email; a fully-private GitHub email yields no address.

### LinkedIn  — provider id `linkedin_oidc`
1. LinkedIn → **Developer Portal → Create app** (requires an associated Company Page).
2. **Products** → request **"Sign In with LinkedIn using OpenID Connect"**.
3. **Auth** tab → add the Supabase callback URL(s) under Authorized redirect URLs;
   scopes `openid profile email`.
4. Copy **Client ID + Secret** → Supabase → **LinkedIn (OIDC)** (not legacy LinkedIn).
   The app already calls the `linkedin_oidc` provider in `app/auth/login/page.tsx`.

### Facebook  (Meta)
1. Meta for Developers → **Create App** → add the **Facebook Login** product (Web).
2. **Facebook Login → Settings → Valid OAuth Redirect URIs:** add the Supabase callback above.
3. **App settings → Basic:** copy **App ID + App Secret** → Supabase → **Facebook**.
4. In Development mode only **Testers/Admins** (App Roles) can sign in; for the public,
   set the app **Live** and complete **App Review** for `email` + `public_profile`
   (Business verification). Email is required for the invite match.

## 3. App environment
The browser client needs the Supabase URL + publishable key (already in `.env`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://your-domain   # used for invite login links
```
No provider secrets live in the app — they're stored in Supabase (step 2).

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
1. Enable it in Supabase (step 2) and register the Supabase callback at the provider.
2. Add one entry to the `PROVIDERS` array in `app/auth/login/page.tsx` (provider id +
   label + icon). That's it — the callback and provisioning are provider-agnostic.

## Local testing without provider apps
You can validate the invite/provisioning logic without OAuth apps by enabling the
**Email** provider (magic link) in Supabase temporarily, or by inserting an
`auth.users` row in a test DB — the `handle_new_user` trigger fires either way.
