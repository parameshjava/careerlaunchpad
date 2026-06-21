import JourneyGraphic from "./components/JourneyGraphic";
import FoundersMessage from "./components/FoundersMessage";

export default function Home() {
  return (
    <main className="page">
      <section className="intro">
        <h1 className="intro-title">
          Mentoring rural students into enterprise-ready professionals
        </h1>
        <p className="intro-lead">
          CareerLaunchPad helps rural students enrich their knowledge and build
          the practical, industry-ready skills enterprises demand — connecting
          them with mentors, real-world training, and opportunities that bridge
          the gap between learning and employment.
        </p>
      </section>

      <section className="journey">
        <JourneyGraphic />
      </section>

      <FoundersMessage />
    </main>
  );
}
