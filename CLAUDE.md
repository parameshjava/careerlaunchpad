# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CareerLaunchPad is a single-page marketing/landing site for a platform that bridges the gap between academic learning and industry expectations ("College to Corporate"). It is built on **Next.js 15 (App Router) + React 19 + TypeScript**. There is no database, authentication, or state management layer; the only backend is one trivial route handler. Treat this as a content-and-presentation project: most work is layout, copy, and visual polish.

## Working Principles

- **Verify in the browser, not just the build.** There is no test suite, so a passing build does not prove a UI change looks right. Run the dev server and render the page (screenshots help) before claiming a visual change is done.
- **Keep copy in data, not JSX.** Section content (founders, core values, vision/mission, journey steps) lives in plain arrays at the top of each component. Edit the array, not the markup, when changing content.
- **Don't introduce a styling framework.** Styling is intentionally plain global CSS (see Architecture). Add CSS rules; do not reach for Tailwind, CSS Modules, or CSS-in-JS.
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

The page is assembled in `app/page.tsx` from section components in `app/components/`:

- `Navbar` — brand lockup (logo + wordmark + tagline) and the "Get Started" CTA
- `JourneyGraphic` — the student-journey flow diagram (hand-authored inline SVG / animated CSS)
- `FoundersMessage` — founder & co-founder cards, the "Core Values" tile, and the Vision/Mission cards
- `FounderAvatar` — the only client component (see below)

`app/layout.tsx` is the root layout (metadata, global CSS import, `<Navbar/>`). The lone API endpoint is `app/api/students/route.ts`.

### Styling: plain global CSS only

**All styling lives in the single file `app/globals.css`**, addressed by plain class names (`.navbar`, `.founder-card`, `.jf-step`, …). No Tailwind, no CSS Modules, no styled-components. When editing UI, add/adjust rules in `globals.css` and reference them via `className`. The brand identity is a blue→violet gradient (`#2563eb` → `#7c3aed`) on a `#f6f8fb` background.

### Server vs. client components

Components are React Server Components by default. The only `"use client"` component is `FounderAvatar.tsx`, which uses `useState` to fall back from a profile photo to an initials badge when the image fails to load.

### Favicon pipeline (non-obvious)

The favicon is `app/icon.png` (Next.js App Router file convention — it auto-emits the `<link rel="icon">`; do **not** also set `metadata.icons`, or you get duplicates). It is **generated from `public/logo.jpeg`**, not used directly: the source JPEG has a white background and JPEG cannot store transparency, so pointing the favicon at the raw `.jpeg` puts a white square in the browser tab. The committed `app/icon.png` / `public/favicon.ico` are transparent PNG/ICO versions produced by a Pillow (Python) script that trims the margin and flood-fills the background white to transparent. Regenerate via that processing — never swap in the raw JPEG.

### Founder photos

Profile photos live in `public/founders/` with filenames referenced in the `founders` array in `FoundersMessage.tsx` (e.g. `lakshmi-narayana.jpg`). If a file is missing, `FounderAvatar` shows the initials instead, so an absent photo degrades gracefully rather than breaking the page.

## Task Handling Guidelines

- **Changing UI/layout** → edit the rule in `app/globals.css` and the relevant component; run `npm run dev` and render to confirm. Card grids are responsive (`founders-grid`, `vision-mission`) and stack on mobile — check narrow widths too.
- **Changing copy/content** → edit the data array at the top of the component (e.g. `founders`, `teamValues`, `visionMission`), not the JSX loop.
- **Working with the logo or favicon** → remember JPEG has no transparency; produce a transparent PNG/ICO rather than referencing the JPEG directly.
- **Adding/replacing founder photos** → drop the file in `public/founders/` matching the path in the `founders` array; the avatar surfaces it automatically and falls back to initials if absent.

## Conventions

- Import alias `@/*` maps to the repo root (`tsconfig.json`).
- Match the surrounding plain-CSS style and naming; keep comment density consistent with the file you are editing.

## Branches

`main` is the single source of truth. Branch feature work off `main`, merge it back into `main`, and delete the feature branch once merged — no long-lived parallel branches.
