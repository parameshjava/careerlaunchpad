/**
 * Cloudflare R2 storage helper (S3-compatible API).
 *
 * Profile photos and resumes live in R2 — NOT in Supabase storage or the DB.
 * The database (`student_profile.photo_url` / `resume_url`) stores only the R2
 * **object key** (e.g. `students/<userId>/photo/169...-avatar.jpg`); URLs are
 * derived at read time:
 *   - photos  -> `publicUrl(key)`     (public bucket domain; cheap, CDN-cached)
 *   - resumes -> `presignDownload(key)` (short-lived signed URL; resumes are PII)
 *
 * Uploads are done directly browser -> R2 with a presigned PUT from
 * `presignUpload()`, so files never pass through our server. See docs/R2_SETUP.md.
 *
 * Required env (see .env.example):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Optional: R2_PUBLIC_BASE_URL (public domain/r2.dev URL for the photos bucket)
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example / docs/R2_SETUP.md)`);
  return v;
}

// One S3 client, lazily created, pointed at the account's R2 endpoint.
let _client: S3Client | null = null;
export function r2(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto", // R2 ignores region but the SDK requires a value
      endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return _client;
}

const bucket = () => env("R2_BUCKET");

/** Presigned PUT for a direct browser upload. Default 5-minute expiry. */
export function presignUpload(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

/** Presigned GET for a private download (resumes). Default 1-hour expiry. */
export function presignDownload(key: string, expiresIn = 3600) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

/** Public URL for objects served from a public bucket domain (photos). */
export function publicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/${key}` : null;
}

/** Delete an object (e.g. when a student replaces a photo/resume). */
export function deleteObject(key: string) {
  return r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * Build a stable, collision-resistant object key for a student's file.
 * `userId` namespaces by owner so access can be authorized by path.
 */
export function studentObjectKey(
  userId: string,
  kind: "photo" | "resume",
  filename: string,
  now: number,
): string {
  // Collapse runs of disallowed chars to a single '-' (linear), then trim leading/
  // trailing '-' with a loop — NOT a regex like /^-+|-+$/g, which backtracks
  // super-linearly on dash-heavy filenames (CodeQL js/polynomial-redos).
  const collapsed = filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  let start = 0;
  let end = collapsed.length;
  while (start < end && collapsed.charCodeAt(start) === 45) start++; // 45 = '-'
  while (end > start && collapsed.charCodeAt(end - 1) === 45) end--;
  const safe = collapsed.slice(start, end);
  return `students/${userId}/${kind}/${now}-${safe}`;
}
