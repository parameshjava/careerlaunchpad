import { redirect } from "next/navigation";

// The Exam papers page now lives at /dashboard/exams/papers. Keep this index
// path working (bookmarks, old links) by redirecting to the canonical slug.
export default function ExamsIndex() {
  redirect("/dashboard/exams/papers");
}
