import { notFound, redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchStudentCourseWithBatches } from "@/lib/course-query";
import { CourseDetailView } from "@/components/students/course-detail-view";

// Read-only course details for a student, reached from /student/courses
// (issue #49). Fetches the course (prose/exams/syllabus) plus the batches open
// at the student's college and renders <CourseDetailView>; each batch's Enrol
// action reuses enroll_self().
export default async function StudentCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const supabase = await createClient();
  const course = await fetchStudentCourseWithBatches(supabase, courseId, ctx.userId);
  if (!course) notFound();

  return <CourseDetailView course={course} />;
}
