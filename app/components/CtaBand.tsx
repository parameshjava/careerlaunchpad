import Link from "next/link";

// Closing call-to-action before the footer — the last thing a visitor sees
// should be a way to act, not a founder bio.
const cta = {
  title: "Ready to become job-ready before graduation?",
  sub: "Register free, take your first assessment, and see exactly where you stand.",
  primary: { label: "Register as a student", href: "/student/register" },
  secondary: { label: "Talk to us", href: "/contact" },
};

export default function CtaBand() {
  return (
    <section className="cta-band">
      <h2 className="cta-band-title">{cta.title}</h2>
      <p className="cta-band-sub">{cta.sub}</p>
      <div className="hero-ctas">
        <Link href={cta.primary.href} className="hero-cta hero-cta--inverse">
          {cta.primary.label}
        </Link>
        <Link href={cta.secondary.href} className="hero-cta hero-cta--outline">
          {cta.secondary.label}
        </Link>
      </div>
    </section>
  );
}
