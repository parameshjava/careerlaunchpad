"use client";

// "Don't switch away" badge for the exam screens: the OS-specific tab-switch
// shortcut on keycaps (Alt + Tab on Windows/Linux, ⌘ Cmd + Tab on macOS) under a
// red prohibition ring. Inline SVG so it stays crisp at any size and needs no
// asset pipeline; the OS is detected client-side (defaults to Windows, corrected
// on mount to avoid an SSR mismatch).
import { useEffect, useState } from "react";

function Keycap({ x, label }: { x: number; label: string }) {
  return (
    <g>
      {/* drop shadow for a slight 3D keycap feel */}
      <rect x={x} y={51} width={72} height={48} rx={11} fill="#94a3b8" opacity={0.5} />
      <rect x={x} y={48} width={72} height={48} rx={11} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={2} />
      <text
        x={x + 36}
        y={78}
        textAnchor="middle"
        fontSize={label.length > 3 ? 18 : 22}
        fontWeight={700}
        fill="#334155"
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
      viewBox="0 0 200 150"
      role="img"
      aria-label={`${mod} + Tab is disabled during the exam`}
      className={className}
    >
      {/* Shortcut keycaps: [Alt|Cmd] + [Tab] */}
      <Keycap x={16} label={mod} />
      <text x={100} y={80} textAnchor="middle" fontSize={26} fontWeight={700} fill="#64748b">
        +
      </text>
      <Keycap x={112} label="Tab" />

      {/* Red prohibition sign over the combo. */}
      <circle cx={100} cy={72} r={68} fill="none" stroke="#dc2626" strokeWidth={11} />
      <line
        x1={51.9}
        y1={23.9}
        x2={148.1}
        y2={120.1}
        stroke="#dc2626"
        strokeWidth={11}
        strokeLinecap="round"
      />
    </svg>
  );
}
