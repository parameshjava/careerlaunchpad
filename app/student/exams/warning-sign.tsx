// Standard hazard warning triangle (golden-yellow fill, black rounded border and
// exclamation) — the universally-recognised "caution" symbol. Used on the exam
// waiting screen beside the "moving away submits your exam" notice. Inline SVG so
// it stays crisp at any size and needs no asset pipeline.
export function WarningSign({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 108" role="img" aria-label="Warning" className={className}>
      {/* Rounded triangle: yellow fill, thick black border (round joins/caps give
          the rounded corners of the classic hazard sign). */}
      <path
        d="M60 12 L108 96 L12 96 Z"
        fill="#FFC400"
        stroke="#111827"
        strokeWidth={9}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Exclamation: a slightly tapered bar + a dot, centred. */}
      <path d="M54.5 40 L65.5 40 L64 70 L56 70 Z" fill="#111827" />
      <circle cx={60} cy={84} r={5.5} fill="#111827" />
    </svg>
  );
}
