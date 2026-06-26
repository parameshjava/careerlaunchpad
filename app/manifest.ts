import type { MetadataRoute } from "next";

// PWA manifest (Next App Router file convention) — served at /manifest.webmanifest
// and auto-linked from <head>. Makes the site installable as a desktop/mobile app.
// theme_color matches the brand blue used in the viewport export (app/layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CareerLaunchpad",
    short_name: "CareerLP",
    description:
      "Bridging college to corporate — mentorship, practical skills, and industry connections to help students become job-ready.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
