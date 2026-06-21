import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
