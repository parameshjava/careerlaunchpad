# Zoom — auto-created meetings for scheduled classes

When staff schedule a class for a batch subject (GitHub #64), the server creates
a Zoom meeting, adds the subject's mentors as **alternative hosts**, and emails
everyone an `.ics` invite. This uses Zoom's **Server-to-Server OAuth** — a
back-end app that authenticates with account credentials, so no per-user login
or consent screen is involved.

- Client: [`lib/zoom/index.ts`](../lib/zoom/index.ts) (server-only)
- Scheduling flow: [`lib/session-schedule.ts`](../lib/session-schedule.ts)
- Env template: [`.env.example`](../.env.example)
- API contract: [`CALENDAR_API.md`](./CALENDAR_API.md)

## What you need

Three server-only environment variables:

| Variable             | What it is                                 |
| -------------------- | ------------------------------------------ |
| `ZOOM_ACCOUNT_ID`    | Your Zoom account ID                       |
| `ZOOM_CLIENT_ID`     | The Server-to-Server OAuth app's Client ID |
| `ZOOM_CLIENT_SECRET` | That app's Client Secret                   |

> **Zoom is optional.** If these are unset, scheduling still works — a class saves
> with `meeting_status='failed'` (or `manual` if staff pasted a link), and nothing
> throws. Add the credentials to turn on auto-created meetings.

## 1. Create a Server-to-Server OAuth app

You need **admin access** to the Zoom account, and the account must be allowed to
create Server-to-Server OAuth apps (Zoom Pro or higher; on free/basic accounts an
account admin may need to enable it).

1. Sign in to the **[Zoom App Marketplace](https://marketplace.zoom.us/)** with the
   admin account (the one whose meetings will host the classes).
2. **Develop → Build App**.
3. Choose **Server-to-Server OAuth** → **Create**. Give it a name, e.g.
   `CareerLaunchpad Classes`.
4. On the **App Credentials** page you'll see the **Account ID**, **Client ID**, and
   **Client Secret** — these are the three values above. Keep the page open.

## 2. Add scopes

Under **Scopes → Add Scopes**, grant (at minimum):

- `meeting:write:admin` — create / update / delete meetings
  (newer granular scopes: `meeting:write:meeting:admin`,
  `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`)
- `user:read:admin` — resolve the host user (`/users/me`)

These cover create/update/delete used by `lib/zoom` (create on schedule, patch on
edit, delete on cancel) plus reading the host.

## 3. Fill in the required app info & activate

Complete the mandatory **Information** fields (company name, contact) — Zoom won't
let you activate without them. Then **Activation → Activate your app**. The
credentials only work once the app is activated.

## 4. Set the environment variables

**Local** — in `.env` (or `.env.local`):

```bash
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
```

**Vercel** — add the same three under **Project → Settings → Environment
Variables** for **both Preview and Production**. They are server-only, so do **not**
prefix with `NEXT_PUBLIC_`. Redeploy after adding them.

> These are secrets that bypass user auth. Never commit them, never expose them to
> the browser, and rotate the Client Secret from the App Credentials page if it
> leaks.

## 5. Verify

1. Restart the dev server (or redeploy) so the new env is loaded.
2. Go to **Dashboard → Batches → (a batch) → Subjects & mentors** and assign at
   least one mentor to a subject (so there's someone to invite).
3. Open **Schedule**, create a class with **"Create a Zoom meeting automatically"**
   ticked, and save.
4. Expected: the class appears under **Upcoming classes** with a **Zoom** button
   (not a red **No Zoom** badge), and each assigned mentor receives a calendar
   invite (requires SMTP — see below). Enrolled students see it on
   `/student/calendar` with a working **Join** link.

## How meetings map to classes

- **One-off class** → a single scheduled meeting (Zoom type 2).
- **Recurring series** → one recurring meeting (Zoom type 8) whose join link is
  shared by every occurrence. Editing the series patches the recurrence; cancelling
  deletes the meeting.
- Subject **mentors** are added as `alternative_hosts` so they can start the class.

## Notes & troubleshooting

- **Meetings are hosted by the app's account** (`/users/me`). All class meetings
  belong to that Zoom user; the account needs enough capacity/licensing for
  concurrent classes.
- **"No Zoom" badge / `meeting_status='failed'`** — the credentials are missing,
  the app isn't activated, or a scope is missing. Check the server logs for the
  `Zoom … failed (<status>)` message; a `401`/`400` usually means bad credentials or
  scopes.
- **The `.ics` invite** to mentors is sent over SMTP, configured separately — see
  the Email section of [`.env.example`](../.env.example). Without SMTP the meeting
  is still created; only the email is skipped.
- Mentors must be **approved** with an account email for the invite to work.

### Who starts a class

Class meetings use **join-before-host** (`join_before_host: true`, `jbh_time: 0`,
waiting room off), so **no org host has to start the class** — the mentor or any
student can open the room with the join link at class time. There's no designated
host and no host-only controls (mute-all, admit, host-gated recording).

> **Enable it account-wide:** for join-before-host to take effect, it must also be
> **on at the Zoom account level** — Zoom Admin → Account Management → Account
> Settings → *Join before host* (and *Waiting room* off / allowed to be turned
> off per meeting). Otherwise Zoom silently ignores the per-meeting flag and the
> account owner still has to start the meeting.

If you later want a real host (host controls, recording), add mentors as Zoom
users (below) so they can be alternative hosts / start the class.

### Alternative hosts (error 1114)

> `Unable to assign "…@gmail.com" as an alternative host because the user cannot
> be selected at this time` (code **1114**).

Zoom only allows **alternative hosts who are users on the same Zoom account**
(and typically licensed) — a mentor's personal Gmail can't be an alt-host. We
therefore set alt-hosts **best-effort and decoupled from meeting creation**: the
meeting is always created and the join link always works; if an alt-host can't be
assigned, it's skipped (logged as a warning), not failed. Mentors still receive
the class on their calendar via the `.ics` invite and join with the link.

**To make mentors actual alternative hosts** (able to *start* the class), add
them as **users on your Zoom account** (Zoom Admin → User Management → Users →
Add) with the same email you use in CareerLaunchpad, then reschedule/edit the
class. Otherwise the join-link + calendar-invite flow is the intended experience
and needs no Zoom account per mentor.
