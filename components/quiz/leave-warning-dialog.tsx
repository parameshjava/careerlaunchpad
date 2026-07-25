"use client";

// The shared "you switched away" first-strike warning, used by every quiz surface
// (exam, assessment, future mock tests). Only the title and body copy differ per
// surface — the chrome (amber icon, footer button) lives here so it can't drift.
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LeaveWarningDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <TriangleAlert className="size-5" />
          </span>
          <DialogDescription className="flex-1">{children}</DialogDescription>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>I understand — continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
