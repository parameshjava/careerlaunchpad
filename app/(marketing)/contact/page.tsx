import type { Metadata } from "next";

// Single source of truth for the company contact details (also feeds the JSON-LD
// below). Keep address/phone/email here, not duplicated in the JSX.
const ADDRESS_LINES = [
  "CareerLaunchPad Pvt Ltd, Plot 30",
  "Near Cinema Hall Centre, Yerrabalem Village",
  "Mangalagiri Mandal, Guntur District – 522502",
];
const ADDRESS_ONE_LINE = ADDRESS_LINES.join(", ");
const PHONE_DISPLAY = "+91 99635 49926";
const PHONE_TEL = "+919963549926";
const EMAIL = "contact@careerlaunchpad.ai";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS_ONE_LINE)}`;

export const metadata: Metadata = {
  title: "Contact Us — CareerLaunchPad",
  description:
    "Get in touch with CareerLaunchPad. Find our address in Guntur, phone number and email — we'd love to hear from you.",
  alternates: { canonical: "/contact" },
};

// Structured data so search engines surface the business address/phone/email
// (helps local search & Google Business listings for the physical office).
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "CareerLaunchPad Pvt Ltd",
  url: "https://careerlaunchpad.ai",
  email: EMAIL,
  telephone: PHONE_TEL,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Plot 30, Near Cinema Hall Centre, Yerrabalem Village",
    addressLocality: "Mangalagiri Mandal",
    addressRegion: "Guntur District, Andhra Pradesh",
    postalCode: "522502",
    addressCountry: "IN",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    telephone: PHONE_TEL,
    email: EMAIL,
  },
};

export default function ContactPage() {
  return (
    <main className="page contact">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="contact-head">
        <h1 className="contact-title">
          Get in <span className="brand-accent">touch</span>
        </h1>
        <p className="contact-lead">
          Questions, partnerships, or just want to say hello? Reach us any of these ways —
          we&rsquo;d love to hear from you.
        </p>
      </header>

      <div className="contact-grid">
        {/* Address → opens the location in Google Maps */}
        <a
          className="contact-card"
          href={MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="contact-icon contact-icon--addr" aria-hidden="true">📍</span>
          <span className="contact-card-body">
            <span className="contact-label">Address</span>
            <span className="contact-value">
              {ADDRESS_LINES.map((line, i) => (
                <span key={i} className="contact-addr-line">{line}</span>
              ))}
            </span>
            <span className="contact-action">Get directions →</span>
          </span>
        </a>

        {/* Phone → tap to call on mobile */}
        <a className="contact-card" href={`tel:${PHONE_TEL}`}>
          <span className="contact-icon contact-icon--phone" aria-hidden="true">📞</span>
          <span className="contact-card-body">
            <span className="contact-label">Phone</span>
            <span className="contact-value">{PHONE_DISPLAY}</span>
            <span className="contact-action">Tap to call →</span>
          </span>
        </a>

        {/* Email → opens the mail client */}
        <a className="contact-card" href={`mailto:${EMAIL}`}>
          <span className="contact-icon contact-icon--mail" aria-hidden="true">✉️</span>
          <span className="contact-card-body">
            <span className="contact-label">Email</span>
            <span className="contact-value">{EMAIL}</span>
            <span className="contact-action">Send an email →</span>
          </span>
        </a>
      </div>
    </main>
  );
}
