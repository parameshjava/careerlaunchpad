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
    role: "Founder",
    initials: "LN",
    linkedin: "https://www.linkedin.com/in/lakshminarayana2930/",
    photo: "/founders/lakshmi-narayana.jpg",
    message:
      "Talent is everywhere, but opportunity often begins with the right guidance. \nDuring my recent visits to Degree, PG, and Engineering colleges, I noticed a common challenge: talented students often lack the industry guidance needed to become job-ready. \nCareerLaunchPad.ai was created to help students transform their potential into successful careers through mentorship, practical skills, and industry connections.",
  },
  {
    name: "Korrakuti Paramesh",
    role: "Co-Founder",
    initials: "KP",
    linkedin: "https://www.linkedin.com/in/paramesh-korrakuti-265b3928/",
    photo: "/founders/paramesh-korrakuti.jpg",
    message:
      "As a Senior Architect with 17+ years across Java, Spring Boot, C#, Python, Golang, React, and AI, I've delivered many enterprise-grade applications to production. My passion is mentoring students into industry-ready professionals who can bridge the gap between learning and employment.",
  },
];

// Core values that define the student journey on CareerLaunchPad.
const teamValues: { icon: string; title: string; detail: string }[] = [
  {
    icon: "🎯",
    title: "Aspire",
    detail: "Dream bigger than your circumstances.",
  },
  {
    icon: "📚",
    title: "Prepare",
    detail: "Develop the skills that industry demands.",
  },
  {
    icon: "🚀",
    title: "Launch",
    detail: "Start a successful and meaningful career.",
  },
];

const visionMission: { icon: string; label: string; text: string }[] = [
  {
    icon: "🔭",
    label: "Vision",
    text: "Empowering students to dream bigger, learn smarter, and launch successful careers.",
  },
  {
    icon: "🧭",
    label: "Mission",
    text: "Connecting students with mentors, skills, and opportunities to become job-ready and future-ready.",
  },
];

export default function FoundersMessage() {
  return (
    <section id="founders" className="founders">
      {/* Vision + Mission — a conceptual pair, shown side by side */}
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

      {/* Core Values — header plus the three values as a row */}
      <article className="values-card">
        <div className="values-head">
          <span className="values-badge" aria-hidden="true">
            ★
          </span>
          <div>
            <p className="founder-role">Our Team</p>
            <h3 className="founder-name">Core Values</h3>
          </div>
        </div>
        <ul className="values-row">
          {teamValues.map((v) => (
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
      </article>

      {/* Founder + Co-Founder — side by side, equal-height profile cards */}
      <div className="team-grid">
        {founders.map((f) => (
          <article className="founder-card" key={f.name}>
            <FounderAvatar
              photo={f.photo}
              initials={f.initials}
              name={f.name}
              linkedin={f.linkedin}
            />

            <div className="founder-body">
              <p className="founder-role">{f.role}</p>
              <h3 className="founder-name">
                <a href={f.linkedin} target="_blank" rel="noopener noreferrer">
                  {f.name}
                </a>
              </h3>
              {f.message && <p className="founder-message">{f.message}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
