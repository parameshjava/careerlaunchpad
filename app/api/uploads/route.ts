/**
 * Profile file uploads/downloads backed by Cloudflare R2 (see docs/R2_SETUP.md).
 *
 * Flow (files never pass through this server):
 *   1. Client POSTs { kind, filename, contentType } -> gets { uploadUrl, key }.
 *   2. Client PUTs the file bytes directly to `uploadUrl` (the R2 presigned URL).
 *   3. Client saves `key` into student_profile.photo_url / resume_url.
 *   4. To view a private file (resume), client GETs ?key=... -> { downloadUrl }.
 *
 * Auth: the caller must be a signed-in Supabase user; keys are namespaced under
 * the user's id so a user can only sign URLs for their own files.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignUpload, presignDownload, studentObjectKey } from "@/lib/r2";

const ALLOWED: Record<"photo" | "resume", string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  resume: ["application/pdf"],
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { kind?: string; filename?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { kind, filename, contentType } = body;
  if (kind !== "photo" && kind !== "resume") {
    return NextResponse.json({ error: "kind must be 'photo' or 'resume'" }, { status: 400 });
  }
  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType are required" }, { status: 400 });
  }
  if (!ALLOWED[kind].includes(contentType)) {
    return NextResponse.json(
      { error: `contentType ${contentType} not allowed for ${kind} (allowed: ${ALLOWED[kind].join(", ")})` },
      { status: 415 },
    );
  }

  const key = studentObjectKey(user.id, kind, filename, Date.now());
  const uploadUrl = await presignUpload(key, contentType);
  // Note: presigned PUT can't cap file size; enforce a client-side limit and/or
  // a bucket-level size rule. Store `key` (not the URL) in the DB column.
  return NextResponse.json({ uploadUrl, key });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key query param required" }, { status: 400 });

  // Owner-only: a user may only sign URLs for files under their own namespace.
  // (Extend later for recruiters/admins viewing an applicant's resume via RBAC.)
  if (!key.startsWith(`students/${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const downloadUrl = await presignDownload(key);
  return NextResponse.json({ downloadUrl });
}
