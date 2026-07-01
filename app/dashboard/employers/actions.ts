"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

// All employer writes are gated by user.manage (matches the employer RLS policy).

export async function createEmployer(
  name: string,
  website: string,
  logoUrl: string = "",
): Promise<{ ok?: boolean; id?: string; name?: string; error?: string }> {
  let ctx;
  try {
    ctx = await requirePermission("user.manage");
  } catch {
    return { error: "You don't have permission to add organizations." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { error: "Organization name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employer")
    .insert({ name: trimmed, website: website.trim() || null, logo_url: logoUrl.trim() || null, created_by: ctx.userId })
    .select("id, name")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard/employers");
  revalidatePath("/dashboard/users"); // the invite form's employer list
  return { ok: true, id: data.id, name: data.name };
}

export async function updateEmployer(
  id: string,
  name: string,
  website: string,
  logoUrl: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requirePermission("user.manage");
  } catch {
    return { error: "You don't have permission to edit organizations." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { error: "Organization name is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employer")
    .update({ name: trimmed, website: website.trim() || null, logo_url: logoUrl.trim() || null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/employers");
  revalidatePath("/dashboard/users");
  return { ok: true };
}

/** Suspend or reactivate an employer organization. */
export async function setEmployerStatus(formData: FormData): Promise<void> {
  await requirePermission("user.manage");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || (status !== "active" && status !== "suspended")) return;
  const supabase = await createClient();
  await supabase.from("employer").update({ status }).eq("id", id);
  revalidatePath("/dashboard/employers");
}
