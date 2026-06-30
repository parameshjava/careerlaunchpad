"use client";

/**
 * Student registration — a 6-step form wired to the registration APIs.
 * On mount it loads reference data + the existing profile and RESUMES at
 * last_completed_step + 1 (works for imported/pre-filled profiles too). Each
 * step saves incrementally via PATCH /api/registration/profile; the final step
 * calls POST …/submit. See docs/REGISTRATION_AND_INTAKE_API.md.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type Form, type RefData, type Ref, type College,
  EMPTY, FIELD_LABELS, STEP_PAYLOAD, StepBody, Stepper,
} from "@/components/students/registration-fields";

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
      <Stepper step={step} onJump={setStep} />

      <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        <p className="mb-1 text-[0.72rem] font-bold tracking-[0.08em] text-[#7c3aed] uppercase">Step {step}</p>
        <StepBody
          step={step}
          f={f}
          set={set}
          refs={refs}
          college={college}
          onPickCollege={setCollege}
          email={email}
        />

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

