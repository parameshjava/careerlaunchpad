// Animated "visual walkthrough" of the student journey, styled as a metro line
// (crisp/scalable): a gradient track runs Students -> 6 numbered stations
// (alternating above/below the line) -> career sectors fanned out at the terminus.
import type { ReactNode } from "react";

/* ----------------------------- Icons ----------------------------- */
const ic = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

// Group of students (the origin hub). Three figures so it reads as "many
// students", not one — a small grad cap on the front figure keeps the theme.
function StudentsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      {/* back-left and back-right peers */}
      <circle {...ic} cx="5.5" cy="9" r="1.9" />
      <path {...ic} d="M2.5 18.5c0-2.3 1.3-3.6 3-3.6" />
      <circle {...ic} cx="18.5" cy="9" r="1.9" />
      <path {...ic} d="M21.5 18.5c0-2.3-1.3-3.6-3-3.6" />
      {/* front student with graduation cap */}
      <path {...ic} d="M12 4 8 6l4 2 4-2-4-2Z" />
      <path {...ic} d="M16 6v2.2" />
      <circle {...ic} cx="12" cy="11.2" r="2.4" />
      <path {...ic} d="M7.5 19c0-2.9 2-4.4 4.5-4.4s4.5 1.5 4.5 4.4" />
    </svg>
  );
}
function RegisterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <rect {...ic} x="5" y="3" width="14" height="18" rx="2" />
      <path {...ic} d="M9 3.5h6v2.5H9z" />
      <path {...ic} d="M8.5 11h4M8.5 14.5h7" />
      <path {...ic} d="m14.5 11 1.4 1.4 2.6-2.6" />
    </svg>
  );
}
function AssessIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path {...ic} d="M4 19h16" />
      <rect {...ic} x="5" y="11" width="3.2" height="6" rx="1" />
      <rect {...ic} x="10.4" y="8" width="3.2" height="9" rx="1" />
      <rect {...ic} x="15.8" y="5" width="3.2" height="12" rx="1" />
    </svg>
  );
}
function MentorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <circle {...ic} cx="8" cy="8" r="2.6" />
      <circle {...ic} cx="16" cy="8" r="2.6" />
      <path {...ic} d="M3.5 19c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path {...ic} d="M12.5 19c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
    </svg>
  );
}
function SkillIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path {...ic} d="M9 18h6M10 21h4" />
      <path
        {...ic}
        d="M12 3a6 6 0 0 0-4 10.5c.8.8 1.1 1.5 1.1 2.5h5.8c0-1 .3-1.7 1.1-2.5A6 6 0 0 0 12 3Z"
      />
    </svg>
  );
}
function InterviewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path {...ic} d="M4 5h16v10H9l-4 3v-3H4Z" />
      <path {...ic} d="M8 9h8M8 12h5" />
    </svg>
  );
}
function PlacementIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path {...ic} d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
      <path {...ic} d="M5 5H3v1.5A2.5 2.5 0 0 0 5.5 9M19 5h2v1.5A2.5 2.5 0 0 1 18.5 9" />
      <path {...ic} d="M12 12v3M9 20h6M10 20l.5-3h3l.5 3" />
    </svg>
  );
}
function BankIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path {...ic} d="M4 9 12 4l8 5" />
      <path {...ic} d="M6 9v8M10 9v8M14 9v8M18 9v8" />
      <path {...ic} d="M3.5 20h17" />
    </svg>
  );
}
function ITIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <rect {...ic} x="3" y="4" width="18" height="12" rx="1.5" />
      <path {...ic} d="M9 20h6M12 16v4" />
      <path {...ic} d="m9.5 8-2 2 2 2M14.5 8l2 2-2 2" />
    </svg>
  );
}
function GovtIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path {...ic} d="M12 3l4 2-4 1-4-1 4-2Z" />
      <path {...ic} d="M12 6v3" />
      <rect {...ic} x="5" y="9" width="14" height="9" rx="1" />
      <path {...ic} d="M9 9v9M15 9v9M4 21h16" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <circle cx="6" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------ Data ------------------------------ */
const steps: { n: number; title: string; icon: ReactNode }[] = [
  { n: 1, title: "Register", icon: <RegisterIcon /> },
  { n: 2, title: "Career Assessment", icon: <AssessIcon /> },
  { n: 3, title: "Mentor Allocation", icon: <MentorIcon /> },
  { n: 4, title: "Skill Development", icon: <SkillIcon /> },
  { n: 5, title: "Interview Preparation", icon: <InterviewIcon /> },
  { n: 6, title: "Placement & Career Growth", icon: <PlacementIcon /> },
];

const sectors: { label: string; icon: ReactNode }[] = [
  { label: "Banks", icon: <BankIcon /> },
  { label: "IT Sector", icon: <ITIcon /> },
  { label: "Govt Sector", icon: <GovtIcon /> },
  { label: "& Much More", icon: <MoreIcon /> },
];

// y-centres for the 4 outcome cards inside the fan SVG
// (card height 56 + 14 gap = 70 pitch): 28, 98, 168, 238 within a 266-tall box.
const fanTargets = [28, 98, 168, 238];

/* ---------------------------- Component ---------------------------- */
// Metro-line walkthrough: a single gradient "track" runs Students -> 6 numbered
// stations (alternating above/below the line) -> a fan-out into career sectors.
// On narrow screens the track turns vertical (see the @media block in landing.css).
export default function JourneyGraphic() {
  return (
    <div className="journey-panel">
      <div
        className="metro"
        role="img"
        aria-label="Student career journey: register, career assessment, mentor allocation, skill development, interview preparation, then placement into Banks, IT Sector, Govt Sector and more."
      >
        {/* Origin */}
        <div className="metro-origin">
          <div className="jf-hub">
            <StudentsIcon />
          </div>
          <span className="metro-origin-label">Students</span>
        </div>

        {/* The CareerLaunchpad box: students enter here, pass the 6 steps */}
        <div className="metro-track">
          <div className="metro-track-header">
            <span className="journey-title">
              <span className="jt-mark">Career</span>
              <span className="jt-accent">Launchpad</span>
            </span>
          </div>
          <span className="metro-line" aria-hidden="true" />
          <ol className="metro-stations">
            {steps.map((s, i) => (
              <li
                className={`metro-station metro-station--${i % 2 === 0 ? "up" : "down"}`}
                key={s.n}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="metro-card">
                  <span className="metro-card-icon">{s.icon}</span>
                  <span className="metro-card-title">{s.title}</span>
                </div>
                <span className="metro-stem" aria-hidden="true" />
                <span className="metro-dot">{s.n}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Terminus: fan-out into career sectors */}
        <div className="metro-terminus">
          <svg
            className="metro-fan"
            viewBox="0 0 64 266"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <line className="flow-line" x1="0" y1="133" x2="14" y2="133" />
            <circle className="metro-fan-hub" cx="14" cy="133" r="4.5" />
            {fanTargets.map((y, i) => (
              <path
                key={i}
                className="flow-curve"
                style={{ animationDelay: `${i * 0.15}s` }}
                d={`M14 133 C 44 133 34 ${y} 62 ${y}`}
              />
            ))}
            {fanTargets.map((y, i) => (
              <circle key={`d${i}`} className="metro-fan-dot" cx="62" cy={y} r="3.5" />
            ))}
          </svg>
          <ul className="metro-outcomes">
            {sectors.map((s) => (
              <li className="metro-outcome" key={s.label}>
                <span className="metro-outcome-icon">{s.icon}</span>
                <span className="metro-outcome-label">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
