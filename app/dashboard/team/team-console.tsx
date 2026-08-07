"use client";

/**
 * The Team hub: one screen, four segregated actor views as connected folder
 * tabs — Admins · Staff · Mentors · Invites. Because roles are additive, a
 * person legitimately appears in more than one tab (a mentor who is also an
 * admin shows in both Admins and Mentors); that's intended, not duplication.
 * Admins/Staff/Invites reuse the shared PlatformUsersTable; Mentors uses the
 * MentorsTable + review drawer. Every mutation is guarded server-side.
 */
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PlatformUsersTable, type MemberRow, type Caps } from "@/app/dashboard/users/platform-users-table";
import { MentorsTable } from "./mentors-table";
import type { MentorRow } from "@/lib/mentors-query";
import type { StaffRow, StaffInviteRow } from "@/lib/college-staff-list";
import { becomeMentor } from "@/app/dashboard/mentors/actions";

// Shared folder-tab trigger style (docs/STYLE_GUIDE.md → Tabs): muted inactive
// tabs keep their underline; the active tab is a solid brand fill with no border.
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

export type TeamTab = "admins" | "staff" | "mentors" | "collegeStaff" | "invites";

export function TeamConsole({
  admins,
  staff,
  invites,
  mentors,
  collegeStaff,
  collegeStaffPanel,
  caps,
  callerRank,
  isOwner,
  currentUserId,
  canReviewMentors,
  isMentor,
  defaultTab,
}: {
  admins: MemberRow[];
  staff: MemberRow[];
  invites: MemberRow[];
  mentors: MentorRow[];
  /** Counts only — the panel itself is a server component passed in as a slot,
   * so this client component never re-implements the roster. */
  collegeStaff: { rows: StaffRow[]; invites: StaffInviteRow[] } | null;
  collegeStaffPanel?: React.ReactNode;
  caps: Caps;
  callerRank: number;
  isOwner: boolean;
  currentUserId: string;
  canReviewMentors: boolean;
  isMentor: boolean;
  defaultTab: TeamTab;
}) {
  const tabs: { value: TeamTab; label: string; count: number }[] = [
    { value: "admins", label: "Admins", count: admins.length },
    { value: "staff", label: "Staff", count: staff.length },
    { value: "mentors", label: "Mentors", count: mentors.length },
    ...(collegeStaff
      ? [{
          value: "collegeStaff" as const,
          label: "College staff",
          count: collegeStaff.rows.length + collegeStaff.invites.length,
        }]
      : []),
    { value: "invites", label: "Invites", count: invites.length },
  ];

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList
        variant="line"
        className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
      >
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className={TAB_CLS}>
            {t.label} ({t.count})
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="admins" className="mt-4 min-w-0">
        <MemberTab
          rows={admins}
          caps={caps}
          callerRank={callerRank}
          isOwner={isOwner}
          currentUserId={currentUserId}
          empty="No owners or admins yet."
        />
      </TabsContent>

      <TabsContent value="staff" className="mt-4 min-w-0">
        <MemberTab
          rows={staff}
          caps={caps}
          callerRank={callerRank}
          isOwner={isOwner}
          currentUserId={currentUserId}
          empty="No coordinators, support or college admins yet."
        />
      </TabsContent>

      <TabsContent value="mentors" className="mt-4 min-w-0 space-y-4">
        <div className="flex justify-end">
          {isMentor ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/mentor">My mentor profile</Link>
            </Button>
          ) : (
            <form action={becomeMentor}>
              <Button type="submit" variant="outline" size="sm">Become a mentor</Button>
            </form>
          )}
        </div>
        {mentors.length === 0 ? (
          <EmptyState>No mentors have signed up yet.</EmptyState>
        ) : (
          <MentorsTable
            mentors={mentors}
            canReview={canReviewMentors}
            canDelete={caps.canDelete}
            currentUserId={currentUserId}
          />
        )}
      </TabsContent>

      {collegeStaff && (
        <TabsContent value="collegeStaff" className="mt-4 min-w-0">
          {collegeStaffPanel}
        </TabsContent>
      )}

      <TabsContent value="invites" className="mt-4 min-w-0">
        <MemberTab
          rows={invites}
          caps={caps}
          callerRank={callerRank}
          isOwner={isOwner}
          currentUserId={currentUserId}
          empty="No pending invites."
        />
      </TabsContent>
    </Tabs>
  );
}

function MemberTab({
  rows, caps, callerRank, isOwner, currentUserId, empty,
}: {
  rows: MemberRow[];
  caps: Caps;
  callerRank: number;
  isOwner: boolean;
  currentUserId: string;
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <PlatformUsersTable
      rows={rows}
      caps={caps}
      callerRank={callerRank}
      isOwner={isOwner}
      currentUserId={currentUserId}
    />
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
      {children}
    </div>
  );
}
