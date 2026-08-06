// Shapes for editing the feedback instrument (issue #84 §F9, migration 170).
//
// Kept separate from lib/feedback-query.ts on purpose: that module is the READ side of
// live feedback (a student's form, a mentor's aggregates, staff's identified rows) and
// is imported by half the app. This one is the authoring side — one screen, one
// permission, and a shape that includes editable draft state the read side must never
// carry.
import type { ItemGroup } from "@/lib/feedback-query";

export type FormItemDraft = {
  /** Absent on a row the admin has just added and not yet saved. */
  id?: string;
  dimensionKey: string;
  prompt: string;
  shortLabel: string | null;
  itemGroup: ItemGroup;
  sortOrder: number;
  responseType: "rating5" | "choice";
  choices: string[] | null;
  required: boolean;
  allowNa: boolean;
};

export type FormVersion = {
  id: string;
  scope: string;
  version: number;
  status: "draft" | "active" | "retired";
  publishedAt: string | null;
  createdAt: string;
  /** Windows opened with this version — the number that makes versioning legible. */
  requestCount: number;
  responseCount: number;
  items: FormItemDraft[];
};

const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function toFormItem(r: Record<string, unknown>): FormItemDraft {
  return {
    id: str(r.id) ?? undefined,
    dimensionKey: (str(r.dimension_key) ?? "") as string,
    prompt: (str(r.prompt) ?? "") as string,
    shortLabel: str(r.short_label),
    itemGroup: (str(r.item_group) ?? "teaching") as ItemGroup,
    sortOrder: num(r.sort_order),
    responseType: (str(r.response_type) ?? "rating5") as FormItemDraft["responseType"],
    choices: Array.isArray(r.choices) ? (r.choices as string[]) : null,
    required: r.required !== false,
    allowNa: r.allow_na !== false,
  };
}

export function toFormVersion(r: Record<string, unknown>): FormVersion {
  return {
    id: r.id as string,
    scope: (str(r.scope) ?? "chapter") as string,
    version: num(r.version),
    status: (str(r.status) ?? "draft") as FormVersion["status"],
    publishedAt: str(r.published_at),
    createdAt: (str(r.created_at) ?? "") as string,
    requestCount: num(r.request_count),
    responseCount: num(r.response_count),
    items: ((r.items as Record<string, unknown>[] | null) ?? []).map(toFormItem),
  };
}

/** Wire shape for PUT /api/admin/feedback/forms/[id]/items. snake_case because it
 *  goes straight into the table the RLS policy guards. */
export function toItemRow(i: FormItemDraft, formId: string, index: number) {
  return {
    form_id: formId,
    dimension_key: i.dimensionKey.trim(),
    prompt: i.prompt.trim(),
    short_label: i.shortLabel?.trim() || null,
    item_group: i.itemGroup,
    // Position in the submitted array IS the order, so a reorder in the UI needs no
    // separate "move" endpoint and cannot leave two items claiming the same slot.
    sort_order: index + 1,
    response_type: i.responseType,
    choices: i.responseType === "choice" ? (i.choices ?? []) : null,
    required: i.required,
    allow_na: i.responseType === "choice" ? false : i.allowNa,
  };
}
