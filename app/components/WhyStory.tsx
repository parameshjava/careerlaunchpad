// Problem → answer narrative plus the belief statement, from the founding document.
const story: { label: string; text: string; answer?: boolean }[] = [
  {
    label: "The problem",
    text: "Every year, thousands of talented students from rural colleges graduate with degrees but struggle to secure employment — they lack industry exposure, practical skills, mentorship and career guidance. Many relocate to cities like Hyderabad, Bengaluru, Chennai or Pune, spending significant time and money in coaching institutes before becoming employable.",
  },
  {
    label: "Our answer",
    text: "CareerLaunchPad brings industry mentors, structured learning, assessments and career opportunities directly to students while they are still in college — so they become job-ready before graduation, without migrating for expensive coaching.",
    answer: true,
  },
];

const belief =
  "A student's career should be determined by their potential — not by their location, financial background, or access to guidance.";

// Why the company exists: the problem/answer pair, closed by the belief quote.
export default function WhyStory() {
  return (
    <section className="why" id="why">
      <h2 className="section-title">Why CareerLaunchPad</h2>
      <div className="why-grid">
        {story.map((s) => (
          <article
            className={`why-card${s.answer ? " why-card--answer" : ""}`}
            key={s.label}
          >
            <p className="why-label">{s.label}</p>
            <p className="why-text">{s.text}</p>
          </article>
        ))}
      </div>
      <figure className="quote-band">
        <blockquote>&ldquo;{belief}&rdquo;</blockquote>
        <figcaption>Why CareerLaunchPad.ai exists</figcaption>
      </figure>
    </section>
  );
}
