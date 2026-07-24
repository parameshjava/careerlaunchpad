import { redirect } from "next/navigation";

// The platform-users page is now the Admins/Staff/Invites tabs of the Team hub.
// Kept as a redirect so old links/bookmarks keep working.
export default function UsersPage() {
  redirect("/dashboard/team");
}
