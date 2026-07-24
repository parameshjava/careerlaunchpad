"use client";

// A searchable subject picker, shared by the exam and assessment question banks
// (editors, list filters, and the JSON importers). Wraps SearchableSelect so the
// subject dropdown behaves like the chapter one — typeahead over the shared global
// taxonomy. Self-fetches /api/exam/subjects by default; pass `subjects` to reuse a
// server-provided list (the import pages already load it).
import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/exam/SearchableSelect";

type SubjectOption = { id: string; name: string };

export function SubjectSelect({
  value,
  onChange,
  id,
  subjects: subjectsProp,
  includeArchived = false,
  placeholder = "Select a subject…",
  searchPlaceholder = "Search subjects…",
  emptyOption,
  disabled,
  className,
}: {
  value: string;
  onChange: (subjectId: string) => void;
  id?: string;
  /** Provide to skip the fetch (e.g. import pages that load subjects server-side). */
  subjects?: SubjectOption[];
  includeArchived?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOption?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [fetched, setFetched] = useState<SubjectOption[]>([]);

  useEffect(() => {
    if (subjectsProp) return;
    let alive = true;
    fetch(`/api/exam/subjects${includeArchived ? "?include_archived=true" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setFetched((d.subjects ?? []) as SubjectOption[]);
      })
      .catch(() => {
        if (alive) setFetched([]);
      });
    return () => {
      alive = false;
    };
  }, [subjectsProp, includeArchived]);

  const subjects = subjectsProp ?? fetched;

  return (
    <SearchableSelect
      id={id}
      options={subjects.map((s) => ({ value: s.id, label: s.name }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyOption={emptyOption}
      disabled={disabled}
      className={className}
    />
  );
}
