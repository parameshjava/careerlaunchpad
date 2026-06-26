"use client";

import { useActionState } from "react";
import { setOfficeEmail, type OfficeEmailState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * One person's office-address editor. Inline (useActionState) so the owner sees
 * "Saved" / validation errors next to the row without a full reload. Submitting
 * an empty value clears the office address.
 */
export function OfficeEmailForm({
  userId,
  defaultEmail,
}: {
  userId: string;
  defaultEmail: string;
}) {
  const [state, formAction, pending] = useActionState<OfficeEmailState, FormData>(
    setOfficeEmail,
    {},
  );
  const justSaved = state.ok && state.userId === userId;
  const error = state.error && state.userId === userId ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="user_id" value={userId} />
        <Input
          name="email"
          type="email"
          defaultValue={defaultEmail}
          placeholder="name@careerlaunchpad.ai"
          className="h-8 w-full min-w-0 sm:w-64"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {justSaved && !error && <p className="text-xs text-emerald-600">Saved.</p>}
    </form>
  );
}
