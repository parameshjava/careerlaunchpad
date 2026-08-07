import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { PageContainer } from "@/components/app-shell/page-container";
import { StaffForm } from "./staff-form";

export const metadata: Metadata = { title: "Staff registration" };

/**
 * College Staff registration / profile editor. The form (client) loads reference
 * data + the existing registration from the API and resumes where the person
 * left off — or, if they have no registration yet, asks which college they work
 * at first (the college decides who reviews them, so it comes before anything
 * else).
 *
 * Signed-in only — no role check and no `provisioned` check. A brand-new
 * registrant has no app_user row until they pick a college here, so requiring
 * either would bounce them back to /auth/no-access, which is the page that sent
 * them. See the fuller note in ../layout.tsx.
 */
export default async function CollegeStaffRegisterPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <PageContainer variant="form">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">🏫 College Staff Registration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A few details about your role, experience and the subjects you teach — it saves as you go.
        </p>
      </header>
      <StaffForm />
    </PageContainer>
  );
}
