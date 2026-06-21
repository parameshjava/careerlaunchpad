import Image from "next/image";

export default function Home() {
  return (
    <main className="page">
      <Image
        className="banner"
        src="/launchpad.jpeg"
        alt="Career Launchpad — College to Corporate"
        width={1024}
        height={200}
        priority
      />

      <h1 className="greeting">Hello Student</h1>
      <p className="subtitle">Welcome to your journey from college to corporate.</p>

      <Image
        className="hero"
        src="/career-path.jpeg"
        alt="From College to Corporate — Career Pathway"
        width={711}
        height={804}
      />
    </main>
  );
}
