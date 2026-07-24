"use client";

// The one confirmation dialog for the console — replaces every ad-hoc
// window.confirm()/alert() on a destructive or deliberate action (see
// docs/STYLE_GUIDE.md → Dialogs & confirmations). Never use the browser
// confirm()/alert() for these.
//
//   • destructive      → shows the TriangleAlert badge + a destructive button.
//   • confirmPhrase    → type-to-confirm: the user must type the exact phrase
//                        (e.g. the record name) to enable the button. Use this
//                        for IRREVERSIBLE deletes.
//   • onConfirm        → may be async; the dialog shows a busy state, surfaces a
//                        thrown Error inline, and auto-closes on success.

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmPhrase,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Show the destructive alert badge + a destructive confirm button. */
  destructive?: boolean;
  /** When set, the user must type this exact text to enable the confirm button
      (type-to-confirm). Use for irreversible deletes. */
  confirmPhrase?: string;
  /** May be async. A thrown Error is shown inline; success auto-closes. */
  onConfirm: () => void | Promise<void>;
  /** Extra body content (e.g. a scope selector) shown above the type-to-confirm
      input. Keep it to a small choice — this is still a confirm dialog. */
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");

  // Reset transient state when the dialog closes so it reopens clean.
  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError("");
      setTyped("");
    }
  }, [open]);

  // Case-insensitive so "cancel" matches "CANCEL" (the common type-to-confirm
  // convention, and preserves behaviour from the dialogs migrated onto this).
  const phraseOk =
    !confirmPhrase || typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();

  async function handleConfirm() {
    setError("");
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-start gap-3">
            {destructive && (
              <span className="bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full">
                <TriangleAlert className="size-5" />
              </span>
            )}
            {description && <div className="text-muted-foreground text-sm">{description}</div>}
          </div>
          {children}
          {confirmPhrase && (
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-phrase" className="text-sm font-normal">
                Type <span className="text-foreground font-semibold">{confirmPhrase}</span> to confirm
              </Label>
              <Input
                id="confirm-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                aria-label={`Type ${confirmPhrase} to confirm`}
              />
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={busy || !phraseOk}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
