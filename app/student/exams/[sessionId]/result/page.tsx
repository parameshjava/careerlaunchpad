import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { StudentResult } from "./student-result";

export default async function StudentResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!can(ctx, "exam.attempt.take")) redirect("/student");

  const { sessionId } = await params;
  return <StudentResult sessionId={sessionId} />;
}
