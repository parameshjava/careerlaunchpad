import Hero from "../components/Hero";
import JourneyGraphic from "../components/JourneyGraphic";
import WhyStory from "../components/WhyStory";
import FoundersMessage from "../components/FoundersMessage";

export default function Home() {
  return (
    <main className="page">
      <Hero />

      <section className="journey">
        <JourneyGraphic />
      </section>

      <WhyStory />

      <FoundersMessage />
    </main>
  );
}
