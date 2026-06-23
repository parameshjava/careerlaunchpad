# Registering each OAuth provider & wiring credentials

Step-by-step for **Google, GitHub, LinkedIn, Facebook** — create the OAuth app,
copy its credentials into Supabase, and confirm it works in this project. For the
overall auth model (invite-only, roles, routing) see [`AUTH_SETUP.md`](./AUTH_SETUP.md).

## How the pieces fit together
```
[Provider OAuth app]  --client id/secret-->  [Supabase Auth provider]  <--reads--  [this app's login button]
        ▲                                                  │
        └────── registers ONE redirect URL: ──────────────┘
                https://<project-ref>.supabase.co/auth/v1/callback
```
Three important facts that avoid 90% of the confusion:
1. **Each provider only ever needs the *Supabase* callback URL** (below) — never
   `localhost` and never `/auth/callback` of this app.
2. **This app's URLs** (`http://localhost:3000`, your prod domain) go in
   **Supabase → Auth → URL Configuration → Redirect URLs**, not in the provider.
3. **Provider client id/secret** are pasted into **Supabase**, not into this repo.
   This repo holds no provider secrets.

### Your Supabase callback URLs (register these at every provider)
Derived from `NEXT_PUBLIC_SUPABASE_URL` (the `<project-ref>` is the subdomain):

| Environment | Callback URL to register at the provider |
|---|---|
| **Preview** (`etzfcktxzfttgcqbjgyu`) | `https://etzfcktxzfttgcqbjgyu.supabase.co/auth/v1/callback` |
| **Production** (`zwvcsvbjmmbnoroasgim`) | `https://zwvcsvbjmmbnoroasgim.supabase.co/auth/v1/callback` |

> Two Supabase projects = two separate sets of provider apps (or add **both**
> callback URLs to one provider app where the provider allows multiple). Find your
> ref any time under Supabase → Project Settings → API → Project URL.

---

## 1. Google
**Console:** <https://console.cloud.google.com>

1. Top bar → **project picker → New Project** (e.g. "CareerLaunchpad") → create/select it.
2. **APIs & Services → OAuth consent screen**:
   - User type **External** → Create.
   - App name, support email, developer email. Save.
   - **Scopes** → Add `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`.
   - **Test users** → add the Google accounts you'll test with (while the app is in
     "Testing"). Publish later for the public.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type **Web application**, name it.
   - **Authorized redirect URIs** → add the Supabase callback URL(s) from the table above.
   - Create.
4. Copy **Client ID** and **Client secret**.
5. **Supabase → Authentication → Providers → Google** → enable → paste Client ID +
   Secret → Save.

## 2. GitHub
**Settings:** <https://github.com/settings/developers>

1. **OAuth Apps → New OAuth App** (Settings → Developer settings → OAuth Apps).
2. Fill in:
   - **Application name:** CareerLaunchpad
   - **Homepage URL:** your app URL (`http://localhost:3000` for dev is fine)
   - **Authorization callback URL:** the Supabase callback URL from the table above.
3. **Register application**, then **Generate a new client secret**.
4. Copy **Client ID** and the **Client secret** (shown once).
5. **Supabase → Authentication → Providers → GitHub** → enable → paste → Save.

> GitHub users with a **private email** won't return an address unless the
> `user:email` scope is requested. Supabase requests it for GitHub by default, but
> verify the user has at least one verified email — the invite match needs it.

## 3. LinkedIn  (provider id: `linkedin_oidc`)
**Portal:** <https://www.linkedin.com/developers/apps>

1. **Create app**. LinkedIn requires associating a **LinkedIn Company Page** — create
   a placeholder page if you don't have one. Add app logo + legal terms.
2. **Products tab → request "Sign In with LinkedIn using OpenID Connect"** → wait for
   it to be granted (usually instant).
3. **Auth tab**:
   - Under **OAuth 2.0 settings → Authorized redirect URLs**, add the Supabase
     callback URL(s) from the table above.
   - Note the **Client ID** and **Primary Client Secret**.
   - Confirm scopes `openid`, `profile`, `email` are present (granted by the product).
4. **Supabase → Authentication → Providers → LinkedIn (OIDC)** → enable → paste
   Client ID + Secret → Save.
   *(Use the "LinkedIn (OIDC)" entry, not the legacy "LinkedIn" one. This app already
   calls the `linkedin_oidc` provider in `app/auth/login/page.tsx`.)*

## 4. Facebook  (Meta)
**Portal:** <https://developers.facebook.com/apps>

1. **Create app** → use case **Authenticate and request data from users with
   Facebook Login** (Consumer-type) → fill app name + contact email.
2. **Add product → Facebook Login → Set up** (Web).
3. **Facebook Login → Settings → Valid OAuth Redirect URIs** → add the Supabase
   callback URL(s) from the table above → Save.
4. **App settings → Basic** → copy **App ID** and **App Secret** (click Show).
5. **Supabase → Authentication → Providers → Facebook** → enable → paste App ID +
   App Secret → Save.
6. **Going live:**
   - While the app is in **Development mode**, only **App Roles → Testers/Admins** can
     sign in — add test accounts there.
   - For the public, toggle the app to **Live** and complete **App Review** for the
     `email` and `public_profile` permissions (Meta requires Business verification).
     Email is required because invites match on email.

---

## Configure Supabase (once per project)
**Authentication → URL Configuration:**
- **Site URL:** `http://localhost:3000` for dev; your domain for prod.
- **Redirect URLs (allow-list):** add `http://localhost:3000/**` and
  `https://YOUR-PROD-DOMAIN/**`. (This is where the app's own `…/auth/callback`
  redirect must be allowed — distinct from the provider callback above.)

## Configure this project
No provider secrets live here. Only the public Supabase config + site URL, already
in `.env` / `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://your-domain   # used for invite login links
```
For Vercel, set those three the same way (Project → Settings → Environment Variables).
The login buttons themselves are already wired in `app/auth/login/page.tsx`.

## Verify
1. `npm run dev`, open `/auth/login`, click a provider.
2. You bounce to the provider, approve, return to `/auth/callback`, then land by role
   (invited) or on `/auth/no-access` (not invited).
3. Repeat per provider you enabled.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` / "redirect URI is not allowed" | The **provider** app's redirect URL must be exactly the Supabase callback URL (table above), including `https` and `/auth/v1/callback`. |
| Returns to app but lands on `/auth/no-access` | Working as designed — that email has no pending invite. Create one in `/dashboard/users` (or check the email matches the invite). |
| "Unsupported provider" / provider button errors | The provider isn't **enabled** in Supabase → Authentication → Providers. |
| Signed in but no email captured (GitHub/Facebook) | Ensure email scope/permission is granted; add the account as a tester (FB) or make a GitHub email verified. |
| App redirect after login is blocked | Add your app origin to Supabase → Auth → URL Configuration → Redirect URLs. |
| LinkedIn shows only legacy provider | Request the **OpenID Connect** product and use Supabase's **LinkedIn (OIDC)** entry. |
