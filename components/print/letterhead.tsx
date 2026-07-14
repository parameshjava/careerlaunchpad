// The official CareerLaunchpad letterhead as print furniture. Every printable
// surface (question papers, results, statements) wraps its content in
// LetterheadFrame so the printout lands on letterhead paper: the brand header
// (navy logo corner + blue→green band with phone/website) repeats at the top
// of every printed page via <thead>, and the address footer repeats at the
// bottom via <tfoot>. Hidden on screen; shown only when printing.
// Source of truth for the design: public/CareerLaunchpad-Letterhead.html.
// Brand colors are fixed print inks — paper doesn't have a dark mode.

const NAVY = "#0e2f55";
const BLUE = "#1470c9";
const GREEN = "#2fa04d";

export function LetterheadFrame({
  docLabel,
  children,
}: {
  /** Small uppercase document type shown under the header, e.g. "Question Paper". */
  docLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <table
      className="w-full"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {/* Letterhead chrome is print-only; screen UIs render their own layout. */}
      <style>{`
        .print-chrome { display: none; }
        @media print {
          /* Full-bleed letterhead: the page owns no margin; the header/footer
             bands run edge-to-edge and the body cell carries the text margin. */
          @page { margin: 0; }
          .print-chrome { display: block !important; }
          .print-chrome-flex { display: flex !important; }
          .lh-body { padding-left: 14mm; padding-right: 14mm; }
        }
      `}</style>
      <thead>
        <tr>
          <td>
            <div className="print-chrome" style={{ position: "relative", height: "21mm", marginBottom: "4mm" }}>
              {/* blue→green band: brand name + phone/website */}
              <div
                style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: "20mm",
                  background: `linear-gradient(95deg, ${BLUE} 15%, ${GREEN} 95%)`,
                  display: "flex", alignItems: "center", paddingLeft: "48mm",
                }}
              >
                <span style={{ color: "#fff", fontSize: "13pt", letterSpacing: "0.06em" }}>
                  <b>CAREER</b>
                  <span style={{ fontWeight: 300 }}>LAUNCHPAD</span>
                </span>
                <span
                  style={{
                    marginLeft: "auto", padding: "0 5mm 0 4mm",
                    borderLeft: "0.4mm solid rgba(255,255,255,.55)",
                    color: "#fff", textAlign: "right", fontSize: "6.8pt", lineHeight: 1.7,
                  }}
                >
                  📞 +91 99635 49926
                  <br />
                  🌐 www.careerlaunchpad.ai
                </span>
              </div>
              {/* navy logo corner, flush with the rule below the band */}
              <div
                style={{
                  position: "absolute", top: 0, left: 0, width: "42mm", height: "21mm",
                  background: NAVY, borderBottomRightRadius: "10mm",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: "1mm",
                }}
              >
                <span
                  style={{
                    width: "11mm", height: "12mm", background: "#fff", borderRadius: "1.6mm",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginRight: "5mm", /* optical center: the corner curve eats the right side */
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/letterhead-logo.png" alt="" style={{ width: "9mm" }} />
                </span>
                <span
                  style={{
                    color: "#cfe3d8", fontSize: "5.6pt", letterSpacing: "0.18em",
                    whiteSpace: "nowrap", marginRight: "5mm", fontWeight: 500,
                  }}
                >
                  LEARN · GROW · SUCCEED
                </span>
              </div>
              {/* thin gradient rule immediately below the band */}
              <div
                style={{
                  position: "absolute", left: 0, right: 0, bottom: 0, height: "1mm",
                  background: `linear-gradient(90deg, ${NAVY} 25%, ${BLUE} 55%, ${GREEN})`,
                }}
              />
            </div>
            {docLabel && (
              <div
                className="print-chrome"
                style={{
                  textAlign: "right", fontSize: "7pt", letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "#6b7280", marginBottom: "2mm",
                  paddingRight: "14mm",
                }}
              >
                {docLabel}
              </div>
            )}
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td>
            {/* The spacer reserves footer room at the bottom of every page; the
                visual band is position:fixed so it pins to the paper edge even
                when the last page's content ends early (tfoot would otherwise
                render right below the content). Fixed elements repeat on every
                printed page. */}
            <div className="print-chrome" style={{ height: "13mm" }} />
            <div
              className="print-chrome"
              style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "9mm", background: NAVY, overflow: "hidden" }}
            >
              <div
                style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: "0.9mm",
                  background: `linear-gradient(90deg, ${BLUE}, ${GREEN})`,
                }}
              />
              <div
                style={{
                  position: "absolute", right: 0, bottom: 0, width: "28mm", height: "7mm",
                  background: `linear-gradient(95deg, ${BLUE}, ${GREEN})`,
                  borderTopLeftRadius: "100% 200%",
                }}
              />
              <div
                style={{
                  position: "absolute", left: "5mm", top: "50%", transform: "translateY(-50%)",
                  display: "flex", alignItems: "center", gap: "1.4mm",
                  color: "#dbe6ef", fontSize: "6.8pt",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons8-google-maps.svg" alt="" style={{ width: "2.8mm", height: "2.8mm" }} />
                Plot 30, Cinema Hall Centre, Yerrabalem Village, Mangalagiri Mandal, Guntur District – 522502
              </div>
            </div>
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="lh-body py-3">{children}</td>
        </tr>
      </tbody>
    </table>
  );
}
