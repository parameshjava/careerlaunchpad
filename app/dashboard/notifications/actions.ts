"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export type OfficeEmailState = { ok?: boolean; error?: string; userId?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Set / change / clear a person's OFFICE address (one per user). Owner-managed
 * (user.manage; RLS also enforces it). An empty value removes the office row;
 * a non-empty value upserts it (kind='office', active=true). Returns inline
 * state keyed by userId so the right row shows the result.
 */
export async function setOfficeEmail(
  _prev: OfficeEmailState,
  formData: FormData,
): Promise<OfficeEmailState> {
  await requirePermission("user.manage");
  const supabase = await createClient();

  const userId = String(formData.get("user_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!userId) return { error: "Missing user." };

  // The existing office row for this user, if any.
  const { data: existing } = await supabase
    .from("notification_email")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "office")
    .maybeSingle();

  // Empty input clears the office address.
  if (!email) {
    if (existing) {
      const { error } = await supabase.from("notification_email").delete().eq("id", existing.id);
      if (error) return { ok: false, error: error.message, userId };
    }
    revalidatePath("/dashboard/notifications");
    return { ok: true, userId };
  }

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", userId };

  const { error } = existing
    ? await supabase.from("notification_email").update({ email }).eq("id", existing.id)
    : await supabase
        .from("notification_email")
        .insert({ user_id: userId, email, kind: "office", active: true });
  if (error) return { ok: false, error: error.message, userId };

  revalidatePath("/dashboard/notifications");
  return { ok: true, userId };
}

/** Enable / disable a single address (personal or office) without deleting it. */
export async function toggleEmailActive(formData: FormData): Promise<void> {
  await requirePermission("user.manage");
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  await supabase.from("notification_email").update({ active }).eq("id", id);
  revalidatePath("/dashboard/notifications");
}
