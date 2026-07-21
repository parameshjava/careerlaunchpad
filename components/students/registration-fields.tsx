"use client";

/**
 * Shared student-profile wizard UI — the single source of truth for the field
 * layout used by BOTH student self-registration (app/student/register) and the
 * admin "Add a student" page (app/dashboard/students/new), so the two stay
 * identical. Owns the form shape, the per-step field bodies, the building-block
 * inputs, and the stepper. Flow (how it's saved/submitted) lives in each caller.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TellUsStep } from "./tell-us-step";

export type Ref = { id: string; slug: string; label: string; category: string | null };
export type RefData = Record<string, Ref[]>;
export type College = { id: string; name: string; place: string | null; state?: string | null };

export type Form = {
  full_name: string; phone: string; gender: string;
  city_village: string; district: string; state: string;
  college_id: string; roll_number: string; degree: string; branch: string; year_of_study: string;
  graduation_year: string; cgpa: string;
  preferred_category_slugs: string[]; // Step 3 (#42): up to 2 preference categories
  career_goal_ids: string[]; primary_career_goal_id: string; // grandfathered (admin/analytics)
  preferred_mentor_pref_id: string; // grandfathered — no longer collected in the wizard, but set by Excel intake & shown read-only
  skill_assessment: Record<string, number>;
  skills: string[]; interests: string[];
  // Step 6 "Tell Us"
  is_first_generation: string; // "yes" | "no" | ""
  date_of_birth: string;
  languages: string[];
  caste_certificate_status: string; // ref_caste_certificate_status.slug
  reservation_category: string;     // ref_reservation_category.slug (only when cert = "has")
  income_band: string;              // ref_income_band.slug
  family_members: { relation: string; occupation: string }[];
  hobbies: string[];
  custom_hobbies: string[];
  biggest_challenge: string;        // Markdown
};

export const EMPTY: Form = {
  full_name: "", phone: "", gender: "", city_village: "", district: "", state: "",
  college_id: "", roll_number: "", degree: "", branch: "", year_of_study: "", graduation_year: "", cgpa: "",
  preferred_category_slugs: [],
  career_goal_ids: [], primary_career_goal_id: "", preferred_mentor_pref_id: "", skill_assessment: {},
  skills: [], interests: [],
  is_first_generation: "", date_of_birth: "", languages: [],
  caste_certificate_status: "", reservation_category: "", income_band: "",
  family_members: [], hobbies: [], custom_hobbies: [], biggest_challenge: "",
};

export const STEPS = ["Basic Info", "Academics", "Career Goals", "Self Assess", "Skills", "Tell Us"];

// Friendly labels for the submit-time "X is required" messages.
export const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  phone: "Mobile number",
  college_id: "College",
  roll_number: "Roll number",
  preferred_category_slugs: "Career paths",
};

export const selectClass =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

// Fields each step owns (must match STEP_FIELDS in lib/registration.ts).
export const STEP_PAYLOAD: Record<number, (f: Form) => Record<string, unknown>> = {
  1: (f) => ({ full_name: f.full_name, phone: f.phone, gender: f.gender, city_village: f.city_village, district: f.district, state: f.state }),
  2: (f) => ({ college_id: f.college_id, roll_number: f.roll_number, degree: f.degree, branch: f.branch, year_of_study: f.year_of_study, graduation_year: f.graduation_year, cgpa: f.cgpa }),
  3: (f) => ({ preferred_category_slugs: f.preferred_category_slugs }),
  4: (f) => ({ skill_assessment: f.skill_assessment }),
  5: (f) => ({ skills: f.skills, interests: f.interests }),
  6: (f) => ({
    is_first_generation: f.is_first_generation === "" ? null : f.is_first_generation === "yes",
    date_of_birth: f.date_of_birth || null,
    languages: f.languages,
    caste_certificate_status: f.caste_certificate_status,
    // Only send a category when they actually hold a certificate.
    reservation_category: f.caste_certificate_status === "has" ? f.reservation_category : "",
    income_band: f.income_band,
    family_members: f.family_members.filter((m) => m.relation || m.occupation),
    hobbies: f.hobbies,
    custom_hobbies: f.custom_hobbies,
    biggest_challenge: f.biggest_challenge,
  }),
};

export type SetForm = <K extends keyof Form>(k: K, v: Form[K]) => void;

/** The fields for one wizard step. Email is editable when onEmailChange is given
 * (admin add) and read-only otherwise (self-registration shows the session email). */
export function StepBody({
  step, f, set, refs, college, onPickCollege, email, onEmailChange,
}: {
  step: number; f: Form; set: SetForm; refs: RefData;
  college: College | null; onPickCollege: (c: College | null) => void;
  email: string | null; onEmailChange?: (v: string) => void;
}) {
  if (step === 1) return (
    <Step title="Basic Information" hint="Tell us who you are and where you're from.">
      <Field label="Full Name" required>
        <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Ravi Kumar" />
      </Field>
      <Field label="Email" required={!!onEmailChange}>
        <Input
          type="email"
          value={email ?? ""}
          onChange={onEmailChange ? (e) => onEmailChange(e.target.value) : undefined}
          disabled={!onEmailChange}
          readOnly={!onEmailChange}
          placeholder="student@example.com"
        />
      </Field>
      <Field label="Mobile Number" required>
        <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 90000 00000" />
      </Field>
      <Field label="Gender">
        <SelectRef value={f.gender} onChange={(v) => set("gender", v)} options={refs.gender} placeholder="Select…" />
      </Field>
      <Field label="Village / Mandal / City">
        <Input value={f.city_village} onChange={(e) => set("city_village", e.target.value)} placeholder="e.g. Tenali" />
      </Field>
      <Field label="District">
        <Input value={f.district} onChange={(e) => set("district", e.target.value)} placeholder="e.g. Guntur" />
      </Field>
      <Field label="State">
        <Input value={f.state} onChange={(e) => set("state", e.target.value)} placeholder="e.g. Andhra Pradesh" />
      </Field>
    </Step>
  );

  if (step === 2) return (
    <Step title="Academic Details" hint="Your college and current course.">
      <div className="sm:col-span-2">
        <CollegePicker college={college} onPick={(c) => { onPickCollege(c); set("college_id", c?.id ?? ""); }} />
      </div>
      <Field label="Roll Number" required><Input value={f.roll_number} onChange={(e) => set("roll_number", e.target.value)} placeholder="e.g. 21B81A0512" /></Field>
      <Field label="Degree"><SelectRef value={f.degree} onChange={(v) => set("degree", v)} options={refs.degree} /></Field>
      <Field label="Branch"><SelectRef value={f.branch} onChange={(v) => set("branch", v)} options={refs.branch} /></Field>
      <Field label="Year of Study"><SelectRef value={f.year_of_study} onChange={(v) => set("year_of_study", v)} options={refs.year_of_study} /></Field>
      <Field label="Graduation Year"><Input type="number" value={f.graduation_year} onChange={(e) => set("graduation_year", e.target.value)} placeholder="2026" /></Field>
      <Field label="CGPA / Percentage"><Input value={f.cgpa} onChange={(e) => set("cgpa", e.target.value)} placeholder="e.g. 8.2 or 78" /></Field>
    </Step>
  );

  if (step === 3) return (
    <Step title="Which paths interest you?" hint="Pick up to 2 areas to prepare for. We coach you across each — you can enroll in any specific exam later.">
      <div className="sm:col-span-2">
        <PreferencePicker
          refs={refs}
          selected={f.preferred_category_slugs}
          onChange={(v) => set("preferred_category_slugs", v)}
        />
      </div>
    </Step>
  );

  if (step === 4) return (
    <Step title="Current Skill Assessment" hint="Rate yourself from 1 (beginner) to 5 (confident).">
      <div className="sm:col-span-2 divide-y">
        {refs.skill_assessment_category.map((cat) => (
          <div key={cat.slug} className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm font-medium">{cat.label}</span>
            <Rating value={f.skill_assessment[cat.slug] ?? 0} onChange={(v) => set("skill_assessment", { ...f.skill_assessment, [cat.slug]: v })} />
          </div>
        ))}
      </div>
    </Step>
  );

  if (step === 5) return (
    <Step title="Skills & Interests" hint="Pick everything that applies — tap to toggle.">
      <div className="sm:col-span-2">
        <Label className="mb-2 block">Skills</Label>
        <GroupedChipMulti options={refs.skill} selected={f.skills} onChange={(v) => set("skills", v)} />
        <Label className="mt-5 mb-2 block">Interests</Label>
        <GroupedChipMulti options={refs.interest} selected={f.interests} onChange={(v) => set("interests", v)} fallback="Interests" />
      </div>
    </Step>
  );

  return <TellUsStep f={f} set={set} refs={refs} />;
}

/** Stepper rail — completed steps are clickable to jump back. */
export function Stepper({
  step,
  onJump,
  steps = STEPS,
}: {
  step: number;
  onJump: (n: number) => void;
  /** Override the rail labels (defaults to the student STEPS). */
  steps?: string[];
}) {
  return (
    <ol className="mb-7 flex items-start">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        const reached = n <= step;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2">
            {i > 0 && (
              <span className={`absolute top-[15px] right-1/2 h-0.5 w-full ${reached ? "bg-gradient-to-r from-[#2563eb] to-[#7c3aed]" : "bg-border"}`} />
            )}
            <button
              type="button"
              onClick={() => done && onJump(n)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              className={`ring-card relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 transition ${
                active || done
                  ? "bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-white shadow-sm"
                  : "border-input text-muted-foreground border-2 bg-background"
              } ${done ? "cursor-pointer hover:brightness-110" : ""}`}
            >
              {done ? "✓" : n}
            </button>
            <span className={`hidden text-center text-[0.7rem] leading-tight font-semibold tracking-wide sm:block ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- building blocks -------------------------------------------------------

export function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">{hint}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}{required && <span className="text-primary"> *</span>}</Label>
      {children}
    </div>
  );
}

function SelectRef({ value, onChange, options, placeholder = "Select…" }: { value: string; onChange: (v: string) => void; options: Ref[]; placeholder?: string }) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
    </select>
  );
}

function Rating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-md border text-sm font-bold transition ${
            n <= value ? "border-transparent bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-primary/50"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}


/** Chip multi-select grouped into bordered section cards by `category`
 * (competency domain) — a job-portal-style skill picker (Naukri/Shine): each
 * domain is a titled card with a live selected-count, and every chip carries a
 * +/✓ affordance so selection is unambiguous and the rows read as intentional. */
function GroupedChipMulti({ options, selected, onChange, fallback = "Other" }: { options: Ref[]; selected: string[]; onChange: (v: string[]) => void; fallback?: string }) {
  // Bucket by category, preserving first-seen order (options arrive sort_order'd).
  // Uncategorised options (e.g. interests) collapse into one `fallback` card.
  const groups: { name: string; items: Ref[] }[] = [];
  for (const o of options) {
    const key = o.category ?? fallback;
    let g = groups.find((x) => x.name === key);
    if (!g) { g = { name: key, items: [] }; groups.push(g); }
    g.items.push(o);
  }
  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const count = g.items.filter((i) => selected.includes(i.slug)).length;
        return (
          <div key={g.name} className="overflow-hidden rounded-xl border">
            <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-3.5 py-2">
              <span className="text-[0.72rem] font-bold tracking-[0.05em] text-[#7c3aed] uppercase">{g.name}</span>
              <span className="text-muted-foreground text-[0.7rem] font-medium tabular-nums">
                {count > 0 ? <span className="text-primary font-semibold">{count} selected</span> : g.items.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 p-3.5">
              {g.items.map((o) => {
                const on = selected.includes(o.slug);
                return (
                  <button
                    key={o.slug}
                    type="button"
                    onClick={() => toggle(o.slug)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-3.5 pl-2.5 text-sm font-medium transition ${
                      on
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40"
                    }`}
                  >
                    {on ? <Check className="size-3.5" /> : <Plus className="size-3.5 opacity-50" />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Preference-category rows from the reference API (#42) — richer than flat Ref.
type PrefCategory = { slug: string; name: string; group_label: string | null; guidance: string };
type ExamRow = { slug: string; label: string; category_slug: string };
type CatSkill = { category_slug: string; skill_slug: string };

const MAX_CATEGORIES = 2;

/**
 * Step 3 (#42): pick up to 2 preference categories. Each card lists the exams it
 * covers (enroll later) and the whole selection yields a consolidated-coaching
 * preview grouped by competency domain (ref_skill.category).
 */
function PreferencePicker({ refs, selected, onChange }: {
  refs: RefData; selected: string[]; onChange: (v: string[]) => void;
}) {
  const cats = (refs.preference_category ?? []) as unknown as PrefCategory[];
  const exams = (refs.exam ?? []) as unknown as ExamRow[];
  const map = (refs.preference_category_skill ?? []) as unknown as CatSkill[];
  const skills = refs.skill ?? [];

  const [capHit, setCapHit] = useState(false);
  const skillBySlug = new Map(skills.map((s) => [s.slug, s]));
  const examsByCat = (slug: string) => exams.filter((e) => e.category_slug === slug);

  function toggle(slug: string) {
    if (selected.includes(slug)) { onChange(selected.filter((s) => s !== slug)); setCapHit(false); }
    else if (selected.length >= MAX_CATEGORIES) { setCapHit(true); }
    else { onChange([...selected, slug]); }
  }

  // Consolidated coaching: union of chosen categories' skills, grouped by domain.
  const chosenSkills = new Set(map.filter((m) => selected.includes(m.category_slug)).map((m) => m.skill_slug));
  const domains: { name: string; items: string[] }[] = [];
  for (const s of skills) {
    if (!chosenSkills.has(s.slug)) continue;
    const dom = s.category ?? "Other";
    let band = domains.find((d) => d.name === dom);
    if (!band) { band = { name: dom, items: [] }; domains.push(band); }
    band.items.push(s.label);
  }
  const examCount = new Set(
    exams.filter((e) => selected.includes(e.category_slug)).map((e) => e.slug),
  ).size;

  // Render categories in order, inserting a heading when group_label changes.
  const rows: React.ReactNode[] = [];
  let lastGroup: string | null | undefined = undefined;
  cats.forEach((c) => {
    if (c.group_label && c.group_label !== lastGroup) {
      rows.push(
        <p key={`g-${c.group_label}`} className="text-[0.7rem] font-bold tracking-[0.06em] text-[#7c3aed] uppercase mt-4 first:mt-0">
          {c.group_label}
        </p>,
      );
    }
    lastGroup = c.group_label;
    const on = selected.includes(c.slug);
    const disabled = !on && selected.length >= MAX_CATEGORIES;
    rows.push(
      <button
        key={c.slug}
        type="button"
        onClick={() => toggle(c.slug)}
        aria-pressed={on}
        disabled={disabled}
        className={`w-full rounded-xl border p-3.5 text-left transition ${
          on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex-1 text-sm font-semibold">{c.name}</span>
          <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>
            {on ? "✓" : ""}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">Coaching: <span className="text-foreground font-medium">{c.guidance}</span></p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {examsByCat(c.slug).map((e) => (
            <span key={e.slug} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[0.7rem]">{e.label}</span>
          ))}
        </div>
        {examsByCat(c.slug).length > 0 && (
          <p className="text-muted-foreground mt-2 text-[0.7rem] italic">Enroll in any of these exams later — no need to decide now.</p>
        )}
      </button>,
    );
  });

  return (
    <div>
      <div className="space-y-2">{rows}</div>

      <p className="text-muted-foreground mt-3 text-sm">
        {selected.length
          ? <>{selected.length} path{selected.length > 1 ? "s" : ""} selected</>
          : "No paths selected yet."}
        <span className={`float-right font-bold tabular-nums ${selected.length === MAX_CATEGORIES ? "text-emerald-600" : ""}`}>
          {selected.length} / {MAX_CATEGORIES}
        </span>
      </p>
      {capHit && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          You can pick up to 2 paths for now. Remove one to add another.
        </p>
      )}

      {selected.length > 0 && (
        <div className="mt-5 rounded-xl border p-4">
          <p className="text-[0.7rem] font-bold tracking-[0.06em] text-[#7c3aed] uppercase">Consolidated coaching you'll receive</p>
          <p className="text-muted-foreground mt-1 text-xs">
            <b className="text-foreground">{examCount}</b> exams you can enroll in later · <b className="text-foreground">{chosenSkills.size}</b> topics across <b className="text-foreground">{domains.length}</b> skill areas
          </p>
          <div className="mt-3 space-y-3">
            {domains.map((d) => (
              <div key={d.name}>
                <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-wide uppercase">{d.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.items.map((label) => (
                    <span key={label} className="bg-muted rounded-md px-2 py-1 text-xs">{label}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CollegePicker({ college, onPick }: { college: College | null; onPick: (c: College | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (college || query.trim().length < 2) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query)}`);
      if (res.ok) { setResults((await res.json()).results); setOpen(true); }
    }, 250);
  }, [query, college]);

  return (
    <div className="relative grid gap-1.5">
      <Label>College <span className="text-primary">*</span></Label>
      <Input
        autoComplete="off"
        placeholder="Search your college…"
        value={college ? `${college.name}${college.place ? ` — ${college.place}` : ""}` : query}
        onChange={(e) => { onPick(null); setQuery(e.target.value); }}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && !college && results.length > 0 && (
        <ul className="border-input bg-background absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="hover:bg-muted w-full px-3 py-2 text-left" onClick={() => { onPick(c); setOpen(false); }}>
                {c.name}{c.place ? <span className="text-muted-foreground"> — {c.place}{c.state ? `, ${c.state}` : ""}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
