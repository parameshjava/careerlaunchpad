"use client";

// "Don't switch away" traffic-style prohibition sign for the exam screens: a
// white disc with the OS-specific tab-switch shortcut on keycaps INSIDE it (Alt +
// Tab on Windows/Linux, Cmd + Tab on macOS), a bold red ring, and the slash
// across — one cohesive symbol like No-Parking / No-U-Turn signs. Keycaps are
// sized large (and the slash runs through the gap between them) so the labels
// stay readable even at small render sizes. Inline SVG so it's crisp at any size;
// OS detected client-side (defaults to Windows, corrected on mount).
import { useEffect, useState } from "react";

function Keycap({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <rect x={x} y={81} width={60} height={38} rx={8} fill="#f1f5f9" stroke="#64748b" strokeWidth={2} />
      <text
        x={x + 30}
        y={109}
        textAnchor="middle"
        fontSize={24}
        fontWeight={700}
        fill="#1e293b"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

export function NoTabSwitch({ className }: { className?: string }) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || navigator.platform || "";
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(ua));
  }, []);

  const mod = isMac ? "Cmd" : "Alt";

  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={`${mod} + Tab is disabled during the exam`}
      className={className}
    >
      {/* White sign disc + the large shortcut keycaps contained inside it. */}
      <circle cx={100} cy={100} r={90} fill="#ffffff" />
      <Keycap x={32} label={mod} />
      <Keycap x={108} label="Tab" />

      {/* Bold red prohibition ring + diagonal slash (runs through the gap between
          the two keys, so it never crosses the labels). */}
      <circle cx={100} cy={100} r={83} fill="none" stroke="#dc2626" strokeWidth={14} />
      <line x1={46.3} y1={46.3} x2={153.7} y2={153.7} stroke="#dc2626" strokeWidth={14} />
    </svg>
  );
}
