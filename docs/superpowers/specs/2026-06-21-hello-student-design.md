# Hello Student — Vercel App Design

**Date:** 2026-06-21
**Status:** Approved

## Purpose

A minimal Next.js app deployed on Vercel that demonstrates a UI page and a JSON
API side by side. It establishes the project structure so both the UI and the API
can grow within the same repository over time.

## Stack

- Next.js (App Router)
- TypeScript
- Deployed to Vercel (zero-config, auto-detected)

## Structure

```
app/
  page.tsx                 # UI: renders "Hello Student"
  layout.tsx               # Root layout
  api/
    students/
      route.ts             # API: GET -> { message: "Hello Students" }
package.json
tsconfig.json
next.config.ts
```

## Behavior

### UI — `/`
- Renders a page displaying **Hello Student**.
- Minimal styling; no client-side interactivity required.

### API — `GET /api/students`
- Returns HTTP 200 with JSON body:
  ```json
  { "message": "Hello Students" }
  ```

## Non-goals (YAGNI)

- No database, authentication, or external dependencies.
- No `vercel.json` — Next.js is auto-detected by Vercel.
- No tests beyond confirming the dev server serves the page and the API responds.

## Deployment

- Push to a Vercel-linked project, or run the `vercel` CLI.
- Next.js framework preset handles build and routing automatically.

## Future growth

- Additional UI pages added under `app/`.
- Additional API endpoints added under `app/api/`.
