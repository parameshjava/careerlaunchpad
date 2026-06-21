import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// Branded social-share card (logo + wordmark + vision), generated at build time.
// Next.js auto-emits the <meta property="og:image"> tags from this file.
export const runtime = "nodejs";
export const alt =
  "CareerLaunchpad — Connecting Rural Talent with Global Opportunities";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logoData = readFileSync(join(process.cwd(), "public", "logo.jpeg"));
const logoSrc = `data:image/jpeg;base64,${logoData.toString("base64")}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #f6f8fb 0%, #eef2ff 55%, #f5f3ff 100%)",
          position: "relative",
        }}
      >
        {/* top gradient accent bar */}
        <div
          style={{
            height: 14,
            width: "100%",
            background: "linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)",
          }}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 90px",
          }}
        >
          {/* brand lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <img
              src={logoSrc}
              width={150}
              height={150}
              style={{ borderRadius: 28 }}
            />
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800 }}>
              <span style={{ color: "#0f172a" }}>Career</span>
              <span
                style={{
                  background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Launchpad
              </span>
            </div>
          </div>

          {/* vision statement */}
          <div
            style={{
              marginTop: 48,
              fontSize: 46,
              fontWeight: 600,
              color: "#1e293b",
              lineHeight: 1.25,
              maxWidth: 980,
            }}
          >
            Empowering students to dream bigger, learn smarter, and launch
            successful careers.
          </div>

          {/* tagline */}
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: "#475569",
            }}
          >
            Connecting Rural Talent with Global Opportunities
          </div>
        </div>

        {/* bottom URL strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 90px 56px",
            fontSize: 30,
            fontWeight: 600,
            color: "#2563eb",
          }}
        >
          careerlaunchpad.ai
        </div>
      </div>
    ),
    { ...size }
  );
}
