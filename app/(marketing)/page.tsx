import Hero from "../components/Hero";
import JourneyGraphic from "../components/JourneyGraphic";
import Programs from "../components/Programs";
import FoundersMessage from "../components/FoundersMessage";
import CtaBand from "../components/CtaBand";

export default function Home() {
  return (
    <main className="page">
      <Hero />

      {/* <StatStrip /> — disabled for now; re-import from ../components/StatStrip to restore */}

      <section className="journey" id="journey">
        <JourneyGraphic />
      </section>

      {/* The origin story lives in FoundersMessage (#why-we-started) — the old
          WhyStory problem/answer section was retired in favor of that format */}
      <Programs />

      <FoundersMessage />

      <CtaBand />
    </main>
  );
}
