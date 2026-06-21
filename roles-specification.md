# CareerLaunchPad — Roles & Permissions Specification

**Status:** Draft for review
**Date:** 2026-06-21
**Scope:** Product specification (PRD) for the platform's roles, permissions, and the flows that connect them. Captures the full vision; ends with a suggested build order for incremental delivery.

---

## 1. Overview

CareerLaunchPad is evolving from a static marketing site into a multi-tenant platform that bridges college students and employers. Today the site has no database and no authentication — this spec defines the role system that the platform will be built around.

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
- Approve or reject College and Employer registrations.
- Manage all users (view, suspend, edit, assign roles).
- Define and edit roles and their permission bundles.
- View platform-wide analytics.

### 2.2 Student
Any college student. **Self-serve signup** — no approval needed — but a student **must select an already-approved college** at registration; students whose college is not yet on the platform cannot register until it is.

Capabilities:
- Create and manage their own profile (see §4 for fields).
- Toggle "open to opportunities" discoverability.
- Browse and apply to jobs.
- Receive and respond to in-platform contact from employers.
- Control when their contact details (email/phone) are revealed (see §5.3).

### 2.3 College Admin
Staff representing a single college. **Registers, then must be approved by an Owner.** Scoped strictly to their own college — cannot see other colleges' data.

Capabilities:
- View and manage all students belonging to their college.
- View college-level analytics (e.g. registered students, placement activity).
- Manage college profile/details.

### 2.4 Employer
An organization seeking talent. **Registers, then must be approved by an Owner** before gaining access.

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

| Permission | Owner | Student | College Admin | Employer |
|------------|:-----:|:-------:|:-------------:|:--------:|
| `user.manage` (all users) | ✅ | | | |
| `role.manage` | ✅ | | | |
| `college.approve` / `employer.approve` | ✅ | | | |
| `analytics.platform.view` | ✅ | | | |
| `student.profile.manage_own` | | ✅ | | |
| `job.browse` / `job.apply` | | ✅ | | |
| `message.respond` | | ✅ | | |
| `college.students.view` (own college) | | | ✅ | |
| `college.analytics.view` (own college) | | | ✅ | |
| `college.profile.manage` (own college) | | | ✅ | |
| `student.profile.search` | | | | ✅ |
| `student.profile.view` (full) | | | | ✅ |
| `student.contact.initiate` | | | | ✅ |
| `job.post` / `job.applicants.view` | | | | ✅ |
| `*` (wildcard) | ✅ | | | |

> Scoping note: College Admin permissions are **resource-scoped** to the admin's own college; the authorization layer must enforce college ownership, not just the permission string.

---

## 4. Student profile data

A student profile contains four groups (all in v1):

1. **Core identity & academics** — name, photo, college (linked), degree/branch, graduation year, CGPA/grades.
2. **Skills & resume** — skills/tags, uploaded resume (PDF), portfolio / GitHub / LinkedIn links.
3. **Projects & experience** — project descriptions, internships, certifications, achievements.
4. **Job preferences** — desired roles, locations, job type (internship / full-time), "open to opportunities" status.

---

## 5. Key flows

### 5.1 Onboarding & verification
- **Student:** self-serve signup → must pick an approved college → build profile → active immediately.
- **College Admin / Employer:** register → an `ApprovalRequest` is created → Owner reviews in an approval queue → on approval, access is granted; on rejection, account stays inactive with a reason.

### 5.2 Employer ↔ Student discovery
Employer searches/filters all students → opens a full profile → initiates in-platform contact.

### 5.3 Contact privacy
Employers see full **profile** content immediately, but a student's **direct contact details (email/phone) are revealed only after the student responds to or consents** to the employer's outreach. All initial contact happens via in-platform messaging.

### 5.4 Jobs & applications
Employer posts a `Job` → students browse and apply → applications appear in the employer's applicant review with statuses → employer can contact applicants in-platform.

### 5.5 Owner administration
Owner works an approval queue (colleges, employers), manages users and roles, and views platform analytics.

---

## 6. Core entities

`User` (auth identity + role assignments) · `Permission` · `Role` (role↔permission mapping) · `College` · `StudentProfile` · `Employer` (organization) · `Job` · `Application` · `Conversation` / `Message` · `ApprovalRequest`.

---

## 7. Platform foundations (new capabilities required)

The current site is a static Next.js app with no DB or auth. This spec assumes the platform will add:

- **Authentication** — login/session with the user's role(s) attached.
- **Database** — relational store (e.g. Postgres via the Vercel Marketplace, such as Neon) for the entities in §6.
- **File storage** — resumes and photos (e.g. Vercel Blob).
- **Role-guarded API routes and per-role dashboards.**

These are stated as requirements; exact technology choices are confirmed at implementation-plan time.

---

## 8. Out of scope / open questions

- **Messaging depth:** v1 assumes lightweight in-platform messaging for contact. Full threaded chat is a candidate to defer — *please confirm.*
- **Notifications** (email/in-app) are not specified yet.
- **Billing** for employers is not specified yet.

---

## 9. Suggested build order (decomposition)

This PRD spans several subsystems. Recommended delivery order, each its own implementation plan:

1. **Auth + RBAC foundation** — users, roles, permissions, login, route guards.
2. **Colleges + Student profiles** — college list, student signup with college pick, profile CRUD + file uploads.
3. **Owner admin** — approval queue, user/role management.
4. **Employer discovery** — search/filter, full profile view, in-platform contact + contact-privacy rule.
5. **Jobs & applications** — job posting, browse/apply, applicant review.
6. **College Admin dashboard** — scoped student views and analytics.

---

*Review this document and tell me what to change. Once approved, I'll turn the chosen first slice into a detailed implementation plan.*
