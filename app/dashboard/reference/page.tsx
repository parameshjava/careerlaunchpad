/**
 * Reference Catalogue (issue #99) — degrees, branches, and the degree→branch
 * mapping the registration forms derive from. This server component is the
 * routing/UI guard; the real authorization is `refdata.manage` re-checked in every
 * /api/admin/reference/* handler and again by RLS on the ref_* tables (migration
 * 161). All data flows through those endpoints.
 *
 * A seed migration is a snapshot — AP/TS counselling adds branches every admission
 * season — so this exists to keep the catalogue current without a migration PR each
 * time, and its "Other answers" tab closes the loop by turning students' write-ins
 * into real options.
 */
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canManageRefData } from "@/lib/refdata-admin";
import { ReferenceCatalogue } from "@/components/reference/ReferenceCatalogue";
import { PageContainer } from "@/components/app-shell/page-container";

export default async function ReferencePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!canManageRefData(ctx)) redirect("/dashboard");

  return (
    <PageContainer variant="full" className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Reference catalogue</h1>
        <p className="text-muted-foreground text-sm">
          The degrees and branches students and mentors pick from, and which branches each degree offers. Edits show
          up in the registration forms on their next load. Options are deactivated, never deleted, so existing
          records keep their values.
        </p>
      </div>
      <ReferenceCatalogue />
    </PageContainer>
  );
}
