import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchReference } from "@/lib/batch-query";

// Option data for the batch editor: active courses (with their default fee lines
// to copy) and colleges to associate. Gated on finance.manage.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const ref = await fetchBatchReference(supabase);
    return NextResponse.json(ref);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
