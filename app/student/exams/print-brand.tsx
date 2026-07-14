// Shared print furniture for student-facing printouts (question paper and
// result). The page frame is the official CareerLaunchpad letterhead
// (components/print/letterhead.tsx) — the content blocks below carry no brand
// chrome of their own, only document content:
//   - PrintFrame: letterhead wrapper (running page header/footer).
//   - BrandBlock: the centered cover (college name, document title, italic
//     subjects line over a green rule).
//   - InfoTable/InfoCell: the 4-column info grid with light-blue label cells.

import { LetterheadFrame } from "@/components/print/letterhead";

const BRAND_GREEN = "#16a34a";

export function PrintFrame({
  docLabel,
  children,
}: {
  docLabel: string;
  children: React.ReactNode;
}) {
  return <LetterheadFrame docLabel={docLabel}>{children}</LetterheadFrame>;
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
    <div className="mb-4 text-center">
      {collegeName && (
        <div className="text-2xl font-bold uppercase leading-tight text-gray-900">
          {collegeName}
        </div>
      )}
      <div className="mt-1 text-lg font-bold text-gray-900">{title}</div>
      <div
        className="inline-block border-b-2 pb-1 text-sm italic text-gray-700"
        style={{ borderColor: BRAND_GREEN }}
      >
        {subline}
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
