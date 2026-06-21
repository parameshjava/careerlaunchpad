import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="navbar">
      <Link href="/" className="brand">
        <Image
          className="brand-logo"
          src="/logo.jpeg"
          alt="Career Launchpad logo"
          width={62}
          height={62}
          priority
        />
        <span className="brand-text">
          <span className="brand-name">
            <span className="brand-mark">Career</span>
            <span className="brand-accent">Launchpad</span>
          </span>
          <span className="brand-tagline">
            Connecting Rural Talent with Global Opportunities
          </span>
        </span>
      </Link>
      <Link href="#founders" className="nav-cta">
        Get Started
      </Link>
    </header>
  );
}
