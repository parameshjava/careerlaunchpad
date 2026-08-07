"use client";

/**
 * GitHub-style Markdown editor: a Write / Preview pair with a small formatting
 * toolbar, for prose fields where a plain textarea loses structure (a staff bio
 * that wants a couple of bullets, a bold line, a link).
 *
 * Preview renders through the SAME RichContent the exam surfaces use, so there
 * is one markdown renderer in the app rather than two that disagree. `math` is
 * off: this is user prose, and a literal "$" would otherwise be swallowed into a
 * KaTeX span (see the note on RichContent's `math` prop).
 *
 * No raw HTML is ever rendered — react-markdown ignores it unless rehype-raw is
 * added, which it deliberately is not here. So a bio is safe to display back to
 * a college admin without an escaping pass of our own.
 */
import { useRef, useState } from "react";
import { Bold, Italic, Link2, List, Code, Heading } from "lucide-react";

import { RichContent } from "@/components/exam/RichContent";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Wrap = { before: string; after?: string; placeholder: string; line?: boolean };

const TOOLS: { key: string; label: string; icon: typeof Bold; wrap: Wrap }[] = [
  { key: "bold", label: "Bold", icon: Bold, wrap: { before: "**", after: "**", placeholder: "bold text" } },
  { key: "italic", label: "Italic", icon: Italic, wrap: { before: "_", after: "_", placeholder: "italic text" } },
  { key: "heading", label: "Heading", icon: Heading, wrap: { before: "### ", placeholder: "Heading", line: true } },
  { key: "list", label: "Bulleted list", icon: List, wrap: { before: "- ", placeholder: "list item", line: true } },
  { key: "link", label: "Link", icon: Link2, wrap: { before: "[", after: "](https://)", placeholder: "link text" } },
  { key: "code", label: "Code", icon: Code, wrap: { before: "`", after: "`", placeholder: "code" } },
];

export function MarkdownEditor({
  value,
  onChange,
  id,
  label,
  hint,
  placeholder,
  minRows = 5,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
  minRows?: number;
  maxLength?: number;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const ref = useRef<HTMLTextAreaElement>(null);

  /**
   * Apply a wrap around the selection, or insert the placeholder when nothing is
   * selected — and leave the inserted text selected, so a second keystroke
   * replaces it instead of appending to it (the behaviour every editor has and
   * whose absence feels broken).
   */
  function apply(w: Wrap) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const body = selected || w.placeholder;

    let insert: string;
    let from: number;
    if (w.line) {
      // Line prefixes go at the start of every selected line, so marking three
      // lines as a list does not produce one bullet with two orphans.
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const chunk = value.slice(lineStart, end) || w.placeholder;
      insert = chunk.split("\n").map((l) => (l.startsWith(w.before) ? l : w.before + l)).join("\n");
      const next = value.slice(0, lineStart) + insert + value.slice(end);
      onChange(maxLength ? next.slice(0, maxLength) : next);
      from = lineStart;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(from, from + insert.length);
      });
      return;
    }

    insert = `${w.before}${body}${w.after ?? ""}`;
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(maxLength ? next.slice(0, maxLength) : next);
    from = start + w.before.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, from + body.length);
    });
  }

  const tabCls = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-background text-foreground border border-b-transparent shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="grid min-w-0 gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="border-input bg-muted/40 min-w-0 overflow-hidden rounded-md border">
        {/* Toolbar row: tabs left, formatting right. Wraps on a phone rather than
            forcing the card wider. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5">
          <div role="tablist" aria-label="Editor mode" className="flex items-center gap-1">
            <button type="button" role="tab" aria-selected={tab === "write"}
              onClick={() => setTab("write")} className={tabCls(tab === "write")}>
              Write
            </button>
            <button type="button" role="tab" aria-selected={tab === "preview"}
              onClick={() => setTab("preview")} className={tabCls(tab === "preview")}>
              Preview
            </button>
          </div>

          {tab === "write" && (
            <div className="flex flex-wrap items-center gap-0.5">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => apply(t.wrap)}
                  className="text-muted-foreground hover:bg-background hover:text-foreground rounded p-1.5 transition-colors"
                >
                  <t.icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === "write" ? (
          <textarea
            id={id}
            ref={ref}
            value={value}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={minRows}
            className="bg-background focus-visible:ring-ring block w-full resize-y px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
          />
        ) : (
          <div
            role="tabpanel"
            className="bg-background px-3 py-2 text-sm"
            style={{ minHeight: `${minRows * 1.5 + 1}rem` }}
          >
            {value.trim() ? (
              <RichContent content={value} math={false} />
            ) : (
              <p className="text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      {/* No whitespace-nowrap: at 320px it clipped the hint mid-word instead of
          wrapping it. The counter is pushed to the right on one line with it. */}
      <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <p className="min-w-0">
          {hint ? `${hint} ` : ""}
          Markdown supported — **bold**, _italic_, - lists, [links](url).
        </p>
        {maxLength ? (
          <span className="tabular-nums">{value.length}/{maxLength}</span>
        ) : null}
      </div>
    </div>
  );
}
