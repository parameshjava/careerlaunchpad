"use client";

// The client half of /student/feedback/[requestId]: a back link, the heading, the
// shared <FeedbackForm>, and a thank-you state that stays on the page rather than
// bouncing the student somewhere else the instant they submit.
//
// On success it routes back to the batch the chapter belongs to, because that is
// where the student came from — but only after acknowledging the submit, so the
// screen never changes under their thumb without saying why.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format-date";
import type { PendingFeedback } from "@/lib/feedback-query";
import { FeedbackForm } from "@/components/student/feedback-prompt";

export function FeedbackPage({ request }: { request: PendingFeedback }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const backHref = `/student/batches/${request.batchId}`;

  if (done)
    return (
      <div className="grid gap-4 py-6">
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <CardContent className="grid gap-2 pt-6 text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="size-6" />
            <h1 className="text-lg font-semibold">Thanks — your feedback is recorded.</h1>
            <p className="text-sm">
              You can change your answers for the next 24 hours. Your trainer will only ever see it
              combined with everyone else&apos;s, with no name attached.
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={backHref}>Back to the batch</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/student/quizzes">Take an assessment</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="justify-self-start" asChild>
        <Link href={backHref}>
          <ArrowLeft className="size-4" /> Back to {request.batchName ?? "the batch"}
        </Link>
      </Button>

      <header>
        <h1 className="text-2xl font-bold tracking-tight break-words">
          How was {request.chapterName ?? "this chapter"}?
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {[
            request.subjectName,
            `${request.items.length} questions, about 45 seconds`,
            request.submittedAt ? "editing your answer" : `open till ${formatDate(request.closesAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <FeedbackForm
            request={request}
            onSubmitted={() => {
              setDone(true);
              // Refresh so the syllabus behind this loses its "Give feedback" action.
              router.refresh();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
