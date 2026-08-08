import type { Metadata, Viewport } from "next";
import "./brand.css";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { ImpersonationBanner } from "@/components/impersonation/ImpersonationBanner";
import { DevAuthBanner } from "@/components/dev/dev-auth-banner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://careerlaunchpad.ai";

const description =
  "Bridging the gap between education and employment by helping students become job-ready through mentorship, practical skills, and industry connections.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CareerLaunchpad — Connecting Rural Talent with Global Opportunities",
    template: "%s | CareerLaunchpad",
  },
  description,
  applicationName: "CareerLaunchpad",
  // iOS standalone "Add to Home Screen": opens chromeless with this title/status bar.
  appleWebApp: {
    capable: true,
    title: "CareerLaunchpad",
    statusBarStyle: "default",
  },
  category: "education",
  verification: {
    other: {
      "facebook-domain-verification": "dou9smfyzzahe15fiyebvx9qlyta4v",
    },
  },
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
    siteName: "CareerLaunchpad",
    title: "CareerLaunchpad — Connecting Rural Talent with Global Opportunities",
    description,
    url: "/",
    locale: "en_US",
    images: [
      {
        // Kept small (240²) so WhatsApp/iMessage render the inline side-by-side
        // thumbnail card instead of a full-width banner.
        url: "/social-logo.png",
        width: 240,
        height: 240,
        alt: "CareerLaunchpad",
      },
    ],
  },
  twitter: {
    // "summary" renders the logo as a small thumbnail beside the title/description.
    card: "summary",
    title: "CareerLaunchpad — Connecting Rural Talent with Global Opportunities",
    description,
    images: ["/social-logo.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "CareerLaunchpad",
  url: siteUrl,
  logo: `${siteUrl}/letterhead-logo.png`,
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
      jobTitle: "CEO, Co-Founder",
      sameAs: "https://www.linkedin.com/in/lakshminarayana2930/",
    },
    {
      "@type": "Person",
      name: "Korrakuti Paramesh",
      jobTitle: "CTO, Co-Founder",
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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        {children}
        <ImpersonationBanner />
        {/* Renders only when BYPASS_AUTH is on locally; inert everywhere else. */}
        <DevAuthBanner />
        <ServiceWorkerRegister />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
