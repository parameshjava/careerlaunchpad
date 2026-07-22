// The CareerLaunchpad round company seal — a print-safe SVG "ink stamp" for
// official documents (fee receipts). Self-contained (no external font/image) so
// it renders identically on screen and paper.
//
// A simple single-ring seal: two concentric circles with the company name curved
// across the top and the region across the bottom (vertically centred in the
// band via dominant-baseline), a star on each side, and the payment date in the
// centre. Single royal-blue ink, like a wet stamp.

const BLUE = "#1d4ed8";

// Text baseline radius = the mid-line of the band between the two circles
// (r 75 → 95). With dominant-baseline:central the glyphs sit centred on it.
const R = 85;
const arcTop = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;
const arcBottom = `M ${100 + R} 100 A ${R} ${R} 0 0 1 ${100 - R} 100`;

export function CompanySeal({
  size = 132,
  companyName = "CAREER LAUNCHPAD",
  region = "ANDHRA PRADESH",
  /** Shown in the centre of the seal (e.g. the payment date). Empty ⇒ blank centre. */
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

      <circle cx="100" cy="100" r="95" fill="none" stroke={BLUE} strokeWidth="2.5" />
      <circle cx="100" cy="100" r="75" fill="none" stroke={BLUE} strokeWidth="2" />

      <text fontFamily={font} fontSize="13" fontWeight="800" letterSpacing="1.6" dominantBaseline="central">
        <textPath href="#cl-seal-top" startOffset="50%" textAnchor="middle">
          {companyName}
        </textPath>
      </text>
      <text fontFamily={font} fontSize="13" fontWeight="800" letterSpacing="1.6" dominantBaseline="central">
        <textPath href="#cl-seal-bottom" startOffset="50%" textAnchor="middle">
          {region}
        </textPath>
      </text>

      {/* Star separators at the sides, between the top and bottom labels. */}
      <text x="15" y="100" fontSize="15" textAnchor="middle" dominantBaseline="central">★</text>
      <text x="185" y="100" fontSize="15" textAnchor="middle" dominantBaseline="central">★</text>

      {/* Centre emblem — the CL monogram anchors it as a seal; the payment date
          sits neatly beneath, under a hairline. */}
      <text
        x="100"
        y={centerText ? 92 : 100}
        fontFamily={font}
        fontSize="30"
        fontWeight="800"
        letterSpacing="-1"
        textAnchor="middle"
        dominantBaseline="central"
      >
        CL
      </text>
      {centerText && (
        <>
          <line x1="80" y1="106" x2="120" y2="106" stroke={BLUE} strokeWidth="0.8" />
          <text
            x="100"
            y="114"
            fontFamily={font}
            fontSize="8.5"
            fontWeight="700"
            letterSpacing="0.5"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {centerText}
          </text>
        </>
      )}
    </svg>
  );
}
