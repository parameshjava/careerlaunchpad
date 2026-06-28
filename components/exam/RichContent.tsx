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

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [rehypeKatex];

// When `inline` is set (e.g. an option label), paragraphs are unwrapped so the
// text flows on the same line as surrounding UI instead of forming a block.
const INLINE_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
};

export function RichContent({
  content,
  className,
  inline = false,
}: {
  content: string;
  className?: string;
  inline?: boolean;
}) {
  return (
    <div className={cn("exam-rich", inline && "exam-rich-inline", className)}>
      <Markdown
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
        components={inline ? INLINE_COMPONENTS : undefined}
      >
        {content}
      </Markdown>
    </div>
  );
}
