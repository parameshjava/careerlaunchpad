"use client";

/**
 * Shared mentor-registration wizard UI — the single source of truth for the
 * field layout used by BOTH mentor self-registration (app/mentor/register) and
 * the admin "Add mentor" flow (app/dashboard/users/add-mentor). Owns the form
 * shape, the 3 step bodies, the building-block inputs, and the stepper. Flow
 * (how it saves/submits) lives in each caller. Email is editable when
 * onEmailChange is given (admin) and read-only otherwise (self-registration).
 */
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Ref = { id: string; slug: string; label: string; category: string | null };
export type RefData = Record<string, Ref[]>;
export type College = { id: string; name: string; place: string | null; state?: string | null };

export type Form = {
  full_name: string; phone: string; linkedin_url: string; bio: string;
  college_id: string; graduation_year: string; degree: string; branch: string;
  current_company: string; current_title: string; industry_id: string; years_experience: string;
  mentoring_area_ids: string[]; skills: string[]; career_goal_ids: string[];
  mentor_mode_id: string; contribution_type_id: string; availability: string;
};

export const EMPTY: Form = {
  full_name: "", phone: "", linkedin_url: "", bio: "",
  college_id: "", graduation_year: "", degree: "", branch: "",
  current_company: "", current_title: "", industry_id: "", years_experience: "",
  mentoring_area_ids: [], skills: [], career_goal_ids: [],
  mentor_mode_id: "", contribution_type_id: "", availability: "",
};

export const STEPS = ["About You", "Background", "What You Offer"];

export const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  mentoring_area_ids: "Mentoring areas",
  mentor_mode_id: "Preferred mode",
};

export const selectClass =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

// Fields each step owns (must match STEP_FIELDS in lib/mentor-registration.ts).
export const STEP_PAYLOAD: Record<number, (f: Form) => Record<string, unknown>> = {
  1: (f) => ({ full_name: f.full_name, phone: f.phone, linkedin_url: f.linkedin_url, bio: f.bio }),
  2: (f) => ({
    college_id: f.college_id, graduation_year: f.graduation_year, degree: f.degree, branch: f.branch,
    current_company: f.current_company, current_title: f.current_title,
    industry_id: f.industry_id, years_experience: f.years_experience,
  }),
  3: (f) => ({
    mentoring_area_ids: f.mentoring_area_ids, skills: f.skills, career_goal_ids: f.career_goal_ids,
    mentor_mode_id: f.mentor_mode_id, contribution_type_id: f.contribution_type_id, availability: f.availability,
  }),
};

export type SetForm = <K extends keyof Form>(k: K, v: Form[K]) => void;

export function MentorStepper({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <ol className="mb-7 flex items-start">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const isDone = n < step;
        const reached = n <= step;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2">
            {i > 0 && (
              <span className={`absolute top-[15px] right-1/2 h-0.5 w-full ${reached ? "bg-gradient-to-r from-[#2563eb] to-[#7c3aed]" : "bg-border"}`} />
            )}
            <button
              type="button"
              onClick={() => isDone && onJump(n)}
              disabled={!isDone}
              aria-current={active ? "step" : undefined}
              className={`ring-card relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 transition ${
                active || isDone ? "bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-white shadow-sm" : "border-input text-muted-foreground border-2 bg-background"
              } ${isDone ? "cursor-pointer hover:brightness-110" : ""}`}
            >
              {isDone ? "✓" : n}
            </button>
            <span className={`text-center text-[0.7rem] leading-tight font-semibold tracking-wide ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function MentorStepBody({
  step, f, set, refs, college, onPickCollege, email, onEmailChange,
}: {
  step: number; f: Form; set: SetForm; refs: RefData;
  college: College | null; onPickCollege: (c: College | null) => void;
  email: string | null; onEmailChange?: (v: string) => void;
}) {
  if (step === 1) return (
    <Step title="About You" hint="Tell students who they'll be learning from.">
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
          placeholder="mentor@example.com"
        />
      </Field>
      <Field label="Mobile Number">
        <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 90000 00000" />
      </Field>
      <Field label="LinkedIn">
        <Input value={f.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
      </Field>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>Short Bio</Label>
        <textarea className={`${selectClass} min-h-24 py-2`} value={f.bio} onChange={(e) => set("bio", e.target.value)} placeholder="A line or two on your experience and how you like to help students." />
      </div>
    </Step>
  );

  if (step === 2) return (
    <Step title="Your Background" hint="Where you studied and what you do now — this helps us match you with the right students (e.g. your own college's juniors).">
      <div className="sm:col-span-2">
        <CollegePicker college={college} onPick={(c) => { onPickCollege(c); set("college_id", c?.id ?? ""); }} />
      </div>
      <Field label="Graduation Year"><Input type="number" value={f.graduation_year} onChange={(e) => set("graduation_year", e.target.value)} placeholder="2019" /></Field>
      <Field label="Degree"><SelectRef value={f.degree} onChange={(v) => set("degree", v)} options={refs.degree} /></Field>
      <Field label="Branch"><SelectRef value={f.branch} onChange={(v) => set("branch", v)} options={refs.branch} /></Field>
      <Field label="Industry"><SelectRef value={f.industry_id} onChange={(v) => set("industry_id", v)} options={refs.industry} valueKey="id" /></Field>
      <Field label="Current Company"><Input value={f.current_company} onChange={(e) => set("current_company", e.target.value)} placeholder="e.g. Infosys" /></Field>
      <Field label="Current Role"><Input value={f.current_title} onChange={(e) => set("current_title", e.target.value)} placeholder="e.g. Senior Engineer" /></Field>
      <Field label="Years of Experience"><Input type="number" value={f.years_experience} onChange={(e) => set("years_experience", e.target.value)} placeholder="5" /></Field>
    </Step>
  );

  return (
    <Step title="What You Can Teach" hint="Pick the areas and skills you're happy to mentor on, and how you'd like to help.">
      <div className="sm:col-span-2">
        <Label className="mb-2 block">Mentoring Areas <span className="text-primary">*</span></Label>
        <ChipMulti options={refs.mentoring_area} selected={f.mentoring_area_ids} onChange={(v) => set("mentoring_area_ids", v)} valueKey="id" />
        <Label className="mt-5 mb-2 block">Skills You Can Teach</Label>
        <ChipMulti options={refs.skill} selected={f.skills} onChange={(v) => set("skills", v)} />
        <Label className="mt-5 mb-2 block">Career Goals You Can Guide</Label>
        <ChipMulti options={refs.career_goal} selected={f.career_goal_ids} onChange={(v) => set("career_goal_ids", v)} valueKey="id" />
        <Label className="mt-5 mb-2 block">Preferred Mode <span className="text-primary">*</span></Label>
        <ChipSingle options={refs.mentor_mode} selected={f.mentor_mode_id} onChange={(v) => set("mentor_mode_id", v)} valueKey="id" />
        <Label className="mt-5 mb-2 block">How You'd Like to Contribute</Label>
        <ChipSingle options={refs.contribution_type} selected={f.contribution_type_id} onChange={(v) => set("contribution_type_id", v)} valueKey="id" />
        <Label className="mt-5 mb-2 block">Availability</Label>
        <Input value={f.availability} onChange={(e) => set("availability", e.target.value)} placeholder="e.g. 2 hours a week, weekends" />
      </div>
    </Step>
  );
}

// ---- building blocks -------------------------------------------------------

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">{hint}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}{required && <span className="text-primary"> *</span>}</Label>
      {children}
    </div>
  );
}

function SelectRef({ value, onChange, options, placeholder = "Select…", valueKey = "slug" }: {
  value: string; onChange: (v: string) => void; options: Ref[]; placeholder?: string; valueKey?: "slug" | "id";
}) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o[valueKey]} value={o[valueKey]}>{o.label}</option>)}
    </select>
  );
}

function ChipMulti({ options, selected, onChange, valueKey = "slug" }: {
  options: Ref[]; selected: string[]; onChange: (v: string[]) => void; valueKey?: "slug" | "id";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
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

function ChipSingle({ options, selected, onChange, valueKey = "slug" }: {
  options: Ref[]; selected: string; onChange: (v: string) => void; valueKey?: "slug" | "id";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const val = o[valueKey];
        const on = selected === val;
        return (
          <button key={val} type="button"
            onClick={() => onChange(on ? "" : val)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${on ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}>
            {o.label}
          </button>
        );
      })}
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
      <Label>College (where you studied)</Label>
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
