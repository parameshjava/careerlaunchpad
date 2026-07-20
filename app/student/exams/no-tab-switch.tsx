"use client";

// "Don't switch away" traffic-style prohibition sign for the exam screens: a
// white disc with the OS-specific tab-switch shortcut on keycaps INSIDE it (Alt +
// Tab on Windows/Linux, Cmd + Tab on macOS), a bold red ring, and the slash
// across — one cohesive symbol like No-Parking / No-U-Turn signs. Inline SVG so
// it stays crisp at any size; the OS is detected client-side (defaults to
// Windows, corrected on mount to avoid an SSR mismatch).
import { useEffect, useState } from "react";

function Keycap({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <rect x={x} y={84} width={42} height={32} rx={7} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={1.5} />
      <text
        x={x + 21}
        y={105}
        textAnchor="middle"
        fontSize={15}
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
      {/* White sign disc + the shortcut keycaps contained inside it. */}
      <circle cx={100} cy={100} r={90} fill="#ffffff" />
      <Keycap x={46} label={mod} />
      <text x={100} y={106} textAnchor="middle" fontSize={18} fontWeight={700} fill="#475569">
        +
      </text>
      <Keycap x={112} label="Tab" />

      {/* Bold red prohibition ring + diagonal slash, drawn on top. */}
      <circle cx={100} cy={100} r={83} fill="none" stroke="#dc2626" strokeWidth={14} />
      <line x1={46.3} y1={46.3} x2={153.7} y2={153.7} stroke="#dc2626" strokeWidth={14} />
    </svg>
  );
}
