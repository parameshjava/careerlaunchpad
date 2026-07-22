import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCourses } from "@/lib/course-query";
import { CoursesList } from "@/components/courses/courses-list";

// Courses catalog (issue #49). Gated on the central finance permission.
export default async function CoursesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  const supabase = await createClient();
  const courses = await fetchCourses(supabase);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reusable course templates — subjects, competitive exams, and a default fee. Run them as
          batches per college.
        </p>
      </header>
      <CoursesList courses={courses} />
    </div>
  );
}
