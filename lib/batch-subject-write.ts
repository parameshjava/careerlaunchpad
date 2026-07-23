// Validates the PUT /api/admin/batches/[id]/subjects payload before it reaches
// the replace_batch_subjects RPC (migration 135). Mirrors lib/batch-write.ts.

export type SubjectAssignment = {
  subjectId: string;
  sortOrder: number;
  mentorIds: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSubjectsPayload(
  body: unknown
): { ok: true; value: SubjectAssignment[] } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.subjects)) return { ok: false, error: "subjects must be a list." };

  const out: SubjectAssignment[] = [];
  const seen = new Set<string>();
  for (const raw of b.subjects) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const subjectId = typeof s.subjectId === "string" ? s.subjectId : "";
    if (!UUID_RE.test(subjectId)) return { ok: false, error: "Each subject needs a valid id." };
    if (seen.has(subjectId)) return { ok: false, error: "A subject was added twice." };
    seen.add(subjectId);

    const mentorIdsIn = Array.isArray(s.mentorIds) ? s.mentorIds : [];
    const mentorIds: string[] = [];
    for (const m of mentorIdsIn) {
      if (typeof m !== "string" || !UUID_RE.test(m))
        return { ok: false, error: "A mentor id is invalid." };
      if (!mentorIds.includes(m)) mentorIds.push(m);
    }

    out.push({ subjectId, sortOrder: out.length, mentorIds });
  }
  return { ok: true, value: out };
}
