# Register for Cloudflare R2 & configure environment variables

This guide takes you from **zero → working R2 credentials**, then shows how to set
those credentials in each environment: local `.env`, **Vercel**, and **Supabase**
(Edge Functions). For how the app *uses* R2 (upload/download flow, CORS, public
domain), see [`R2_SETUP.md`](./R2_SETUP.md).

The five variables you'll end up setting everywhere:

| Variable | What it is | Example |
|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account id (R2 overview page) | `a1b2c3d4...` |
| `R2_ACCESS_KEY_ID` | API token access key id | `f39...` |
| `R2_SECRET_ACCESS_KEY` | API token secret (shown once) | `9c8...` |
| `R2_BUCKET` | bucket name | `careerlaunchpad-profiles` |
| `R2_PUBLIC_BASE_URL` | *(optional)* public domain for photos | `https://cdn.careerlaunchpad.ai` |

> ⚠️ These are **server-only secrets**. Never give them a `NEXT_PUBLIC_` prefix and
> never expose them to the browser. They belong only where server code runs.

---

## 1. Register for Cloudflare R2

1. Create a free Cloudflare account / sign in at <https://dash.cloudflare.com>.
2. In the left sidebar choose **R2 Object Storage**.
3. Click **Enable R2**. You must add a payment method even for the free tier, but
   you stay free within the allowance: **10 GB storage, 1M Class-A ops, 10M
   Class-B ops per month, and $0 egress**.

## 2. Create the bucket

1. R2 → **Create bucket**.
2. Name: `careerlaunchpad-profiles` → choose a location hint near your users → **Create**.
3. Copy your **Account ID** from the R2 overview page → this is `R2_ACCOUNT_ID`.

## 3. Create API credentials (token)

1. R2 → **Manage R2 API Tokens** → **Create API Token**.
2. Permission: **Object Read & Write**.
3. Scope it to **only** the `careerlaunchpad-profiles` bucket.
4. Create the token, then copy (these show **once**):
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`

You now have all the values. Next, set them in each environment.

---

## 4. Where do the secrets actually go?

> **Rule of thumb: the R2 secrets live wherever the code that talks to R2 runs.**

In this project the presigning code is the Next.js route `app/api/uploads/route.ts`
(`lib/r2.ts`). So:

| If the upload API runs on… | Put the R2 vars in… |
|---|---|
| your laptop (`npm run dev`) | local **`.env`** (§5) |
| **Vercel** (the deployed Next.js app) | **Vercel** project env vars (§6) |
| a **Supabase Edge Function** (only if you move the presign logic there) | **Supabase** secrets (§7) |

You do **not** need to set R2 vars in Supabase unless you reimplement the upload
endpoint as a Supabase Edge Function. For the current Next.js-on-Vercel setup,
§5 (local) + §6 (Vercel) is all you need.

---

## 5. Local development — `.env`

Copy the template and fill in the values:

```bash
cp .env.example .env
```

```bash
# .env  (gitignored — never commit real values)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET=careerlaunchpad-profiles
R2_PUBLIC_BASE_URL=          # optional; leave blank to keep everything presigned
```

Restart `npm run dev` after editing `.env` so Next.js reloads them.

## 6. Vercel (deployed Next.js app)

**Dashboard:** Vercel → your Project → **Settings → Environment Variables**. Add each
variable, select the environments it applies to (**Production**, **Preview**,
**Development**), and save. Mark the secret/key as sensitive.

**Or via CLI:**

```bash
npm i -g vercel
vercel link                       # once, to connect the local repo to the project
vercel env add R2_ACCOUNT_ID            production
vercel env add R2_ACCESS_KEY_ID         production
vercel env add R2_SECRET_ACCESS_KEY     production
vercel env add R2_BUCKET                production
vercel env add R2_PUBLIC_BASE_URL       production   # optional
# repeat with `preview` (and `development`) as needed
vercel env pull .env.local              # optional: sync them back down locally
```

Environment variable changes only take effect on the **next deployment** — redeploy
after adding them. Do **not** prefix with `NEXT_PUBLIC_`.

## 7. Supabase (only if using an Edge Function)

If you move the presign logic into a Supabase Edge Function (Deno), set the same
values as **Edge Function secrets** — they're then read with `Deno.env.get("R2_…")`.

**CLI:**

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set \
  R2_ACCOUNT_ID=your-account-id \
  R2_ACCESS_KEY_ID=your-access-key-id \
  R2_SECRET_ACCESS_KEY=your-secret-access-key \
  R2_BUCKET=careerlaunchpad-profiles
supabase secrets list             # verify (values are hidden)
```

You can also set them from a file: `supabase secrets set --env-file ./r2.env`.

**Dashboard:** Supabase → Project → **Edge Functions → Secrets** (a.k.a. Function
secrets) → add each key/value.

> Note: these Supabase secrets are scoped to **Edge Functions only** — they are not
> visible to the Next.js app. The `NEXT_PUBLIC_SUPABASE_*` keys already in `.env`
> are unrelated (they're the public Supabase client config, not R2).

---

## 8. Verify

- **Local:** `npm run dev`, then `POST /api/uploads` with a JSON body
  `{ "kind": "photo", "filename": "a.jpg", "contentType": "image/jpeg" }` while
  signed in — you should get back `{ uploadUrl, key }`. A missing var throws a
  clear `Missing required env var R2_… ` error (from `lib/r2.ts`).
- **Vercel:** after redeploy, the same request against the deployed URL should work.
- Never commit `.env`; only `.env.example` is tracked.
