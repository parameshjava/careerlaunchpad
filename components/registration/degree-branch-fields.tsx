"use client";

/**
 * Degree + Branch, as one dependent field group (issue #99). Shared by the
 * STUDENT wizard (components/students/registration-fields.tsx → Step 2) and the
 * MENTOR wizard (components/mentor/mentor-fields.tsx → Step 2), which had the
 * identical flat-dropdown defect. One component, so the two can't diverge and
 * neither can drift from what the API accepts — the rules it renders come from
 * lib/degree-branch.ts, the same module lib/registration.ts validates with.
 *
 * What it enforces, visually:
 *   • Branch options are derived from the chosen Degree (B.Sc → science subjects,
 *     B.Tech → engineering branches, Diploma → polytechnic branches).
 *   • A degree with branch_mode 'none' (MBA, MCA, M.Com, B.Pharm, Pharm.D,
 *     B.Arch, Other) renders NO Branch field at all and stores null — not "Other".
 *   • Before a degree is chosen, Branch is disabled and says so, rather than
 *     offering 30 options that may all be wrong.
 *   • Changing Degree KEEPS a branch the new degree also offers (B.Tech → B.E
 *     keeps CSE) and clears one it doesn't.
 *   • "Other" reveals a free-text field, so the real answer is captured instead
 *     of discarded (it feeds the admin catalogue's "Other answers" inbox).
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  OTHER_SLUG,
  OTHER_TEXT_MAX,
  branchModeOf,
  branchesForDegree,
  degreeHasBranch,
  groupContiguously,
  isPairAllowed,
  type BranchRow,
  type DegreeBranchRow,
  type DegreeRow,
} from "@/lib/degree-branch";

/** The subset of a form this group owns. */
export type DegreeBranchValue = {
  degree: string;
  degree_other: string;
  branch: string;
  branch_other: string;
};

/** The reference payload this group needs — the enriched `degree` / `branch` rows
 * and the `degree_branch` mapping, all served by /api/registration/reference and
 * /api/mentor/reference. Typed loosely because both callers hold their refs as a
 * `Record<string, Ref[]>` bag. */
export type DegreeBranchRefs = {
  degree?: unknown[];
  branch?: unknown[];
  degree_branch?: unknown[];
};

export function DegreeBranchFields({
  value,
  onPatch,
  refs,
}: {
  value: DegreeBranchValue;
  /** Applies a partial update. Several keys can change at once — picking a degree
   * that doesn't offer the current branch clears the branch in the SAME patch, so
   * the form never briefly holds an invalid pair. */
  onPatch: (patch: Partial<DegreeBranchValue>) => void;
  refs: DegreeBranchRefs;
}) {
  const degrees = (refs.degree ?? []) as DegreeRow[];
  const branches = (refs.branch ?? []) as BranchRow[];
  const pairs = (refs.degree_branch ?? []) as DegreeBranchRow[];

  const degreeOptions: ComboboxOption[] = groupContiguously(degrees, (d) => d.category).map((d) => ({
    value: d.slug,
    label: d.label,
    group: d.category,
    searchTerms: d.search_terms,
  }));

  const offered = branchesForDegree(value.degree, branches, pairs);
  const branchOptions: ComboboxOption[] = groupContiguously(offered, (b) => b.group_label ?? b.category).map(
    (b) => ({
      value: b.slug,
      label: b.label,
      // Per-degree heading wins over the branch's own category — a shared branch
      // sits in different groups under different degrees (migration 161 header).
      group: b.group_label ?? b.category,
      searchTerms: b.search_terms,
    }),
  );

  const showBranch = !value.degree || degreeHasBranch(value.degree, degrees);
  const branchRequired = !!value.degree && branchModeOf(value.degree, degrees) === "required";

  function pickDegree(next: string) {
    const patch: Partial<DegreeBranchValue> = { degree: next };
    // Keep a branch the new degree also offers; drop one it doesn't.
    if (value.branch && !(degreeHasBranch(next, degrees) && isPairAllowed(next, value.branch, pairs))) {
      patch.branch = "";
      patch.branch_other = "";
    }
    if (next !== OTHER_SLUG) patch.degree_other = "";
    onPatch(patch);
  }

  function pickBranch(next: string) {
    onPatch(next === OTHER_SLUG ? { branch: next } : { branch: next, branch_other: "" });
  }

  return (
    <>
      <FieldBox label="Degree">
        <Combobox
          value={value.degree}
          onChange={pickDegree}
          options={degreeOptions}
          placeholder="Select your degree…"
          searchPlaceholder="e.g. btech, b.sc, polytechnic"
          emptyHint="No degree matches that. Pick “Other” and type it in."
          aria-label="Degree"
        />
      </FieldBox>

      {value.degree === OTHER_SLUG && (
        <FieldBox label="Which degree?">
          <Input
            value={value.degree_other}
            onChange={(e) => onPatch({ degree_other: e.target.value })}
            maxLength={OTHER_TEXT_MAX}
            placeholder="Type your degree"
          />
        </FieldBox>
      )}

      {showBranch && (
        <FieldBox label="Branch" required={branchRequired}>
          <Combobox
            value={value.branch}
            onChange={pickBranch}
            options={branchOptions}
            disabled={!value.degree}
            placeholder={value.degree ? "Select your branch…" : "Select your degree first"}
            searchPlaceholder="e.g. cse, computers, mpc"
            emptyHint="Can’t find your branch? Pick “Other” and type it in."
            aria-label="Branch"
          />
        </FieldBox>
      )}

      {showBranch && value.branch === OTHER_SLUG && (
        <FieldBox label="Which branch?">
          <Input
            value={value.branch_other}
            onChange={(e) => onPatch({ branch_other: e.target.value })}
            maxLength={OTHER_TEXT_MAX}
            placeholder="Type your branch or subject combination"
          />
        </FieldBox>
      )}
    </>
  );
}

// Matches the `Field` wrappers in both callers (label + optional required marker
// over the control) so the group sits flush in either grid.
function FieldBox({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {label}
        {required && <span className="text-primary"> *</span>}
      </Label>
      {children}
    </div>
  );
}
