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

// Friendly labels for the submit-time "X is required" messages, so the form
// shows "Career goals" instead of the raw column name "career goal ids".
const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  phone: "Mobile number",
  college_id: "College",
  career_goal_ids: "Career goals",
  primary_career_goal_id: "Primary career goal",
};
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
        setErrors(body.missing.map((m: { step: number; field: string }) => `Step ${m.step}: ${FIELD_LABELS[m.field] ?? m.field.replace(/_/g, " ")} is required`));
        setStep(body.missing[0].step);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setErrors([body.error ?? "Could not submit."]);
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading your registration…</p>;

  if (done) {
    return <ProfileSummary f={f} refs={refs} email={email} college={college} onEdit={() => setDone(false)} />;
  }

  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load registration options.</p>;

  return (
    <div>
      {/* Stepper — evenly spaced, gradient connectors fill as you progress.
          No horizontal scroll: steps flex to fit, labels hide on small screens. */}
      <ol className="mb-7 flex items-start">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          const reached = n <= step;
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center gap-2">
              {/* connector from the previous dot's centre to this one */}
              {i > 0 && (
                <span
                  className={`absolute top-[15px] right-1/2 h-0.5 w-full ${
                    reached ? "bg-gradient-to-r from-[#2563eb] to-[#7c3aed]" : "bg-border"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => done && setStep(n)}
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
              <span
                className={`hidden text-center text-[0.7rem] leading-tight font-semibold tracking-wide sm:block ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        <p className="mb-1 text-[0.72rem] font-bold tracking-[0.08em] text-[#7c3aed] uppercase">Step {step}</p>
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

        <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" disabled={step === 1 || saving} onClick={() => setStep((s) => Math.max(1, s - 1))}>← Back</Button>
          <span className="text-muted-foreground text-xs font-medium">Step {step} of 6</span>
          <Button
            disabled={saving}
            onClick={() => saveStep(step + 1)}
            className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
          >
            {saving ? "Saving…" : step === 6 ? "Submit ✓" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- profile summary (shown once registration is submitted) ----------------

/**
 * Read-only view of the submitted profile. Reads the same in-memory form state
 * (`f` + `refs` + `college` + `email`) the wizard collected, mapping stored
 * slugs/ids back to their human labels via the reference data. "Edit my profile"
 * drops back into the wizard (which already resumes at the last step).
 */
function ProfileSummary({
  f, refs, email, college, onEdit,
}: {
  f: Form; refs: RefData | null; email: string | null; college: College | null; onEdit: () => void;
}) {
  const bySlug = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.slug, r.label]));
  const byId = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.id, r.label]));

  const genderLabel = bySlug(refs?.gender).get(f.gender) ?? f.gender;
  const degreeLabel = bySlug(refs?.degree).get(f.degree) ?? f.degree;
  const branchLabel = bySlug(refs?.branch).get(f.branch) ?? f.branch;
  const yearLabel = bySlug(refs?.year_of_study).get(f.year_of_study) ?? f.year_of_study;
  const goalLabel = byId(refs?.career_goal);
  const skillLabel = bySlug(refs?.skill);
  const interestLabel = bySlug(refs?.interest);
  const mentorLabel = byId(refs?.mentor_preference).get(f.preferred_mentor_pref_id) ?? "";
  const assessCats = refs?.skill_assessment_category ?? [];

  const location = [f.city_village, f.district, f.state].filter(Boolean).join(", ");
  const collegeText = college ? `${college.name}${college.place ? ` — ${college.place}` : ""}` : "";
  const ratedCats = assessCats.filter((c) => (f.skill_assessment[c.slug] ?? 0) > 0);

  return (
    <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-emerald-700">
            ✓ Registration submitted
          </span>
          <h2 className="mt-2 truncate text-xl font-bold">{f.full_name || "Your profile"}</h2>
          {email && <p className="text-muted-foreground truncate text-sm">{email}</p>}
        </div>
        <Button
          onClick={onEdit}
          className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
        >
          Edit my profile
        </Button>
      </div>

      <SummarySection title="Basic Information">
        <SummaryItem label="Full name" value={f.full_name} />
        <SummaryItem label="Email" value={email} />
        <SummaryItem label="Mobile" value={f.phone} />
        <SummaryItem label="Gender" value={genderLabel} />
        <SummaryItem label="Location" value={location} className="sm:col-span-2" />
      </SummarySection>

      <SummarySection title="Academics">
        <SummaryItem label="College" value={collegeText} className="sm:col-span-2" />
        <SummaryItem label="Degree" value={degreeLabel} />
        <SummaryItem label="Branch" value={branchLabel} />
        <SummaryItem label="Year of study" value={yearLabel} />
        <SummaryItem label="Graduation year" value={f.graduation_year} />
        <SummaryItem label="CGPA / %" value={f.cgpa} />
      </SummarySection>

      <SummarySection title="Career Goals">
        {f.career_goal_ids.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {f.career_goal_ids.map((id) => {
              const isPrimary = id === f.primary_career_goal_id;
              return (
                <span
                  key={id}
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${
                    isPrimary ? "border-transparent bg-primary text-primary-foreground" : "bg-background"
                  }`}
                >
                  {isPrimary && "★ "}
                  {goalLabel.get(id) ?? id}
                </span>
              );
            })}
          </div>
        )}
      </SummarySection>

      <SummarySection title="Skill Self-Assessment">
        {ratedCats.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            {ratedCats.map((c) => (
              <div key={c.slug} className="flex items-center justify-between gap-3">
                <span className="text-sm">{c.label}</span>
                <RatingDots value={f.skill_assessment[c.slug] ?? 0} />
              </div>
            ))}
          </div>
        )}
      </SummarySection>

      <SummarySection title="Skills & Interests">
        <div className="sm:col-span-2">
          <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Skills</p>
          <ChipList items={f.skills.map((s) => skillLabel.get(s) ?? s)} />
          <p className="text-muted-foreground mt-4 mb-1.5 text-xs font-semibold tracking-wide uppercase">Interests</p>
          <ChipList items={f.interests.map((s) => interestLabel.get(s) ?? s)} />
        </div>
      </SummarySection>

      <SummarySection title="Mentor">
        <SummaryItem label="Preferred mentor type" value={mentorLabel} />
        <SummaryItem label="Biggest challenge" value={f.biggest_challenge} className="sm:col-span-2" />
      </SummarySection>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b py-5 last:border-b-0 last:pb-0">
      <h3 className="text-[0.72rem] font-bold tracking-[0.08em] text-[#7c3aed] uppercase">{title}</h3>
      <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function SummaryItem({ label, value, className = "" }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`text-sm break-words ${value ? "" : "text-muted-foreground/60"}`}>{value || "—"}</dd>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-muted-foreground/60 text-sm">—</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it} className="bg-muted rounded-full px-3 py-1 text-sm font-medium">{it}</span>
      ))}
    </div>
  );
}

function RatingDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1" title={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-2.5 w-2.5 rounded-full ${n <= value ? "bg-primary" : "bg-muted"}`} />
      ))}
    </span>
  );
}

function Empty() {
  return <p className="text-muted-foreground/60 text-sm sm:col-span-2">Nothing added yet.</p>;
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
