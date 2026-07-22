# CareerLaunchpad — UI Style Guide (console / app surfaces)

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

| Use                                 | Class                                   | Resolves to                |
| ----------------------------------- | --------------------------------------- | -------------------------- |
| Primary action / links / focus ring | `bg-primary` `text-primary` `ring-ring` | brand blue `#2563eb`       |
| Accent / secondary emphasis         | `bg-accent` `text-accent-foreground`    | violet tint / brand violet |
| Page & card background              | `bg-background` `bg-card`               | surface                    |
| Muted panels / empty states         | `bg-muted` `bg-muted/40`                | neutral wash               |
| Body text                           | `text-foreground`                       | ink                        |
| Secondary text / captions           | `text-muted-foreground`                 | muted                      |
| Hairline borders                    | `border` `border-border`                | line                       |
| Errors                              | `text-destructive`                      | red                        |
| Charts                              | `--chart-1..5` (blue→violet ramp)       | via shadcn                 |

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
- **Tabs:** **coloured folder tabs** with a count in the trigger, e.g. `Active ({n})` — see **Tabs** below. Don't use the plain default pill `TabsList`.
- **Data grids:** `components/data-table.tsx` (TanStack) — never a hand-rolled table for sortable/filterable data.
- **Forms:** `Label` + `Input`/`Select` in `grid gap-1.5`; primary submit is `<Button>`; validation/error message in `text-destructive text-sm`. For a field users may not recognise (e.g. an ID/number), add a `<InfoTooltip>` next to the label explaining what it is and where to find it — see **Tooltips** below. Don't hide required guidance in a tooltip; it only supplements.
- **Empty state:** `text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm`.
- **Status:** `Badge` — `variant="default"` for live/positive, `"secondary"` otherwise.
- **Icons:** `lucide-react` at default sizes.

## Tabs

Use **connected folder tabs** everywhere — never the default pill `TabsList`. The segmented pills read as generic dev-tool controls; the folder tabs are far easier to recognise. Rules:

- **Every tab is bordered.** Two colours only — one for all inactive tabs, one for the active tab (don't colour-code per tab).
- **Inactive** tabs are **muted** (`bg-muted`, muted text) and **keep their bottom border** (the underline).
- **Active** tab is a **solid brand fill** (`bg-primary` + white label, bold) with **no bottom border**, so it connects into the page. Never make the *inactive* tab the filled/prominent one — that reads as selected to a first-time visitor.

`components/ui/tabs` with `variant="line"`; count in each trigger, e.g. `Upcoming ({n})`. The `line` variant forces `bg-transparent`, so the fills need the `!` important suffix. Shared trigger class:

```tsx
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

<Tabs defaultValue="…">
  <TabsList variant="line" className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 rounded-none border-b p-0">
    {TABS.map(([value, label]) => (
      <TabsTrigger key={value} value={value} className={TAB_CLS}>{label}</TabsTrigger>
    ))}
  </TabsList>
  {/* <TabsContent className="mt-4 min-w-0"> — min-w-0 lets a wide DataTable scroll
      inside its container instead of overflowing the page on mobile. */}
</Tabs>
```

## Dialogs & confirmations

Uniform across the app — the look is built into `components/ui/dialog.tsx`, so don't restyle per dialog:

- **`DialogHeader` is a tinted title band** (muted bg, bottom divider, rounded top); **`DialogFooter` is a divider band** with right-aligned actions. Put **only the title** (optionally a one-line subtitle) in `DialogHeader`; everything else — description, icon, fields — goes in the **body** between header and footer.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader>
    {/* body: <DialogDescription>, inputs, etc. */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={confirm}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **Destructive confirmation:** in the body, a `TriangleAlert` in a `bg-destructive/10 text-destructive` circle beside the description; primary action is `variant="destructive"`.
- **Irreversible deletes:** require **type-to-confirm** — an `Input` that must exactly match the resource name, with the confirm button `disabled` until it matches. Never use the browser `confirm()`/`alert()`.

## Tooltips (help / "what is this?")

Uniform across the app — the look is built into `components/ui/tooltip.tsx` (Radix base), so don't hand-roll a tooltip or restyle per use.

- **Deep-violet header, light body — via brand tokens.** A rounded light card (`bg-tooltip` soft violet-white, `text-tooltip-foreground`, `ring-1 ring-black/10` + `shadow-xl` for a crisp edge). The **header** is a **solid deep-violet band** — `bg-tooltip-header` / `text-tooltip-header-foreground`: the same brand family as the registration/console header, but deliberately **darker than its bright gradient** so the tooltip header never merges into that banner. The **body** stays light with dark readable text (`text-tooltip-foreground`). All four colours are defined once in `app/brand.css` (`--tooltip-*`) and mapped to Tailwind in `globals.css` — no ad-hoc hex in the component.
- **Always header + body.** Every rich tooltip carries a short bold header (its own band) and a one/two-line body — never a bare string. An `Info` icon sits beside the header by default.
- **Position: top, then auto-flip.** Defaults to `side="top"`; Radix `avoidCollisions` flips/shifts it when there's no room. Don't force a side unless you have a reason.
- **Works on touch.** The default trigger is a tappable ⓘ button — hover/focus on desktop, tap-to-toggle on mobile (hover doesn't exist on phones). Keep the important content visible in the UI; the tooltip only supplements it.

Use the `InfoTooltip` composite (default ⓘ trigger), or the `Tooltip`/`TooltipTrigger`/`TooltipContent` primitives with a custom `trigger`:

```tsx
import { InfoTooltip } from "@/components/ui/tooltip";

<Label className="flex items-center gap-1">
  APAAR / ABC ID
  <InfoTooltip title="APAAR / ABC ID">
    A 12-digit national student ID (Academic Bank of Credits) under NEP 2020,
    stored in your DigiLocker account.
  </InfoTooltip>
</Label>
```

## Governance

- Keep this doc and the code in sync — if a pattern changes, update here in the same PR.
- Adding a `components/ui/*` primitive: `npx shadcn@latest add <name>` (Radix base, per `components.json`).
- When unsure whether something is "on brand," it should read as **blue-primary, violet-accent, neutral surfaces, generous spacing, rounded cards** — consistent with the existing `/dashboard` pages.
