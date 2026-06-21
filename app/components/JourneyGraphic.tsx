// Flow diagram (inspired by the provided sketch):
// Students -> Growth & upskilling (rising bars) -> branching into Banks / IT Sector / Govt Sector.
export default function JourneyGraphic() {
  return (
    <svg
      className="journey-graphic"
      viewBox="0 0 660 360"
      role="img"
      aria-label="Students grow and upskill, then branch into careers in Banks, IT Sector and Govt Sector"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="cl-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#475569" />
        </marker>
      </defs>

      {/* ---- Students ---- */}
      <g>
        <circle cx="38" cy="196" r="9" fill="#64748b" />
        <path d="M26 236 C26 214 50 214 50 236 Z" fill="#64748b" />
        <circle cx="74" cy="196" r="9" fill="#64748b" />
        <path d="M62 236 C62 214 86 214 86 236 Z" fill="#64748b" />
        <circle cx="56" cy="190" r="11" fill="#334155" />
        <path d="M40 244 C40 215 72 215 72 244 Z" fill="#334155" />
        <text x="56" y="268" fontSize="14" fontWeight="700" fill="#1a1a2e" textAnchor="middle">
          Students
        </text>
      </g>

      {/* arrow: students -> growth */}
      <line x1="100" y1="210" x2="160" y2="210" stroke="#475569" strokeWidth="2.5" markerEnd="url(#cl-arrow)" />

      {/* ---- Growth (rising bars) ---- */}
      <g>
        <rect x="165" y="110" width="190" height="200" rx="10" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        <rect x="185" y="235" width="28" height="60" rx="3" fill="#fcd34d" />
        <rect x="221" y="205" width="28" height="90" rx="3" fill="#f9a8d4" />
        <rect x="257" y="170" width="28" height="125" rx="3" fill="#c4b5fd" />
        <rect x="293" y="140" width="28" height="155" rx="3" fill="#a78bfa" />
        <text x="260" y="338" fontSize="14" fontWeight="700" fill="#1a1a2e" textAnchor="middle">
          Growth &amp; Upskilling
        </text>
      </g>

      {/* branching arrows: growth -> 3 sectors */}
      <g fill="none" stroke="#475569" strokeWidth="2.5">
        <path d="M355 210 H388 V150 Q388 148 392 148 H466" markerEnd="url(#cl-arrow)" />
        <path d="M355 210 H466" markerEnd="url(#cl-arrow)" />
        <path d="M355 210 H388 V285 Q388 287 392 287 H466" markerEnd="url(#cl-arrow)" />
      </g>

      {/* ---- Sector boxes ---- */}
      <g fontSize="14" fontWeight="600" fill="#1a1a2e" textAnchor="middle">
        <rect x="472" y="128" width="160" height="44" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        <text x="552" y="155">Banks</text>

        <rect x="472" y="188" width="160" height="44" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        <text x="552" y="215">IT Sector</text>

        <rect x="472" y="263" width="160" height="44" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        <text x="552" y="290">Govt Sector</text>
      </g>
    </svg>
  );
}
