import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchFee, fetchBatchRoster } from "@/lib/enrollment-query";

// GET /api/admin/batches/[id]/roster — the batch's fee context + enrolled
// students. Fetched lazily by the workspace's Students section (only when the
// accordion is opened), so the batch page loads without pulling the roster.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const [batch, roster] = await Promise.all([
      fetchBatchFee(supabase, id),
      fetchBatchRoster(supabase, id),
    ]);
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    return NextResponse.json({ batch, roster });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
