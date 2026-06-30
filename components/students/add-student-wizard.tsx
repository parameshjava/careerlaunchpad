"use client";

/**
 * Admin "Add a student" — the same multi-step profile wizard a student fills on
 * self-registration (shared StepBody/Stepper), but the admin also types the
 * student's email and the whole thing is staged + invited in one shot via
 * /api/admin/intake/student (the single-row counterpart to the Excel import).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  type Form, type RefData, type College,
  EMPTY, StepBody, Stepper,
} from "@/components/students/registration-fields";

// Required-to-add set — mirrors student self-registration's submit rules, mapped
// to the step the field lives on (so we can jump the admin back to fix it).
const REQUIRED: { step: number; check: (f: Form, email: string) => boolean; label: string }[] = [
  { step: 1, check: (f) => !!f.full_name.trim(), label: "Step 1: Full name is required" },
  { step: 1, check: (_f, email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), label: "Step 1: A valid email is required" },
  { step: 1, check: (f) => !!f.phone.trim(), label: "Step 1: Mobile number is required" },
  { step: 2, check: (f) => !!f.college_id, label: "Step 2: College is required" },
  { step: 3, check: (f) => f.career_goal_ids.length > 0, label: "Step 3: Pick at least one career goal" },
  { step: 3, check: (f) => !!f.primary_career_goal_id, label: "Step 3: Mark a primary career goal" },
];

export function AddStudentWizard() {
  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState<College | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null); // invited email on success

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/registration/reference");
      if (res.ok) setRefs(await res.json());
      setLoading(false);
    })();
  }, []);

  async function submit() {
    const missing = REQUIRED.filter((r) => !r.check(f, email));
    if (missing.length) {
      setErrors(missing.map((m) => m.label));
      setStep(missing[0].step);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true); setErrors([]);
    const res = await fetch("/api/admin/intake/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ college_id: f.college_id, email: email.trim(), profile: f }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setErrors([body.error ?? "Could not add the student."]); return; }
    setDone(body.email ?? email.trim());
  }

  function reset() {
    setF(EMPTY); setEmail(""); setCollege(null); setStep(1); setErrors([]); setDone(null);
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading…</p>;
  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load form options.</p>;

  if (done) {
    return (
      <div className="bg-card rounded-3xl border p-8 text-center shadow-xl shadow-[#7c3aed]/5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-emerald-700">
          ✓ Student staged & invited
        </span>
        <h2 className="mt-3 text-xl font-bold">{done}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          They’ve been emailed an invite. Their details become their editable profile when they sign in.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={reset}>Add another</Button>
          <Button asChild className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white">
            <Link href="/dashboard">Back to students</Link>
          </Button>
        </div>
      </div>
    );
  }

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
          onEmailChange={setEmail}
        />

        {errors.length > 0 && (
          <ul className="text-destructive mt-4 space-y-1 text-sm">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" disabled={step === 1 || saving} onClick={() => setStep((s) => Math.max(1, s - 1))}>← Back</Button>
          <span className="text-muted-foreground text-xs font-medium">Step {step} of 6</span>
          {step < 6 ? (
            <Button
              onClick={() => { setStep((s) => Math.min(6, s + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
            >
              Next →
            </Button>
          ) : (
            <Button
              disabled={saving}
              onClick={submit}
              className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
            >
              {saving ? "Adding…" : "Add & invite ✓"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
