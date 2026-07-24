import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { ScheduleCalendar } from "@/components/calendar/schedule-calendar";

// A student's class calendar (issue #64). Approval-gated like exams — only an
// approved (hence enrollable) student has classes. Data is fetched client-side
// from /api/calendar/sessions, RLS-scoped to the student's batches.
export default async function StudentCalendarPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!(await isStudentApproved(ctx.userId))) redirect("/student/pending");

  return <ScheduleCalendar />;
}
