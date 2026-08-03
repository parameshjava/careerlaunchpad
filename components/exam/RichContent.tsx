"use client";

// Shared renderer for exam content (question stems, option labels, passages).
// Content is authored as Markdown that also supports LaTeX math ($…$ / $$…$$ via
// KaTeX) and fenced code blocks (resolved D7 in docs/EXAM_MODULE_SPEC.md). The
// SAME component renders the authoring preview, the student attempt UI, and the
// print/PDF view, so what the author sees is exactly what the student and the
// printed paper show. Visual styling lives in the `.exam-rich` rules in globals.css.
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { cn } from "@/lib/utils";

const REMARK_MATH = [remarkGfm, remarkMath];
const REMARK_PLAIN = [remarkGfm];
const REHYPE_MATH = [rehypeKatex];
const REHYPE_PLAIN: [] = [];

// When `inline` is set (e.g. an option label), paragraphs are unwrapped so the
// text flows on the same line as surrounding UI instead of forming a block.
const INLINE_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
};

// Data tables (common in ICET stems — five years × five columns) get their own
// horizontal scroll box. Without it a wide table is simply clipped at the card's
// edge on a phone: the page itself must never scroll sideways, so the last column
// was unreachable rather than merely off-screen.
const BLOCK_COMPONENTS = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="exam-rich-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export function RichContent({
  content,
  className,
  inline = false,
  math = true,
}: {
  content: string;
  className?: string;
  inline?: boolean;
  /** Parse $…$ / $$…$$ as LaTeX math (KaTeX). On for authored exam content; turn
   * OFF for user-entered prose (e.g. a student's free text), where a literal "$"
   * would otherwise be swallowed into a math span and rendered as garbled KaTeX. */
  math?: boolean;
}) {
  return (
    <div className={cn("exam-rich", inline && "exam-rich-inline", className)}>
      <Markdown
        remarkPlugins={math ? REMARK_MATH : REMARK_PLAIN}
        rehypePlugins={math ? REHYPE_MATH : REHYPE_PLAIN}
        components={inline ? INLINE_COMPONENTS : BLOCK_COMPONENTS}
      >
        {content}
      </Markdown>
    </div>
  );
}
