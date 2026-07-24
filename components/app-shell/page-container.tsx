// The one width wrapper for every app-surface page. Pages pick a semantic
// width tier instead of hand-choosing `max-w-*`, so the content column no
// longer jumps wider/narrower as you navigate. Sits inside ConsoleShell's own
// (generous) `max-w-screen-2xl` cap, so the tier below is always the effective
// width.
//
//   full     → dashboards, analytics, lists, tables, grids (use the desktop width)
//   wide     → mixed detail + grid pages
//   reading  → detail / reading pages (comfortable line length)
//   form     → single-column forms (kept narrow for readability)
//
// See docs/STYLE_GUIDE.md → "Page pattern". Prefer this over a bare
// `mx-auto max-w-*` on new pages.
import { cn } from "@/lib/utils";

const WIDTHS = {
  full: "max-w-screen-2xl",
  wide: "max-w-5xl",
  reading: "max-w-4xl",
  form: "max-w-3xl",
} as const;

export type PageWidth = keyof typeof WIDTHS;

export function PageContainer({
  variant = "full",
  className,
  children,
}: {
  variant?: PageWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto w-full", WIDTHS[variant], className)}>{children}</div>;
}
