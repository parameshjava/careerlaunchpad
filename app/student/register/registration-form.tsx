"use client";

/**
 * Student registration — a 6-step form wired to the registration APIs.
 * On mount it loads reference data + the existing profile and RESUMES at
 * last_completed_step + 1 (works for imported/pre-filled profiles too). Each
 * step saves incrementally via PATCH /api/registration/profile; the final step
 * calls POST …/submit. See docs/REGISTRATION_AND_INTAKE_API.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Ref = { id: string; slug: string; label: string; category: string | null };
type RefData = Record<string, Ref[]>;
type College = { id: string; name: string; place: string | null; state?: string | null };

type Form = {
  full_name: string; phone: string; gender: string;
  city_village: string; district: string; state: string;
  college_id: string; degree: string; branch: string; year_of_study: string;
  graduation_year: string; cgpa: string;
  career_goal_ids: string[]; primary_career_goal_id: string;
  skill_assessment: Record<string, number>;
  skills: string[]; interests: string[];
  preferred_mentor_pref_id: string; biggest_challenge: string;
};

const EMPTY: Form = {
  full_name: "", phone: "", gender: "", city_village: "", district: "", state: "",
  college_id: "", degree: "", branch: "", year_of_study: "", graduation_year: "", cgpa: "",
  career_goal_ids: [], primary_career_goal_id: "", skill_assessment: {},
  skills: [], interests: [], preferred_mentor_pref_id: "", biggest_challenge: "",
};

const STEPS = ["Basic Info", "Academics", "Career Goals", "Self Assess", "Skills", "Mentor"];
const selectClass =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

// Only the fields each step PATCHes (must match STEP_FIELDS in lib/registration.ts).
const STEP_PAYLOAD: Record<number, (f: Form) => Record<string, unknown>> = {
  1: (f) => ({ full_name: f.full_name, phone: f.phone, gender: f.gender, city_village: f.city_village, district: f.district, state: f.state }),
  2: (f) => ({ college_id: f.college_id, degree: f.degree, branch: f.branch, year_of_study: f.year_of_study, graduation_year: f.graduation_year, cgpa: f.cgpa }),
  3: (f) => ({ career_goal_ids: f.career_goal_ids, primary_career_goal_id: f.primary_career_goal_id }),
  4: (f) => ({ skill_assessment: f.skill_assessment }),
  5: (f) => ({ skills: f.skills, interests: f.interests }),
  6: (f) => ({ preferred_mentor_pref_id: f.preferred_mentor_pref_id, biggest_challenge: f.biggest_challenge }),
};

export function RegistrationForm() {
  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [email, setEmail] = useState<string | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    (async () => {
      const [refRes, profRes] = await Promise.all([
        fetch("/api/registration/reference"),
        fetch("/api/registration/profile"),
      ]);
      if (refRes.ok) setRefs(await refRes.json());
      if (profRes.ok) {
        const { profile, last_completed_step, registration_status, email } = await profRes.json();
        setEmail(email ?? null);
        if (profile) {
          setF((p) => ({
            ...p,
            ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v != null && (Array.isArray(v) ? true : typeof v !== "object"))),
            career_goal_ids: profile.career_goal_ids ?? [],
            skills: profile.skills ?? [],
            interests: profile.interests ?? [],
            skill_assessment: profile.skill_assessment ?? {},
            graduation_year: profile.graduation_year != null ? String(profile.graduation_year) : "",
            cgpa: profile.cgpa != null ? String(profile.cgpa) : "",
            primary_career_goal_id: profile.primary_career_goal_id ?? "",
            preferred_mentor_pref_id: profile.preferred_mentor_pref_id ?? "",
            college_id: profile.college_id ?? "",
          }));
          if (profile.college) setCollege(profile.college);
        }
        if (registration_status === "submitted") setDone(true);
        setStep(Math.min(6, Math.max(1, (last_completed_step ?? 0) + 1)));
      }
      setLoading(false);
    })();
  }, []);

  async function saveStep(target: number) {
    setSaving(true);
    setErrors([]);
    const res = await fetch("/api/registration/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, data: STEP_PAYLOAD[step](f) }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrors(body.errors ?? [body.error ?? "Could not save. Please try again."]);
      return;
    }
    if (target > 6) {
      const sub = await fetch("/api/registration/profile/submit", { method: "POST" });
      if (sub.ok) { setDone(true); return; }
      const body = await sub.json().catch(() => ({}));
      if (body.missing?.length) {
        setErrors(body.missing.map((m: { step: number; field: string }) => `Step ${m.step}: ${m.field.replace(/_/g, " ")} is required`));
        setStep(body.missing[0].step);
      } else setErrors([body.error ?? "Could not submit."]);
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading your registration…</p>;

  if (done) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl">🎉</div>
        <h2 className="text-xl font-bold">Registration submitted</h2>
        <p className="text-muted-foreground mt-2 text-sm">Thanks! You can come back and update your profile anytime.</p>
        <Button className="mt-6" variant="outline" onClick={() => setDone(false)}>Edit my profile</Button>
      </div>
    );
  }

  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load registration options.</p>;

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n === step ? "active" : n < step ? "done" : "todo";
          return (
            <li key={label} className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => n < step && setStep(n)}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  state === "active" ? "bg-primary text-primary-foreground"
                  : state === "done" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {n}
              </button>
              <span className={`hidden text-xs font-medium sm:inline ${n === step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {i < STEPS.length - 1 && <span className="bg-border mx-1 h-px w-4" />}
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        {step === 1 && (
          <Step title="Basic Information" hint="Tell us who you are and where you're from.">
            <Field label="Full Name" required>
              <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Ravi Kumar" />
            </Field>
            <Field label="Email">
              <Input value={email ?? ""} disabled readOnly />
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
        )}

        {step === 2 && (
          <Step title="Academic Details" hint="Your college and current course.">
            <div className="sm:col-span-2">
              <CollegePicker
                college={college}
                onPick={(c) => { setCollege(c); set("college_id", c?.id ?? ""); }}
              />
            </div>
            <Field label="Degree"><SelectRef value={f.degree} onChange={(v) => set("degree", v)} options={refs.degree} /></Field>
            <Field label="Branch"><SelectRef value={f.branch} onChange={(v) => set("branch", v)} options={refs.branch} /></Field>
            <Field label="Year of Study"><SelectRef value={f.year_of_study} onChange={(v) => set("year_of_study", v)} options={refs.year_of_study} /></Field>
            <Field label="Graduation Year"><Input type="number" value={f.graduation_year} onChange={(e) => set("graduation_year", e.target.value)} placeholder="2026" /></Field>
            <Field label="CGPA / Percentage"><Input value={f.cgpa} onChange={(e) => set("cgpa", e.target.value)} placeholder="e.g. 8.2 or 78" /></Field>
          </Step>
        )}

        {step === 3 && (
          <Step title="Career Aspirations" hint="Pick every goal you're aiming for, then tap the ★ to set one as primary.">
            <div className="sm:col-span-2">
              <GoalPicker
                goals={refs.career_goal}
                selected={f.career_goal_ids}
                primary={f.primary_career_goal_id}
                onChange={(ids, primary) => { set("career_goal_ids", ids); set("primary_career_goal_id", primary); }}
              />
            </div>
          </Step>
        )}

        {step === 4 && (
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
        )}

        {step === 5 && (
          <Step title="Skills & Interests" hint="Pick everything that applies — tap to toggle.">
            <div className="sm:col-span-2">
              <Label className="mb-2 block">Skills</Label>
              <ChipMulti options={refs.skill} selected={f.skills} onChange={(v) => set("skills", v)} />
              <Label className="mt-5 mb-2 block">Interests</Label>
              <ChipMulti options={refs.interest} selected={f.interests} onChange={(v) => set("interests", v)} />
            </div>
          </Step>
        )}

        {step === 6 && (
          <Step title="Mentor Matching" hint="Help us match you with the right mentor.">
            <div className="sm:col-span-2">
              <Label className="mb-2 block">Preferred Mentor Type</Label>
              <ChipSingle options={refs.mentor_preference} selected={f.preferred_mentor_pref_id} onChange={(v) => set("preferred_mentor_pref_id", v)} valueKey="id" />
              <Label className="mt-5 mb-2 block">Biggest Challenge</Label>
              <textarea
                className={`${selectClass} min-h-24 py-2`}
                value={f.biggest_challenge}
                onChange={(e) => set("biggest_challenge", e.target.value)}
                placeholder="What is the biggest obstacle preventing you from achieving your career goal?"
              />
            </div>
          </Step>
        )}

        {errors.length > 0 && (
          <ul className="text-destructive mt-4 space-y-1 text-sm">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={step === 1 || saving} onClick={() => setStep((s) => Math.max(1, s - 1))}>← Back</Button>
          <span className="text-muted-foreground text-xs font-medium">Step {step} of 6</span>
          <Button disabled={saving} onClick={() => saveStep(step + 1)}>
            {saving ? "Saving…" : step === 6 ? "Submit ✓" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- small building blocks -------------------------------------------------

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

function ChipMulti({ options, selected, onChange }: { options: Ref[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.slug);
        return (
          <button
            key={o.slug}
            type="button"
            onClick={() => onChange(on ? selected.filter((s) => s !== o.slug) : [...selected, o.slug])}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              on ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChipSingle({ options, selected, onChange, valueKey = "slug" }: { options: Ref[]; selected: string; onChange: (v: string) => void; valueKey?: "slug" | "id" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const val = o[valueKey];
        const on = selected === val;
        return (
          <button
            key={val}
            type="button"
            onClick={() => onChange(on ? "" : val)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              on ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select career goals grouped by category, with one starred as primary. */
function GoalPicker({ goals, selected, primary, onChange }: {
  goals: Ref[]; selected: string[]; primary: string; onChange: (ids: string[], primary: string) => void;
}) {
  const categories = Array.from(new Set(goals.map((g) => g.category ?? "Other")));
  const byId = new Map(goals.map((g) => [g.id, g]));

  function toggle(id: string) {
    if (selected.includes(id)) {
      const next = selected.filter((s) => s !== id);
      const nextPrimary = primary === id ? (next[0] ?? "") : primary;
      onChange(next, nextPrimary);
    } else {
      const next = [...selected, id];
      onChange(next, primary || id); // first pick becomes primary
    }
  }
  function star(id: string) {
    const next = selected.includes(id) ? selected : [...selected, id];
    onChange(next, id);
  }

  return (
    <div>
      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-muted-foreground mt-4 mb-2 text-xs font-bold tracking-wide uppercase first:mt-0">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {goals.filter((g) => (g.category ?? "Other") === cat).map((g) => {
              const on = selected.includes(g.id);
              const isPrimary = primary === g.id;
              return (
                <span
                  key={g.id}
                  className={`inline-flex items-center overflow-hidden rounded-full border text-sm font-medium transition ${
                    on ? "border-transparent bg-primary text-primary-foreground" : "bg-background"
                  } ${isPrimary ? "ring-2 ring-primary ring-offset-1" : ""}`}
                >
                  <button type="button" onClick={() => toggle(g.id)} className="py-1.5 pr-2 pl-4">{g.label}</button>
                  {on && (
                    <button
                      type="button"
                      onClick={() => star(g.id)}
                      title="Set as primary goal"
                      className="self-stretch border-l border-white/40 bg-white/15 px-2 hover:bg-white/30"
                    >
                      {isPrimary ? "★" : "☆"}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground mt-4 text-sm">
        {selected.length === 0 ? "No goals selected yet."
          : <>{selected.length} goal{selected.length > 1 ? "s" : ""} selected · Primary: <b className="text-primary">{byId.get(primary)?.label ?? "—"}</b></>}
      </p>
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
