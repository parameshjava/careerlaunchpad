"use client";

// Reviewer remarks panel for a student profile (issue #82). Shows the review-note
// thread and a Markdown composer to send a remark by email. The "Request
// corrections" toggle (send the profile back) is meaningful only pre-approval;
// for an approved student a remark is just an informational note that keeps their
// access. Remarks are authored in Markdown via the shared <MarkdownEditor>.
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { MessageSquare } from "lucide-react";

import { sendStudentRemark } from "@/app/dashboard/students/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { RichContent } from "@/components/exam/RichContent";
import { StatusBadge } from "@/components/data-table-parts";

export type ReviewNote = {
  id: string;
  body: string;
  kind: "changes_requested" | "note";
  created_at: string;
  resolved_at: string | null;
  authorName: string | null;
};

function SubmitButton({ preApproval, disabled }: { preApproval: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled} className="shrink-0">
      {pending ? "Sending…" : preApproval ? "Send remark" : "Send note"}
    </Button>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function RemarksPanel({
  studentId,
  status,
  notes,
}: {
  studentId: string;
  /** The student's review status — gates whether "send back" is offered. */
  status: "pending_review" | "changes_requested" | "approved" | "suspended";
  notes: ReviewNote[];
}) {
  // Send-back only applies before approval; an approved/suspended student can be
  // sent an informational note but is never demoted by it.
  const preApproval = status === "pending_review" || status === "changes_requested";
  const [body, setBody] = useState("");

  // Call the server action, then clear the composer. The action revalidates the
  // page, so the new note appears in the thread on the next render.
  async function submit(formData: FormData) {
    await sendStudentRemark(formData);
    setBody("");
  }

  return (
    <section className="mt-6 rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="text-muted-foreground size-4" />
        <h2 className="text-sm font-semibold">Remarks to the student</h2>
      </div>

      {/* Composer */}
      <form action={submit} className="grid gap-3">
        <input type="hidden" name="user_id" value={studentId} />
        {/* Markdown source is mirrored here so it posts with the form. */}
        <input type="hidden" name="body" value={body} />
        <MarkdownEditor
          value={body}
          onChange={setBody}
          placeholder={
            preApproval
              ? "Explain what needs to be corrected before approval…  (Markdown supported)"
              : "Write a note the student will receive by email…  (Markdown supported)"
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {preApproval ? (
            <div className="flex items-start gap-2">
              <Checkbox id="request_changes" name="request_changes" defaultChecked className="mt-0.5" />
              <Label htmlFor="request_changes" className="text-muted-foreground text-xs leading-snug font-normal">
                Send the profile back for corrections
                <span className="block">(returns it to the student to fix &amp; re-submit)</span>
              </Label>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              This student is already approved — the note won’t change their access.
            </p>
          )}
          <SubmitButton preApproval={preApproval} disabled={!body.trim()} />
        </div>
        <p className="text-muted-foreground text-xs">
          The student is emailed your remark with a link to update their profile.
        </p>
      </form>

      {/* Thread */}
      {notes.length > 0 && (
        <div className="mt-5 space-y-3 border-t pt-4">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">History</p>
          {notes.map((n) => (
            <div key={n.id} className="rounded-md border bg-background p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                {n.kind === "changes_requested" ? (
                  <StatusBadge tone="amber">Sent back</StatusBadge>
                ) : (
                  <StatusBadge tone="slate">Note</StatusBadge>
                )}
                {n.resolved_at && <StatusBadge tone="emerald">Resolved</StatusBadge>}
                <span className="text-muted-foreground">
                  {n.authorName ? `${n.authorName} · ` : ""}
                  {fmt(n.created_at)}
                </span>
              </div>
              <RichContent content={n.body} math={false} className="text-sm" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
