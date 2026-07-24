"use client";

// usePrint — the one print mechanism for every printable surface.
//
// Instead of window.print() on the live page (which needs a `body * {
// visibility:hidden }` trick to hide the app chrome, and breaks inside a Radix
// dialog because the dialog is fixed/transformed/clipped), we clone the target
// node into a throwaway hidden <iframe>, copy the page's stylesheets + <base> so
// Tailwind / the brand font / the logo all resolve, and print THAT. An isolated
// document has no surrounding layout to fight, so it prints identically whether
// the node is on a plain page or inside a modal — and no global visibility trick
// is needed.
//
// Usage:
//   const { printRef, print } = usePrint();
//   <PrintDocument ref={printRef} …>…</PrintDocument>
//   <Button onClick={() => print()}>Print / Download PDF</Button>
//
// Split documents (e.g. question paper vs answer key) call print("key"); the
// part string is stamped as `data-print-part` on the cloned <body>, and the
// document's own CSS shows only the matching half:
//   [data-print-part="key"] .paper-body { display:none }

import { useCallback, useRef } from "react";

export function usePrint<T extends HTMLElement = HTMLDivElement>() {
  const printRef = useRef<T>(null);

  const print = useCallback((part?: string) => {
    const node = printRef.current;
    if (typeof document === "undefined" || !node) return;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      visibility: "hidden",
    });
    document.body.appendChild(iframe);

    const cw = iframe.contentWindow;
    const doc = cw?.document;
    if (!cw || !doc) {
      iframe.remove();
      return;
    }

    // Copy every stylesheet + inline <style> so the clone is styled identically.
    const headStyles = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]'),
    )
      .map((n) => n.outerHTML)
      .join("");

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      iframe.remove();
    };
    // afterprint won't fire while the print dialog is open, so also keep a long
    // safety-net timer in case a browser never fires it at all.
    cw.addEventListener("afterprint", cleanup);

    iframe.onload = () => {
      // Give the copied stylesheets/fonts a tick to apply before printing.
      cw.setTimeout(() => {
        cw.focus();
        cw.print();
        cw.setTimeout(cleanup, 60000);
      }, 150);
    };

    const partAttr = part ? ` data-print-part="${part}"` : "";
    // Force light on paper: strip the `dark` theme class so a document printed
    // while the app is in dark mode still comes out on white with dark ink.
    const htmlClass = document.documentElement.className.replace(/\bdark\b/g, "").trim();
    doc.open();
    doc.write(
      `<!doctype html><html class="${htmlClass}">` +
        `<head><meta charset="utf-8"><base href="${window.location.origin}/">${headStyles}</head>` +
        `<body class="${document.body.className}"${partAttr}>${node.outerHTML}</body></html>`,
    );
    doc.close();
  }, []);

  return { printRef, print };
}
