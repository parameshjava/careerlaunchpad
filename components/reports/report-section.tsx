/**
 * One numbered section of a report, with the anchor the sticky jump-nav targets.
 *
 * The sections exist because the page answers four different questions and used
 * to present them as six equally-weighted cards, so the two a staff member acts
 * on (which subjects are weak, which students are behind) were last and unlabelled.
 * Numbering them states the reading order out loud.
 */
export type SectionDef = { id: string; label: string };

export function ReportSection({
  id,
  num,
  title,
  blurb,
  children,
}: {
  id: string;
  num: number;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    // scroll-mt clears the sticky bar, so a jump link never parks the heading
    // underneath it.
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-36 space-y-4">
      <div>
        <h2 id={`${id}-h`} className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
          <span className="text-muted-foreground tabular-nums">{num}</span>
          <span>{title}</span>
        </h2>
        {blurb && <p className="text-muted-foreground text-sm">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}
