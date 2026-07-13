# CareerLaunchPad — UI Style Guide (console / app surfaces)

**Apply this to every app-surface UI change** (`/dashboard`, `/student`, `/employer`, `/mentor`, `/account`, auth). The marketing surface (`app/(marketing)`) keeps its own bespoke plain CSS — this guide does **not** govern it (see `CLAUDE.md` → "Styling: surface-scoped, NEVER mixed").

Full design rationale: `docs/superpowers/specs/2026-06-22-ui-style-guide-design.md`. This file is the short, enforceable rulebook.

## Non-negotiables

- **shadcn + Tailwind tokens only.** Build from `components/ui/*` primitives and theme tokens. **No ad-hoc hex, no inline `style={}`.** Colors/radii/shadows/type come from tokens.
- **Mobile-first, fully responsive.** Design for ~320px up; fluid units, responsive grids, stack on mobile. Wide tables scroll inside their own container — the page body never scrolls sideways. Verify at ~320–390px before claiming done.
- **One brand: blue → violet.** `#2563eb → #7c3aed`. It reaches the console through `app/brand.css` → shadcn tokens; use the tokens, not the raw hex.
- **Reuse first.** Compose existing primitives. A **new shared component (`components/brand/*`) is approval-gated** — ask before adding one.
- **Light + dark.** Every screen must work in both. Use semantic tokens (below), never fixed light-only colors.

## Tokens (what to type in classes)

Brand values live in `app/brand.css`; `app/globals.css` maps them onto shadcn tokens. In JSX, use the **Tailwind/shadcn token classes**, not the CSS vars directly:

| Use | Class | Resolves to |
| --- | --- | --- |
| Primary action / links / focus ring | `bg-primary` `text-primary` `ring-ring` | brand blue `#2563eb` |
| Accent / secondary emphasis | `bg-accent` `text-accent-foreground` | violet tint / brand violet |
| Page & card background | `bg-background` `bg-card` | surface |
| Muted panels / empty states | `bg-muted` `bg-muted/40` | neutral wash |
| Body text | `text-foreground` | ink |
| Secondary text / captions | `text-muted-foreground` | muted |
| Hairline borders | `border` `border-border` | line |
| Errors | `text-destructive` | red |
| Charts | `--chart-1..5` (blue→violet ramp) | via shadcn |

Raw brand vars (`var(--brand-gradient)`, `var(--brand-gradient-135)`) are reserved for **gradient accents** (CTAs, avatars, badges) where a token can't express a gradient — not for ordinary fills.

## Page pattern (copy this skeleton)

```tsx
<div className="mx-auto max-w-4xl">        {/* max-w-3xl forms · 4xl lists · 5xl wide/grids */}
  <header className="mb-6">
    <h1 className="text-2xl font-bold tracking-tight">Title</h1>
    <p className="text-muted-foreground mt-1 text-sm">One-line description.</p>
  </header>
  {/* sections in <Card>; tabs via <Tabs>; grids via DataTable */}
</div>
```

- **Section container:** `Card` + `CardContent` (`pt-6` when there's no `CardHeader`).
- **Tabs:** `components/ui/tabs` with a count in the trigger, e.g. `Active ({n})`.
- **Data grids:** `components/data-table.tsx` (TanStack) — never a hand-rolled table for sortable/filterable data.
- **Forms:** `Label` + `Input`/`Select` in `grid gap-1.5`; primary submit is `<Button>`; validation/error message in `text-destructive text-sm`.
- **Empty state:** `text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm`.
- **Status:** `Badge` — `variant="default"` for live/positive, `"secondary"` otherwise.
- **Icons:** `lucide-react` at default sizes.

## Governance

- Keep this doc and the code in sync — if a pattern changes, update here in the same PR.
- Adding a `components/ui/*` primitive: `npx shadcn@latest add <name>` (Radix base, per `components.json`).
- When unsure whether something is "on brand," it should read as **blue-primary, violet-accent, neutral surfaces, generous spacing, rounded cards** — consistent with the existing `/dashboard` pages.
