import JourneyGraphic from "./components/JourneyGraphic";
import FoundersMessage from "./components/FoundersMessage";

export default function Home() {
  return (
    <main className="page">
      <section className="journey">
        <JourneyGraphic />
      </section>

      <FoundersMessage />
    </main>
  );
}
