"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnProfile } from "./actions";

export function ProfileForm({
  initialName,
  initialPhone,
  email,
  roles,
}: {
  initialName: string;
  initialPhone: string;
  email: string;
  roles: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name !== initialName || phone !== initialPhone;

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    const res = await updateOwnProfile(name, phone);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Your name" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="+91 90000 00000" />
      </div>
      <div className="grid gap-1.5">
        <Label>Email</Label>
        <Input value={email} disabled readOnly />
        <p className="text-muted-foreground text-xs">From your sign-in — can't be changed here.</p>
      </div>
      <div className="grid gap-1.5">
        <Label>Roles</Label>
        <div className="flex flex-wrap gap-2">
          {roles.length ? roles.map((r) => (
            <span key={r} className="bg-muted rounded-full px-3 py-1 text-sm font-medium">{r}</span>
          )) : <span className="text-muted-foreground text-sm">—</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</Button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
        {error && <span className="text-destructive text-sm">{error}</span>}
      </div>
    </div>
  );
}
