// The CareerLaunchpad round company seal — a print-safe SVG "ink stamp" for
// official documents (fee receipts). Self-contained (no external font/image) so
// it renders identically on screen and paper.
//
// A simple single-ring seal: two concentric circles with the company name curved
// across the top and the region across the bottom (centred in the band), a star
// on each side, and the payment date in the centre. Single royal-blue ink.

import { PRINT_INK } from "@/lib/print-brand";

const BLUE = PRINT_INK.sealBlue;

// Circle radii (viewBox 0 0 200 200, centre 100,100). The text baseline sits on
// the mid-line of the band between the two circles; with dominant-baseline:central
// the (larger) glyphs stay centred in the band.
const OUTER = 97;
const INNER = 71;
const R = (OUTER + INNER) / 2; // 84
const arcTop = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;
const arcBottom = `M ${100 + R} 100 A ${R} ${R} 0 0 1 ${100 - R} 100`;

export function CompanySeal({
  size = 132,
  companyName = "CAREER LAUNCHPAD",
  region = "ANDHRA PRADESH",
  /** Shown in the centre of the seal (e.g. the payment date). */
  centerText,
  className,
}: {
  size?: number;
  companyName?: string;
  region?: string;
  centerText?: string;
  className?: string;
}) {
  const font = "ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={`${companyName} official seal`}
      className={className}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      fill={BLUE}
    >
      <defs>
        <path id="cl-seal-top" d={arcTop} fill="none" />
        <path id="cl-seal-bottom" d={arcBottom} fill="none" />
      </defs>

      <circle cx="100" cy="100" r={OUTER} fill="none" stroke={BLUE} strokeWidth="3" />
      <circle cx="100" cy="100" r={INNER} fill="none" stroke={BLUE} strokeWidth="2" />

      <text fontFamily={font} fontSize="20" fontWeight="800" letterSpacing="1" dominantBaseline="central">
        <textPath href="#cl-seal-top" startOffset="50%" textAnchor="middle">
          {companyName}
        </textPath>
      </text>
      <text fontFamily={font} fontSize="20" fontWeight="800" letterSpacing="1" dominantBaseline="central">
        <textPath href="#cl-seal-bottom" startOffset="50%" textAnchor="middle">
          {region}
        </textPath>
      </text>

      {/* Star separators at the sides, between the top and bottom labels. */}
      <text x={100 - R} y="100" fontSize="22" textAnchor="middle" dominantBaseline="central">★</text>
      <text x={100 + R} y="100" fontSize="22" textAnchor="middle" dominantBaseline="central">★</text>

      {/* Centre: the payment date. */}
      {centerText && (
        <text
          x="100"
          y="100"
          fontFamily={font}
          fontSize="15"
          fontWeight="800"
          letterSpacing="0.5"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {centerText}
        </text>
      )}
    </svg>
  );
}
