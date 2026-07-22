import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { CompetitiveExamEditor } from "@/components/competitive-exams/competitive-exam-editor";

export default async function NewCompetitiveExamPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  return <CompetitiveExamEditor />;
}
