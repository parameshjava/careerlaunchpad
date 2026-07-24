import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchOpenCoursesForStudent } from "@/lib/course-query";
import { AvailableCourses } from "@/components/students/available-courses";
import { PageContainer } from "@/components/app-shell/page-container";

// Student self-enrolment (issue #49): browse the COURSES open for enrolment at
// your college. Each course card opens its details page, where the individual
// batches (dated runs) are listed and joined via the enroll_self() RPC.
export default async function StudentCoursesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const supabase = await createClient();
  const courses = await fetchOpenCoursesForStudent(supabase, ctx.userId);

  return (
    <PageContainer variant="full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Courses open for enrolment at your college. Open a course to see its batches; once you join,
          the fee shows under{" "}
          <Link href="/student/fees" className="text-primary hover:underline">My fees</Link>.
        </p>
      </header>
      <AvailableCourses courses={courses} />
    </PageContainer>
  );
}
