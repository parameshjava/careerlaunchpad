import { Target, Handshake, Rocket } from "lucide-react";
import FounderAvatar from "./FounderAvatar";

type Founder = {
  name: string;
  role: string; // badge text, e.g. "Founder & CEO"
  initials: string;
  linkedin: string;
  photo?: string;
  accent: string; // per-card accent color (badge, checkmarks, quote tint)
  expertise: string[];
  message: string[]; // story paragraphs
  quote: string; // highlighted pull-quote
};

// Profile photos live in public/founders/ (save the LinkedIn photo with the
// filename below). If a file is missing, the avatar falls back to initials.
const founders: Founder[] = [
  {
    name: "Darisiguntla Lakshmi Narayana",
    role: "Founder & CEO",
    initials: "LN",
    linkedin: "https://www.linkedin.com/in/lakshminarayana2930/",
    photo: "/founders/lakshmi-narayana.jpg",
    accent: "#2563eb",
    expertise: [
      "12+ Years Experience",
      "Data Quality & ETL Testing",
      "AI Testing & Automation",
      "EdTech & Mentoring",
      "Career Development",
    ],
    message: [
      "During my recent visits to Degree, PG, and Engineering colleges, I noticed a common challenge: talented students often lack the industry guidance needed to become job-ready.",
      "CareerLaunchpad was created to help students transform their potential into successful careers through mentorship, practical skills, and industry connections.",
    ],
    quote: "Talent is everywhere. Opportunity should be too.",
  },
  {
    name: "Korrakuti Paramesh",
    role: "Co-Founder & CTO",
    initials: "KP",
    linkedin: "https://www.linkedin.com/in/paramesh-korrakuti-265b3928/",
    photo: "/founders/paramesh-korrakuti.jpg",
    accent: "#16a34a",
    expertise: [
      "17+ Years Experience",
      "Software Architecture",
      "AI & Machine Learning",
      "Cloud Platforms",
      "Enterprise Applications",
    ],
    message: [
      "As a Senior Architect with 17+ years across Java, Spring Boot, C#, Python, Golang, React, and AI, I've delivered many enterprise-grade applications to production.",
      "My passion is mentoring students into industry-ready professionals who can bridge the gap between learning and employment.",
    ],
    quote: "Technology should create opportunities — not barriers.",
  },
];

// Our Promise — the three commitments we make to every student.
const promises: { icon: React.ElementType; title: string; detail: string }[] = [
  {
    icon: Target,
    title: "Identify Potential",
    detail: "We discover talented students through career readiness assessments.",
  },
  {
    icon: Handshake,
    title: "Guide with Purpose",
    detail:
      "Every selected student is matched with industry mentors and a structured learning path.",
  },
  {
    icon: Rocket,
    title: "Launch Careers",
    detail:
      "Practical skills, mentorship and employer connections make students job-ready before graduation.",
  },
];

// Long-term impact goals, plus the national programs the platform supports.
const impacts: string[] = [
  "Reduce unemployment among graduates",
  "Improve employability in Tier-2 & Tier-3 colleges",
  "Minimize migration to metros for coaching",
  "Reduce the financial burden on students and parents",
  "Connect industry experts with aspiring students",
  "A measurable Career Readiness Index for institutions",
];

const programs = ["Digital India", "Skill India", "Startup India"];

// Vision & Mission — from the founding document (accent color per card).
// Icons are hand-authored duotone SVGs in currentColor, like the origin strip.
const visionMission: {
  icon: React.ReactNode;
  label: string;
  text: string;
  accent: string;
}[] = [
  {
    // Telescope: solid angled tube, tinted eyepiece + tripod, sparkle star
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="m8.2 13.4 13-7.5a2 2 0 0 1 2.7.7l1.6 2.8a2 2 0 0 1-.7 2.7l-13 7.5-3.6-6.2Z" fill="currentColor" />
        <path d="m5 15.3 3.2-1.9 3.6 6.2-3.2 1.9a1.6 1.6 0 0 1-2.2-.6L4.4 17.5A1.6 1.6 0 0 1 5 15.3Z" fill="currentColor" opacity=".45" />
        <path
          d="M12.5 22.5 9 28.5m4.6-7.5.9 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".45"
        />
        <path
          d="M26.5 15.5v4m-2-2h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity=".55"
        />
      </svg>
    ),
    label: "Vision",
    accent: "#2563eb",
    text: "To empower students from Tier-2, Tier-3, and rural India with industry mentorship, practical skills, and career opportunities, enabling them to become job-ready before graduation without the need to migrate to metro cities for expensive coaching or training.",
  },
  {
    // Target: tinted rings, solid bullseye, arrow into center
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="14.5" cy="17.5" r="11" fill="currentColor" opacity=".15" />
        <circle cx="14.5" cy="17.5" r="11" stroke="currentColor" strokeWidth="2" />
        <circle cx="14.5" cy="17.5" r="6" fill="currentColor" opacity=".3" />
        <circle cx="14.5" cy="17.5" r="2.6" fill="currentColor" />
        <path
          d="M15 17 25.5 6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M24 4.5 28 4l-.5 4-3.2-.3-.3-3.2Z" fill="currentColor" />
      </svg>
    ),
    label: "Mission",
    accent: "#7c3aed",
    text: "To bridge the gap between academic education and industry expectations by building an AI-enabled Career Readiness Platform that identifies skill gaps, delivers personalized mentorship, provides industry-led learning, measures career readiness, and connects students with employment opportunities.",
  },
];

// Origin story — the five-step "Why We Started CareerLaunchpad" flow shown
// below the founder cards. Icons are hand-authored duotone SVGs (filled shape
// + lighter tint details); they draw in currentColor, so the blue/green
// alternation comes from the .origin-icon CSS.
const originStory: { icon: React.ReactNode; title: string; detail: string }[] = [
  {
    // Institution: pediment + pillars + base
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 3.5 27.5 10v2.5h-23V10L16 3.5Z" fill="currentColor" />
        <circle cx="16" cy="9" r="1.4" fill="#fff" />
        <rect x="6.5" y="14.5" width="3.4" height="8" rx="1" fill="currentColor" opacity=".45" />
        <rect x="14.3" y="14.5" width="3.4" height="8" rx="1" fill="currentColor" opacity=".45" />
        <rect x="22.1" y="14.5" width="3.4" height="8" rx="1" fill="currentColor" opacity=".45" />
        <rect x="4.5" y="24.5" width="23" height="3.5" rx="1.75" fill="currentColor" />
      </svg>
    ),
    title: "Visited 20+ Colleges",
    detail: "Across rural & Tier-2/3 towns",
  },
  {
    // Eye: tinted lens, solid iris, white glint
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 8.5c-6.4 0-11 5.3-12.5 7.5C5 18.2 9.6 23.5 16 23.5S27 18.2 28.5 16C27 13.8 22.4 8.5 16 8.5Z"
          fill="currentColor"
          opacity=".18"
        />
        <path
          d="M16 8.5c-6.4 0-11 5.3-12.5 7.5C5 18.2 9.6 23.5 16 23.5S27 18.2 28.5 16C27 13.8 22.4 8.5 16 8.5Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="16" cy="16" r="4.4" fill="currentColor" />
        <circle cx="17.6" cy="14.4" r="1.3" fill="#fff" />
      </svg>
    ),
    title: "Observed Industry Skill Gap",
    detail: "Students lack practical skills & guidance",
  },
  {
    // Briefcase: handle, tinted lid band, solid body, white clasp
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M12.5 10V8a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v2"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <rect x="4" y="10" width="24" height="16.5" rx="3" fill="currentColor" />
        <path d="M4 13h24v3.6H4V13Z" fill="#fff" opacity=".3" />
        <rect x="13.7" y="15.6" width="4.6" height="3.6" rx="1.2" fill="#fff" />
      </svg>
    ),
    title: "Resigned Corporate Career",
    detail: "Left stable jobs with a bigger purpose",
  },
  {
    // Code: tinted editor panel + </> glyph
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="26" height="20" rx="4" fill="currentColor" opacity=".15" />
        <path
          d="m12 12-4.4 4 4.4 4M20 12l4.4 4-4.4 4"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m17.4 10.8-2.8 10.4"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    ),
    title: "Built CareerLaunchpad",
    detail: "AI-powered platform for career readiness & mentorship",
  },
  {
    // Rocket: solid body, white porthole, tinted fins + flame
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 2.8c3.6 2.6 5.2 6.2 5.2 10.3 0 2.5-.6 4.8-1.7 6.6h-7c-1.1-1.8-1.7-4.1-1.7-6.6 0-4.1 1.6-7.7 5.2-10.3Z"
          fill="currentColor"
        />
        <circle cx="16" cy="11.8" r="2.3" fill="#fff" />
        <path
          d="M11.3 15.2c-2.2 1.3-3.5 3.3-4 6l4.6-1.7ZM20.7 15.2c2.2 1.3 3.5 3.3 4 6l-4.6-1.7Z"
          fill="currentColor"
          opacity=".5"
        />
        <path d="M13.9 21.5h4.2L16 27.5l-2.1-6Z" fill="currentColor" opacity=".55" />
      </svg>
    ),
    title: "Helping Students Become Job-Ready",
    detail: "Before graduation",
  },
];

// The "About" cluster of the landing page. Per IA best practice, it follows the
// product story (the Journey above) in the order commitments → outcomes → people:
//   1. Our Promise  (what we commit to)
//   2. Impact       (what changes if we succeed)
//   3. Founders     (who's behind it)
// Each is its OWN titled, anchored section rather than an unlabeled card stack.
export default function FoundersMessage() {
  return (
    <div className="about">
      {/* 1) Our Promise — the commitments, as three parallel tiles */}
      <section id="promise">
        <h2 className="section-title">Our Promise</h2>
        <ul className="values-row">
          {promises.map((v) => (
            <li className="value-tile" key={v.title}>
              <span className="value-tile-head">
                <span className="value-tile-icon" aria-hidden="true">
                  <v.icon />
                </span>
                <span className="value-tile-title">{v.title}</span>
              </span>
              <span className="value-tile-detail">{v.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 2) Impact — the long-term goals, as checkmark tiles + program badges */}
      <section id="impact">
        <h2 className="section-title">The Long-Term Impact</h2>
        <ul className="impact-grid">
          {impacts.map((t) => (
            <li className="impact-tile" key={t}>
              {t}
            </li>
          ))}
        </ul>
        <p className="impact-badges">
          {programs.map((p) => (
            <span className="impact-badge" key={p}>
              {p}
            </span>
          ))}
        </p>
      </section>

      {/* 3) Vision & Mission — the two founding-document statements */}
      <section id="vision-mission">
        <h2 className="section-title">Vision &amp; Mission</h2>
        <div className="vm-grid">
          {visionMission.map((v) => (
            <article
              className="vm-card"
              key={v.label}
              style={{ "--vm-accent": v.accent } as React.CSSProperties}
            >
              <span className="vm-head">
                <span className="vm-icon" aria-hidden="true">
                  {v.icon}
                </span>
                <h3 className="vm-label">{v.label}</h3>
              </span>
              <p className="vm-text">{v.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 4) Founders — profile cards: photo + expertise on the left, badge/
             name/story/pull-quote on the right (accent color per card) */}
      <section id="founders">
        <div className="team-head">
          <h2 className="section-title">A Team With a Mission</h2>
          <p className="team-sub">
            We combine industry experience, technology expertise, and a shared
            passion to empower students and build a better future.
          </p>
        </div>
        <div className="team-grid">
          {founders.map((f) => (
            <article
              className="founder-card"
              key={f.name}
              style={{ "--fc-accent": f.accent } as React.CSSProperties}
            >
              <div className="founder-side">
                <FounderAvatar
                  photo={f.photo}
                  initials={f.initials}
                  name={f.name}
                  linkedin={f.linkedin}
                  large
                />
                <h4 className="founder-expertise-title">Expertise</h4>
                <ul className="founder-expertise">
                  {f.expertise.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>

              <div className="founder-main">
                <span className="founder-badge">{f.role}</span>
                <h3 className="founder-name">
                  <a href={f.linkedin} target="_blank" rel="noopener noreferrer">
                    {f.name}
                  </a>
                </h3>
                {f.message.map((p) => (
                  <p className="founder-message" key={p.slice(0, 32)}>
                    {p}
                  </p>
                ))}
                <blockquote className="founder-quote">{f.quote}</blockquote>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 5) Origin story — the founding journey as a five-step flow */}
      <section id="why-we-started">
        <div className="origin-panel">
          <h2 className="origin-title">
            Why We Started <span className="origin-brand">CareerLaunchpad</span>
          </h2>
          <ol className="origin-flow">
            {originStory.map((s) => (
              <li className="origin-step" key={s.title}>
                <span className="origin-icon" aria-hidden="true">
                  {s.icon}
                </span>
                <span className="origin-step-title">{s.title}</span>
                <span className="origin-step-detail">{s.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
