import Link from "next/link";
import { Brand } from "@/components/brand/Brand";

export default function Navbar() {
  return (
    <header className="navbar">
      <Brand />
      <div className="nav-actions">
        {/* Contact Us → dedicated /contact page. A clean text menu-link (not a
            boxed button) with a gradient underline on hover, so the gradient
            "Get Started" stays the single prominent CTA — see modern SaaS navs. */}
        <Link href="/contact" className="nav-link">
          Contact Us
        </Link>
        <Link href="/auth/login" className="nav-cta">
          Login
        </Link>
      </div>
    </header>
  );
}
