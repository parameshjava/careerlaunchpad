"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";

/** Update the signed-in user's own display name + phone (update_own_profile RPC
 * writes only those columns for auth.uid() — never status/roles). */
export async function updateOwnProfile(
  fullName: string,
  phone: string,
): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned) return { error: "You must be signed in." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_profile", {
    p_full_name: fullName,
    p_phone: phone,
  });
  if (error) return { error: error.message };

  revalidatePath("/account");
  return { ok: true };
}
