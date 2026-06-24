"use client";

import { useState } from "react";
import { useActionState } from "react";
import { sendTestEmailAction, type TestEmailState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TestEmailForm({ defaultTo, disabled }: { defaultTo?: string | null; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<TestEmailState, FormData>(sendTestEmailAction, {});
  const [to, setTo] = useState(defaultTo ?? "");

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="to">Send a test email to</Label>
        <Input
          id="to"
          name="to"
          type="email"
          placeholder="you@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={disabled}
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={disabled || pending || !EMAIL_RE.test(to.trim())}>
          {pending ? "Sending…" : "Send test email"}
        </Button>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-green-600">{state.message}</p>}
      </div>
    </form>
  );
}
