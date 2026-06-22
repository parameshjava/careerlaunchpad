# Cloudflare R2 — profile photo & resume storage

Profile photos and resumes are stored in **Cloudflare R2** (S3-compatible object
storage), not in Supabase or the database. The DB keeps only the R2 **object key**
in `student_profile.photo_url` / `resume_url`. R2's free tier is **10 GB storage
with zero egress fees**, so serving files to many students costs nothing.

- Helper: [`lib/r2.ts`](../lib/r2.ts)
- Upload/download API: [`app/api/uploads/route.ts`](../app/api/uploads/route.ts)
- Env template: [`.env.example`](../.env.example)
- **Account registration + env vars (local / Vercel / Supabase):**
  [`R2_REGISTER_AND_ENV.md`](./R2_REGISTER_AND_ENV.md)

---

## 1. Account, bucket, credentials & env vars

See **[`R2_REGISTER_AND_ENV.md`](./R2_REGISTER_AND_ENV.md)** for the full walkthrough:
registering for R2, creating the `careerlaunchpad-profiles` bucket and an API token,
and setting the `R2_*` variables in local `.env`, Vercel, and Supabase. Come back here
for CORS, the upload/download flow, and the public-domain option.

## 2. Configure CORS (needed for direct browser uploads)

Browser → R2 presigned `PUT` uploads require CORS on the bucket.
Bucket → **Settings** → **CORS policy** → add:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://YOUR-PROD-DOMAIN"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

## 3. How the app uses it

Upload (files go **straight to R2**, never through our server):

```ts
// 1. ask our API for a presigned upload URL
const res = await fetch("/api/uploads", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ kind: "resume", filename: file.name, contentType: file.type }),
});
const { uploadUrl, key } = await res.json();

// 2. PUT the bytes directly to R2
await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });

// 3. persist the KEY (not a URL) on the student's profile
await supabase.from("student_profile").update({ resume_url: key }).eq("user_id", userId);
```

Display / download:

- **Photos** — if you attach a public domain (§4), render
  `publicUrl(key)` directly in `<img>`. Otherwise treat like resumes.
- **Resumes (private, PII)** — never public. Server calls `GET /api/uploads?key=...`
  → returns a short-lived `downloadUrl` (presigned, 1 h). The route only signs
  keys under the requesting user's own `students/<userId>/…` namespace.

`lib/r2.ts` exposes: `presignUpload`, `presignDownload`, `publicUrl`,
`deleteObject`, `studentObjectKey`.

## 4. (Optional) Public domain for photos

Profile photos are non-sensitive and benefit from direct CDN serving:

1. Bucket → **Settings** → **Public access** → either enable the **r2.dev**
   subdomain (fine for dev) or **Connect a custom domain** (recommended for prod).
2. Put that base URL in `R2_PUBLIC_BASE_URL`. Then `publicUrl(key)` returns a
   cacheable URL you can drop into `<img src>`.

Keep **resumes private** (do not expose them via the public domain) — serve them
only via presigned URLs.

## Notes / limits

- **File-size cap:** presigned `PUT` can't enforce size. Enforce a client-side
  limit (e.g. photo ≤ 1 MB, resume ≤ 5 MB) and consider a Cloudflare Worker /
  presigned POST policy for a hard server-side cap.
- **Free tier headroom:** at ~1 MB/student you can hold thousands of profiles in
  10 GB; egress is free, so views/downloads don't accrue cost.
- **Replacing a file:** the key is timestamped, so a new upload is a new object —
  call `deleteObject(oldKey)` after updating the DB to avoid orphans.
