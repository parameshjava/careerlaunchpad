"use client";

/**
 * College Staff registration — the 3-step form wired to the staff APIs. On mount
 * it loads reference data + the existing profile and RESUMES at
 * last_completed_step + 1. Each step saves via PATCH /api/college-staff/profile;
 * the final step calls POST …/submit, which marks the form complete and queues it
 * for the college admin (the vetting `status` stays pending_review until they
 * approve — and until then the person holds no role at all).
 *
 * Deliberately the same shape as app/mentor/register/mentor-form.tsx, because
 * the console's "Add staff" wizard reuses StaffStepBody the way the mentor
 * wizard reuses MentorStepBody. Flow lives here; fields live in the shared
 * component.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RichContent } from "@/components/exam/RichContent";
import { CollegePicker, type College } from "@/components/colleges/college-picker";
import { FIELD_LABELS, REQUIRED_FIELDS } from "@/lib/college-staff-registration";
import {
  type Form, type RefData, type Ref, type SubjectPick,
  EMPTY, STEP_PAYLOAD, stepSubjects, StaffStepBody, StaffStepper,
} from "@/components/college-staff/staff-fields";
import { startStaffRegistration } from "../actions";

// The console profile editor overrides these to target a specific staff member.
const DEFAULT_ENDPOINTS = {
  profile: "/api/college-staff/profile",
  submit: "/api/college-staff/profile/submit",
};

type ReviewNote = { body: string; kind: string; created_at: string; resolved_at: string | null };

export function StaffForm({
  endpoints = DEFAULT_ENDPOINTS,
  reviewFirst = false,
  enforceMandatory = true,
}: {
  endpoints?: { profile: string; submit: string };
  reviewFirst?: boolean;
  /**
   * Whether a missing mandatory field BLOCKS Next/Submit. False in the console
   * editor: an admin correcting someone else's record may not know their years of
   * experience, and stranding them on step 1 over it would make the record
   * uneditable. The submit API still refuses without them either way — this only
   * decides whether the button is disabled here. Mirrors the student wizard's
   * identically-named prop.
   */
  enforceMandatory?: boolean;
} = {}) {
  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [email, setEmail] = useState<string | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  /** No profile row yet → ask which college first (see startStaffRegistration). */
  const [needsCollege, setNeedsCollege] = useState(false);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  const load = useCallback(async () => {
    const [refRes, profRes] = await Promise.all([
      fetch("/api/college-staff/reference"),
      fetch(endpoints.profile),
    ]);
    if (refRes.ok) setRefs(await refRes.json());
    if (profRes.ok) {
      const body = await profRes.json();
      setEmail(body.email ?? null);
      setStatus(body.status ?? null);
      setNotes(body.review_notes ?? []);
      setCollege(body.college ?? null);

      if (!body.profile) {
        setNeedsCollege(true);
        setLoading(false);
        return;
      }
      setNeedsCollege(false);
      setF(hydrate(body.profile, body.subjects ?? []));
      if (reviewFirst || body.registration_status === "submitted") setDone(true);
      setStep(Math.min(3, Math.max(1, (body.last_completed_step ?? 0) + 1)));
    }
    setLoading(false);
  }, [endpoints.profile, reviewFirst]);

  useEffect(() => { void load(); }, [load]);

  async function saveStep(target: number) {
    setSaving(true);
    setErrors([]);
    const res = await fetch(endpoints.profile, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step,
        data: STEP_PAYLOAD[step](f),
        // Subjects live in their own table and belong to step 3 only.
        ...(step === 3 ? { subjects: stepSubjects(f) } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrors(body.errors ?? [body.error ?? "Could not save. Please try again."]);
      return;
    }
    if (target > 3) {
      const sub = await fetch(endpoints.submit, { method: "POST" });
      if (sub.ok) {
        setDone(true);
        setStatus((s) => (s === "changes_requested" ? "pending_review" : s));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const body = await sub.json().catch(() => ({}));
      if (body.missing?.length) {
        setErrors(
          body.missing.map((m: { step: number; field: string }) =>
            `Step ${m.step}: ${FIELD_LABELS[m.field] ?? m.field.replace(/_/g, " ")} is required`),
        );
        setStep(body.missing[0].step);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setErrors([body.error ?? "Could not submit."]);
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading your registration…</p>;

  if (needsCollege) return <CollegeStep onStarted={() => { setLoading(true); void load(); }} />;

  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load registration options.</p>;

  if (done) {
    return (
      <StaffSummary
        f={f} refs={refs} email={email} college={college} status={status} notes={notes}
        onEdit={() => setDone(false)}
      />
    );
  }

  const openNote = notes.find((n) => !n.resolved_at && n.kind === "changes_requested");

  // Mandatory-field gating, derived from REQUIRED_FIELDS rather than a second
  // hand-written list — that list is what POST …/submit validates, so a copy here
  // would eventually disagree with the server and disable Next over a field the
  // API does not want (or worse, enable it over one the API does).
  const label = (field: string) => FIELD_LABELS[field] ?? field.replace(/_/g, " ");
  const isBlank = (field: string) => !String((f as unknown as Record<string, unknown>)[field] ?? "").trim();
  const missingHere = REQUIRED_FIELDS.filter((r) => r.step === step && isBlank(r.field));
  const missingAnywhere = REQUIRED_FIELDS.filter((r) => isBlank(r.field));
  const canAdvance = !enforceMandatory || missingHere.length === 0;
  // Submit needs every step's mandatory fields, not just this step's — otherwise
  // the button is live on step 3 and the API bounces you back to step 1.
  const canSubmit = !enforceMandatory || missingAnywhere.length === 0;

  return (
    <div>
      <StaffStepper step={step} onJump={setStep} />

      {openNote && <SendBackNotice body={openNote.body} />}

      <div className="bg-card overflow-hidden rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        {/* The same gradient step band the student wizard and the admin invite
            wizard use, rather than a small "STEP 1" label — this form was the
            only one of the three without it. */}
        <div className="-mx-5 -mt-5 mb-6 flex items-center justify-between gap-3 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] px-5 py-3 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
          <p className="text-sm font-bold tracking-[0.04em]">Step {step} of 3</p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/25 sm:w-28">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${Math.round((step / 3) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums whitespace-nowrap">{step} / 3</span>
          </div>
        </div>

        <StaffStepBody step={step} f={f} set={set} refs={refs} college={college} email={email} />

        {/* Say what is missing next to the button that is disabled because of it —
            by the time someone has worked down a step they are looking here, not
            at the rail at the top of the page. */}
        {enforceMandatory && missingHere.length > 0 && (
          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Add your{" "}
            <span className="font-semibold">
              {missingHere.map((m) => label(m.field).toLowerCase()).join(", ")}
            </span>{" "}
            to continue — {missingHere.length === 1 ? "it is" : "they are"} required.
          </p>
        )}

        {/* Blocked by a field on a step you have already left: name it and offer
            the trip back, rather than disabling Submit with no explanation. */}
        {enforceMandatory && step === 3 && missingHere.length === 0 && missingAnywhere.length > 0 && (
          <p className="text-muted-foreground mt-5 text-sm">
            Before you can submit, add your{" "}
            {missingAnywhere.map((m) => label(m.field).toLowerCase()).join(", ")}{" "}
            <button
              type="button"
              onClick={() => setStep(missingAnywhere[0].step)}
              className="text-foreground font-medium underline"
            >
              on step {missingAnywhere[0].step}
            </button>
            .
          </p>
        )}

        {errors.length > 0 && (
          <ul className="text-destructive mt-4 space-y-1 text-sm">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        {/* Footer matches the student wizard: outlined-blue Back on the left,
            gradient Next / emerald Submit on the right. The step counter lives in
            the band above, so it is not repeated here. */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button
            variant="outline"
            disabled={step === 1 || saving}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="border-2 border-[#2563eb] font-semibold text-[#2563eb] hover:bg-[#2563eb]/5"
          >
            ← Back
          </Button>
          {step < 3 ? (
            <Button
              disabled={saving || !canAdvance}
              onClick={() => saveStep(step + 1)}
              className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
            >
              {saving ? "Saving…" : "Next →"}
            </Button>
          ) : (
            <Button
              disabled={saving || !canSubmit}
              onClick={() => saveStep(4)}
              className="bg-emerald-600 font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700"
            >
              {saving ? "Saving…" : "Submit ✓"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Map the API's profile row + subject rows onto the form shape. Only scalars and
 * arrays are copied from `profile`; the jsonb list columns and the subject rows
 * are rebuilt explicitly, since their in-form shape (all-strings, for inputs)
 * differs from what the DB stores.
 */
function hydrate(profile: Record<string, unknown>, subjects: Record<string, unknown>[]): Form {
  const str = (v: unknown) => (v == null ? "" : String(v));
  const list = <T,>(v: unknown, map: (row: Record<string, unknown>) => T): T[] =>
    Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map((x) => map(x as Record<string, unknown>)) : [];

  return {
    ...EMPTY,
    full_name: str(profile.full_name),
    phone: str(profile.phone),
    linkedin_url: str(profile.linkedin_url),
    employee_code: str(profile.employee_code),
    designation_id: str(profile.designation_id),
    designation_other: str(profile.designation_other),
    department: str(profile.department),
    department_other: str(profile.department_other),
    office_email: str(profile.office_email),
    bio: str(profile.bio),
    highest_qualification: str(profile.highest_qualification),
    highest_qualification_other: str(profile.highest_qualification_other),
    specialization: str(profile.specialization),
    specialization_other: str(profile.specialization_other),
    other_qualifications: str(profile.other_qualifications),
    years_teaching_total: str(profile.years_teaching_total),
    years_at_this_college: str(profile.years_at_this_college),
    joined_year: str(profile.joined_year),
    years_industry: str(profile.years_industry),
    previous_institutions: list(profile.previous_institutions, (r) => ({
      name: str(r.name), role: str(r.role), from: str(r.from), to: str(r.to),
    })),
    certifications: list(profile.certifications, (r) => ({ name: str(r.name), year: str(r.year) })),
    achievements: list(profile.achievements, (r) => ({ title: str(r.title), year: str(r.year) })),
    subjects: subjects.map((s) => ({
      subject_id: s.subject_id ? str(s.subject_id) : null,
      subject_name: s.subject_id ? null : str(s.subject_name),
      relation: s.relation as SubjectPick["relation"],
      since_year: str(s.since_year),
      last_year: str(s.last_year),
    })),
    teaching_year_ids: (profile.teaching_year_ids as string[]) ?? [],
    instruction_language_ids: (profile.instruction_language_ids as string[]) ?? [],
    support_area_ids: (profile.support_area_ids as string[]) ?? [],
    contribution_type_ids: (profile.contribution_type_ids as string[]) ?? [],
    availability: str(profile.availability),
    open_to_mentoring: profile.open_to_mentoring === true,
    notes: str(profile.notes),
  };
}

// ---- the college question (only shown before a registration exists) ---------

function CollegeStep({ onStarted }: { onStarted: () => void }) {
  const [college, setCollege] = useState<College | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!college) { setError("Choose the college you work at."); return; }
    setSaving(true); setError(null);
    const res = await startStaffRegistration(college.id);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    onStarted();
  }

  return (
    <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
      <h2 className="text-lg font-bold">Where do you work?</h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">
        Search for your college. Your registration is reviewed by this college&rsquo;s admin, so
        pick carefully — it can&rsquo;t be changed once approved.
      </p>

      <CollegePicker value={college} onChange={setCollege} label="Your college" />

      {error && <p className="text-destructive mt-4 text-sm">{error}</p>}

      <div className="mt-7 flex justify-end border-t pt-5">
        <Button
          disabled={saving}
          onClick={start}
          className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
        >
          {saving ? "Starting…" : "Continue →"}
        </Button>
      </div>
    </div>
  );
}

// ---- summary (shown once the registration is submitted) ---------------------

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_review:    { label: "⏳ Awaiting your college admin", cls: "bg-amber-50 text-amber-700" },
  changes_requested: { label: "✏️ Correction requested",        cls: "bg-amber-50 text-amber-700" },
  approved:          { label: "✓ Approved",                     cls: "bg-emerald-50 text-emerald-700" },
  suspended:         { label: "⛔ Access paused",                cls: "bg-rose-50 text-rose-700" },
  rejected:          { label: "⛔ Not approved",                 cls: "bg-rose-50 text-rose-700" },
};

function SendBackNotice({ body }: { body: string }) {
  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Your college admin asked for a correction</p>
      <p className="mt-1 whitespace-pre-wrap">{body}</p>
      <p className="mt-2 text-xs">Make the change and submit again — it goes straight back to them.</p>
    </div>
  );
}

function StaffSummary({
  f, refs, email, college, status, notes, onEdit,
}: {
  f: Form; refs: RefData; email: string | null; college: College | null;
  status: string | null; notes: ReviewNote[]; onEdit: () => void;
}) {
  const byId = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.id, r.label]));
  const bySlug = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.slug, r.label]));

  const other = (value: string, write: string, labels: Map<string, string>) => {
    const label = labels.get(value) ?? "";
    return label.toLowerCase() === "other" && write ? write : label;
  };

  const designation = other(f.designation_id, f.designation_other, byId(refs.staff_designation));
  const department = other(f.department, f.department_other, bySlug(refs.branch));
  const qualification = other(f.highest_qualification, f.highest_qualification_other, bySlug(refs.degree));
  const specialization = other(f.specialization, f.specialization_other, bySlug(refs.branch));
  const subjectLabel = byId(refs.subject);

  const subjectsFor = (relation: SubjectPick["relation"]) =>
    f.subjects
      .filter((s) => s.relation === relation)
      .map((s) => {
        // A linked row resolves through the platform list; a free-typed one is
        // already the label (migration 177).
        const name = s.subject_id
          ? subjectLabel.get(s.subject_id) ?? s.subject_id
          : (s.subject_name ?? "");
        const year = relation === "taught" ? s.last_year : s.since_year;
        return year ? `${name} (${relation === "taught" ? "until" : "since"} ${year})` : name;
      })
      .filter(Boolean) as string[];

  const collegeText = college ? `${college.name}${college.place ? ` — ${college.place}` : ""}` : "";
  const badge = STATUS_BADGE[status ?? "pending_review"] ?? STATUS_BADGE.pending_review;
  const openNote = notes.find((n) => !n.resolved_at);

  return (
    <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          <h2 className="mt-2 truncate text-xl font-bold">{f.full_name || "Your staff registration"}</h2>
          {email && <p className="text-muted-foreground truncate text-sm">{email}</p>}
        </div>
        <Button
          onClick={onEdit}
          className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
        >
          Edit my details
        </Button>
      </div>

      {openNote && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Note from your college admin</p>
          <p className="mt-1 whitespace-pre-wrap">{openNote.body}</p>
        </div>
      )}

      <Section title="At the College">
        <Item label="College" value={collegeText} className="sm:col-span-2" />
        <Item label="Designation" value={designation} />
        <Item label="Department" value={department} />
        <Item label="Employee ID" value={f.employee_code} />
        <Item label="Mobile" value={f.phone} />
        <Item label="Office email" value={f.office_email} />
        <Item label="LinkedIn" value={f.linkedin_url} />
        {/* Bio is authored as Markdown (MarkdownEditor), so the summary has to
            RENDER it — a plain Item would print the literal ** and -. Same
            renderer as the editor's Preview tab, so the two always agree. */}
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-muted-foreground text-xs">Bio</dt>
          <dd className="text-sm">
            {f.bio.trim() ? (
              <RichContent content={f.bio} math={false} />
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </dd>
        </div>
      </Section>

      <Section title="Experience">
        <Item label="Highest qualification" value={qualification} />
        <Item label="Specialization" value={specialization} />
        <Item label="Teaching experience" value={f.years_teaching_total ? `${f.years_teaching_total} yrs` : ""} />
        <Item label="At this college" value={f.years_at_this_college ? `${f.years_at_this_college} yrs` : ""} />
        <Item label="Joined" value={f.joined_year} />
        <Item label="Industry experience" value={f.years_industry ? `${f.years_industry} yrs` : ""} />
        <Item label="Other qualifications" value={f.other_qualifications} className="sm:col-span-2" />
        {f.previous_institutions.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-muted-foreground mb-1.5 text-xs">Previously</p>
            <ul className="space-y-1 text-sm">
              {f.previous_institutions.map((p, i) => (
                <li key={i}>
                  {p.name}
                  {p.role && ` — ${p.role}`}
                  {(p.from || p.to) && ` (${p.from || "?"}–${p.to || "present"})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Teaching">
        <div className="sm:col-span-2">
          <ChipRow label="Teaching now" items={subjectsFor("teaching")} />
          <ChipRow label="Taught earlier" items={subjectsFor("taught")} />
          <ChipRow label="Can also teach" items={subjectsFor("can_teach")} />
          <ChipRow label="Years taught" items={f.teaching_year_ids.map((id) => byId(refs.year_of_study).get(id) ?? id)} />
          <ChipRow label="Languages" items={f.instruction_language_ids.map((id) => byId(refs.language).get(id) ?? id)} />
          <ChipRow label="Can support with" items={f.support_area_ids.map((id) => byId(refs.mentoring_area).get(id) ?? id)} />
          <ChipRow label="Happy to contribute" items={f.contribution_type_ids.map((id) => byId(refs.contribution_type).get(id) ?? id)} />
        </div>
        <Item label="Availability" value={f.availability} />
        <Item label="Open to mentoring" value={f.open_to_mentoring ? "Yes" : "No"} />
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

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span key={it} className="bg-muted rounded-full px-3 py-1 text-sm font-medium">{it}</span>
        ))}
      </div>
    </div>
  );
}
