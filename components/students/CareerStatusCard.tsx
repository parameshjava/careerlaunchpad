"use client";

// "Career status" card on the student surface: the student records whether
// they're still seeking, placed (with job details), etc. Being placed is what
// surfaces the "Become a mentor" call-to-action (requirement 1) — a placed
// student can pay it forward and guide juniors. Placement is self-reported and
// rides student_profile's self-RLS (PATCH /api/student/placement).
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { becomeMentor } from "@/app/student/actions";

type Placement = {
  company?: string | null; title?: string | null; location?: string | null;
  type?: string | null; offer_date?: string | null;
};

const STATUSES: { key: string; label: string }[] = [
  { key: "seeking", label: "Still seeking" },
  { key: "placed", label: "Placed 🎉" },
  { key: "higher_studies", label: "Higher studies" },
  { key: "other", label: "Other" },
];

const selectClass =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

export function CareerStatusCard({ isMentor }: { isMentor: boolean }) {
  const [status, setStatus] = useState("seeking");
  const [placement, setPlacement] = useState<Placement>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/student/placement");
      if (res.ok) {
        const d = await res.json();
        setStatus(d.employment_status ?? "seeking");
        setPlacement(d.placement ?? {});
      }
      setLoading(false);
    })();
  }, []);

  const setP = (k: keyof Placement, v: string) => { setPlacement((p) => ({ ...p, [k]: v })); setSaved(false); };

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/student/placement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employment_status: status, placement: status === "placed" ? placement : null }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  if (loading) return null;

  const isPlaced = status === "placed";

  return (
    <div className="bg-card rounded-2xl border p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Career status</h2>
      <p className="text-muted-foreground mt-0.5 text-sm">
        Got placed? Let us know — and consider mentoring the students coming up behind you.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const on = status === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { setStatus(s.key); setSaved(false); }}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                on ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {isPlaced && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Company</Label>
            <Input value={placement.company ?? ""} onChange={(e) => setP("company", e.target.value)} placeholder="e.g. TCS" />
          </div>
          <div className="grid gap-1.5">
            <Label>Role / Title</Label>
            <Input value={placement.title ?? ""} onChange={(e) => setP("title", e.target.value)} placeholder="e.g. Software Engineer" />
          </div>
          <div className="grid gap-1.5">
            <Label>Location</Label>
            <Input value={placement.location ?? ""} onChange={(e) => setP("location", e.target.value)} placeholder="e.g. Hyderabad" />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <select className={selectClass} value={placement.type ?? ""} onChange={(e) => setP("type", e.target.value)}>
              <option value="">Select…</option>
              <option value="full_time">Full time</option>
              <option value="internship">Internship</option>
            </select>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save status"}</Button>
        {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
      </div>

      {/* Mentor conversion */}
      <div className="bg-muted/40 mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">{isMentor ? "You're a mentor" : "Become a mentor"}</h3>
          <p className="text-muted-foreground text-sm">
            {isMentor
              ? "Manage your mentor profile and availability."
              : "Guide juniors with your experience. We pre-fill what we already know from your profile."}
          </p>
        </div>
        {isMentor ? (
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/mentor">Go to mentor hub</Link>
          </Button>
        ) : (
          <Button
            className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
            disabled={pending}
            onClick={() => startTransition(() => becomeMentor())}
          >
            {pending ? "Setting up…" : "Become a mentor"}
          </Button>
        )}
      </div>
    </div>
  );
}
