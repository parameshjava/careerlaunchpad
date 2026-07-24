"use client";

/**
 * Admin "Add mentor" — the same 3-step form a mentor fills on self-registration
 * (shared MentorStepBody), but the admin also types the mentor's email and it's
 * staged + invited in one shot via /api/admin/mentor. The mentor gets a login
 * email, shows Pending until first sign-in, then their profile is materialised.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  type Form, type RefData, type College,
  EMPTY, MentorStepBody, MentorStepper,
} from "@/components/mentor/mentor-fields";

const REQUIRED: { step: number; ok: (f: Form, email: string) => boolean; label: string }[] = [
  { step: 1, ok: (f) => !!f.full_name.trim(), label: "Step 1: Full name is required" },
  { step: 1, ok: (_f, email) => /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email), label: "Step 1: A valid email is required" },
  { step: 3, ok: (f) => f.mentoring_area_ids.length > 0, label: "Step 3: Pick at least one mentoring area" },
  { step: 3, ok: (f) => !!f.mentor_mode_id, label: "Step 3: Choose a preferred mode" },
];

/** When editing a pending invite, the wizard pre-fills from its staged profile
 * and saves back to that invite instead of creating a new one. */
export type EditInvite = {
  id: string;
  email: string;
  profile: Record<string, unknown>;
  college: College | null;
};

export function AddMentorWizard({ editInvite }: { editInvite?: EditInvite | null }) {
  const editing = !!editInvite;
  const initialForm: Form = editInvite
    ? { ...EMPTY, ...(Object.fromEntries(Object.entries(editInvite.profile).filter(([k]) => k in EMPTY)) as Partial<Form>) }
    : EMPTY;

  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(initialForm);
  const [email, setEmail] = useState(editInvite?.email ?? "");
  const [college, setCollege] = useState<College | null>(editInvite?.college ?? null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/mentor/reference");
      if (res.ok) setRefs(await res.json());
      setLoading(false);
    })();
  }, []);

  async function submit() {
    const missing = REQUIRED.filter((r) => !r.ok(f, email));
    if (missing.length) {
      setErrors(missing.map((m) => m.label));
      setStep(missing[0].step);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true); setErrors([]);
    const res = await fetch("/api/admin/mentor", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editing
          ? { inviteId: editInvite!.id, email: email.trim(), profile: f }
          : { email: email.trim(), profile: f },
      ),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setErrors([body.error ?? `Could not ${editing ? "update" : "add"} the mentor.`]); return; }
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
          {editing ? "✓ Mentor updated" : "✓ Mentor invited"}
        </span>
        <h2 className="mt-3 text-xl font-bold">{done}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {editing ? (
            <>The invite has been updated. It still shows as <b>Pending</b> until they sign in, when their profile is created from these details.</>
          ) : (
            <>They’ve been emailed a login link and show as <b>Pending</b> until they sign in — their profile is already filled in and appears the moment they do.</>
          )}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!editing && <Button variant="outline" onClick={reset}>Add another</Button>}
          <Button asChild className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white">
            <Link href="/dashboard/team?tab=mentors">Back to team</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Step position, shown as the progress fill in the gradient band (same chrome
  // as the student registration wizard).
  const pct = Math.round((step / 3) * 100);

  return (
    <div>
      <MentorStepper step={step} onJump={setStep} />
      <div className="bg-card overflow-hidden rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        <div className="-mx-5 -mt-5 mb-6 flex items-center justify-between gap-3 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] px-5 py-3 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
          <p className="text-sm font-bold tracking-[0.04em]">Step {step} of 3</p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/25 sm:w-28">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums whitespace-nowrap">{step} / 3</span>
          </div>
        </div>
        <MentorStepBody
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={step === 1 || saving}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="border-2 border-[#2563eb] font-semibold text-[#2563eb] hover:bg-[#2563eb]/5"
            >
              ← Back
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/dashboard/team?tab=mentors">Cancel</Link>
            </Button>
          </div>
          {step < 3 ? (
            <Button
              onClick={() => { setStep((s) => Math.min(3, s + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
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
