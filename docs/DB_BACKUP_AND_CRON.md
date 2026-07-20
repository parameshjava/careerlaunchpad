# Database Backup & Scheduled Jobs — Manual Setup

Two independent pieces of database automation, and the one-time manual steps each
needs. Nothing here runs until the steps below are done.

- **Part A — Weekly DB backup** (GitHub Actions → private repo)
- **Part B — pg_cron scheduled jobs** (in-database cron, e.g. audit-log prune)

---

## Part A — Weekly DB backup

`.github/workflows/db-backup.yml` runs every **Sunday 03:00 UTC** (plus
on-demand via **Actions → DB Backup → Run workflow**). It `pg_dump`s the
`public` schema of **both** the prod and preview Supabase projects, gzips each,
and pushes them to a **separate private repo**:

```
careerlaunchpad-db-backups/
  dumps/prod/cl-<timestamp>.sql.gz
  dumps/preview/cl-<timestamp>.sql.gz
```

Retention: the 12 most-recent dumps per environment (~3 months of weekly
snapshots). Dumps contain real data, so they never live in this source repo.

### One-time setup

1. **Create the private backup repo.** Under the **same GitHub owner** as this
   repo, create `careerlaunchpad-db-backups` and set it **Private**. (The owner
   is auto-derived from `github.repository_owner`; if you put the backup repo
   under a different owner, add a `BACKUP_REPO` secret = `owner/name`.)

2. **Create a token** with write access to that repo — a fine-grained PAT scoped
   to `careerlaunchpad-db-backups` with **Contents: Read and write**, or a
   classic PAT with `repo` scope.

3. **Get each Supabase connection string.** In each project:
   **Project Settings → Database → Connection string → _Session pooler_**.
   Use the **Session pooler** URL (host `...pooler.supabase.com`, port **5432**)
   with the DB password inline:

   ```
   postgres://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   > ⚠️ Do **not** use the direct `db.<ref>.supabase.co:5432` host — it is
   > IPv6-only and GitHub runners are IPv4, so `pg_dump` will hang. Do **not**
   > use the transaction pooler (port `6543`) — it doesn't support `pg_dump`.

4. **Add the repo secrets** (this repo → **Settings → Secrets and variables →
   Actions → New repository secret**):

   | Secret              | Value                                                             |
   | ------------------- | ----------------------------------------------------------------- |
   | `PROD_DB_URL`       | Prod Session-pooler connection string (with password)             |
   | `PREVIEW_DB_URL`    | Preview Session-pooler connection string (with password)          |
   | `BACKUP_REPO_TOKEN` | The token from step 2                                             |
   | `BACKUP_REPO`       | *(optional)* `owner/careerlaunchpad-db-backups` if not same owner |

5. **Merge to `main`.** Scheduled (`cron`) workflows only fire from the default
   branch — the workflow won't run from a feature branch.

6. **Test it.** **Actions → DB Backup → Run workflow**, then confirm both
   `dumps/prod/` and `dumps/preview/` receive a new `cl-*.sql.gz`. The run aborts
   if either dump is < 1 KB, so a green run means both dumps hold real data.

### Restoring from a dump

```bash
gunzip -c cl-<timestamp>.sql.gz | psql "<target-connection-string>"
```

The dump uses `--clean --if-exists`, so it drops and recreates each `public`
object before loading — restore into the intended project, not a live prod you
don't mean to overwrite.

---

## Part B — pg_cron scheduled jobs

`supabase/migrations/108_pg_cron_prune_impersonation_log.sql` schedules an
in-database cron job (`cl-prune-impersonation-log`) that runs **daily at 03:30
UTC** and deletes `impersonation_log` rows older than 90 days. pg_cron fires
daily; the `WHERE created_at < now() - interval '90 days'` clause decides what
actually gets removed, keeping the schedule expression simple.

### One-time setup

1. **Enable the `pg_cron` extension.** The migration runs
   `create extension if not exists pg_cron;`, which is enough on projects where
   the migration role may create extensions. If `supabase db push` errors on
   that line, enable it once manually:
   **Supabase dashboard → Database → Extensions → search `pg_cron` → Enable.**
   Then re-run the migration.

2. **Apply the migration** — it's picked up automatically by the migrate
   workflows on merge (preview) and release (prod), or run `supabase db push`
   locally against the target project.

### Verify & manage (run in the SQL editor of the target project)

```sql
-- Is the job registered?
select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'cl-prune-impersonation-log';

-- Recent run history (status = 'succeeded' / 'failed', plus any error).
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'cl-prune-impersonation-log')
order by start_time desc
limit 10;
```

**Change the retention window or time:** edit `interval '90 days'` and/or the
`'30 3 * * *'` expression in migration 108 and re-apply — `cron.schedule`
upserts by job name, so re-running updates the existing job in place.

**Run it once, now (ad-hoc):**

```sql
delete from public.impersonation_log where created_at < now() - interval '90 days';
```

**Remove the job entirely:**

```sql
select cron.unschedule('cl-prune-impersonation-log');
```

> Note: pg_cron runs in the **prod** and **preview** databases independently —
> each project has its own scheduler, so enabling the extension and applying the
> migration must happen in both (the migrate workflows handle applying it).
