"use client";

// "Invite user" button → opens the invite form in a dialog (the page keeps a
// single Platform-users section; new invites appear as Pending rows on refresh).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InviteForm } from "./invite-form";

type Employer = { id: string; name: string };

export function InviteDialog({ employers, canInviteOwner }: { employers: Employer[]; canInviteOwner: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite user</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite a platform user</DialogTitle>
            <DialogDescription>
              College Admins are scoped to a college; Employers to an organization.
              To add students, use the Students section.
            </DialogDescription>
          </DialogHeader>
          <InviteForm employers={employers} canInviteOwner={canInviteOwner} />
        </DialogContent>
      </Dialog>
    </>
  );
}
