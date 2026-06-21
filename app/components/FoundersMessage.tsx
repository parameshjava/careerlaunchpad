type Founder = {
  name: string;
  role: string;
  initials: string;
  linkedin: string;
  message?: string;
};

// To use a real photo later: drop the image in public/founders/ and swap the
// initials <span> inside the avatar link for a <Image> from "next/image".
const founders: Founder[] = [
  {
    name: "Darisiguntla Lakshmi Narayana",
    role: "Founder",
    initials: "LN",
    linkedin: "https://www.linkedin.com/in/lakshminarayana2930/",
    message:
      "During my visits to engineering and degree colleges, I noticed a significant gap between academic learning and industry expectations. CareerLaunchPad.ai was created to bridge that gap by connecting students, mentors, and employers on a single platform.",
  },
  {
    name: "Korrakuti Paramesh",
    role: "Co-Founder",
    initials: "KP",
    linkedin: "https://www.linkedin.com/in/paramesh-korrakuti-265b3928/",
  },
];

export default function FoundersMessage() {
  return (
    <section id="founders" className="founders">
      <h2 className="section-title">Founder&apos;s Message</h2>

      {founders.map((f) => (
        <article className="founder-card" key={f.name}>
          <a
            className="avatar"
            href={f.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${f.name} on LinkedIn`}
          >
            <span aria-hidden="true">{f.initials}</span>
          </a>

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
    </section>
  );
}
