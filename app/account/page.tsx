import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

// Friendly labels for the read-only roles line.
const ROLE_NAMES: Record<string, string> = {
  owner: "Owner",
  platform_admin: "Admin",
  coordinator: "Coordinator",
  support: "Support Team",
  mentor: "Mentor",
  student: "Student",
  college_admin: "College Admin",
  employer: "Employer",
};

export default async function AccountPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null; // layout already guards; keeps types happy

  const roleLabels = ctx.roles.map((r) => ROLE_NAMES[r] ?? r);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Update your display name and contact number. Your sign-in email and roles are managed for you.
      </p>
      <div className="bg-card mt-6 rounded-xl border p-6 shadow-sm">
        <ProfileForm
          initialName={ctx.name ?? ""}
          initialPhone={ctx.phone ?? ""}
          email={ctx.email ?? ""}
          roles={roleLabels}
        />
      </div>
    </div>
  );
}
