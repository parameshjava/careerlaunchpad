// The CareerLaunchpad round company seal — a print-safe SVG "ink stamp" for
// official documents (fee receipts). Self-contained (no external font/image) so
// it renders identically on screen and paper.
//
// A simple single-ring seal: two concentric circles with the company name curved
// across the top and the region across the bottom, separated by a star on each
// side, and an EMPTY centre. Single royal-blue ink, like a wet stamp.

const BLUE = "#1d4ed8";

// Text baseline radius (viewBox 0 0 200 200, centre 100,100). Top arc runs
// left→right over the top; bottom arc runs right→left under the bottom so its
// text stays upright to the reader.
const R = 86;
const arcTop = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;
const arcBottom = `M ${100 + R} 100 A ${R} ${R} 0 0 1 ${100 - R} 100`;

export function CompanySeal({
  size = 132,
  companyName = "CAREER LAUNCHPAD",
  region = "ANDHRA PRADESH",
  className,
}: {
  size?: number;
  /** Curved across the top of the ring. */
  companyName?: string;
  /** Curved across the bottom of the ring. */
  region?: string;
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

      {/* Two rings; the centre stays empty. */}
      <circle cx="100" cy="100" r="96" fill="none" stroke={BLUE} strokeWidth="2.5" />
      <circle cx="100" cy="100" r="74" fill="none" stroke={BLUE} strokeWidth="2" />

      <text fontFamily={font} fontSize="14" fontWeight="800" letterSpacing="2">
        <textPath href="#cl-seal-top" startOffset="50%" textAnchor="middle">
          {companyName}
        </textPath>
      </text>
      <text fontFamily={font} fontSize="14" fontWeight="800" letterSpacing="2">
        <textPath href="#cl-seal-bottom" startOffset="50%" textAnchor="middle">
          {region}
        </textPath>
      </text>

      {/* Star separators at the sides, between the top and bottom labels. */}
      <text x="14" y="100" fontSize="16" textAnchor="middle" dominantBaseline="central">★</text>
      <text x="186" y="100" fontSize="16" textAnchor="middle" dominantBaseline="central">★</text>
    </svg>
  );
}
