import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { BatchSubjectsEditor } from "@/components/batches/batch-subjects-editor";

export default async function BatchSubjectsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  return <BatchSubjectsEditor batchId={id} />;
}
