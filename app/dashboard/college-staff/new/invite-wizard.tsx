"use client";

/**
 * Admin "Invite staff" — the SAME 3-step form a staff member fills on
 * self-registration (shared StaffStepBody), with the admin also typing their
 * email; it is staged onto the invite and sent in one shot via
 * POST /api/admin/college-staff.
 *
 * The invitee gets a login email, shows as Invited until first sign-in, and is
 * AUTO-APPROVED at that point — no review step, because a permission-checked
 * admin creating the invite is the approval (#107 rule 3).
 *
 * One-for-one with app/dashboard/users/add-mentor/add-mentor-wizard.tsx, which
 * is what keeps "one registration form, two entry paths" true rather than
 * aspirational.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  type Form, type RefData, type College, type SubjectPick,
  EMPTY, stepSubjects, StaffStepBody, StaffStepper,
} from "@/components/college-staff/staff-fields";
import { STEP_PAYLOAD } from "@/components/college-staff/staff-fields";

const REQUIRED: { step: number; ok: (f: Form, email: string) => boolean; label: string }[] = [
  { step: 1, ok: (f) => !!f.full_name.trim(), label: "Step 1: Full name is required" },
  { step: 1, ok: (_f, email) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email), label: "Step 1: A valid email is required" },
  { step: 1, ok: (f) => !!f.designation_id, label: "Step 1: Choose a designation" },
  { step: 2, ok: (f) => f.years_teaching_total !== "", label: "Step 2: Total teaching experience is required" },
];

/** Editing a pending invite: pre-fill from its staged profile and PATCH it. */
export type EditInvite = {
  id: string;
  email: string;
  profile: Record<string, unknown>;
  subjects: SubjectPick[];
};

export function InviteStaffWizard({
  college,
  editInvite,
}: {
  college: College;
  editInvite?: EditInvite | null;
}) {
  const editing = !!editInvite;

  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(() =>
    editInvite
      ? {
          ...EMPTY,
          ...(Object.fromEntries(
            Object.entries(editInvite.profile).filter(([k]) => k in EMPTY),
          ) as Partial<Form>),
          subjects: editInvite.subjects,
        }
      : EMPTY,
  );
  const [email, setEmail] = useState(editInvite?.email ?? "");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/college-staff/reference");
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
    setSaving(true);
    setErrors([]);

    // Send every step's columns at once — the invite is created in one shot, so
    // there is no per-step save to piggyback on. Reusing STEP_PAYLOAD keeps the
    // key set identical to what the self-serve form sends.
    const profile = { ...STEP_PAYLOAD[1](f), ...STEP_PAYLOAD[2](f), ...STEP_PAYLOAD[3](f) };

    const res = await fetch("/api/admin/college-staff", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editing
          ? { inviteId: editInvite!.id, email: email.trim(), profile, subjects: stepSubjects(f) }
          : { email: email.trim(), college_id: college.id, profile, subjects: stepSubjects(f) },
      ),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrors(body.errors ?? [body.error ?? `Could not ${editing ? "update" : "invite"} this person.`]);
      return;
    }
    setDone(body.email ?? email.trim());
  }

  function reset() {
    setF(EMPTY); setEmail(""); setStep(1); setErrors([]); setDone(null);
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading…</p>;
  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load form options.</p>;

  if (done) {
    return (
      <div className="bg-card rounded-3xl border p-8 text-center shadow-xl shadow-[#7c3aed]/5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-emerald-700">
          {editing ? "✓ Invite updated" : "✓ Staff invited"}
        </span>
        <h2 className="mt-3 text-xl font-bold break-words">{done}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {editing ? (
            <>The invite has been updated. It still shows as <b>Invited</b> until they sign in.</>
          ) : (
            <>
              They&rsquo;ve been emailed a login link and show as <b>Invited</b> until they sign in.
              Because you invited them, they&rsquo;re <b>approved automatically</b> — no review needed.
            </>
          )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!editing && <Button variant="outline" onClick={reset}>Invite another</Button>}
          <Button asChild className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white">
            <Link href="/dashboard/college-staff?tab=invited">Back to staff</Link>
          </Button>
        </div>
      </div>
    );
  }

  const pct = Math.round((step / 3) * 100);

  return (
    <div>
      <StaffStepper step={step} onJump={setStep} />
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

        <StaffStepBody
          step={step}
          f={f}
          set={set}
          refs={refs}
          college={college}
          email={email}
          onEmailChange={setEmail}
        />

        {errors.length > 0 && (
          <ul className="text-destructive mt-4 space-y-1 text-sm">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
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
              <Link href="/dashboard/college-staff">Cancel</Link>
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
              {saving ? (editing ? "Saving…" : "Inviting…") : editing ? "Save invite ✓" : "Invite ✓"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
