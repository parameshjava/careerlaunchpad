/**
 * GET /bimi/logo.svg — the brand mark served as a BIMI logo
 * (Brand Indicators for Message Identification).
 *
 * BIMI requires the brand mark as an SVG in the Tiny Portable/Secure (SVG P/S)
 * profile, referenced from the domain's DNS BIMI record. The SVG P/S profile
 * prohibits raster <image> elements, scripts, external references and animation,
 * and recommends a file under ~32KB — so the source artwork must be a true
 * vector, not an embedded PNG.
 *
 * The served asset is public/bimi-logo.svg: a hand-authored, square SVG P/S
 * brand mark (gradient launch motif, legible at inbox size ~24px). This handler
 * reads it once and serves it with the correct image/svg+xml content type.
 * Edit public/bimi-logo.svg to change the mark.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
// Logo is static; cache aggressively at the edge/CDN.
export const revalidate = false;

// Read the BIMI vector once at module load (not per request).
const svg = readFileSync(join(process.cwd(), "public", "bimi-logo.svg"), "utf8");

export function GET() {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
