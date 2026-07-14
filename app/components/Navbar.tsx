import Link from "next/link";
import { Brand } from "@/components/brand/Brand";

// In-bar menu links. All anchors resolve on the homepage; Contact has its own
// page. Hidden below 860px (see .nav-menu in landing.css) — the sections are
// one scroll away on phones, so no hamburger for now.
const menu = [
  { label: "Programs", href: "/#programs" },
  { label: "How it works", href: "/#journey" },
  { label: "Why us", href: "/#why-we-started" },
  { label: "Contact Us", href: "/contact" },
];

export default function Navbar() {
  return (
    <header className="navbar">
      {/* /home resolves per-user: signed-in → their dashboard, else → marketing home. */}
      <Brand href="/home" />
      <nav className="nav-menu" aria-label="Main">
        {menu.map((m) => (
          <Link key={m.label} href={m.href} className="nav-link">
            {m.label}
          </Link>
        ))}
      </nav>
      <div className="nav-actions">
        <Link href="/auth/login" className="nav-link">
          Login
        </Link>
        {/* Compacts to "Register" below 420px (same target) — see .nav-cta-now */}
        <Link href="/student/register" className="nav-cta">
          Register<span className="nav-cta-now"> Now</span>
        </Link>
      </div>
    </header>
  );
}
