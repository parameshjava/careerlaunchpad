# CareerLaunchPad — Roles & Permissions Specification

**Status:** Draft for review
**Date:** 2026-06-21
**Scope:** Product specification (PRD) for the platform's roles, permissions, and the flows that connect them. Captures the full vision; ends with a suggested build order for incremental delivery.

---

## 1. Overview

CareerLaunchPad is evolving from a static marketing site into a multi-tenant platform that bridges college students and employers. Today the site has no database and no authentication — this spec defines the role system that the platform will be built around.

**Every account is provisioned by an Owner through an invite** — there is no self-serve registration for any role. Invited users sign in with a social identity provider (Google, Facebook, LinkedIn, GitHub; more can be added later). The user's role (and, for students, their college) is fixed by the invite, not chosen by the user.

The platform serves four roles in v1, designed so **additional roles can be added later without rewriting code** (see §3, RBAC model):

1. **Owner** — founders/co-founders; unrestricted.
2. **Student** — college students.
3. **College Admin** — staff who oversee their own college's students.
4. **Employer** — organizations that discover talent and post jobs.

---

## 2. Roles

### 2.1 Owner
The founder and co-founder. Unrestricted access — holds the wildcard permission (`*`) and is never blocked by a permission check.

Responsibilities:
- **Invite users** of any role — the sole entry point for account creation.
- Create and manage Colleges.
- Manage all users (view, suspend, edit, re-assign roles, revoke).
- Define and edit roles and their permission bundles.
- View platform-wide analytics.

### 2.2 Student
A college student, **added by Owner invite**. The invite assigns the student to an existing college (chosen from approved colleges by the Owner) — students are always tied to a college and never pick one themselves. The student accepts the invite and signs in via a social provider.

Capabilities:
- Create and manage their own profile (see §4 for fields).
- Toggle "open to opportunities" discoverability.
- Browse and apply to jobs.
- Receive and respond to in-platform contact from employers.
- Control when their contact details (email/phone) are revealed (see §5.3).

### 2.3 College Admin
Staff representing a single college. **Added by Owner invite and linked to one college.** Scoped strictly to their own college — cannot see other colleges' data.

Capabilities:
- View and manage all students belonging to their college.
- View college-level analytics (e.g. registered students, placement activity).
- Manage college profile/details.

### 2.4 Employer
An organization seeking talent. **Added by Owner invite** before gaining access.

Capabilities:
- Search and filter across **all** student profiles.
- View full student profiles (skills, resume, projects, preferences).
- Initiate in-platform contact with students.
- Post jobs and review applicants.

---

## 3. Permission model (RBAC)

The platform uses **permission-based Role-Based Access Control** so roles are data, not hardcoded logic.

- **Permission** — a granular capability string, e.g. `student.profile.view`, `employer.approve`, `job.post`, `college.students.view`.
- **Role** — a named bundle of permissions. A user has one or more roles.
- **Authorization** — an action is allowed if any of the user's roles grants the required permission (or the user holds the `*` wildcard).

**Extensibility:** adding a new role (e.g. "Mentor", "Recruiter Assistant") means defining a new permission bundle in data — no changes to authorization code. Permissions can be added as new capabilities ship.

### 3.1 Seeded permissions (v1)

| Permission                             | Owner | Student | College Admin | Employer |
| -------------------------------------- | :---: | :-----: | :-----------: | :------: |
| `user.invite` (any role)               |   ✅   |         |               |          |
| `user.manage` (all users)              |   ✅   |         |               |          |
| `role.manage`                          |   ✅   |         |               |          |
| `college.manage` (create/edit)         |   ✅   |         |               |          |
| `analytics.platform.view`              |   ✅   |         |               |          |
| `student.profile.manage_own`           |       |    ✅    |               |          |
| `job.browse` / `job.apply`             |       |    ✅    |               |          |
| `message.respond`                      |       |    ✅    |               |          |
| `college.students.view` (own college)  |       |         |       ✅       |          |
| `college.analytics.view` (own college) |       |         |       ✅       |          |
| `college.profile.manage` (own college) |       |         |       ✅       |          |
| `student.profile.search`               |       |         |               |    ✅     |
| `student.profile.view` (full)          |       |         |               |    ✅     |
| `student.contact.initiate`             |       |         |               |    ✅     |
| `job.post` / `job.applicants.view`     |       |         |               |    ✅     |
| `*` (wildcard)                         |   ✅   |         |               |          |

> Scoping note: College Admin permissions are **resource-scoped** to the admin's own college; the authorization layer must enforce college ownership, not just the permission string.

### 3.2 Roles table design

The RBAC model is stored as data in five tables (Supabase Postgres). Roles and permissions are rows — never hardcoded — so a new role is an `INSERT`, not a code change.

**Entity-relationship (how the tables connect):**

```
                 user_roles                     role_permissions
  app_user  ─────<  (M:N)  >─────  role  ─────<     (M:N)     >─────  permission
 (id, …)              ▲          (id, key,            ▲             (id, key, …)
                      │           name, …)             │
                  scope_college_id            (role_id, permission_id)
                  (nullable — scopes a
                   College-Admin grant
                   to one college)
```

**`role`** — one row per role; extend by inserting a new row.

| Column        | Type          | Notes                                                                |
| ------------- | ------------- | -------------------------------------------------------------------- |
| `id`          | `uuid` PK     | `gen_random_uuid()`                                                  |
| `key`         | `text` UNIQUE | Stable machine name: `owner`, `student`, `college_admin`, `employer` |
| `name`        | `text`        | Human label: "College Admin"                                         |
| `description` | `text`        | What the role is for                                                 |
| `is_system`   | `boolean`     | `true` for the four seeded roles (cannot be deleted)                 |
| `created_at`  | `timestamptz` | default `now()`                                                      |

**`permission`** — one row per granular capability (the §3.1 strings).

| Column        | Type          | Notes                                           |
| ------------- | ------------- | ----------------------------------------------- |
| `id`          | `uuid` PK     |                                                 |
| `key`         | `text` UNIQUE | e.g. `student.profile.view`, `user.invite`, `*` |
| `description` | `text`        | What the permission grants                      |

**`role_permission`** — join table; which permissions each role bundles.

| Column          | Type      | Notes                                  |
| --------------- | --------- | -------------------------------------- |
| `role_id`       | `uuid` FK | → `role.id`, `ON DELETE CASCADE`       |
| `permission_id` | `uuid` FK | → `permission.id`, `ON DELETE CASCADE` |
|                 |           | PK = (`role_id`, `permission_id`)      |

**`app_user`** — the platform account (1:1 with the Supabase `auth.users` row).

| Column       | Type          | Notes                                      |
| ------------ | ------------- | ------------------------------------------ |
| `id`         | `uuid` PK     | = `auth.users.id` (Supabase auth identity) |
| `email`      | `text`        | From the social provider                   |
| `status`     | `text`        | `active` / `suspended`                     |
| `created_at` | `timestamptz` | default `now()`                            |

**`user_role`** — assigns roles to users, with optional college scope.

| Column             | Type           | Notes                                                                        |
| ------------------ | -------------- | ---------------------------------------------------------------------------- |
| `user_id`          | `uuid` FK      | → `app_user.id`, `ON DELETE CASCADE`                                         |
| `role_id`          | `uuid` FK      | → `role.id`                                                                  |
| `scope_college_id` | `uuid` FK NULL | → `college.id`; set for College Admins / Students, `NULL` for Owner/Employer |
|                    |                | PK = (`user_id`, `role_id`, `scope_college_id`)                              |

**Seed data (the four v1 roles → permissions):**

| `role.key`      | Permissions granted (`permission.key`)                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `owner`         | `*`                                                                                                                       |
| `student`       | `student.profile.manage_own`, `job.browse`, `job.apply`, `message.respond`                                                |
| `college_admin` | `college.students.view`, `college.analytics.view`, `college.profile.manage` (all scoped via `user_role.scope_college_id`) |
| `employer`      | `student.profile.search`, `student.profile.view`, `student.contact.initiate`, `job.post`, `job.applicants.view`           |

> **Authorization check:** resolve a user's permissions by joining `user_role → role → role_permission → permission`. Allow if any granted `permission.key` matches the required permission **or** equals `*`. For college-scoped permissions, additionally require the target's `college_id` to equal the grant's `scope_college_id` — enforced in Postgres via Row-Level Security.

---

## 4. Student profile data

A student profile contains four groups (all in v1):

1. **Core identity & academics** — name, photo, college (linked), degree/branch, graduation year, CGPA/grades.
2. **Skills & resume** — skills/tags, uploaded resume (PDF), portfolio / GitHub / LinkedIn links.
3. **Projects & experience** — project descriptions, internships, certifications, achievements.
4. **Job preferences** — desired roles, locations, job type (internship / full-time), "open to opportunities" status.

---

## 5. Key flows

### 5.1 Onboarding via invite (all roles)
There is no self-serve registration. For every role:
1. Owner creates an `Invite` specifying the **role** and any required scope (for a Student or College Admin, the **college**; for an Employer, the **organization**).
2. The invitee receives the invite (email link) and **signs in with a social provider** (Google, Facebook, LinkedIn, or GitHub).
3. On first successful sign-in the account is provisioned with the invite's role and scope, and the invite is marked consumed.
4. Owner can revoke a pending invite or, later, suspend/revoke the account.

Login providers are pluggable — additional integrations can be added later without changing the role model.

### 5.2 Employer ↔ Student discovery
Employer searches/filters all students → opens a full profile → initiates in-platform contact.

### 5.3 Contact privacy
Employers see full **profile** content immediately, but a student's **direct contact details (email/phone) are revealed only after the student responds to or consents** to the employer's outreach. All initial contact happens via in-platform messaging.

### 5.4 Jobs & applications
Employer posts a `Job` → students browse and apply → applications appear in the employer's applicant review with statuses → employer can contact applicants in-platform.

### 5.5 Owner administration
Owner manages the invite list (issue/revoke invites for any role), creates and edits colleges, manages users and roles, and views platform analytics.

---

## 6. Core entities

`User` (auth identity + role assignments) · `Permission` · `Role` (role↔permission mapping) · `Invite` (role + scope + status, issued by Owner) · `College` · `StudentProfile` · `Employer` (organization) · `Job` · `Application` · `Conversation` / `Message`.

---

## 7. Platform foundations (new capabilities required)

The current site is a static Next.js app with no DB or auth. This spec assumes the platform will add, built on **Supabase** (free tier for now):

- **Authentication** — Supabase Auth with social OAuth providers: **Google, Facebook, LinkedIn, GitHub** (more can be added later). No password or self-serve signup; sign-in is gated by an Owner-issued invite. The session carries the user's role(s).
- **Database** — Supabase Postgres for the entities in §6. Row-Level Security enforces the college-scoping rule (§3.1) at the data layer.
- **File storage** — Supabase Storage for resumes and photos.
- **Role-guarded API routes and per-role dashboards** in the Next.js app.

Supabase is the chosen foundation for v1; it can be revisited if scale needs change.

---

## 8. Out of scope / open questions

- **Messaging depth:** v1 assumes lightweight in-platform messaging for contact. Full threaded chat is a candidate to defer — *please confirm.*
- **Notifications** (email/in-app) are not specified yet.
- **Billing** for employers is not specified yet.

---

## 9. Suggested build order (decomposition)

This PRD spans several subsystems. Recommended delivery order, each its own implementation plan:

1. **Auth + RBAC foundation** — Supabase Auth (social OAuth), invite-gated sign-in, users, roles, permissions, route guards.
2. **Owner admin + invites** — invite issuing/revoking for all roles, college creation, user/role management.
3. **Colleges + Student profiles** — student onboarding via invite, profile CRUD + file uploads (Supabase Storage).
4. **Employer discovery** — search/filter, full profile view, in-platform contact + contact-privacy rule.
5. **Jobs & applications** — job posting, browse/apply, applicant review.
6. **College Admin dashboard** — scoped student views and analytics.

---

*Review this document and tell me what to change. Once approved, I'll turn the chosen first slice into a detailed implementation plan.*
