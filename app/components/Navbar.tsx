import Link from "next/link";

export default function Navbar() {
  return (
    <header className="navbar">
      <Link href="/" className="brand">
        <span className="brand-rocket" aria-hidden="true">🚀</span>
        <span className="brand-name">Career Launchpad</span>
      </Link>
      <Link href="#founders" className="nav-cta">
        Get Started
      </Link>
    </header>
  );
}
