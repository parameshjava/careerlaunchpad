import Link from "next/link";

// Hero copy — the positioning statement, sourced from the founding document.
// The headline is approved copy; readiness, never a placement guarantee.
const hero = {
  titleLead: "Job-ready",
  titleAccent: "before graduation",
  sub: "Personalized mentorship, industry-led learning, skill-gap analytics and career intelligence for students of Tier-2, Tier-3 and rural colleges.",
  primary: { label: "Register as a student", href: "/student/register" },
  secondary: { label: "Partner with us", href: "/contact" },
};

// The page's opening statement: what CareerLaunchPad is, who it serves, and
// how to act on it — shown before the journey diagram.
export default function Hero() {
  return (
    <section className="hero">
      <h1 className="hero-title">
        {hero.titleLead} <span className="hero-accent">{hero.titleAccent}</span>
      </h1>
      <p className="hero-sub">{hero.sub}</p>
      <div className="hero-ctas">
        <Link href={hero.primary.href} className="hero-cta">
          {hero.primary.label}
        </Link>
        <Link href={hero.secondary.href} className="hero-cta hero-cta--ghost">
          {hero.secondary.label}
        </Link>
      </div>
    </section>
  );
}
