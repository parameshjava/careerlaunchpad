// Markdown → HTML for email bodies (issue #82). Uses micromark (the same parser
// react-markdown is built on) with the GFM extension, producing an HTML STRING
// directly — no react-dom/server, so this stays importable from the client-
// reachable server-action graph without tripping Next's build check.
//
// micromark is safe by default: raw HTML is escaped and dangerous URL protocols
// are dropped, so reviewer free-text can't inject markup into the email.
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

export function markdownToEmailHtml(md: string): string {
  return micromark(md, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}
