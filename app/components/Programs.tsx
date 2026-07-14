import Link from "next/link";
import { ClipboardCheck, BookOpenCheck, Users, MessagesSquare } from "lucide-react";

// What a student actually gets — the concrete offer, the way training
// institutes lead with courses. Copy lives here, not in the JSX.
const programs: { icon: React.ElementType; title: string; detail: string }[] = [
  {
    icon: ClipboardCheck,
    title: "Career Readiness Assessment",
    detail:
      "Know where you stand with subject-wise assessments and a personal readiness score.",
  },
  {
    icon: BookOpenCheck,
    title: "Aptitude, Reasoning & English Practice",
    detail:
      "8,000+ exam-grade questions across 50+ chapters, modeled on real placement and competitive exams.",
  },
  {
    icon: Users,
    title: "Mentorship & Structured Learning",
    detail:
      "Industry mentors and a structured learning path matched to your goals and gaps.",
  },
  {
    icon: MessagesSquare,
    title: "Interview & Placement Preparation",
    detail:
      "Mock interviews, communication practice and employer connections when you're ready.",
  },
];

export default function Programs() {
  return (
    <section className="programs" id="programs">
      <h2 className="section-title">What Students Get</h2>
      <div className="programs-grid">
        {programs.map((p) => (
          <article className="program-card" key={p.title}>
            <span className="program-head">
              <span className="program-icon" aria-hidden="true">
                <p.icon />
              </span>
              <h3 className="program-title">{p.title}</h3>
            </span>
            <p className="program-detail">{p.detail}</p>
          </article>
        ))}
      </div>
      <p className="programs-cta">
        <Link href="/student/register" className="hero-cta">
          Register to get started
        </Link>
      </p>
    </section>
  );
}
