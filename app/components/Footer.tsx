import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";
import {
  ADDRESS_LINES,
  PHONE_DISPLAY,
  PHONE_TEL,
  EMAIL,
  MAPS_URL,
} from "@/lib/contact";

const blurb =
  "Bridging the gap between academic learning and industry expectations for students of Tier-2, Tier-3 and rural colleges.";

const explore = [
  { label: "Programs", href: "/#programs" },
  { label: "How it works", href: "/#journey" },
  { label: "Why CareerLaunchPad", href: "/#why" },
  { label: "Our team", href: "/#founders" },
  { label: "Contact Us", href: "/contact" },
];

const getStarted = [
  { label: "Register as a student", href: "/student/register" },
  { label: "Login", href: "/auth/login" },
  { label: "Partner with us", href: "/contact" },
];

// Site footer for all marketing routes: brand blurb, link columns, contact
// details and the legal line. Dark band — the page's closing contrast.
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <p className="footer-wordmark">
            <span className="footer-mark">Career</span>
            <span className="footer-accent">Launchpad</span>
          </p>
          <p className="footer-blurb">{blurb}</p>
        </div>

        <nav className="footer-col" aria-label="Explore">
          <p className="footer-col-title">Explore</p>
          {explore.map((l) => (
            <Link key={l.label} href={l.href} className="footer-link">
              {l.label}
            </Link>
          ))}
        </nav>

        <nav className="footer-col" aria-label="Get started">
          <p className="footer-col-title">Get started</p>
          {getStarted.map((l) => (
            <Link key={l.label} href={l.href} className="footer-link">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="footer-col" aria-label="Contact">
          <p className="footer-col-title">Contact</p>
          <a
            className="footer-link footer-contact"
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin aria-hidden="true" />
            <span>
              {ADDRESS_LINES.map((line) => (
                <span key={line} className="footer-addr-line">
                  {line}
                </span>
              ))}
            </span>
          </a>
          <a className="footer-link footer-contact" href={`tel:${PHONE_TEL}`}>
            <Phone aria-hidden="true" />
            <span>{PHONE_DISPLAY}</span>
          </a>
          <a className="footer-link footer-contact" href={`mailto:${EMAIL}`}>
            <Mail aria-hidden="true" />
            <span>{EMAIL}</span>
          </a>
        </div>
      </div>

      <p className="footer-legal">
        © {new Date().getFullYear()} CareerLaunchPad Pvt Ltd. All rights reserved.
      </p>
    </footer>
  );
}
