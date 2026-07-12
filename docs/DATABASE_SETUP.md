# Database Setup & Migration Pipeline

How the two Supabase databases are provisioned and kept in sync automatically.
Everything here is **manual, one-time setup** except where noted — after it's
done, migrations flow through CI with no manual SQL execution.

## Model

Two Supabase projects, both in **`ap-southeast-1` (Singapore)**:

| Project     | Tracks        | Migrated when                 |
| ----------- | ------------- | ----------------------------- |
| `preview`   | `main` branch | a PR is merged to `main`      |
| `prod`      | release tags  | a GitHub Release is published |

Migrations live in `supabase/migrations/*.sql` and are applied with
`supabase db push`, which is **incremental and tracked** — it records applied
versions in `supabase_migrations.schema_migrations` and only runs files not yet
applied, in filename order. Because a fresh project has an empty history, the
first push replays **all** migrations (schema **and** seed data) from zero. That
is why you never re-run scripts by hand.

The pipeline (`.github/workflows/`):
- `migrate-preview.yml` — on push to `main` → `db push` to the preview project.
- `deploy-prod.yml` — on Release publish → `db push` to prod, **then** deploy the
  app to Vercel (migrate-before-deploy, enforced by `needs: migrate`).

> **Migration versions must be unique.** `db push` keys each file by its leading
> numeric prefix. The old per-batch seed files (`028_seed_arithmetic_questions_001..035`,
> etc.) shared one prefix each and were merged into a single file per prefix
> (`028_seed_arithmetic_questions.sql`). Keep prefixes unique going forward — use
> `supabase migration new <name>` (generates a timestamp prefix) for new files.

---

## One-time setup

### 1. Create the two projects (Supabase dashboard)

For **each** of `preview` and `prod`:

1. New project → **Region: Southeast Asia (Singapore) `ap-southeast-1`**.
2. Set a strong database password — **save it**, you need it for CI.
3. After it provisions, note:
   - **Project Ref** — from the URL `https://supabase.com/dashboard/project/<ref>`.
   - **Project URL** and **Publishable key** — Settings → API.

### 2. Create a Supabase access token

Dashboard → account **Account Tokens** → **Generate new token**
(name it `github-actions`). Copy it once — this is `SUPABASE_ACCESS_TOKEN`.

### 3. Add GitHub secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret                  | Value               |
| ----------------------- | ------------------- |
| `SUPABASE_ACCESS_TOKEN` | token from step 2   |
| `PREVIEW_PROJECT_ID`    | preview project ref |
| `PREVIEW_DB_PASSWORD`   | preview DB password |
| `PROD_PROJECT_ID`       | prod project ref    |
| `PROD_DB_PASSWORD`      | prod DB password    |

(`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` should already exist from
the deploy pipeline.)

### 4. Point the app at each database (Vercel env vars)

Vercel → Project → Settings → Environment Variables. Add each variable twice,
scoped to the matching environment:

| Variable                               | Preview scope           | Production scope     |
| -------------------------------------- | ----------------------- | -------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | preview project URL     | prod project URL     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | preview publishable key | prod publishable key |

Redeploy after adding so the values take effect.

### 5. First migration push (bootstrap the empty DBs)

You can let CI do it, or push once manually to verify locally first.

**Preview** — merge any PR to `main`, or run locally:

```bash
export SUPABASE_ACCESS_TOKEN=<token>
supabase link --project-ref <preview-ref>   # prompts for DB password
supabase db push
```

**Production** — publish a GitHub Release, or run locally against the prod ref
the same way.

### 6. Verify

```bash
supabase migration list        # local vs remote versions should match
```

Or in the dashboard: Table Editor shows the tables; the question-bank tables
should be populated from the seed migrations.

### 7. Delete the old project

Only after both new projects are verified working (app loads, data present):
Supabase dashboard → old project → Settings → General → **Delete project**.

---

## Day-to-day (no manual steps)

1. Add a migration: `supabase migration new <name>`, write SQL, commit in a PR.
2. Merge the PR → `migrate-preview.yml` applies it to the preview DB.
3. Publish a Release → `deploy-prod.yml` applies it to prod, then deploys the app.

## Troubleshooting

- **Migration history out of sync** (a file applied manually / recorded wrong):
  `supabase migration repair --status applied <version>` (or `reverted`) fixes
  the tracking table without running SQL.
- **`db push` says nothing to apply but schema is missing**: check
  `supabase migration list` — the remote may already record the version. Repair
  as above.
- **CI auth fails**: confirm `SUPABASE_ACCESS_TOKEN` and the `*_DB_PASSWORD` /
  `*_PROJECT_ID` secrets match the intended project.
