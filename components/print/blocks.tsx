// Shared content blocks for printable documents — the pieces that sit INSIDE a
// <PrintDocument> (which supplies the letterhead header/footer + A4 geometry):
//
//   • PrintToolbar          — the on-screen action bar (Back / Print / Close);
//                             sits OUTSIDE the printed node, so it never prints.
//   • BrandBlock            — centred cover (college name, title, italic subline).
//   • InfoTable / InfoCell  — the 4-column label/value grid (two InfoCells per row).
//   • SignatureLine         — a signature rule with a caption ("Controller of
//                             Examinations", "Authorised Signatory", …).
//   • ComputerGeneratedNote — the standard "computer-generated document" note.
//
// These carry no brand chrome of their own — only document content. Print inks
// come from lib/print-brand.ts (fixed colours; paper has no dark mode).

import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRINT_INK } from "@/lib/print-brand";

/**
 * On-screen toolbar for a print page. Place it as a sibling ABOVE the ref'd
 * <PrintDocument> so it is excluded from the printed clone; `print:hidden` also
 * hides it if the raw page is printed directly. Pass the Print button(s) as
 * children (a document may have several, e.g. "Print paper" + "Print key").
 */
export function PrintToolbar({
  backHref,
  backLabel = "Back",
  onClose,
  children,
}: {
  backHref?: string;
  backLabel?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Document actions"
      className="mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-3 print:hidden"
    >
      {backHref ? (
        <Button variant="outline" asChild>
          <Link href={backHref}>
            <ArrowLeft /> {backLabel}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            <X /> Close
          </Button>
        )}
      </div>
    </div>
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
    <div className="mb-4 text-center">
      {collegeName && (
        <div className="text-2xl font-bold uppercase leading-tight text-gray-900">
          {collegeName}
        </div>
      )}
      <div className="mt-1 text-lg font-bold text-gray-900">{title}</div>
      <div
        className="inline-block border-b-2 pb-1 text-sm italic text-gray-700"
        style={{ borderColor: PRINT_INK.greenInk }}
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
        style={{ backgroundColor: PRINT_INK.labelBg }}
      >
        {label}
      </td>
      <td className="w-[28%] border border-gray-400 px-2 py-1.5">{value}</td>
    </>
  );
}

/** A signature rule with a caption underneath (and optional sub-caption). */
export function SignatureLine({
  label,
  sub,
  className,
}: {
  label: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <div
        className="mx-auto mt-10 w-[190px] border-t pt-1"
        style={{ borderColor: PRINT_INK.lineStrong }}
      >
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color: PRINT_INK.inkSoft }}
        >
          {label}
        </span>
        {sub && (
          <span
            className="mt-0.5 block text-[11px] font-normal"
            style={{ color: PRINT_INK.inkFaint }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

/** The standard "computer-generated document" disclaimer note. */
export function ComputerGeneratedNote({
  issuedOn,
  children,
  className,
}: {
  issuedOn?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn("text-[11px] leading-relaxed", className)}
      style={{ color: PRINT_INK.inkFaint }}
    >
      {issuedOn && <>Date of issue: {issuedOn} · </>}
      {children ??
        "This is a computer-generated document and does not require a signature."}
    </p>
  );
}
