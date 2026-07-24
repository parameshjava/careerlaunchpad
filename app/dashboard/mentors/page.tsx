import { redirect } from "next/navigation";

// Mentor review now lives on the Mentors tab of the Team hub. Kept as a redirect
// so old links (approval emails, bookmarks) keep working.
export default function MentorsPage() {
  redirect("/dashboard/team?tab=mentors");
}
