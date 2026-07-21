"use client";

/**
 * Registration Step 6 — "Tell Us". Decision-useful student background, all
 * optional: first-generation status, a govt caste/community certificate (+ the
 * reservation group it's issued against), languages, date of birth, family
 * members & their occupations, household income band, hobbies, and a free-text
 * biggest challenge authored as Markdown.
 *
 * Every option set comes from a public-read `ref_*` table via the reference API
 * (never hard-coded) — see lib/registration REF_TABLES. Family members are held
 * as a jsonb array [{relation, occupation}] on student_profile, so the whole
 * step round-trips through the single-table incremental PATCH like every other
 * step. Rendered by StepBody (registration-fields.tsx) for both student
 * self-registration and the console per-student editor.
 */
import { useRef, useState } from "react";
import {
  Check, Plus, X, ChevronDown, CalendarIcon,
  Bold, Italic, List, ListOrdered, Link as LinkIcon, Heading, Quote, Code, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichContent } from "@/components/exam/RichContent";
import { cn } from "@/lib/utils";
import { Step, selectClass, type Form, type SetForm, type RefData, type Ref } from "./registration-fields";
import { MIN_AGE_YEARS } from "@/lib/registration";

export type FamilyMember = { relation: string; occupation: string };

// Relations a student can only have one of — once picked in a row, hidden from
// the other rows' dropdowns. Everything else (guardian/brother/sister/other)
// can repeat.
const UNIQUE_RELATIONS = new Set(["father", "mother", "spouse"]);

// Client caps MUST match the server bounds in lib/registration.ts (family_members
// max 12, custom_hobbies max 20). Step 6 saves as one PATCH, so exceeding either
// on the client would 400 the whole step and lose all Tell-Us data — cap here so
// the Add controls stop before the server ever rejects.
const MAX_FAMILY_MEMBERS = 12;
const MAX_CUSTOM_HOBBIES = 20;

export function TellUsStep({ f, set, refs }: { f: Form; set: SetForm; refs: RefData }) {
  // Always show at least one (empty) row. All mutators operate on `rows`, not the
  // raw array — otherwise the FIRST edit maps over an empty [] and is discarded
  // (the row only "sticks" once a real entry exists).
  const rows: FamilyMember[] = f.family_members.length ? f.family_members : [{ relation: "", occupation: "" }];
  const setMember = (i: number, patch: Partial<FamilyMember>) =>
    set("family_members", rows.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const addMember = () => {
    if (rows.length >= MAX_FAMILY_MEMBERS) return;
    set("family_members", [...rows, { relation: "", occupation: "" }]);
  };
  const removeMember = (i: number) => set("family_members", rows.filter((_, idx) => idx !== i));
  // The single fallback row can be removed too — that just clears the entry (it
  // reappears as one empty row). Only when it's already blank is there nothing to
  // remove, so the control is disabled/hidden then.
  const soleEmptyRow = rows.length === 1 && !rows[0].relation && !rows[0].occupation;

  return (
    <Step
      title="Tell us a little about you"
      hint="This helps us understand your background so we can guide and support you better. Everything here is optional — share what you're comfortable with."
    >
      <div className="space-y-5 sm:col-span-2">
        {/* ---- About you ---- */}
        <SectionCard name="About you">
          <div className="space-y-4 p-3.5">
            <div>
              <Label className="mb-2 block">Are you the first in your family to attend college?</Label>
              <ChipSingle
                options={[{ slug: "yes", label: "Yes" }, { slug: "no", label: "No" }]}
                selected={f.is_first_generation}
                onChange={(v) => set("is_first_generation", v)}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Helps us give first-generation learners extra guidance — never used to judge.
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Do you have a caste / community certificate from a government authority?</Label>
              <ChipSingle
                options={refs.caste_certificate_status ?? []}
                selected={f.caste_certificate_status}
                onChange={(v) => {
                  set("caste_certificate_status", v);
                  if (v !== "has") set("reservation_category", "");
                }}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                🔒 Optional — a government certificate can unlock reservation benefits and scholarships.
              </p>
              {f.caste_certificate_status === "has" && (
                <div className="border-primary/30 bg-primary/[0.03] mt-3 rounded-lg border p-3">
                  <Label className="mb-1.5 block">Which category is on your certificate?</Label>
                  <select
                    className={selectClass}
                    value={f.reservation_category}
                    onChange={(e) => set("reservation_category", e.target.value)}
                  >
                    <option value="">Select your category…</option>
                    {(refs.reservation_category ?? []).map((c) => (
                      <option key={c.slug} value={c.slug}>{c.label}</option>
                    ))}
                  </select>
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    As printed on your certificate — this is what determines your reservation group.
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Languages you know</Label>
              <ChipMulti options={refs.language ?? []} selected={f.languages} onChange={(v) => set("languages", v)} />
            </div>

            <div className="max-w-[260px]">
              <Label className="mb-1.5 block">Date of birth</Label>
              <DobPicker value={f.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
            </div>
          </div>
        </SectionCard>

        {/* ---- Your family ---- */}
        <SectionCard name="Your family">
          <div className="space-y-3 p-3.5">
            <p className="text-muted-foreground text-xs">
              Who&apos;s in your household and what they do — helps us understand your support system.
            </p>
            {rows.map((m, i) => {
              // Hide singular relations already chosen in a different row.
              const takenUnique = new Set(
                rows.filter((_, j) => j !== i).map((x) => x.relation).filter((r) => UNIQUE_RELATIONS.has(r)),
              );
              const relationOptions = (refs.family_relation ?? []).filter((r) => !takenUnique.has(r.slug));
              return (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Relation</Label>
                  <select className={selectClass} value={m.relation} onChange={(e) => setMember(i, { relation: e.target.value })}>
                    <option value="">Select…</option>
                    {relationOptions.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">What they do</Label>
                  <select className={selectClass} value={m.occupation} onChange={(e) => setMember(i, { occupation: e.target.value })}>
                    <option value="">Select…</option>
                    {(refs.family_occupation ?? []).map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  disabled={soleEmptyRow}
                  aria-label="Remove family member"
                  className="text-muted-foreground hover:text-destructive hidden h-10 w-10 items-center justify-center rounded-md border disabled:opacity-30 sm:flex"
                >
                  <X className="size-4" />
                </button>
                {!soleEmptyRow && (
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    className="text-muted-foreground hover:text-destructive -mt-1 justify-self-start text-xs sm:hidden"
                  >
                    Remove
                  </button>
                )}
              </div>
              );
            })}
            <button
              type="button"
              onClick={addMember}
              disabled={rows.length >= MAX_FAMILY_MEMBERS}
              className="text-primary hover:bg-primary/5 border-primary/40 inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-4" /> Add family member
            </button>
            {rows.length >= MAX_FAMILY_MEMBERS && (
              <p className="text-muted-foreground text-xs">You can add up to {MAX_FAMILY_MEMBERS} family members.</p>
            )}

            <div className="pt-1">
              <Label className="mb-2 block">Approximate annual household income</Label>
              <ChipSingle options={refs.income_band ?? []} selected={f.income_band} onChange={(v) => set("income_band", v)} />
              <p className="text-muted-foreground mt-1.5 text-xs">
                🔒 Private — only used to check if you qualify for fee support or scholarships.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* ---- Hobbies ---- */}
        <SectionCard name="Hobbies & interests (outside academics)">
          <div className="space-y-3 p-3.5">
            <HobbyPicker
              options={refs.hobby ?? []}
              selected={f.hobbies}
              onChange={(v) => set("hobbies", v)}
              custom={f.custom_hobbies}
              onCustomChange={(v) => set("custom_hobbies", v)}
            />
          </div>
        </SectionCard>

        {/* ---- Biggest challenge (Markdown editor) ---- */}
        <SectionCard name="Your biggest challenge">
          <div className="p-3.5">
            <Label className="mb-2 block">What&apos;s the biggest challenge you&apos;re facing right now?</Label>
            <MarkdownEditor value={f.biggest_challenge} onChange={(v) => set("biggest_challenge", v)} />
            <p className="text-muted-foreground mt-1.5 text-xs">
              Use the buttons above to format — no need to know Markdown. In your own words — this helps us give you the right support.
            </p>
          </div>
        </SectionCard>
      </div>
    </Step>
  );
}

// ---- building blocks -------------------------------------------------------

function SectionCard({ name, children, defaultOpen = true }: { name: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 bg-gradient-to-r from-[#2563eb]/5 to-[#7c3aed]/5 px-3.5 py-2.5 text-left transition hover:from-[#2563eb]/10 hover:to-[#7c3aed]/10 ${open ? "border-b" : ""}`}
      >
        <span className="text-sm font-bold">{name}</span>
        <span className="border-[#7c3aed]/30 bg-background flex size-7 shrink-0 items-center justify-center rounded-full border shadow-sm">
          <ChevronDown className={`size-4 text-[#7c3aed] transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {open && children}
    </div>
  );
}

function ChipSingle({ options, selected, onChange }: { options: Pick<Ref, "slug" | "label">[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected === o.slug;
        return (
          <button
            key={o.slug}
            type="button"
            onClick={() => onChange(on ? "" : o.slug)}
            aria-pressed={on}
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

function ChipMulti({ options, selected, onChange }: { options: Pick<Ref, "slug" | "label">[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (slug: string) => onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.slug);
        return (
          <button
            key={o.slug}
            type="button"
            onClick={() => toggle(o.slug)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-3.5 pl-2.5 text-sm font-medium transition ${
              on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40"
            }`}
          >
            {on ? <Check className="size-3.5" /> : <Plus className="size-3.5 opacity-50" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Date-of-birth picker — the shared shadcn Calendar in a Popover (same pattern
 * as DateTimePicker, minus the time). Month/year dropdowns make picking a birth
 * year quick; dates that would make the student younger than MIN_AGE_YEARS are
 * disabled (they must have finished 12th standard). Stores/reads "YYYY-MM-DD". */
function DobPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return y && m && d ? new Date(y, m - 1, d) : undefined;
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const date = value ? parse(value) : undefined;
  const now = new Date();
  // Newest allowed DOB: exactly MIN_AGE_YEARS ago today.
  const maxDob = new Date(now.getFullYear() - MIN_AGE_YEARS, now.getMonth(), now.getDate());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start gap-2 font-normal", !date && "text-muted-foreground")}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          {date ? date.toLocaleDateString(undefined, { dateStyle: "medium" }) : "Pick your date of birth"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date ?? maxDob}
          captionLayout="dropdown"
          startMonth={new Date(1950, 0)}
          endMonth={new Date(maxDob.getFullYear(), 11)}
          disabled={{ after: maxDob }}
          onSelect={(d) => { if (d) { onChange(fmt(d)); setOpen(false); } }}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}

/** Hobbies grouped into titled cards by `category`, plus a free-text
 * "add your own" escape hatch that stores write-ins separately. */
function HobbyPicker({
  options, selected, onChange, custom, onCustomChange,
}: {
  options: Ref[]; selected: string[]; onChange: (v: string[]) => void;
  custom: string[]; onCustomChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const groups: { name: string; items: Ref[] }[] = [];
  for (const o of options) {
    const key = o.category ?? "Other";
    let g = groups.find((x) => x.name === key);
    if (!g) { g = { name: key, items: [] }; groups.push(g); }
    g.items.push(o);
  }
  const toggle = (slug: string) => onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);

  const atCustomCap = custom.length >= MAX_CUSTOM_HOBBIES;

  const add = () => {
    const v = input.trim();
    if (!v) return;
    const known = options.find((o) => o.label.toLowerCase() === v.toLowerCase());
    if (known) {
      if (!selected.includes(known.slug)) onChange([...selected, known.slug]);
    } else if (!atCustomCap && !custom.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onCustomChange([...custom, v]);
    }
    setInput("");
  };

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const count = g.items.filter((i) => selected.includes(i.slug)).length;
        return (
          <div key={g.name} className="overflow-hidden rounded-xl border">
            <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-3.5 py-2">
              <span className="text-[0.72rem] font-bold tracking-[0.05em] text-[#7c3aed] uppercase">{g.name}</span>
              <span className="text-muted-foreground text-[0.7rem] font-medium tabular-nums">
                {count > 0 ? <span className="text-primary font-semibold">{count} selected</span> : g.items.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 p-3.5">
              {g.items.map((o) => {
                const on = selected.includes(o.slug);
                return (
                  <button
                    key={o.slug}
                    type="button"
                    onClick={() => toggle(o.slug)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-3.5 pl-2.5 text-sm font-medium transition ${
                      on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40"
                    }`}
                  >
                    {on ? <Check className="size-3.5" /> : <Plus className="size-3.5 opacity-50" />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Escape hatch: anything not in the curated lists */}
      <div className="overflow-hidden rounded-xl border border-dashed">
        <div className="bg-muted/40 border-b px-3.5 py-2">
          <span className="text-[0.72rem] font-bold tracking-[0.05em] text-[#7c3aed] uppercase">Something else? Add your own</span>
        </div>
        <div className="p-3.5">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="e.g. Stand-up comedy, Astronomy…"
              maxLength={100}
              disabled={atCustomCap}
              className="h-9"
            />
            <button
              type="button"
              onClick={add}
              disabled={!input.trim() || atCustomCap}
              className="h-9 shrink-0 rounded-md bg-gradient-to-r from-[#2563eb] to-[#7c3aed] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {atCustomCap && (
            <p className="text-muted-foreground mt-2 text-xs">You&apos;ve added the maximum of {MAX_CUSTOM_HOBBIES} custom hobbies.</p>
          )}
          {custom.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {custom.map((h) => (
                <span key={h} className="border-primary bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-2 pl-3.5 text-sm font-medium shadow-sm">
                  {h}
                  <button
                    type="button"
                    aria-label={`Remove ${h}`}
                    onClick={() => onCustomChange(custom.filter((x) => x !== h))}
                    className="flex size-5 items-center justify-center rounded-full hover:bg-white/20"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-xs">Type a hobby and press Enter — it&apos;ll be added as a tag you can remove.</p>
        </div>
      </div>
    </div>
  );
}

/** GitHub-style Markdown editor: Write/Preview tabs + a formatting toolbar that
 * writes the Markdown so students never type syntax. Preview renders GFM via the
 * shared RichContent renderer (same engine as the exam module). */
function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const reselect = (start: number, end: number) =>
    requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.focus(); ta.setSelectionRange(start, end); } });

  // Read the textarea's LIVE value so back-to-back clicks never see stale state.
  const wrap = (token: string, placeholder: string) => {
    const ta = taRef.current; if (!ta) return;
    const v = ta.value; const { selectionStart: s, selectionEnd: e } = ta;
    const sel = v.slice(s, e) || placeholder;
    onChange(v.slice(0, s) + token + sel + token + v.slice(e));
    reselect(s + token.length, s + token.length + sel.length);
  };
  const mapLines = (transform: (ln: string, i: number) => string) => {
    const ta = taRef.current; if (!ta) return;
    const v = ta.value; const { selectionStart: s, selectionEnd: e } = ta;
    const from = v.lastIndexOf("\n", s - 1) + 1;
    const nl = v.indexOf("\n", e);
    const to = nl === -1 ? v.length : nl;
    const out = v.slice(from, to).split("\n").map(transform).join("\n");
    onChange(v.slice(0, from) + out + v.slice(to));
    reselect(from, from + out.length);
  };
  const link = () => {
    const ta = taRef.current; if (!ta) return;
    const v = ta.value; const { selectionStart: s, selectionEnd: e } = ta;
    const sel = v.slice(s, e) || "link text";
    const inserted = `[${sel}](https://)`;
    onChange(v.slice(0, s) + inserted + v.slice(e));
    reselect(s + inserted.length - 9, s + inserted.length - 1);
  };

  const TOOLBAR: { key: string; label: string; icon: typeof Bold; run: () => void }[] = [
    { key: "h", label: "Heading", icon: Heading, run: () => mapLines((ln) => `### ${ln}`) },
    { key: "b", label: "Bold", icon: Bold, run: () => wrap("**", "bold text") },
    { key: "i", label: "Italic", icon: Italic, run: () => wrap("_", "italic text") },
    { key: "quote", label: "Quote", icon: Quote, run: () => mapLines((ln) => `> ${ln}`) },
    { key: "code", label: "Code", icon: Code, run: () => wrap("`", "code") },
    { key: "link", label: "Link", icon: LinkIcon, run: link },
    { key: "ul", label: "Bulleted list", icon: List, run: () => mapLines((ln) => `- ${ln || "List item"}`) },
    { key: "ol", label: "Numbered list", icon: ListOrdered, run: () => mapLines((ln, i) => `${i + 1}. ${ln || "List item"}`) },
    { key: "task", label: "Task list", icon: ListChecks, run: () => mapLines((ln) => `- [ ] ${ln || "To do"}`) },
  ];

  return (
    <div className="focus-within:ring-ring overflow-hidden rounded-md border focus-within:ring-1">
      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-y-1 border-b px-1.5 pt-1.5">
        <div className="flex items-center gap-1">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t ? "bg-background border border-b-0 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "write" && (
          <div className="flex items-center gap-0.5 pb-1">
            {TOOLBAR.map((b, i) => (
              <span key={b.key} className="flex items-center">
                {i === 6 && <span className="bg-border mx-1 h-4 w-px" />}
                <button
                  type="button"
                  title={b.label}
                  aria-label={b.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={b.run}
                  className="text-muted-foreground hover:bg-background hover:text-foreground flex size-7 items-center justify-center rounded-md transition"
                >
                  <b.icon className="size-4" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {tab === "write" ? (
        <textarea
          ref={taRef}
          className="bg-background min-h-28 w-full resize-y px-3 py-2 text-sm focus-visible:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Not sure which career to pick, weak in communication, family / financial pressure, no guidance…"
        />
      ) : (
        <div className="bg-background min-h-28 px-3 py-2">
          {value.trim() ? <RichContent content={value} math={false} /> : <p className="text-muted-foreground text-sm italic">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}
