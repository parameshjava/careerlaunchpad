"use client";

/**
 * Shared College-Staff registration wizard UI — the single source of truth for
 * the field layout used by BOTH staff self-registration
 * (app/college-staff/register) and the admin "Add staff" flow
 * (app/dashboard/college-staff/new). Owns the form shape, the 3 step bodies, the
 * building-block inputs, and the stepper. Flow (how it saves/submits) lives in
 * each caller — exactly the split that keeps components/mentor/mentor-fields.tsx
 * serving two callers without either forking it.
 *
 * Two per-caller differences, both props rather than forks:
 *   • email     — editable when `onEmailChange` is given (admin), read-only
 *                 otherwise (the registrant's own address, from their session).
 *   • college   — always read-only here. Self-registration fixes it before the
 *                 wizard opens (register_as_college_staff); the admin flow fixes
 *                 it to the college they are inviting into. Neither may change it
 *                 mid-form, because it decides who reviews the registration.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { PhoneField } from "@/components/ui/phone-input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Stepper } from "@/components/students/registration-fields";
import type { College } from "@/components/colleges/college-picker";

export type Ref = {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  /** Search aliases from ref_degree / ref_branch (migration 161). Absent on the
   *  tables that have no such column, which the combobox handles. */
  search_terms?: string[] | null;
};
export type RefData = Record<string, Ref[]>;
export type { College };

/** One row of college_staff_subject, as the form holds it. */
export type SubjectPick = {
  subject_id: string;
  relation: "teaching" | "taught" | "can_teach";
  since_year?: string;
  last_year?: string;
};

/** A previous employer, as held in college_staff_profile.previous_institutions. */
export type PrevInstitution = { name: string; role: string; from: string; to: string };

export type Form = {
  // Step 1
  full_name: string; phone: string; linkedin_url: string; employee_code: string;
  designation_id: string; designation_other: string;
  department: string; department_other: string;
  office_email: string; bio: string;
  // Step 2
  highest_qualification: string; highest_qualification_other: string;
  specialization: string; specialization_other: string; other_qualifications: string;
  years_teaching_total: string; years_at_this_college: string;
  joined_year: string; years_industry: string;
  previous_institutions: PrevInstitution[];
  certifications: { name: string; year: string }[];
  achievements: { title: string; year: string }[];
  // Step 3
  subjects: SubjectPick[];
  teaching_year_ids: string[]; instruction_language_ids: string[];
  support_area_ids: string[]; contribution_type_ids: string[];
  availability: string; open_to_mentoring: boolean; notes: string;
};

export const EMPTY: Form = {
  full_name: "", phone: "", linkedin_url: "", employee_code: "",
  designation_id: "", designation_other: "",
  department: "", department_other: "",
  office_email: "", bio: "",
  highest_qualification: "", highest_qualification_other: "",
  specialization: "", specialization_other: "", other_qualifications: "",
  years_teaching_total: "", years_at_this_college: "",
  joined_year: "", years_industry: "",
  previous_institutions: [], certifications: [], achievements: [],
  subjects: [],
  teaching_year_ids: [], instruction_language_ids: [],
  support_area_ids: [], contribution_type_ids: [],
  availability: "", open_to_mentoring: false, notes: "",
};

export const STEPS = ["About You", "Experience", "What You Teach"];

export const selectClass =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Fields each step owns — must match STEP_FIELDS in
 * lib/college-staff-registration.ts. `subjects` is carried alongside step 3's
 * columns because it is saved to its own table, not merged into the profile row.
 */
export const STEP_PAYLOAD: Record<number, (f: Form) => Record<string, unknown>> = {
  1: (f) => ({
    full_name: f.full_name, phone: f.phone, linkedin_url: f.linkedin_url,
    employee_code: f.employee_code,
    designation_id: f.designation_id, designation_other: f.designation_other,
    department: f.department, department_other: f.department_other,
    office_email: f.office_email, bio: f.bio,
  }),
  2: (f) => ({
    highest_qualification: f.highest_qualification,
    highest_qualification_other: f.highest_qualification_other,
    specialization: f.specialization, specialization_other: f.specialization_other,
    other_qualifications: f.other_qualifications,
    years_teaching_total: f.years_teaching_total,
    years_at_this_college: f.years_at_this_college,
    joined_year: f.joined_year, years_industry: f.years_industry,
    previous_institutions: f.previous_institutions.filter((p) => p.name.trim()),
    certifications: f.certifications.filter((c) => c.name.trim()),
    achievements: f.achievements.filter((a) => a.title.trim()),
  }),
  3: (f) => ({
    teaching_year_ids: f.teaching_year_ids,
    instruction_language_ids: f.instruction_language_ids,
    support_area_ids: f.support_area_ids,
    contribution_type_ids: f.contribution_type_ids,
    availability: f.availability, open_to_mentoring: f.open_to_mentoring, notes: f.notes,
  }),
};

/** The subject rows step 3 sends (separate from the column payload above). */
export const stepSubjects = (f: Form) =>
  f.subjects.filter((s) => s.subject_id).map((s) => ({
    subject_id: s.subject_id,
    relation: s.relation,
    since_year: s.since_year || null,
    last_year: s.last_year || null,
  }));

export type SetForm = <K extends keyof Form>(k: K, v: Form[K]) => void;

// "Other" is a real, selectable option in ref_staff_designation, so the write-in
// box appears only for that slug — matching how the student/mentor forms behave.
const OTHER_SLUG = "other";

/**
 * The step rail. Delegates to the SHARED Stepper the student wizard uses
 * (components/students/registration-fields.tsx), which already takes a `steps`
 * override — so the staff form looks and behaves identically instead of being a
 * fourth near-copy of the same 30 lines.
 */
export function StaffStepper({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return <Stepper step={step} onJump={onJump} steps={STEPS} />;
}

export function StaffStepBody({
  step, f, set, refs, college, email, onEmailChange,
}: {
  step: number; f: Form; set: SetForm; refs: RefData;
  college: College | null;
  email: string | null; onEmailChange?: (v: string) => void;
}) {
  if (step === 1) return (
    <Step title="About You" hint="Who you are and what you do at the college.">
      <Field label="Full Name" required htmlFor="staff-full-name">
        <Input id="staff-full-name" value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Dr. Anitha Rao" />
      </Field>
      <Field label="Email" required={!!onEmailChange}>
        <Input
          type="email"
          value={email ?? ""}
          onChange={onEmailChange ? (e) => onEmailChange(e.target.value) : undefined}
          disabled={!onEmailChange}
          readOnly={!onEmailChange}
          placeholder="faculty@college.edu"
        />
      </Field>

      {/* College is fixed, not picked: it decides who reviews this registration. */}
      <div className="min-w-0 sm:col-span-2">
        <Label>College</Label>
        <div className="bg-muted/40 mt-1.5 rounded-md border px-3 py-2.5 text-sm">
          {college ? (
            <>
              <span className="font-medium">{college.name}</span>
              {college.place && <span className="text-muted-foreground"> — {college.place}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Your registration is reviewed by this college&rsquo;s admin. To change it, contact them or
          the CareerLaunchpad team.
        </p>
      </div>

      <Field label="Designation" required htmlFor="staff-designation">
        <SelectRef id="staff-designation" grouped value={f.designation_id} onChange={(v) => set("designation_id", v)} options={refs.staff_designation} valueKey="id" />
      </Field>
      {isOther(f.designation_id, refs.staff_designation, "id") && (
        <Field label="Your Designation">
          <Input value={f.designation_other} onChange={(e) => set("designation_other", e.target.value)} placeholder="Type your designation" />
        </Field>
      )}

      <Field label="Department" htmlFor="staff-department">
        <SelectRef id="staff-department" value={f.department} onChange={(v) => set("department", v)} options={refs.branch} />
      </Field>
      {f.department === OTHER_SLUG && (
        <Field label="Your Department">
          <Input value={f.department_other} onChange={(e) => set("department_other", e.target.value)} placeholder="Type your department" />
        </Field>
      )}

      <Field label="Employee ID">
        <Input value={f.employee_code} onChange={(e) => set("employee_code", e.target.value)} placeholder="Optional" />
      </Field>
      <Field label="Mobile Number">
        <PhoneField value={f.phone} onChange={(v) => set("phone", v)} />
      </Field>
      <Field label="Office Email">
        <Input type="email" value={f.office_email} onChange={(e) => set("office_email", e.target.value)} placeholder="Optional — your college address" />
      </Field>
      <Field label="LinkedIn">
        <Input value={f.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
      </Field>
      <div className="min-w-0 sm:col-span-2">
        <MarkdownEditor
          id="staff-bio"
          label="Short Bio"
          value={f.bio}
          onChange={(v) => set("bio", v)}
          placeholder={"A line or two about your teaching and what you focus on.\n\n- 14 years teaching DBMS and OS\n- NPTEL certified"}
          hint="Shown to your college admin and the CareerLaunchpad team."
          maxLength={2000}
        />
      </div>
    </Step>
  );

  if (step === 2) return (
    <Step title="Your Experience" hint="Your qualification and how long you've been teaching. This is what we look at when inviting faculty onto sessions and panels.">
      <Field label="Highest Qualification">
        <SelectRef value={f.highest_qualification} onChange={(v) => set("highest_qualification", v)} options={refs.degree} />
      </Field>
      {f.highest_qualification === OTHER_SLUG && (
        <Field label="Your Qualification">
          <Input value={f.highest_qualification_other} onChange={(e) => set("highest_qualification_other", e.target.value)} placeholder="Type your qualification" />
        </Field>
      )}
      <Field label="Specialization">
        <SelectRef value={f.specialization} onChange={(v) => set("specialization", v)} options={refs.branch} />
      </Field>
      {f.specialization === OTHER_SLUG && (
        <Field label="Your Specialization">
          <Input value={f.specialization_other} onChange={(e) => set("specialization_other", e.target.value)} placeholder="Type your specialization" />
        </Field>
      )}

      <Field label="Total Teaching Experience (years)" required htmlFor="staff-years-teaching">
        <Input id="staff-years-teaching" type="number" min={0} max={70} value={f.years_teaching_total} onChange={(e) => set("years_teaching_total", e.target.value)} placeholder="12" />
      </Field>
      <Field label="Years at This College">
        <Input type="number" min={0} max={70} value={f.years_at_this_college} onChange={(e) => set("years_at_this_college", e.target.value)} placeholder="5" />
      </Field>
      <Field label="Year You Joined">
        <Input type="number" value={f.joined_year} onChange={(e) => set("joined_year", e.target.value)} placeholder="2021" />
      </Field>
      <Field label="Industry Experience (years)">
        <Input type="number" min={0} max={70} value={f.years_industry} onChange={(e) => set("years_industry", e.target.value)} placeholder="0" />
      </Field>

      <div className="grid min-w-0 gap-1.5 sm:col-span-2">
        <Label>Other Qualifications</Label>
        <textarea
          className={`${selectClass} min-h-20 py-2`}
          value={f.other_qualifications}
          onChange={(e) => set("other_qualifications", e.target.value)}
          placeholder="NET / SET / Ph.D. status, additional degrees…"
        />
      </div>

      <div className="min-w-0 space-y-4 sm:col-span-2">
        <RowList
          title="Previous Institutions"
          hint="Where you taught before this college."
          rows={f.previous_institutions}
          onChange={(rows) => set("previous_institutions", rows)}
          blank={{ name: "", role: "", from: "", to: "" }}
          columns={[
            { key: "name", label: "Institution", placeholder: "e.g. SRK College", grow: true },
            { key: "role", label: "Role", placeholder: "Assistant Professor" },
            { key: "from", label: "From", placeholder: "2015", width: "w-24" },
            { key: "to", label: "To", placeholder: "2020", width: "w-24" },
          ]}
        />
        <RowList
          title="Certifications"
          hint="Anything relevant you've been certified on."
          rows={f.certifications}
          onChange={(rows) => set("certifications", rows)}
          blank={{ name: "", year: "" }}
          columns={[
            { key: "name", label: "Certification", placeholder: "e.g. NPTEL — DBMS", grow: true },
            { key: "year", label: "Year", placeholder: "2023", width: "w-24" },
          ]}
        />
        <RowList
          title="Publications & Achievements"
          hint="Papers, awards, or anything you'd want students to know."
          rows={f.achievements}
          onChange={(rows) => set("achievements", rows)}
          blank={{ title: "", year: "" }}
          columns={[
            { key: "title", label: "Title", placeholder: "e.g. IEEE paper on…", grow: true },
            { key: "year", label: "Year", placeholder: "2024", width: "w-24" },
          ]}
        />
      </div>
    </Step>
  );

  return (
    <Step title="What You Teach" hint="The subjects you handle now, what you've taught before, and anything else you could take. This is how we match you to batches and sessions.">
      <div className="min-w-0 space-y-4 sm:col-span-2">
        {refs.subject && refs.subject.length > 0 ? (
          <>
            <SubjectPicker
              title="Subjects You Teach Now"
              hint="Your current teaching load."
              relation="teaching"
              yearLabel="Since"
              subjects={refs.subject}
              value={f.subjects}
              onChange={(v) => set("subjects", v)}
            />
            <SubjectPicker
              title="Subjects You Taught Earlier"
              hint="Previously handled — still useful to us."
              relation="taught"
              yearLabel="Until"
              subjects={refs.subject}
              value={f.subjects}
              onChange={(v) => set("subjects", v)}
            />
            <SubjectPicker
              title="Other Subjects You Could Teach"
              hint="Anything you'd be comfortable taking if asked."
              relation="can_teach"
              subjects={refs.subject}
              value={f.subjects}
              onChange={(v) => set("subjects", v)}
            />
          </>
        ) : (
          <FieldGroup title="Subjects">
            <p className="text-muted-foreground text-sm">
              No subjects are set up yet — an admin can add them under Subjects &amp; Chapters.
            </p>
          </FieldGroup>
        )}

        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
          <FieldGroup title="Years You Teach" hint="Which year(s) of study you handle.">
            <ChipMulti options={refs.year_of_study} selected={f.teaching_year_ids} onChange={(v) => set("teaching_year_ids", v)} valueKey="id" />
          </FieldGroup>
          <FieldGroup title="Languages of Instruction">
            <ChipMulti options={refs.language} selected={f.instruction_language_ids} onChange={(v) => set("instruction_language_ids", v)} valueKey="id" />
          </FieldGroup>
        </div>

        <FieldGroup title="Areas You Can Support" hint="Beyond your subjects — where you can help students.">
          <ChipMulti options={refs.mentoring_area} selected={f.support_area_ids} onChange={(v) => set("support_area_ids", v)} valueKey="id" />
        </FieldGroup>

        <FieldGroup title="How You'd Like to Contribute" hint="Guest sessions, mock interviews, content review — pick any.">
          <ChipMulti options={refs.contribution_type} selected={f.contribution_type_ids} onChange={(v) => set("contribution_type_ids", v)} valueKey="id" />
        </FieldGroup>

        <FieldGroup title="Availability" hint="Roughly how much time you could give, and when.">
          <Input value={f.availability} onChange={(e) => set("availability", e.target.value)} placeholder="e.g. 2 hours a week, Saturdays" />
        </FieldGroup>

        <FieldGroup title="Mentoring">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 h-4 w-4 shrink-0"
              checked={f.open_to_mentoring}
              onChange={(e) => set("open_to_mentoring", e.target.checked)}
            />
            <span>
              I&rsquo;m open to mentoring students one-to-one.
              <span className="text-muted-foreground block text-xs">
                We&rsquo;ll get in touch before adding you to anything.
              </span>
            </span>
          </label>
        </FieldGroup>

        <FieldGroup title="Anything Else" hint="Optional — anything you want the college admin to know.">
          <textarea className={`${selectClass} min-h-20 py-2`} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </FieldGroup>
      </div>
    </Step>
  );
}

// ---- building blocks -------------------------------------------------------

function isOther(value: string, options: Ref[] | undefined, key: "id" | "slug") {
  if (!value) return false;
  return (options ?? []).some((o) => o[key] === value && o.slug === OTHER_SLUG);
}

// `[&>*]:min-w-0` is load-bearing, not decoration: a grid item defaults to
// min-width:auto, so ONE wide child (a long subject name, the phone field's
// country selector, a long branch label in a <select>) widens its whole track
// and the page scrolls sideways on a phone. Verified at 320px — without this the
// wizard overflowed on steps 1 and 3.
function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">{hint}</p>
      <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * `htmlFor` associates the label with its control. Worth passing at least on the
 * mandatory fields: without it a screen reader announces an unlabelled input, and
 * the label is not a click target. (The control must carry the matching `id`.)
 */
function Field({ label, required, htmlFor, children }: {
  label: string; required?: boolean; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={htmlFor}>{label}{required && <span className="text-primary"> *</span>}</Label>
      {children}
    </div>
  );
}

function FieldGroup({ title, required, hint, children }: {
  title: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-muted/20 min-w-0 rounded-xl border p-4">
      <h3 className="text-sm font-semibold">
        {title}{required && <span className="text-primary"> *</span>}
      </h3>
      {hint && <p className="text-muted-foreground mt-0.5 mb-3 text-xs">{hint}</p>}
      <div className={`min-w-0 ${hint ? "" : "mt-3"}`}>{children}</div>
    </section>
  );
}

/**
 * Every single-select on this form is a searchable Combobox, not a bare
 * dropdown. Department and Specialization come from ref_branch — 143 rows after
 * #99 — which is unusable as a scroll list on a phone, and Designation groups
 * into Teaching / Leadership / Placement / Support. Combobox is a drop-in for
 * RefSelect (same prop shape) and adds filtering, sticky group headings, a
 * bottom-sheet panel under `sm`, and alias matching via `search_terms`.
 *
 * It also sidesteps the shadcn SelectTrigger problem: that trigger is
 * `w-fit whitespace-nowrap`, so a long option sized it past its container.
 */
function SelectRef({
  value, onChange, options, placeholder = "Select…", valueKey = "slug", id, grouped = false,
}: {
  value: string; onChange: (v: string) => void; options?: Ref[];
  placeholder?: string; valueKey?: "slug" | "id"; id?: string;
  /**
   * Render `category` as option-group headings. OPT-IN, because Combobox starts a
   * new heading whenever the group changes between CONSECUTIVE options — so it is
   * only meaningful for a list whose rows are already contiguous by category.
   *
   * ref_staff_designation is (its seed groups Teaching / Leadership / Placement /
   * Support in blocks). ref_branch is NOT: its 143 rows are ordered by
   * sort_order and its categories interleave, so grouping it produced a heading
   * above nearly every row. #99 hit the same thing and concluded the grouping
   * belongs on the degree→branch MAPPING rather than ref_branch.category; a
   * department here is where someone WORKS, with no degree to key that off, so it
   * stays a flat searchable list.
   */
  grouped?: boolean;
}) {
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full min-w-0"
      options={(options ?? []).map((o) => ({
        value: o[valueKey],
        label: o.label,
        group: grouped ? o.category : null,
        searchTerms: o.search_terms,
      }))}
    />
  );
}

function ChipMulti({ options, selected, onChange, valueKey = "slug" }: {
  options?: Ref[]; selected: string[]; onChange: (v: string[]) => void; valueKey?: "slug" | "id";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(options ?? []).map((o) => {
        const val = o[valueKey];
        const on = selected.includes(val);
        return (
          <button key={val} type="button"
            onClick={() => onChange(on ? selected.filter((s) => s !== val) : [...selected, val])}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${on ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One relation's slice of `subjects`. All three pickers edit the SAME array —
 * each filters to its own relation and splices its rows back — so the caller
 * holds one flat list that maps 1:1 onto college_staff_subject rows.
 *
 * A subject may legitimately appear under more than one relation (taught it in
 * 2019, teaching it again now), which is why the PK includes `relation` and why
 * these pickers deliberately do not exclude each other's picks.
 */
function SubjectPicker({
  title, hint, relation, yearLabel, subjects, value, onChange,
}: {
  title: string; hint: string;
  relation: SubjectPick["relation"];
  yearLabel?: string;
  subjects: Ref[];
  value: SubjectPick[];
  onChange: (v: SubjectPick[]) => void;
}) {
  const mine = value.filter((s) => s.relation === relation);
  const picked = new Set(mine.map((s) => s.subject_id));

  const toggle = (subjectId: string) => {
    onChange(
      picked.has(subjectId)
        ? value.filter((s) => !(s.relation === relation && s.subject_id === subjectId))
        : [...value, { subject_id: subjectId, relation }],
    );
  };

  const setYear = (subjectId: string, year: string) => {
    const key = relation === "taught" ? "last_year" : "since_year";
    onChange(
      value.map((s) =>
        s.relation === relation && s.subject_id === subjectId ? { ...s, [key]: year } : s,
      ),
    );
  };

  return (
    <FieldGroup title={title} hint={hint}>
      <div className="flex flex-wrap gap-2">
        {subjects.map((s) => {
          const on = picked.has(s.id);
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${on ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* The year inputs appear only once something is picked, so the block stays
          quiet until it has anything to ask about. The name gets its own line on
          a phone (flex-wrap + basis-full) — truncating a subject to nine
          characters to keep a 96px input on the same row helps nobody. */}
      {yearLabel && mine.length > 0 && (
        <div className="mt-3 grid gap-2">
          {mine.map((s) => {
            const label = subjects.find((x) => x.id === s.subject_id)?.label ?? "Subject";
            const val = (relation === "taught" ? s.last_year : s.since_year) ?? "";
            return (
              <div key={s.subject_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto sm:truncate">{label}</span>
                <Label className="text-muted-foreground text-xs whitespace-nowrap">{yearLabel}</Label>
                <Input
                  type="number"
                  className="w-24"
                  value={val}
                  onChange={(e) => setYear(s.subject_id, e.target.value)}
                  placeholder="2023"
                  aria-label={`${yearLabel} — ${label}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </FieldGroup>
  );
}

/**
 * A repeatable list of small records (previous institutions, certifications,
 * achievements) stored as jsonb. Generic over the row shape so the three lists
 * share one implementation instead of three near-identical blocks.
 */
function RowList<T extends Record<string, string>>({
  title, hint, rows, onChange, blank, columns,
}: {
  title: string; hint: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  columns: { key: keyof T & string; label: string; placeholder: string; grow?: boolean; width?: string }[];
}) {
  return (
    <FieldGroup title={title} hint={hint}>
      <div className="grid gap-3">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            {columns.map((c) => (
              <div key={c.key} className={`grid gap-1 ${c.grow ? "min-w-40 flex-1" : c.width ?? "w-28"}`}>
                <Label className="text-muted-foreground text-xs">{c.label}</Label>
                <Input
                  value={row[c.key] ?? ""}
                  placeholder={c.placeholder}
                  onChange={(e) =>
                    onChange(rows.map((r, j) => (j === i ? { ...r, [c.key]: e.target.value } : r)))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive h-10 shrink-0 rounded-md border px-3 text-sm"
              aria-label={`Remove ${title} entry ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, { ...blank }])}
          className="hover:border-primary/50 w-fit rounded-md border border-dashed px-3 py-1.5 text-sm font-medium"
        >
          + Add
        </button>
      </div>
    </FieldGroup>
  );
}
