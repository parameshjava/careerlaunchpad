// Shared branded print furniture for student-facing printouts (question paper
// and result), matching the CareerLaunchPad assessment docx template:
//   - PrintFrame: thead/tfoot table wrapper → running page header (logo · brand
//     · document label) and footer repeated on every printed page.
//   - BrandBlock: the centered cover lockup (logo, brand name, document title,
//     italic subjects line over a green rule).
//   - InfoTable/InfoCell: the 4-column info grid with light-blue label cells.
// Brand colors are fixed print inks (blue #2563eb / green #16a34a), not theme
// tokens — paper doesn't have a dark mode.

const BRAND_BLUE = "#2563eb";
const BRAND_GREEN = "#16a34a";

export function PrintFrame({
  docLabel,
  children,
}: {
  docLabel: string;
  children: React.ReactNode;
}) {
  return (
    <table className="w-full" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      {/* Running header/footer + branded cover are print furniture: hidden on
          screen (the result page shows its own UI), shown when printing. */}
      <style>{`
        .print-chrome { display: none; }
        @media print {
          .print-chrome { display: block !important; }
          .print-chrome-flex { display: flex !important; }
        }
      `}</style>
      <thead>
        <tr>
          <td>
            <div className="print-chrome print-chrome-flex items-center justify-between border-b border-gray-300 pb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="" className="h-8 w-8 object-contain" />
              <span className="text-sm font-bold" style={{ color: BRAND_BLUE }}>
                CareerLaunchPad
              </span>
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{docLabel}</span> | Multiple Choice
              </span>
            </div>
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td>
            <div className="print-chrome border-t border-gray-300 pt-1 text-center text-[10px] text-gray-600">
              CareerLaunchPad | Prepared for college assessment practice
            </div>
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="py-3">{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function BrandBlock({
  title,
  subline,
  collegeName,
}: {
  title: string;
  subline: string;
  collegeName?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-center gap-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpeg" alt="" className="h-20 w-20 object-contain" />
      <div>
        {collegeName ? (
          <>
            <div className="text-2xl font-bold uppercase leading-tight text-gray-900">
              {collegeName}
            </div>
            <div className="text-xs font-semibold" style={{ color: BRAND_BLUE }}>
              Assessment powered by CareerLaunchPad
            </div>
          </>
        ) : (
          <div className="text-2xl font-bold" style={{ color: BRAND_BLUE }}>
            CareerLaunchPad
          </div>
        )}
        <div className="mt-1 text-lg font-bold text-gray-900">{title}</div>
        <div
          className="border-b-2 pb-1 text-sm italic text-gray-700"
          style={{ borderColor: BRAND_GREEN }}
        >
          {subline}
        </div>
      </div>
    </div>
  );
}

export function InfoTable({ children }: { children: React.ReactNode }) {
  return (
    <table
      className="mb-4 w-full border-collapse text-sm"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <tbody>{children}</tbody>
    </table>
  );
}

/** One label+value pair; put two per <tr> for the template's 4-column grid. */
export function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <>
      <td
        className="w-[22%] border border-gray-400 px-2 py-1.5 font-semibold"
        style={{ backgroundColor: "#dbeafe" }}
      >
        {label}
      </td>
      <td className="w-[28%] border border-gray-400 px-2 py-1.5">{value}</td>
    </>
  );
}
