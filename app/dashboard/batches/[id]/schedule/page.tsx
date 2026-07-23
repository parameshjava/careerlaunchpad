import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { BatchSchedule } from "@/components/batches/batch-schedule";

export default async function BatchSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "finance.manage"))) redirect("/dashboard");

  return <BatchSchedule batchId={id} />;
}
