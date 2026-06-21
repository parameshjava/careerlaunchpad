import Image from "next/image";
import JourneyGraphic from "./components/JourneyGraphic";
import FoundersMessage from "./components/FoundersMessage";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <h1 className="greeting">Hello Student</h1>
        <p className="subtitle">
          Your step-by-step journey from college to corporate — with confidence.
        </p>
        <Image
          className="hero-image"
          src="/career-pathway.png"
          alt="From College to Corporate — Career Pathway"
          width={948}
          height={1080}
          priority
        />
      </section>

      <section className="journey">
        <h2 className="section-title">From Campus to Career</h2>
        <JourneyGraphic />
      </section>

      <FoundersMessage />
    </main>
  );
}
