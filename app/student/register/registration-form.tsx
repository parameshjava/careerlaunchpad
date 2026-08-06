"use client";

/**
 * Student registration — a 6-step form wired to the registration APIs.
 * On mount it loads reference data + the existing profile and RESUMES at
 * last_completed_step + 1 (works for imported/pre-filled profiles too). Each
 * step saves incrementally via PATCH /api/registration/profile; the final step
 * calls POST …/submit. See docs/REGISTRATION_AND_INTAKE_API.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { RichContent } from "@/components/exam/RichContent";
import { noBranchDegreeSet, profileCompleteness } from "@/lib/registration";
import { degreeHasBranch, labelWithOther, type DegreeRow } from "@/lib/degree-branch";
import {
  type Form, type RefData, type Ref, type College,
  EMPTY, FIELD_LABELS, STEP_PAYLOAD, StepBody, Stepper,
} from "@/components/students/registration-fields";

// Endpoints default to the student's own registration API; the console profile
// editor overrides them to target a specific student (/api/students/:id/...).
const DEFAULT_ENDPOINTS = { profile: "/api/registration/profile", submit: "/api/registration/profile/submit" };

// `reviewFirst` lands on the read-only summary regardless of registration status
// (the console: staff review the whole profile, then click Edit to open the
// wizard). Students self-registering leave it false so an in-progress profile
// drops straight back into the wizard where they left off.
export function RegistrationForm({
  endpoints = DEFAULT_ENDPOINTS,
  reviewFirst = false,
}: {
  endpoints?: { profile: string; submit: string };
  reviewFirst?: boolean;
}) {
  const [refs, setRefs] = useState<RefData | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [email, setEmail] = useState<string | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [regStatus, setRegStatus] = useState<"submitted" | "in_progress">("in_progress");
  const router = useRouter();

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  // Scroll the top of the wizard into view whenever the step changes (Next,
  // Submit-jump-back, or a Stepper jump). The app shell — not window — is the
  // scroll container here, so window.scrollTo is a no-op; scrollIntoView on a
  // top anchor scrolls whichever ancestor actually scrolls. Without this, tall
  // steps (e.g. "Tell Us") open scrolled to the bottom (on the Next/Submit row).
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  useEffect(() => {
    (async () => {
      const [refRes, profRes] = await Promise.all([
        fetch("/api/registration/reference"),
        fetch(endpoints.profile),
      ]);
      if (refRes.ok) setRefs(await refRes.json());
      if (profRes.ok) {
        const { profile, last_completed_step, registration_status, email } = await profRes.json();
        setEmail(email ?? null);
        if (profile) {
          setF((p) => ({
            ...p,
            ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v != null && (Array.isArray(v) ? true : typeof v !== "object"))),
            preferred_category_slugs: profile.preferred_category_slugs ?? [],
            career_goal_ids: profile.career_goal_ids ?? [],
            skills: profile.skills ?? [],
            interests: profile.interests ?? [],
            skill_assessment: profile.skill_assessment ?? {},
            graduation_year: profile.graduation_year != null ? String(profile.graduation_year) : "",
            cgpa: profile.cgpa != null ? String(profile.cgpa) : "",
            primary_career_goal_id: profile.primary_career_goal_id ?? "",
            preferred_mentor_pref_id: profile.preferred_mentor_pref_id ?? "",
            college_id: profile.college_id ?? "",
            // Step 6 "Tell Us"
            is_first_generation: profile.is_first_generation == null ? "" : (profile.is_first_generation ? "yes" : "no"),
            languages: profile.languages ?? [],
            family_members: profile.family_members ?? [],
            hobbies: profile.hobbies ?? [],
            custom_hobbies: profile.custom_hobbies ?? [],
          }));
          if (profile.college) setCollege(profile.college);
        }
        setRegStatus(registration_status === "submitted" ? "submitted" : "in_progress");
        if (reviewFirst || registration_status === "submitted") setDone(true);
        setStep(Math.min(6, Math.max(1, (last_completed_step ?? 0) + 1)));
      }
      setLoading(false);
    })();
  }, [endpoints.profile, reviewFirst]);

  async function saveStep(target: number) {
    // College is mandatory: block leaving Academics (step 2) — via Next or
    // Submit — until one is picked, instead of deferring the failure to submit.
    if (step === 2 && !f.college_id) {
      setErrors(["Step 2: College is required — search and select your college to continue."]);
      return;
    }
    setSaving(true);
    setErrors([]);
    const res = await fetch(endpoints.profile, {
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
      const sub = await fetch(endpoints.submit, { method: "POST" });
      if (sub.ok) {
        setDone(true);
        // The submit resolved any open reviewer remarks server-side; refresh so the
        // page's server components (the StudentRemarksAlert) re-query and the now-
        // cleared remarks disappear without a manual page reload.
        router.refresh();
        return;
      }
      const body = await sub.json().catch(() => ({}));
      if (body.missing?.length) {
        setErrors(body.missing.map((m: { step: number; field: string }) => `Step ${m.step}: ${FIELD_LABELS[m.field] ?? m.field.replace(/_/g, " ")} is required`));
        setStep(body.missing[0].step);
      } else setErrors([body.error ?? "Could not submit."]);
      return;
    }
    setStep(target);
  }

  if (loading) return <p className="text-muted-foreground py-20 text-center text-sm">Loading your registration…</p>;

  if (done) {
    return <ProfileSummary f={f} refs={refs} email={email} college={college} status={regStatus} onEdit={() => { setStep(1); setDone(false); }} />;
  }

  if (!refs) return <p className="text-destructive py-20 text-center text-sm">Could not load registration options.</p>;

  // Mandatory fields (steps 1–2). Steps 3–6 are optional, so Submit unlocks once these are set.
  const canSubmit = Boolean(f.full_name.trim() && f.phone.trim() && f.college_id);

  // Live profile completeness (same 0–100 scale the admin grid + approval email
  // use), so students see how much richer their profile can still get on every step.
  // Exclude Branch for a degree that has none, so an MBA student isn't shown a
  // permanent 94% for a field the form never renders (#99 review).
  const pct = profileCompleteness(
    f as unknown as Record<string, unknown>,
    noBranchDegreeSet(((refs?.degree ?? []) as unknown as { slug: string; branch_mode: string }[]) ?? []),
  );

  return (
    // The wizard stays narrow for readability (per the style guide) even when the
    // page container is full-width for the profile view.
    <div className="mx-auto w-full max-w-3xl">
      {/* Scroll anchor — the app shell scrolls this into view on every step change. */}
      <div ref={topRef} className="scroll-mt-4" aria-hidden />
      <Stepper step={step} onJump={setStep} />

      <div className="bg-card overflow-hidden rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        <div className="-mx-5 -mt-5 mb-6 flex items-center justify-between gap-3 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] px-5 py-3 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
          <p className="text-sm font-bold tracking-[0.04em]">Step {step} of 6</p>
          <div className="flex items-center gap-2" title={`Your profile is ${pct}% complete`}>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/25 sm:w-28">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums whitespace-nowrap">{pct}% complete</span>
          </div>
        </div>
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
          <Button
            variant="outline"
            disabled={step === 1 || saving}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="border-2 border-[#2563eb] font-semibold text-[#2563eb] hover:bg-[#2563eb]/5"
          >
            ← Back
          </Button>
          {/* Steps 3–6 are optional: from Academics on, Submit sits beside Next and
              unlocks once the mandatory fields are filled. */}
          <div className="flex items-center gap-2">
            {step < 6 && (
              <Button
                disabled={saving}
                onClick={() => saveStep(step + 1)}
                className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
              >
                {saving ? "Saving…" : "Next →"}
              </Button>
            )}
            {step >= 2 && (
              <Button
                disabled={saving || !canSubmit}
                onClick={() => saveStep(7)}
                className="bg-emerald-600 font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700"
              >
                {saving ? "Saving…" : "Submit ✓"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- profile summary (shown once registration is submitted) ----------------

/**
 * Read-only view of a profile. Reads form state (`f` + `refs` + `college` +
 * `email`), mapping stored slugs/ids back to their human labels via the reference
 * data. Reused by the console's student-profile page (no `onEdit` → no edit
 * button; `status` swaps the header badge). "Edit my profile" drops the student
 * back into the wizard (which already resumes at the last step).
 */
export function ProfileSummary({
  f, refs, email, college, onEdit, status = "submitted",
}: {
  f: Form; refs: RefData | null; email: string | null; college: College | null;
  onEdit?: () => void; status?: "submitted" | "in_progress";
}) {
  const bySlug = (list?: Ref[]) => new Map((list ?? []).map((r) => [r.slug, r.label]));

  const genderLabel = bySlug(refs?.gender).get(f.gender) ?? f.gender;
  // An "Other" pick reads back as the text the student typed (#99), and a degree
  // with no branch shows no Branch row at all rather than a dead "—".
  const degreeLabel = labelWithOther(f.degree, f.degree_other, bySlug(refs?.degree));
  const branchLabel = labelWithOther(f.branch, f.branch_other, bySlug(refs?.branch));
  const showBranch = !f.degree || degreeHasBranch(f.degree, (refs?.degree ?? []) as unknown as DegreeRow[]);
  const yearLabel = bySlug(refs?.year_of_study).get(f.year_of_study) ?? f.year_of_study;
  const categoryName = new Map(
    ((refs?.preference_category ?? []) as unknown as { slug: string; name: string }[]).map((c) => [c.slug, c.name]),
  );
  const skillLabel = bySlug(refs?.skill);
  const interestLabel = bySlug(refs?.interest);
  const assessCats = refs?.skill_assessment_category ?? [];
  // Step 6 "Tell Us" label maps
  const firstGenLabel = f.is_first_generation === "yes" ? "Yes" : f.is_first_generation === "no" ? "No" : "";
  const certLabel = bySlug(refs?.caste_certificate_status).get(f.caste_certificate_status) ?? "";
  const categoryLabel = bySlug(refs?.reservation_category).get(f.reservation_category) ?? "";
  const incomeLabel = bySlug(refs?.income_band).get(f.income_band) ?? "";
  const relLabel = bySlug(refs?.family_relation);
  const occLabel = bySlug(refs?.family_occupation);
  const langLabel = bySlug(refs?.language);
  const hobbyLabel = bySlug(refs?.hobby);
  const familyRows = f.family_members.filter((m) => m.relation || m.occupation);
  const hobbyItems = [
    ...f.hobbies.map((s) => hobbyLabel.get(s) ?? s),
    ...f.custom_hobbies,
  ];

  // PIN last and set off with a dash: "Tenali, Guntur, Andhra Pradesh — 522201".
  // flat first, then the geocoded address (which already carries city/state/PIN).
  const place = [f.flat_building, f.address].filter(Boolean).join(", ")
    || [f.city_village, f.district, f.state].filter(Boolean).join(", ");
  const location = [place, f.pincode].filter(Boolean).join(" — ");
  const collegeText = college ? `${college.name}${college.place ? ` — ${college.place}` : ""}` : "";
  // Answered categories — includes an explicit 0 ("no skill"); only truly
  // unrated categories (key absent) are left out. `in` avoids a number-vs-
  // undefined comparison (noUncheckedIndexedAccess is off).
  const ratedCats = assessCats.filter((c) => c.slug in f.skill_assessment);
  // Exclude Branch for a degree that has none, so an MBA student isn't shown a
  // permanent 94% for a field the form never renders (#99 review).
  const pct = profileCompleteness(
    f as unknown as Record<string, unknown>,
    noBranchDegreeSet(((refs?.degree ?? []) as unknown as { slug: string; branch_mode: string }[]) ?? []),
  );

  return (
    <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {status === "submitted" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-emerald-700">
              ✓ Registration submitted
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-amber-700">
              Registration in progress
            </span>
          )}
          <h2 className="mt-2 truncate text-xl font-bold">{f.full_name || "Your profile"}</h2>
          {email && <p className="text-muted-foreground truncate text-sm">{email}</p>}
          <div className="mt-3 flex items-center gap-2" title={`Profile ${pct}% complete`}>
            <div className="bg-muted h-1.5 w-36 overflow-hidden rounded-full">
              <div
                className={pct === 100 ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-primary"}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-muted-foreground text-xs font-semibold tabular-nums">{pct}% complete</span>
          </div>
        </div>
        {onEdit && (
          <Button
            onClick={onEdit}
            className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
          >
            Edit my profile
          </Button>
        )}
      </div>

      {/* One card per registration step, so the read-only view maps 1:1 onto the
          wizard and each section shows exactly that step's inputs. All open by
          default; each is independently collapsible. */}
      <Accordion type="multiple" defaultValue={["s1", "s2", "s3", "s4", "s5", "s6"]} className="mt-5 gap-3">
        <Section value="s1" n={1} title="Basic Information">
          <SummaryItem label="Full name" value={f.full_name} />
          <SummaryItem label="Email" value={email} />
          <SummaryItem label="Mobile" value={f.phone} />
          <SummaryItem label="Gender" value={genderLabel} />
          <SummaryItem label="Location" value={location} className="col-span-full" />
        </Section>

        <Section value="s2" n={2} title="Academic Details">
          <SummaryItem label="College" value={collegeText} className="col-span-full" />
          <SummaryItem label="Roll number" value={f.roll_number} />
          <SummaryItem label="Registration number" value={f.registration_number} />
          <SummaryItem label="APAAR ID" value={f.apaar_id} />
          <SummaryItem label="Degree" value={degreeLabel} />
          {showBranch && <SummaryItem label="Branch" value={branchLabel} />}
          <SummaryItem label="Year of study" value={yearLabel} />
          <SummaryItem label="Graduation year" value={f.graduation_year} />
          <SummaryItem label="CGPA / %" value={f.cgpa} />
        </Section>

        <Section value="s3" n={3} title="Career Paths">
          {f.preferred_category_slugs.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-wrap gap-2 col-span-full">
              {f.preferred_category_slugs.map((slug) => (
                <span
                  key={slug}
                  className="border-transparent bg-primary text-primary-foreground rounded-full border px-3 py-1 text-sm font-medium"
                >
                  {categoryName.get(slug) ?? slug}
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section value="s4" n={4} title="Current Skill Assessment">
          {ratedCats.length === 0 ? (
            <Empty />
          ) : (
            <div className="grid gap-3 col-span-full sm:grid-cols-2">
              {ratedCats.map((c) => (
                <div key={c.slug} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{c.label}</span>
                  {f.skill_assessment[c.slug] === 0 ? (
                    <span className="text-muted-foreground text-xs font-medium">No skill</span>
                  ) : (
                    <RatingDots value={f.skill_assessment[c.slug] ?? 0} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section value="s5" n={5} title="Skills & Interests">
          <div className="col-span-full">
            <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Skills</p>
            <ChipList items={f.skills.map((s) => skillLabel.get(s) ?? s)} />
            <p className="text-muted-foreground mt-4 mb-1.5 text-xs font-semibold tracking-wide uppercase">Interests</p>
            <ChipList items={f.interests.map((s) => interestLabel.get(s) ?? s)} />
          </div>
        </Section>

        <Section value="s6" n={6} title="Tell Us">
          <SummaryItem label="First-generation learner" value={firstGenLabel} />
          <SummaryItem label="Date of birth" value={f.date_of_birth} />
          <SummaryItem label="Caste / community certificate" value={certLabel} />
          {f.caste_certificate_status === "has" && <SummaryItem label="Reservation category" value={categoryLabel} />}
          <SummaryItem label="Household income" value={incomeLabel} />
          <div className="col-span-full">
            <dt className="text-muted-foreground text-xs">Languages</dt>
            <dd className="mt-1"><ChipList items={f.languages.map((s) => langLabel.get(s) ?? s)} /></dd>
          </div>
          <div className="col-span-full">
            <dt className="text-muted-foreground text-xs">Family members</dt>
            <dd className="mt-1">
              {familyRows.length === 0 ? (
                <p className="text-muted-foreground/60 text-sm">—</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {familyRows.map((m, i) => (
                    <li key={i}>
                      <span className="font-medium">{relLabel.get(m.relation) ?? m.relation ?? "—"}</span>
                      {m.occupation ? <span className="text-muted-foreground"> — {occLabel.get(m.occupation) ?? m.occupation}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div className="col-span-full">
            <dt className="text-muted-foreground text-xs">Hobbies &amp; interests</dt>
            <dd className="mt-1"><ChipList items={hobbyItems} /></dd>
          </div>
          <div className="col-span-full">
            <dt className="text-muted-foreground text-xs">Biggest challenge</dt>
            <dd className={`mt-1 text-sm ${f.biggest_challenge ? "" : "text-muted-foreground/60"}`}>
              {f.biggest_challenge ? <RichContent content={f.biggest_challenge} math={false} /> : "—"}
            </dd>
          </div>
        </Section>
      </Accordion>
    </div>
  );
}

// One collapsible card per registration step, so the read-only view maps 1:1
// onto the wizard: a numbered brand chip + step title on a tinted header, and the
// step's fields in a 2-column grid below. Children are the SummaryItems/blocks.
function Section({
  value,
  n,
  title,
  children,
}: {
  value: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="overflow-hidden rounded-xl border">
      <AccordionTrigger className="bg-muted/40 hover:bg-muted/60 px-4">
        <span className="flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold">
            {n}
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="border-t px-4 pt-4 pb-4">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      </AccordionContent>
    </AccordionItem>
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
  return <p className="text-muted-foreground/60 text-sm col-span-full">Nothing added yet.</p>;
}

