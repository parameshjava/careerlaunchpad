import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StudentResult } from "./student-result";
import type { SessionPrintMeta } from "../paper-print";

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

  // The printable result's branded cover needs the exam metadata + the
  // student's name; both are self-readable.
  const supabase = await createClient();
  const [{ data: sessions }, { data: profile }] = await Promise.all([
    supabase.rpc("list_my_exam_sessions"),
    supabase
      .from("student_profile")
      .select("full_name, roll_number, college:college_id(name)")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);
  const meta =
    ((sessions ?? []) as SessionPrintMeta[]).find((s) => s.session_id === sessionId) ?? null;

  const collegeRel = profile?.college as { name: string } | { name: string }[] | null | undefined;
  const collegeName = Array.isArray(collegeRel) ? (collegeRel[0]?.name ?? "") : (collegeRel?.name ?? "");
  const printedOn = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <StudentResult
      sessionId={sessionId}
      meta={meta}
      studentName={profile?.full_name ?? ctx.email ?? ""}
      rollNumber={profile?.roll_number ?? ""}
      collegeName={collegeName}
      printedOn={printedOn}
    />
  );
}
