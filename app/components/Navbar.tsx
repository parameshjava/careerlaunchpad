import Link from "next/link";
import { Brand } from "@/components/brand/Brand";

export default function Navbar() {
  return (
    <header className="navbar">
      <Brand />
      <Link href="#founders" className="nav-cta">
        Get Started
      </Link>
    </header>
  );
}
