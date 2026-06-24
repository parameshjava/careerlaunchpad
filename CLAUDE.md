# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CareerLaunchPad is a platform that bridges the gap between academic learning and industry expectations ("College to Corporate"), built on **Next.js 15 (App Router) + React 19 + TypeScript**. It has **two distinct surfaces**:

- **Marketing site** (`/`, in the `app/(marketing)` route group) — the bespoke landing page. Content-and-presentation work: layout, copy, visual polish, hand-authored SVG.
- **Application console** (`/dashboard`, etc.) — the enterprise app surfaces (student management, data grids), built with **Tailwind CSS v4 + shadcn/ui (Radix base) + TanStack Table**.

The only backend so far is one trivial route handler (`app/api/students/route.ts`); there is no auth or DB yet.

**Mobile-first is the primary purpose.** This is a mobile-first site — most visitors arrive on phones, so full responsive design is the top requirement, not an afterthought. Every change must look and work correctly across the full range of viewports (small phones ~320px up through tablet and desktop). A change is not complete until it has been verified on a narrow mobile width, and "looks right on desktop" alone never counts as done.

## Working Principles

- **API design first — for every form.** Before building or changing *any* form (marketing or console), design the API contract **first**: the endpoint(s), the request/response JSON shape, validation rules, and the exact DB tables/columns it reads and writes. Build the form UI against that contract and keep the two in lockstep — forms collect and submit data **through** the API, never bypassing it, and they must round-trip (a record created via the form can be re-fetched and edited later through the same API). Fetch reference/option data (dropdowns, chips) from the API / `ref_*` tables rather than hard-coding it in the component. When a form's fields change, update the API contract **and** the underlying schema in the same change so the form, API, and DB never drift apart.
- **Mobile-first, fully responsive — always.** Design and verify for phones first, then scale up. Use fluid/relative units, responsive grids, and breakpoints so layouts reflow and stack gracefully; nothing should overflow horizontally or require zooming on small screens. Check narrow widths (~320–390px) on every UI change before claiming it works.
- **Verify in the browser, not just the build.** There is no test suite, so a passing build does not prove a UI change looks right. Run the dev server and render the page at both mobile and desktop widths (screenshots help) before claiming a visual change is done.
- **Keep copy in data, not JSX.** Section content (founders, core values, vision/mission, journey steps) lives in plain arrays at the top of each component. Edit the array, not the markup, when changing content.
- **Use the right styling system per surface.** The two surfaces are styled differently and must stay separated (see Architecture):
  - **Marketing** (`app/(marketing)`) → plain global CSS in `app/landing.css`, semantic class names (`.navbar`, `.founder-card`, `.jf-step`). Do **not** add Tailwind utilities here.
  - **Application** (`/dashboard`, etc.) → **Tailwind v4 + shadcn/ui**. Build from shadcn primitives and theme tokens (`bg-background`, `text-muted-foreground`, `border-border`); avoid ad-hoc hex values. Add components via `npx shadcn@latest add <name>`. Use **TanStack Table** for data grids (see `components/data-table.tsx`).
- **Run lint and build before committing**, since CI/verification relies on them:

```bash
npm run lint      # next lint (ESLint)
npm run build     # production build — also type-checks
```

## Commands

```bash
npm run dev      # dev server at http://localhost:3000
npm run build    # production build (runs lint + type-check)
npm run start    # serve the production build
npm run lint     # ESLint via next lint
npx tsc --noEmit # type-check only
```

**No test framework is configured** — there is no `test` script and no runner installed. Verify changes by building and rendering the affected page/section.

## Architecture

### Two surfaces, two route trees

`app/layout.tsx` is the **root layout**: it sets metadata/viewport/JSON-LD, imports `app/globals.css` (Tailwind + shadcn theme), and loads the Geist font on `<html>`. It deliberately does **not** render the marketing navbar.

- **Marketing** — `app/(marketing)/` route group. `(marketing)/layout.tsx` imports `app/landing.css` and renders the marketing `<Navbar/>`; `(marketing)/page.tsx` is the landing page assembled from `app/components/`:
  - `Navbar` — the marketing copy of the shared brand bar (logo + wordmark + tagline + "Get Started" CTA); kept pixel-matched to `SiteHeader` — see "The top navbar" below
  - `JourneyGraphic` — the student-journey flow diagram (hand-authored inline SVG / animated CSS)
  - `FoundersMessage` — founder & co-founder cards, the "Core Values" tile, and the Vision/Mission cards
  - `FounderAvatar` — a `"use client"` component that falls back from a profile photo to an initials badge on image error
- **Application** — `app/dashboard/` (and future app routes). `dashboard/layout.tsx` is the token-themed app shell; its topbar is the shared `<SiteHeader/>` (see below) with the console nav links and account menu passed into its slots. UI is composed from `components/ui/*` (shadcn) and `components/data-table.tsx` (generic TanStack Table grid); `components/students/columns.tsx` defines the students grid; sample data is in `lib/students-data.ts`.

The lone API endpoint is `app/api/students/route.ts`.

### The top navbar — ONE bar, every surface ("one navbar, two impls")

The brand navbar must look **identical on every page** — marketing, auth, student,
employer, and the dashboard console. It is the same logo + wordmark + tagline lockup
everywhere; only the trailing action and (on the console) the nav links change. Do
**not** introduce a third navbar, a "Console"-suffixed variant, or per-page restyling
of the bar — that drift is exactly what this rule prevents.

Because the two surfaces can't share one component (marketing is plain CSS, app is
Tailwind — see Styling rule below), the navbar exists as **two implementations that
are kept pixel-matched**:

- **Marketing** → `app/components/Navbar.tsx` + `components/brand/Brand.tsx`, styled by
  `.navbar` / `.brand*` / `.nav-cta` in `app/landing.css`.
- **All app surfaces** (auth, student, employer, dashboard) → `components/brand/SiteHeader.tsx`
  (Tailwind). Per-surface content goes in its two slots, never by forking the bar:
  - `nav` — in-bar links (the console passes Students/Import/Users here).
  - `right` — trailing action: omit → "Get Started" CTA; `null` → brand only (login);
    a node → custom (e.g. email + Sign out on signed-in pages).

**Keeping them matched:** the lockup dimensions are shared `clamp()` values — logo
`clamp(40px,9vw,84px)`, wordmark `clamp(1.15rem,4.5vw,2.5rem)`, tagline
`clamp(0.72rem,2.3vw,1rem)`, brand gradient `#2563eb→#7c3aed`. These are duplicated in
`SiteHeader.tsx` and the `.brand*` rules in `landing.css`. **If you change the lockup
in one, change the other to match.** The tagline is **hidden below 600px** in both
(`min-[600px]:block` in SiteHeader; an `@media (max-width:600px)` rule in landing.css)
so the right-side action always fits on phones without horizontal overflow.

### Styling: surface-scoped, NEVER mixed

This is the most important architectural rule — the two styling systems must not bleed into each other:

- **`app/globals.css`** (loaded by the root layout, applies everywhere) = Tailwind v4 + shadcn theme tokens + `@import "./shadcn-tailwind.css"` (vendored shadcn nova base: keyframes + `data-state` variants). PostCSS is configured in `postcss.config.mjs`.
- **`app/landing.css`** = the bespoke marketing CSS (plain semantic class names: `.navbar`, `.founder-card`, `.jf-step`, …). It is imported **only** in `(marketing)/layout.tsx`, so its global reset (`* { margin:0 }`) and `body { background:#f6f8fb }` load on marketing routes only and never override Tailwind utilities on app routes. Brand identity: blue→violet gradient (`#2563eb` → `#7c3aed`).
- For app surfaces, use **shadcn components + Tailwind utilities/tokens**. Add components with `npx shadcn@latest add <name>` (configured for the **Radix** base in `components.json` — do not switch to base-ui). Theme tokens live in `globals.css` (`:root` / `.dark`).

### Server vs. client components

Components are React Server Components by default. Client components (`"use client"`) include `FounderAvatar.tsx` (marketing) and the data-grid pieces (`components/data-table.tsx`, `components/students/columns.tsx`) since TanStack Table uses hooks.

### Favicon pipeline (non-obvious)

The favicon is `app/icon.png` (Next.js App Router file convention — it auto-emits the `<link rel="icon">`; do **not** also set `metadata.icons`, or you get duplicates). It is **generated from `public/logo.jpeg`**, not used directly: the source JPEG has a white background and JPEG cannot store transparency, so pointing the favicon at the raw `.jpeg` puts a white square in the browser tab. The committed `app/icon.png` / `public/favicon.ico` are transparent PNG/ICO versions produced by a Pillow (Python) script that trims the margin and flood-fills the background white to transparent. Regenerate via that processing — never swap in the raw JPEG.

### Founder photos

Profile photos live in `public/founders/` with filenames referenced in the `founders` array in `FoundersMessage.tsx` (e.g. `lakshmi-narayana.jpg`). If a file is missing, `FounderAvatar` shows the initials instead, so an absent photo degrades gracefully rather than breaking the page.

## Task Handling Guidelines

- **Changing marketing UI/layout** → edit the rule in `app/landing.css` and the relevant component in `app/components/`; run `npm run dev` and render to confirm. Card grids are responsive (`founders-grid`, `vision-mission`) and stack on mobile — check narrow widths too.
- **Building app/console UI** → compose shadcn primitives + Tailwind tokens under `app/dashboard/` (or new app routes); add missing components via `npx shadcn@latest add <name>`. For tables use the `DataTable` in `components/data-table.tsx`. Wide grids should scroll inside their own container — never let the page scroll sideways.
- **Changing the top navbar** → it must stay identical on every surface. Edit **both** `components/brand/SiteHeader.tsx` (app surfaces) **and** the `.navbar`/`.brand*`/`.nav-cta` rules in `app/landing.css` + `app/components/Navbar.tsx` (marketing) so they keep matching — see Architecture → "The top navbar". Per-page changes belong in `SiteHeader`'s `nav`/`right` slots, not in a new navbar. Verify the right-side action stays visible (no horizontal overflow) at ~320–390px.
- **Changing copy/content** → edit the data array at the top of the component (e.g. `founders`, `teamValues`, `visionMission`), not the JSX loop.
- **Working with the logo or favicon** → remember JPEG has no transparency; produce a transparent PNG/ICO rather than referencing the JPEG directly.
- **Adding/replacing founder photos** → drop the file in `public/founders/` matching the path in the `founders` array; the avatar surfaces it automatically and falls back to initials if absent.

## Conventions

- Import alias `@/*` maps to the repo root (`tsconfig.json`), so shadcn resolves `@/components`, `@/lib/utils`, etc.
- On the marketing surface, match the surrounding plain-CSS style and naming. On app surfaces, match shadcn/Tailwind conventions (the `cn()` helper in `lib/utils.ts`, theme tokens, `new-york`-style components). Keep comment density consistent with the file you are editing.

## Branches

`main` is the single source of truth. Branch feature work off `main`, merge it back into `main`, and delete the feature branch once merged — no long-lived parallel branches.
