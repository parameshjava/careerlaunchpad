import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://careerlaunchpad.ai";

const description =
  "CareerLaunchPad helps rural students enrich their knowledge and build the practical, industry-ready skills enterprises demand — connecting them with mentors, real-world training, and opportunities that bridge the gap between learning and employment.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CareerLaunchPad — Connecting Rural Talent with Global Opportunities",
    template: "%s | CareerLaunchPad",
  },
  description,
  applicationName: "CareerLaunchPad",
  category: "education",
  keywords: [
    "rural students",
    "skill development",
    "industry-ready skills",
    "employability",
    "student mentorship",
    "career launchpad",
    "enterprise careers",
    "job-ready training",
    "upskilling",
    "college to corporate",
  ],
  openGraph: {
    type: "website",
    siteName: "CareerLaunchPad",
    title: "CareerLaunchPad — Connecting Rural Talent with Global Opportunities",
    description,
    url: "/",
    locale: "en_US",
    images: [
      {
        // Kept small (240²) so WhatsApp/iMessage render the inline side-by-side
        // thumbnail card instead of a full-width banner.
        url: "/logo-mark.png",
        width: 240,
        height: 240,
        alt: "CareerLaunchPad",
      },
    ],
  },
  twitter: {
    // "summary" renders the logo as a small thumbnail beside the title/description.
    card: "summary",
    title: "CareerLaunchPad — Connecting Rural Talent with Global Opportunities",
    description,
    images: ["/logo-mark.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "CareerLaunchPad",
  url: siteUrl,
  logo: `${siteUrl}/logo.jpeg`,
  slogan: "Connecting Rural Talent with Global Opportunities",
  description,
  knowsAbout: [
    "Career mentorship",
    "Skill development",
    "Employability training",
    "Rural student empowerment",
    "Industry-ready skills",
  ],
  founder: [
    {
      "@type": "Person",
      name: "Darisiguntla Lakshmi Narayana",
      jobTitle: "Founder",
      sameAs: "https://www.linkedin.com/in/lakshminarayana2930/",
    },
    {
      "@type": "Person",
      name: "Korrakuti Paramesh",
      jobTitle: "Co-Founder",
      sameAs: "https://www.linkedin.com/in/paramesh-korrakuti-265b3928/",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
