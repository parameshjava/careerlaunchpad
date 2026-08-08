"use client";

/**
 * Invite a peer COLLEGE ADMIN — email only.
 *
 * Deliberately not the 3-step wizard: there is no college_admin profile to fill
 * in (only college_staff has one), so the wizard would be three steps of fields
 * that go nowhere. The invitee gets the normal login email and holds the role the
 * moment they sign in — no review step, because a permission-checked admin
 * creating the invite IS the approval, exactly as for staff.
 *
 * The role is sent as a plain string, but it is an ALLOWLIST of two on the server
 * and again in invite_college_member (178) — a forged value cannot mint any other
 * role, and the scope is forced to a college the caller is authorized for.
 */
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { College } from "@/components/college-staff/staff-fields";

export function InviteAdminForm({ college }: { college: College }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/college-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value, college_id: college.id, role: "college_admin" }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not send the invite.");
      return;
    }
    setDone(body.email ?? value);
  }

  if (done) {
    return (
      <div className="bg-card rounded-3xl border p-8 text-center shadow-xl shadow-[#7c3aed]/5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-emerald-700">
          ✓ Admin invited
        </span>
        <h2 className="mt-3 text-xl font-bold break-words">{done}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          They&rsquo;ve been emailed a login link and become a college admin for{" "}
          <b>{college.name}</b> the moment they sign in.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => { setEmail(""); setDone(null); }}>
            Invite another
          </Button>
          <Button asChild className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white">
            <Link href="/dashboard/college-staff?tab=invited">Back to staff</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="admin-email">Their email</Label>
        <Input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="colleague@college.edu"
        />
        <p className="text-muted-foreground text-xs">
          They must sign in with this exact address for the invite to match.
        </p>
      </div>

      {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/college-staff">Cancel</Link>
        </Button>
        <Button
          disabled={saving || !email.trim()}
          onClick={submit}
          className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
        >
          {saving ? "Inviting…" : "Invite admin ✓"}
        </Button>
      </div>
    </div>
  );
}
