"use client";

/**
 * The in-app help panel for college staff (#107: "need not connect the platform
 * team for any doubts").
 *
 * Content lives in the array below, not the JSX (CLAUDE.md: "keep copy in
 * data") — so the answer to a question we start getting is a new array entry.
 *
 * These are deliberately the questions the DESIGN creates, not generic help:
 *   • "why can't I see student X" — every read is college-scoped, and that is
 *     invisible until it bites.
 *   • "who else here has access" — decision #107 §7 Q4 removed the peer
 *     directory, so a staff member genuinely cannot look this up. Leaving that
 *     as a dead end is precisely how someone ends up emailing us; the honest
 *     answer is "your college admin can see it".
 *   • "why can't I mark a chapter complete" — staff are read-only on progress
 *     unless they're the assigned mentor, which looks like a bug otherwise.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";

type Item = { q: string; a: string; forStaffAdmin?: boolean };

const ITEMS: Item[] = [
  {
    q: "Why can't I see a student I know is at my college?",
    a:
      "You only see students whose profile lists your college. If they picked the wrong one, or " +
      "haven't finished registering, they won't appear — they'll be under “Mid-registration” or " +
      "not on the platform yet. Ask them to check the college on their profile.",
  },
  {
    q: "How do I see how one student is doing?",
    a:
      "Open Students, click the student, then “View progress”. You'll see their chapter scores, " +
      "which subjects are weak, how they're trending, and what would lift their average most — " +
      "the same view they see of themselves.",
  },
  {
    q: "How far has a batch got through the syllabus?",
    a:
      "The Batches section on this page shows the completed-chapter count and a progress bar for " +
      "every batch linked to your college.",
  },
  {
    q: "Why can't I mark a chapter as completed?",
    a:
      "Progress is recorded by whoever teaches the subject. If you're assigned as the mentor on a " +
      "batch subject you can set it from the Mentor hub; otherwise your view is read-only by " +
      "design, so two people can't disagree about what was covered.",
  },
  {
    q: "Who else from my college has access?",
    a:
      "Staff can't see each other's records, so you can't look this up yourself. Your college " +
      "admin has the full list and can add or remove people.",
  },
  {
    q: "How do I get a colleague added?",
    a:
      "Ask your college admin to invite them — an invited colleague is approved automatically and " +
      "just has to sign in. They can also register themselves, in which case your college admin " +
      "approves them.",
    forStaffAdmin: true,
  },
  {
    q: "Someone registered claiming to work here. How do I check?",
    a:
      "We don't verify email domains, so their claim isn't proof. Open the registration and check " +
      "the designation, department and employee ID against your own staff records before " +
      "approving. If something's off, use “Send back” and say what's wrong — they'll be emailed " +
      "your note and can correct it.",
    forStaffAdmin: true,
  },
  {
    q: "Someone has left the college.",
    a:
      "Suspend them from the College staff page. Their access is revoked immediately; they keep " +
      "their account, and you can approve them again if they come back.",
    forStaffAdmin: true,
  },
];

export function StaffHelp({ canSeeStaff = false }: { canSeeStaff?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  // The three approval questions only make sense to someone who can approve.
  const items = ITEMS.filter((i) => !i.forStaffAdmin || canSeeStaff);

  return (
    <section className="bg-card rounded-2xl border p-5">
      <h2 className="text-lg font-semibold tracking-tight">Questions</h2>
      <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
        The things people usually ask. If your answer isn&rsquo;t here, your college admin can help.
      </p>
      <ul className="divide-y">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <li key={item.q}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="hover:text-primary flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium"
              >
                <span className="min-w-0">{item.q}</span>
                <ChevronDown
                  className={`text-muted-foreground size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {isOpen && <p className="text-muted-foreground pb-3 text-sm">{item.a}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
