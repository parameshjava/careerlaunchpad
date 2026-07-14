import Link from "next/link";
import { Brand } from "@/components/brand/Brand";

export default function Navbar() {
  return (
    <header className="navbar">
      {/* /home resolves per-user: signed-in → their dashboard, else → marketing home. */}
      <Brand href="/home" />
      <div className="nav-actions">
        {/* Contact Us → dedicated /contact page. A clean text menu-link (not a
            boxed button) with a gradient underline on hover, so the gradient
            "Get Started" stays the single prominent CTA — see modern SaaS navs. */}
        <Link href="/contact" className="nav-link">
          Contact<span className="nav-link-us"> Us</span>
        </Link>
        <Link href="/auth/login" className="nav-cta">
          Login
        </Link>
      </div>
    </header>
  );
}
