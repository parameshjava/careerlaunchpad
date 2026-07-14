import FounderAvatar from "./FounderAvatar";

type Founder = {
  name: string;
  role: string;
  initials: string;
  linkedin: string;
  message?: string;
  photo?: string;
};

// Profile photos live in public/founders/ (save the LinkedIn photo with the
// filename below). If a file is missing, the avatar falls back to initials.
const founders: Founder[] = [
  {
    name: "Darisiguntla Lakshmi Narayana",
    role: "CEO & Co-Founder",
    initials: "LN",
    linkedin: "https://www.linkedin.com/in/lakshminarayana2930/",
    photo: "/founders/lakshmi-narayana.jpg",
    message:
      "Talent is everywhere, but opportunity often begins with the right guidance. \nDuring my recent visits to Degree, PG, and Engineering colleges, I noticed a common challenge: talented students often lack the industry guidance needed to become job-ready. \nCareerLaunchPad was created to help students transform their potential into successful careers through mentorship, practical skills, and industry connections.",
  },
  {
    name: "Korrakuti Paramesh",
    role: "CTO & Co-Founder",
    initials: "KP",
    linkedin: "https://www.linkedin.com/in/paramesh-korrakuti-265b3928/",
    photo: "/founders/paramesh-korrakuti.jpg",
    message:
      "As a Senior Architect with 17+ years across Java, Spring Boot, C#, Python, Golang, React, and AI, I've delivered many enterprise-grade applications to production. My passion is mentoring students into industry-ready professionals who can bridge the gap between learning and employment.",
  },
];

// Our Promise — the three commitments we make to every student.
const promises: { icon: string; title: string; detail: string }[] = [
  {
    icon: "📍",
    title: "Identify Potential",
    detail: "We discover talented students through career readiness assessments.",
  },
  {
    icon: "🤝",
    title: "Guide with Purpose",
    detail:
      "Every selected student is matched with industry mentors and a structured learning path.",
  },
  {
    icon: "🚀",
    title: "Launch Careers",
    detail:
      "Practical skills, mentorship and employer connections make students job-ready before graduation.",
  },
];

const visionMission: { icon: string; label: string; text: string }[] = [
  {
    icon: "🔭",
    label: "Vision",
    text: "Empower students from Tier-2, Tier-3 and rural India with industry mentorship, practical skills and career opportunities — job-ready before graduation, without migrating to metro cities for expensive coaching.",
  },
  {
    icon: "🧭",
    label: "Mission",
    text: "Bridge the gap between academic education and industry expectations: identify skill gaps, deliver personalized mentorship and industry-led learning, measure career readiness, and connect students with employment opportunities.",
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

// The "About" cluster of the landing page. Per IA best practice, it follows the
// product story (the Journey above) in the order purpose → principles → people:
//   1. Vision & Mission  (why we exist)
//   2. Our Promise       (what we commit to)
//   3. Impact            (what changes if we succeed)
//   4. Founders          (who's behind it)
// Each is its OWN titled, anchored section rather than an unlabeled card stack.
export default function FoundersMessage() {
  return (
    <div className="about">
      {/* 1) Vision & Mission — the purpose, right after the product story */}
      <section id="vision-mission">
        <h2 className="section-title">Our Vision &amp; Mission</h2>
        <div className="vm-grid">
          {visionMission.map((vm) => (
            <article className="vm-card" key={vm.label}>
              <span className="vm-badge" aria-hidden="true">
                {vm.icon}
              </span>
              <div className="vm-body">
                <p className="founder-role">{vm.label}</p>
                <p className="vm-text">{vm.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 2) Our Promise — the commitments, as three parallel tiles */}
      <section id="promise">
        <h2 className="section-title">Our Promise</h2>
        <ul className="values-row">
          {promises.map((v) => (
            <li className="value-tile" key={v.title}>
              <span className="value-tile-head">
                <span className="value-tile-icon" aria-hidden="true">
                  {v.icon}
                </span>
                <span className="value-tile-title">{v.title}</span>
              </span>
              <span className="value-tile-detail">{v.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 3) Impact — the long-term goals, as checkmark tiles + program badges */}
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

      {/* 4) Founders — the people, equal-height profile cards */}
      <section id="founders">
        <h2 className="section-title">Our Team</h2>
        <div className="team-grid">
          {founders.map((f) => (
            <article className="founder-card" key={f.name}>
              {f.message && <p className="founder-message">{f.message}</p>}

              <div className="founder-attrib">
                <FounderAvatar
                  photo={f.photo}
                  initials={f.initials}
                  name={f.name}
                  linkedin={f.linkedin}
                />
                <div className="founder-attrib-text">
                  <h3 className="founder-name">
                    <a href={f.linkedin} target="_blank" rel="noopener noreferrer">
                      {f.name}
                    </a>
                  </h3>
                  <p className="founder-role">{f.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
