import Link from "next/link";

import { Button } from "@/components/ui/button";
import { RichContent } from "@/components/exam/RichContent";
import { createClient } from "@/lib/supabase/server";

// Student-facing view of unresolved reviewer remarks (issue #82). Server
// component: reads the current student's own OPEN notes (RLS self_read) and
// renders an actionable alert. Renders nothing when there are no open remarks, so
// it's safe to drop above the registration form and on the pending screen.
export async function StudentRemarksAlert({ showCta = false }: { showCta?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("student_review_note")
    .select("id, body, created_at")
    .eq("student_user_id", user.id)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  const notes = data ?? [];
  if (notes.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
      <p className="font-semibold text-amber-900 dark:text-amber-200">Remarks from the team</p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
        Our team left remarks on your registration. Please review them, update your profile, and
        re-submit — submitting clears these remarks:
      </p>
      <ul className="mt-3 space-y-2">
        {notes.map((n) => (
          <li
            key={n.id as string}
            className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <RichContent content={n.body as string} math={false} />
          </li>
        ))}
      </ul>
      {showCta && (
        <Button asChild className="mt-4">
          <Link href="/student/register">Update &amp; re-submit</Link>
        </Button>
      )}
    </div>
  );
}
