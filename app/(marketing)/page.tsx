import Hero from "../components/Hero";
import StatStrip from "../components/StatStrip";
import JourneyGraphic from "../components/JourneyGraphic";
import WhyStory from "../components/WhyStory";
import Programs from "../components/Programs";
import FoundersMessage from "../components/FoundersMessage";
import CtaBand from "../components/CtaBand";

export default function Home() {
  return (
    <main className="page">
      <Hero />

      <StatStrip />

      <section className="journey" id="journey">
        <JourneyGraphic />
      </section>

      <WhyStory />

      <Programs />

      <FoundersMessage />

      <CtaBand />
    </main>
  );
}
