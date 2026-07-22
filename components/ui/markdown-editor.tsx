"use client";

// GitHub-style Markdown editor: Write/Preview tabs + a formatting toolbar that
// writes the Markdown so users never have to know the syntax. Preview renders
// GFM via the shared <RichContent> renderer (same engine as the exam module).
//
// Originally authored inline for the student-registration "biggest challenge"
// field; promoted here so every surface (registration, course description, …)
// shares one editor. Prose by default (`math={false}`) so a literal "$" stays
// literal; the toolbar covers headings, bold/italic, quote, code, links, and
// bulleted / numbered / task lists.
import { useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
} from "lucide-react";

import { RichContent } from "@/components/exam/RichContent";

export function MarkdownEditor({
  value,
  onChange,
  id,
  placeholder,
  minHeight = "min-h-28",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  minHeight?: string;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const reselect = (start: number, end: number) =>
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(start, end);
      }
    });

  // Read the textarea's LIVE value so back-to-back clicks never see stale state.
  const wrap = (token: string, ph: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const v = ta.value;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = v.slice(s, e) || ph;
    onChange(v.slice(0, s) + token + sel + token + v.slice(e));
    reselect(s + token.length, s + token.length + sel.length);
  };
  const mapLines = (transform: (ln: string, i: number) => string) => {
    const ta = taRef.current;
    if (!ta) return;
    const v = ta.value;
    const { selectionStart: s, selectionEnd: e } = ta;
    const from = v.lastIndexOf("\n", s - 1) + 1;
    const nl = v.indexOf("\n", e);
    const to = nl === -1 ? v.length : nl;
    const out = v.slice(from, to).split("\n").map(transform).join("\n");
    onChange(v.slice(0, from) + out + v.slice(to));
    reselect(from, from + out.length);
  };
  const link = () => {
    const ta = taRef.current;
    if (!ta) return;
    const v = ta.value;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = v.slice(s, e) || "link text";
    const inserted = `[${sel}](https://)`;
    onChange(v.slice(0, s) + inserted + v.slice(e));
    reselect(s + inserted.length - 9, s + inserted.length - 1);
  };

  const TOOLBAR: { key: string; label: string; icon: typeof Bold; run: () => void }[] = [
    { key: "h", label: "Heading", icon: Heading, run: () => mapLines((ln) => `### ${ln}`) },
    { key: "b", label: "Bold", icon: Bold, run: () => wrap("**", "bold text") },
    { key: "i", label: "Italic", icon: Italic, run: () => wrap("_", "italic text") },
    { key: "quote", label: "Quote", icon: Quote, run: () => mapLines((ln) => `> ${ln}`) },
    { key: "code", label: "Code", icon: Code, run: () => wrap("`", "code") },
    { key: "link", label: "Link", icon: LinkIcon, run: link },
    { key: "ul", label: "Bulleted list", icon: List, run: () => mapLines((ln) => `- ${ln || "List item"}`) },
    { key: "ol", label: "Numbered list", icon: ListOrdered, run: () => mapLines((ln, i) => `${i + 1}. ${ln || "List item"}`) },
    { key: "task", label: "Task list", icon: ListChecks, run: () => mapLines((ln) => `- [ ] ${ln || "To do"}`) },
  ];

  return (
    <div className="focus-within:ring-ring overflow-hidden rounded-md border focus-within:ring-1">
      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-y-1 border-b px-1.5 pt-1.5">
        <div className="flex items-center gap-1">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t
                  ? "bg-background border border-b-0 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "write" && (
          <div className="flex items-center gap-0.5 pb-1">
            {TOOLBAR.map((b, i) => (
              <span key={b.key} className="flex items-center">
                {i === 6 && <span className="bg-border mx-1 h-4 w-px" />}
                <button
                  type="button"
                  title={b.label}
                  aria-label={b.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={b.run}
                  className="text-muted-foreground hover:bg-background hover:text-foreground flex size-7 items-center justify-center rounded-md transition"
                >
                  <b.icon className="size-4" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {tab === "write" ? (
        <textarea
          id={id}
          ref={taRef}
          className={`bg-background w-full resize-y px-3 py-2 text-sm focus-visible:outline-none ${minHeight}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div className={`bg-background px-3 py-2 ${minHeight}`}>
          {value.trim() ? (
            <RichContent content={value} math={false} />
          ) : (
            <p className="text-muted-foreground text-sm italic">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
