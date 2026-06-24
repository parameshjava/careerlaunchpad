"use client";

/**
 * Mentor registration — a short 3-step form wired to the mentor APIs. On mount
 * it loads reference data + the existing profile and RESUMES at
 * last_completed_step + 1 (works for student-converted, pre-filled profiles).
 * Each step saves via PATCH /api/mentor/profile; the final step calls
 * POST …/submit, which marks the form complete and queues it for review (the
 * vetting `status` stays pending_review until an admin approves).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Ref = { id: string; slug: string; label: string; category: string | null };
type RefData = Record<string, Ref[]>;
type College = { id: string; name: string; place: string | null; state?: string | null };

type Form = {
  full_name: string; phone: string; linkedin_url: string; bio: string;
  college_id: string; graduation_year: string; degree: string; branch: string;
  current_company: string; current_title: string; industry_id: string; years_experience: string;
  mentoring_area_ids: string[]; skills: string[]; career_goal_ids: string[];
  mentor_mode_id: string; contribution_type_id: string; availability: string;
};

const EMPTY: Form = {
  full_name: "", phone: "", linkedin_url: "", bio: "",
  college_id: "", graduation_year: "", degree: "", branch: "",
  current_company: "", current_title: "", industry_id: "", years_experience: "",
  mentoring_area_ids: [], skills: [], career_goal_ids: [],
  mentor_mode_id: "", contribution_type_id: "", availability: "",
};

const STEPS = ["About You", "Background", "What You Offer"];

// Friendly labels for the submit-time "X is required" messages, so the form
// shows "Mentoring areas" instead of the raw column name "mentoring area ids".
const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  mentoring_area_ids: "Mentoring areas",
  mentor_mode_id: "Preferred mode",
};
const selectClass =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

// Only the fields each step PATCHes (must match STEP_FIELDS in lib/mentor-registration.ts).
const STEP_PAYLOAD: Record<number, (f: Form) => Record<string, unknown>> = {
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

export function MentorForm() {
  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [email, setEmail] = useState<string | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [status, setStatus] = useState<string>("pending_review");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    (async () => {
      const [refRes, profRes] = await Promise.all([
        fetch("/api/mentor/reference"),
        fetch("/api/mentor/profile"),
      ]);
      if (refRes.ok) setRefs(await refRes.json());
      if (profRes.ok) {
        const { profile, last_completed_step, registration_status, status, email } = await profRes.json();
        setEmail(email ?? null);
        if (status) setStatus(status);
        if (profile) {
          setF((p) => ({
            ...p,
            ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v != null && (Array.isArray(v) ? true : typeof v !== "object"))),
            mentoring_area_ids: profile.mentoring_area_ids ?? [],
            skills: profile.skills ?? [],
            career_goal_ids: profile.career_goal_ids ?? [],
            graduation_year: profile.graduation_year != null ? String(profile.graduation_year) : "",
            years_experience: profile.years_experience != null ? String(profile.years_experience) : "",
            industry_id: profile.industry_id ?? "",
            mentor_mode_id: profile.mentor_mode_id ?? "",
            contribution_type_id: profile.contribution_type_id ?? "",
            college_id: profile.college_id ?? "",
          }));
          if (profile.college) setCollege(profile.college);
        }
        if (registration_status === "submitted") setDone(true);
        setStep(Math.min(3, Math.max(1, (last_completed_step ?? 0) + 1)));
      }
      setLoading(false);
    })();
  }, []);

  async function saveStep(target: number) {
    setSaving(true);
    setErrors([]);
    const res = await fetch("/api/mentor/profile", {
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
    if (target > 3) {
      const sub = await fetch("/api/mentor/profile/submit", { method: "POST" });
      if (sub.ok) { setDone(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const body = await sub.json().catch(() => ({}));
      if (body.missing?.length) {
        setErrors(body.missing.map((m: { step: number; field: string }) => `Step ${m.step}: ${FIELD_LABELS[m.field] ?? m.field.replace(/_/g, " ")} is required`));
        setStep(body.missing[0].step);
        // The missing field is often at the TOP of the step (e.g. Mentoring
        // Areas) while submit is at the bottom — scroll up so it's visible.
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setErrors([body.error ?? "Could not submit."]);
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading your mentor profile…</p>;

  if (done) {
    return <MentorSummary f={f} refs={refs} email={email} college={college} status={status} onEdit={() => setDone(false)} />;
  }

  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load registration options.</p>;

  return (
    <div>
      {/* Stepper — evenly spaced, gradient connectors fill as you progress. */}
      <ol className="mb-7 flex items-start">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const isDone = n < step;
          const reached = n <= step;
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center gap-2">
              {i > 0 && (
                <span
                  className={`absolute top-[15px] right-1/2 h-0.5 w-full ${
                    reached ? "bg-gradient-to-r from-[#2563eb] to-[#7c3aed]" : "bg-border"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => isDone && setStep(n)}
                disabled={!isDone}
                aria-current={active ? "step" : undefined}
                className={`ring-card relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 transition ${
                  active || isDone
                    ? "bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-white shadow-sm"
                    : "border-input text-muted-foreground border-2 bg-background"
                } ${isDone ? "cursor-pointer hover:brightness-110" : ""}`}
              >
                {isDone ? "✓" : n}
              </button>
              <span
                className={`text-center text-[0.7rem] leading-tight font-semibold tracking-wide ${
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
          <Step title="About You" hint="Tell students who they'll be learning from.">
            <Field label="Full Name" required>
              <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Ravi Kumar" />
            </Field>
            <Field label="Email">
              <Input value={email ?? ""} disabled readOnly />
            </Field>
            <Field label="Mobile Number">
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 90000 00000" />
            </Field>
            <Field label="LinkedIn">
              <Input value={f.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
            </Field>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Short Bio</Label>
              <textarea
                className={`${selectClass} min-h-24 py-2`}
                value={f.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="A line or two on your experience and how you like to help students."
              />
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step title="Your Background" hint="Where you studied and what you do now — this helps us match you with the right students (e.g. your own college's juniors).">
            <div className="sm:col-span-2">
              <CollegePicker
                college={college}
                onPick={(c) => { setCollege(c); set("college_id", c?.id ?? ""); }}
              />
            </div>
            <Field label="Graduation Year"><Input type="number" value={f.graduation_year} onChange={(e) => set("graduation_year", e.target.value)} placeholder="2019" /></Field>
            <Field label="Degree"><SelectRef value={f.degree} onChange={(v) => set("degree", v)} options={refs.degree} /></Field>
            <Field label="Branch"><SelectRef value={f.branch} onChange={(v) => set("branch", v)} options={refs.branch} /></Field>
            <Field label="Industry"><SelectRef value={f.industry_id} onChange={(v) => set("industry_id", v)} options={refs.industry} valueKey="id" /></Field>
            <Field label="Current Company"><Input value={f.current_company} onChange={(e) => set("current_company", e.target.value)} placeholder="e.g. Infosys" /></Field>
            <Field label="Current Role"><Input value={f.current_title} onChange={(e) => set("current_title", e.target.value)} placeholder="e.g. Senior Engineer" /></Field>
            <Field label="Years of Experience"><Input type="number" value={f.years_experience} onChange={(e) => set("years_experience", e.target.value)} placeholder="5" /></Field>
          </Step>
        )}

        {step === 3 && (
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
        )}

        {errors.length > 0 && (
          <ul className="text-destructive mt-4 space-y-1 text-sm">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" disabled={step === 1 || saving} onClick={() => setStep((s) => Math.max(1, s - 1))}>← Back</Button>
          <span className="text-muted-foreground text-xs font-medium">Step {step} of 3</span>
          <Button
            disabled={saving}
            onClick={() => saveStep(step + 1)}
            className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
          >
            {saving ? "Saving…" : step === 3 ? "Submit ✓" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- mentor summary (shown once registration is submitted) -----------------

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "⏳ Under review", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "✓ Approved mentor", cls: "bg-emerald-50 text-emerald-700" },
  suspended: { label: "⛔ Paused", cls: "bg-rose-50 text-rose-700" },
};

function MentorSummary({
  f, refs, email, college, status, onEdit,
}: {
  f: Form; refs: RefData | null; email: string | null; college: College | null; status: string; onEdit: () => void;
}) {
  const bySlug = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.slug, r.label]));
  const byId = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.id, r.label]));

  const degreeLabel = bySlug(refs?.degree).get(f.degree) ?? f.degree;
  const branchLabel = bySlug(refs?.branch).get(f.branch) ?? f.branch;
  const industryLabel = byId(refs?.industry).get(f.industry_id) ?? "";
  const modeLabel = byId(refs?.mentor_mode).get(f.mentor_mode_id) ?? "";
  const contributionLabel = byId(refs?.contribution_type).get(f.contribution_type_id) ?? "";
  const areaLabel = byId(refs?.mentoring_area);
  const goalLabel = byId(refs?.career_goal);
  const skillLabel = bySlug(refs?.skill);

  const collegeText = college ? `${college.name}${college.place ? ` — ${college.place}` : ""}` : "";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending_review;

  return (
    <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          <h2 className="mt-2 truncate text-xl font-bold">{f.full_name || "Your mentor profile"}</h2>
          {email && <p className="text-muted-foreground truncate text-sm">{email}</p>}
        </div>
        <Button
          onClick={onEdit}
          className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
        >
          Edit my profile
        </Button>
      </div>

      <Section title="About">
        <Item label="Full name" value={f.full_name} />
        <Item label="Email" value={email} />
        <Item label="Mobile" value={f.phone} />
        <Item label="LinkedIn" value={f.linkedin_url} />
        <Item label="Bio" value={f.bio} className="sm:col-span-2" />
      </Section>

      <Section title="Background">
        <Item label="College" value={collegeText} className="sm:col-span-2" />
        <Item label="Graduation year" value={f.graduation_year} />
        <Item label="Degree" value={degreeLabel} />
        <Item label="Branch" value={branchLabel} />
        <Item label="Industry" value={industryLabel} />
        <Item label="Current company" value={f.current_company} />
        <Item label="Current role" value={f.current_title} />
        <Item label="Experience" value={f.years_experience ? `${f.years_experience} yrs` : ""} />
      </Section>

      <Section title="What You Offer">
        <div className="sm:col-span-2">
          <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Mentoring areas</p>
          <ChipList items={f.mentoring_area_ids.map((id) => areaLabel.get(id) ?? id)} />
          <p className="text-muted-foreground mt-4 mb-1.5 text-xs font-semibold tracking-wide uppercase">Skills</p>
          <ChipList items={f.skills.map((s) => skillLabel.get(s) ?? s)} />
          <p className="text-muted-foreground mt-4 mb-1.5 text-xs font-semibold tracking-wide uppercase">Career goals</p>
          <ChipList items={f.career_goal_ids.map((id) => goalLabel.get(id) ?? id)} />
        </div>
        <Item label="Preferred mode" value={modeLabel} />
        <Item label="Contribution" value={contributionLabel} />
        <Item label="Availability" value={f.availability} className="sm:col-span-2" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b py-5 last:border-b-0 last:pb-0">
      <h3 className="text-[0.72rem] font-bold tracking-[0.08em] text-[#7c3aed] uppercase">{title}</h3>
      <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Item({ label, value, className = "" }: { label: string; value?: string | null; className?: string }) {
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
          <button
            key={val}
            type="button"
            onClick={() => onChange(on ? selected.filter((s) => s !== val) : [...selected, val])}
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

function ChipSingle({ options, selected, onChange, valueKey = "slug" }: {
  options: Ref[]; selected: string; onChange: (v: string) => void; valueKey?: "slug" | "id";
}) {
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
