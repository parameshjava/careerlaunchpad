"use client";

/**
 * Mentor registration — a short 3-step form wired to the mentor APIs. On mount
 * it loads reference data + the existing profile and RESUMES at
 * last_completed_step + 1 (works for student-converted, pre-filled profiles).
 * Each step saves via PATCH /api/mentor/profile; the final step calls
 * POST …/submit, which marks the form complete and queues it for review (the
 * vetting `status` stays pending_review until an admin approves).
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type Form, type RefData, type Ref, type College,
  EMPTY, FIELD_LABELS, STEP_PAYLOAD, MentorStepBody, MentorStepper,
} from "@/components/mentor/mentor-fields";

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
      <MentorStepper step={step} onJump={setStep} />

      <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        <p className="mb-1 text-[0.72rem] font-bold tracking-[0.08em] text-[#7c3aed] uppercase">Step {step}</p>

        <MentorStepBody
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

