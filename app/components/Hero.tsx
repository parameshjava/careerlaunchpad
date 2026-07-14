// Hero copy — the positioning statement, sourced from the founding document.
const hero = {
  eyebrow: "India's first AI-powered Career Readiness Platform",
  titleLead: "Job-ready",
  titleAccent: "before graduation",
  sub: "Personalized mentorship, industry-led learning, skill-gap analytics and career intelligence for students of Tier-2, Tier-3 and rural colleges.",
};

// The page's opening statement: what CareerLaunchPad is and who it serves,
// shown before the journey diagram so first-time visitors get context first.
// No CTA here — the navbar's Login button is the single entry action.
export default function Hero() {
  return (
    <section className="hero">
      <p className="hero-eyebrow">{hero.eyebrow}</p>
      <h1 className="hero-title">
        {hero.titleLead} <span className="hero-accent">{hero.titleAccent}</span>
      </h1>
      <p className="hero-sub">{hero.sub}</p>
    </section>
  );
}
