"use client";

// Reusable syllabus picker: choose subjects and, per subject, which chapters are
// in scope. Renders the registration-style SectionCard accordion (tinted header
// band + circular chevron). Controlled via value/onChange so any editor can use
// it — today the competitive-exam editor authors an exam's syllabus with it.
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { SubjectWithChapters } from "@/lib/course-query";

export type SubjectSelection = { subjectId: string; chapterIds: string[] };

export function SubjectChapterPicker({
  subjectsRef,
  value,
  onChange,
}: {
  subjectsRef: SubjectWithChapters[];
  value: SubjectSelection[];
  onChange: (next: SubjectSelection[]) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const toggleOpen = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const entryOf = (id: string) => value.find((s) => s.subjectId === id);
  const allChapterIdsOf = (id: string) =>
    subjectsRef.find((s) => s.id === id)?.chapters.map((c) => c.id) ?? [];

  const toggleSubject = (id: string) =>
    onChange(
      value.some((s) => s.subjectId === id)
        ? value.filter((s) => s.subjectId !== id)
        : [...value, { subjectId: id, chapterIds: allChapterIdsOf(id) }]
    );

  const toggleChapter = (subjectId: string, chapterId: string) => {
    const entry = entryOf(subjectId);
    if (!entry) return onChange([...value, { subjectId, chapterIds: [chapterId] }]);
    const has = entry.chapterIds.includes(chapterId);
    const chapterIds = has
      ? entry.chapterIds.filter((c) => c !== chapterId)
      : [...entry.chapterIds, chapterId];
    onChange(value.map((s) => (s.subjectId === subjectId ? { ...s, chapterIds } : s)));
  };

  const setChaptersFor = (subjectId: string, chapterIds: string[]) =>
    onChange(
      value.some((s) => s.subjectId === subjectId)
        ? value.map((s) => (s.subjectId === subjectId ? { ...s, chapterIds } : s))
        : [...value, { subjectId, chapterIds }]
    );

  const allSubjectsSelected = subjectsRef.length > 0 && value.length === subjectsRef.length;
  const toggleAllSubjects = () =>
    onChange(
      allSubjectsSelected
        ? []
        : subjectsRef.map((s) => ({ subjectId: s.id, chapterIds: s.chapters.map((c) => c.id) }))
    );

  if (subjectsRef.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No subjects yet. Add subjects &amp; chapters under Question Bank first.
      </p>
    );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {value.length} of {subjectsRef.length} subjects selected
        </p>
        <Button type="button" variant="outline" size="sm" onClick={toggleAllSubjects}>
          {allSubjectsSelected ? "Clear all" : "Select all subjects"}
        </Button>
      </div>

      <div className="grid gap-2">
        {subjectsRef.map((subj) => {
          const entry = entryOf(subj.id);
          const selected = Boolean(entry);
          const total = subj.chapters.length;
          const selCount = entry?.chapterIds.length ?? 0;
          const allSelected = total > 0 && selCount === total;
          const isOpen = open.includes(subj.id);
          return (
            <div key={subj.id} className="overflow-hidden rounded-xl border">
              <div
                className={`flex items-center gap-3 bg-gradient-to-r from-[#2563eb]/5 to-[#7c3aed]/5 px-3.5 py-2.5 ${isOpen ? "border-b" : ""}`}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggleSubject(subj.id)}
                  aria-label={`Include ${subj.name}`}
                />
                <button
                  type="button"
                  onClick={() => toggleOpen(subj.id)}
                  aria-expanded={isOpen}
                  className="flex flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-bold">{subj.name}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {selected ? `${selCount} / ${total} chapters` : `${total} chapters`}
                    </span>
                  </span>
                  <span className="border-[#7c3aed]/30 bg-background flex size-7 shrink-0 items-center justify-center rounded-full border shadow-sm">
                    <ChevronDown
                      className={`size-4 text-[#7c3aed] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </span>
                </button>
              </div>
              {isOpen && (
                <div className="px-3.5 py-3">
                  {total === 0 ? (
                    <p className="text-muted-foreground text-xs">No chapters under this subject.</p>
                  ) : (
                    <div className="grid gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setChaptersFor(subj.id, allSelected ? [] : subj.chapters.map((c) => c.id))
                        }
                        className="text-primary w-fit text-xs font-medium hover:underline"
                      >
                        {allSelected ? "Clear all chapters" : "Select all chapters"}
                      </button>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {subj.chapters.map((ch) => (
                          <label key={ch.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={entry?.chapterIds.includes(ch.id) ?? false}
                              onCheckedChange={() => toggleChapter(subj.id, ch.id)}
                            />
                            {ch.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
