// One source of truth for chart colour, shared by every components/analytics/*
// chart. Before this existed the three analytics components each carried their
// own hardcoded hex array, and the first two slots of that array were brand blue
// and brand violet — the two ends of the same gradient, adjacent, which a
// deuteranope reads as one colour (CVD ΔE 0.4, normal-vision ΔE 12.4).
//
// The values live in app/globals.css as --cl-* tokens and are referenced here as
// var(), for two reasons: dark mode swaps them with no JS (there is no theme
// provider to read), and recharts passes fill/stroke straight through to SVG
// presentation attributes, where var() resolves.
//
// Validated with the dataviz validator against both surfaces before shipping:
//   node scripts/validate_palette.js \
//     "#2563eb,#10b981,#7c3aed,#f59e0b,#06b6d4,#ec4899,#6366f1,#f97316" \
//     --mode light
//   node scripts/validate_palette.js \
//     "#3b82f6,#059669,#8b5cf6,#d97706,#0891b2,#ec4899,#6366f1,#ea580c" \
//     --mode dark --surface "#171717"
// Both: all six checks pass. Light carries a contrast WARN on four slots
// (emerald/amber/cyan/orange fall under 3:1 on white), which obliges the relief
// rule — every chart here ships direct value labels AND a table view.
//
// Rules that come with using this file:
//   - Categorical is IDENTITY. Assign a slot per entity (a subject), never by
//     rank, so re-sorting or filtering never repaints a series.
//   - Never cycle past slot 8. Fold the tail into "Other", or use small
//     multiples. `categorical()` wraps only so a stray 9th series is visible
//     rather than invisible; it is not a licence to render 12 series.
//   - Sequential is MAGNITUDE: one hue. Never use it for identity.
//   - Status is STATE and is reserved: never a series colour, and always paired
//     with an icon or a label so colour is not the only encoding.

/** Categorical slots, in fixed order. Identity only. */
export const CATEGORICAL = [
  "var(--cl-cat-1)",
  "var(--cl-cat-2)",
  "var(--cl-cat-3)",
  "var(--cl-cat-4)",
  "var(--cl-cat-5)",
  "var(--cl-cat-6)",
  "var(--cl-cat-7)",
  "var(--cl-cat-8)",
] as const;

/** How many distinct series this palette is validated for. */
export const CATEGORICAL_MAX = CATEGORICAL.length;

/** Slot i, wrapping. Prefer folding a long tail into "Other" over wrapping. */
export function categorical(i: number): string {
  return CATEGORICAL[((i % CATEGORICAL_MAX) + CATEGORICAL_MAX) % CATEGORICAL_MAX];
}

/** The brand hue — the right choice for a single-series chart (no legend needed). */
export const BRAND = "var(--cl-cat-1)";

/** The comparison baseline — the "not yours / everyone else" fill. A recessive
 *  area colour, NOT a text token: --muted-foreground sits at 3.3:1 on white, which
 *  makes a large fill fight the brand hue instead of receding behind it. */
export const NEUTRAL = "var(--cl-neutral)";

/** The same comparison role, but for THIN marks — a legend ring, a 1px outline.
 *  A 1.5px stroke needs far more contrast than a large fill to register at all, so
 *  it takes a text-weight ink while NEUTRAL stays recessive for areas. (Using the
 *  area colour on an 8px ring made it read as a missing marker.) */
export const NEUTRAL_MARK = "var(--muted-foreground)";

/** Status colours. Reserved; ship with an icon or label, never colour alone. */
export const STATUS = {
  weak: "var(--cl-status-weak)",
  good: "var(--cl-status-good)",
} as const;

/** Sequential ramp, low -> high. Six steps + a neutral for "no data". */
export const SEQUENTIAL = [
  "var(--cl-seq-0)",
  "var(--cl-seq-1)",
  "var(--cl-seq-2)",
  "var(--cl-seq-3)",
  "var(--cl-seq-4)",
  "var(--cl-seq-5)",
] as const;
export const SEQUENTIAL_NONE = "var(--cl-seq-none)";

// Upper bounds of each sequential step. The 40 boundary is the platform default
// pass mark, so a "did they pass?" read lines up with a step edge.
const SEQ_BOUNDS = [20, 40, 55, 70, 85, 101] as const;

/** Which sequential step a percent falls in, plus the ink that reads on it. */
export function sequentialStep(pct: number): { fill: string; ink: string; index: number } {
  const i = SEQ_BOUNDS.findIndex((b) => pct < b);
  const index = i === -1 ? SEQUENTIAL.length - 1 : i;
  return {
    fill: SEQUENTIAL[index],
    // the top three steps are dark enough (light mode) / bright enough (dark
    // mode) that the label needs the opposite ink
    ink: index >= 3 ? "var(--cl-seq-ink-hi)" : "var(--cl-seq-ink-lo)",
    index,
  };
}

/** Labels for the sequential legend, aligned to SEQ_BOUNDS. */
export const SEQUENTIAL_LABELS = ["0–20", "20–40", "40–55", "55–70", "70–85", "85–100"] as const;

/** recharts tooltip chrome, themed off the popover tokens. */
export const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

/** Axis ticks stay recessive — ink tokens, never a series colour. */
export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;

/** Grid + hover cursor, both recessive. */
export const GRID_STROKE = "var(--border)";
export const HOVER_CURSOR = { fill: "var(--muted)", fillOpacity: 0.5 } as const;
