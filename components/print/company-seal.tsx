// The CareerLaunchpad round company seal — a print-safe SVG "ink stamp" for
// official documents (fee receipts, letters). Self-contained (no external
// font/image) so it renders identically on screen and paper.
//
// Classic double-ring seal: an outer ring carrying the company name (top arc)
// and region (bottom arc) separated by stars at the sides, an inner ring with
// the company type (top) and city (bottom), and a monogram at the centre.
// Single royal-blue ink, matching a wet stamp.

const BLUE = "#1d4ed8";

// Arc baselines (viewBox is 0 0 200 200, centre 100,100). Top arcs run
// left→right over the top; bottom arcs run right→left under the bottom so their
// text stays upright to the reader (the standard textPath seal technique).
const OUTER = 86;
const INNER = 52;
const arcTop = (r: number) => `M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`;
const arcBottom = (r: number) => `M ${100 + r} 100 A ${r} ${r} 0 0 1 ${100 - r} 100`;

export function CompanySeal({
  size = 132,
  companyName = "CAREER LAUNCHPAD",
  region = "ANDHRA PRADESH",
  typeLine = "CAREER SERVICES",
  city = "GUNTUR",
  monogram = "CL",
  centerLabel = "OFFICIAL SEAL",
  className,
}: {
  size?: number;
  /** Outer ring, top arc. */
  companyName?: string;
  /** Outer ring, bottom arc. */
  region?: string;
  /** Inner ring, top arc. */
  typeLine?: string;
  /** Inner ring, bottom arc. */
  city?: string;
  /** Centre emblem. */
  monogram?: string;
  /** Small caps under the monogram. */
  centerLabel?: string;
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
        <path id="cl-seal-outer-top" d={arcTop(OUTER)} fill="none" />
        <path id="cl-seal-outer-bottom" d={arcBottom(OUTER)} fill="none" />
        <path id="cl-seal-inner-top" d={arcTop(INNER)} fill="none" />
        <path id="cl-seal-inner-bottom" d={arcBottom(INNER)} fill="none" />
      </defs>

      {/* Rings */}
      <circle cx="100" cy="100" r="97" fill="none" stroke={BLUE} strokeWidth="2.5" />
      <circle cx="100" cy="100" r="76" fill="none" stroke={BLUE} strokeWidth="3" />
      <circle cx="100" cy="100" r="60" fill="none" stroke={BLUE} strokeWidth="1.5" />
      <circle cx="100" cy="100" r="44" fill="none" stroke={BLUE} strokeWidth="1.5" />

      {/* Outer ring text */}
      <text fontFamily={font} fontSize="13.5" fontWeight="800" letterSpacing="1.6">
        <textPath href="#cl-seal-outer-top" startOffset="50%" textAnchor="middle">
          {companyName}
        </textPath>
      </text>
      <text fontFamily={font} fontSize="13.5" fontWeight="800" letterSpacing="1.6">
        <textPath href="#cl-seal-outer-bottom" startOffset="50%" textAnchor="middle">
          {region}
        </textPath>
      </text>

      {/* Side stars separating the two outer labels */}
      <text x="14" y="100" fontSize="15" textAnchor="middle" dominantBaseline="central">★</text>
      <text x="186" y="100" fontSize="15" textAnchor="middle" dominantBaseline="central">★</text>

      {/* Inner ring text */}
      <text fontFamily={font} fontSize="8" fontWeight="700" letterSpacing="1.4">
        <textPath href="#cl-seal-inner-top" startOffset="50%" textAnchor="middle">
          {typeLine}
        </textPath>
      </text>
      <text fontFamily={font} fontSize="8" fontWeight="700" letterSpacing="1.4">
        <textPath href="#cl-seal-inner-bottom" startOffset="50%" textAnchor="middle">
          {city}
        </textPath>
      </text>

      {/* Centre emblem */}
      <text x="100" y="102" fontFamily={font} fontSize="30" fontWeight="800" letterSpacing="-1" textAnchor="middle">
        {monogram}
      </text>
      <line x1="80" y1="110" x2="120" y2="110" stroke={BLUE} strokeWidth="0.8" />
      <text x="100" y="120" fontFamily={font} fontSize="6.5" fontWeight="700" letterSpacing="2" textAnchor="middle">
        {centerLabel}
      </text>
    </svg>
  );
}
