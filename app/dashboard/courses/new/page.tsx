import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { CourseEditor } from "@/components/courses/course-editor";

export default async function NewCoursePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  return <CourseEditor />;
}
