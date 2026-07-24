"use client";

/**
 * Mentors grid for the Team hub. Built on the shared DataTable (search / faceted
 * Kind · College · Status filters / sortable headers) so it matches the Admins,
 * Staff and Invites tabs. Clicking a row opens a review drawer with the full
 * mentor profile and Approve / Suspend / Reset — the actions go through
 * setMentorStatus() → set_mentor_status() (RLS-enforced).
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { DataTable, arrIncludes, type DataTableFilter } from "@/components/data-table";
import { SortHeader, StatusBadge, type StatusTone } from "@/components/data-table-parts";
import type { MentorRow, MentorStatus } from "@/lib/mentors-query";
import { setMentorStatus } from "@/app/dashboard/mentors/actions";

const KIND_LABEL: Record<string, string> = {
  student_alumni: "Alumnus / placed student",
  professional: "External professional",
  staff: "Staff",
};

const STATUS_META: Record<MentorStatus, { label: string; tone: StatusTone }> = {
  pending_review: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  suspended: { label: "Suspended", tone: "rose" },
};

// Search box → match name or email.
const searchFilter: FilterFn<MentorRow> = (row, _id, value) => {
  const t = String(value ?? "").trim().toLowerCase();
  if (!t) return true;
  const r = row.original;
  return (r.name ?? "").toLowerCase().includes(t) || r.email.toLowerCase().includes(t);
};

export function MentorsTable({ mentors, canReview }: { mentors: MentorRow[]; canReview: boolean }) {
  const [selected, setSelected] = useState<MentorRow | null>(null);

  const colleges = useMemo(
    () => Array.from(new Set(mentors.map((m) => m.college).filter((c): c is string => !!c))).sort(),
    [mentors],
  );

  const columns = useMemo<ColumnDef<MentorRow>[]>(() => {
    return [
      {
        accessorKey: "name",
        meta: { label: "Name" },
        header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
        filterFn: searchFilter,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <button
              type="button"
              onClick={() => setSelected(m)}
              className="flex flex-col items-start text-left"
            >
              <span className="font-medium">{m.name || "Unnamed mentor"}</span>
              <span className="text-muted-foreground text-xs break-all">{m.email}</span>
            </button>
          );
        },
      },
      {
        accessorKey: "kind",
        meta: { label: "Kind" },
        header: "Kind",
        filterFn: arrIncludes,
        cell: ({ row }) => (
          <Badge variant="secondary">{KIND_LABEL[row.original.kind] ?? row.original.kind}</Badge>
        ),
      },
      {
        accessorKey: "college",
        meta: { label: "College" },
        header: ({ column }) => <SortHeader column={column}>College</SortHeader>,
        filterFn: arrIncludes,
        cell: ({ row }) => row.original.college || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        filterFn: arrIncludes,
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status];
          return (
            <div className="flex items-center gap-1.5">
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              {!row.original.registered && (
                <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[0.7rem]">
                  Draft
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <MentorRowActions mentor={row.original} canReview={canReview} onReview={setSelected} />
        ),
      },
    ];
  }, [canReview]);

  const filters = useMemo<DataTableFilter[]>(() => {
    const list: DataTableFilter[] = [
      {
        columnId: "kind",
        title: "Kind",
        options: [
          { label: "Alumnus / placed student", value: "student_alumni" },
          { label: "External professional", value: "professional" },
          { label: "Staff", value: "staff" },
        ],
      },
    ];
    if (colleges.length > 0)
      list.push({ columnId: "college", title: "College", options: colleges.map((c) => ({ label: c, value: c })) });
    list.push({
      columnId: "status",
      title: "Status",
      options: [
        { label: "Pending", value: "pending_review" },
        { label: "Approved", value: "approved" },
        { label: "Suspended", value: "suspended" },
      ],
    });
    return list;
  }, [colleges]);

  return (
    <>
      <DataTable
        columns={columns as ColumnDef<MentorRow, unknown>[]}
        data={mentors}
        searchKey="name"
        searchPlaceholder="Search mentors by name or email…"
        filters={filters}
      />
      <MentorReviewDrawer
        mentor={selected}
        canReview={canReview}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

// One ⋯ menu per row — matches the Admins/Staff/Invites tabs. Review opens the
// detail drawer; Edit profile goes to the full wizard; the status actions call
// setMentorStatus directly for quick approve/suspend without opening the drawer.
function MentorRowActions({
  mentor, canReview, onReview,
}: {
  mentor: MentorRow;
  canReview: boolean;
  onReview: (m: MentorRow) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const setStatus = (status: "approved" | "suspended" | "pending_review") =>
    startTransition(async () => {
      await setMentorStatus(mentor.userId, status);
      router.refresh();
    });

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onReview(mentor)}>Review details</DropdownMenuItem>
          {canReview && (
            <DropdownMenuItem onClick={() => router.push(`/dashboard/team/mentors/${mentor.userId}`)}>
              Edit profile
            </DropdownMenuItem>
          )}
          {canReview && (
            <>
              <DropdownMenuSeparator />
              {mentor.status !== "approved" && (
                <DropdownMenuItem onClick={() => setStatus("approved")}>Approve</DropdownMenuItem>
              )}
              {mentor.status !== "suspended" && (
                <DropdownMenuItem onClick={() => setStatus("suspended")}>Suspend</DropdownMenuItem>
              )}
              {mentor.status !== "pending_review" && (
                <DropdownMenuItem onClick={() => setStatus("pending_review")}>Reset to pending</DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MentorReviewDrawer({
  mentor,
  canReview,
  onClose,
}: {
  mentor: MentorRow | null;
  canReview: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(status: "approved" | "suspended" | "pending_review") {
    if (!mentor) return;
    setError(null);
    startTransition(async () => {
      try {
        await setMentorStatus(mentor.userId, status);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t update the mentor.");
      }
    });
  }

  const meta = mentor ? STATUS_META[mentor.status] : null;

  return (
    <Sheet open={!!mentor} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto p-0">
        {mentor && meta && (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg">{mentor.name || "Unnamed mentor"}</SheetTitle>
              <SheetDescription className="break-all">{mentor.email}</SheetDescription>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                <Badge variant="secondary">{KIND_LABEL[mentor.kind] ?? mentor.kind}</Badge>
                {!mentor.registered && (
                  <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs">Draft</span>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-5 p-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {mentor.college && <Detail label="College" value={mentor.college} />}
                {mentor.graduationYear != null && (
                  <Detail label="Graduation year" value={String(mentor.graduationYear)} />
                )}
                {mentor.currentRole && <Detail label="Current role" value={mentor.currentRole} />}
                {mentor.industry && <Detail label="Industry" value={mentor.industry} />}
                {mentor.experience != null && <Detail label="Experience" value={`${mentor.experience} yrs`} />}
                {mentor.mode && <Detail label="Mode" value={mentor.mode} />}
                {mentor.contribution && <Detail label="Contribution" value={mentor.contribution} />}
              </dl>

              {mentor.mentoringAreas.length > 0 && <ChipRow label="Mentoring" items={mentor.mentoringAreas} />}
              {mentor.skills.length > 0 && <ChipRow label="Skills" items={mentor.skills} />}
              {mentor.teachableSubjects.length > 0 && <ChipRow label="Subjects" items={mentor.teachableSubjects} />}

              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>

            {canReview && (
              <SheetFooter className="flex-row flex-wrap items-center justify-end gap-2">
                <Button variant="outline" asChild className="mr-auto">
                  <Link href={`/dashboard/team/mentors/${mentor.userId}`}>Edit profile</Link>
                </Button>
                {mentor.status !== "pending_review" && (
                  <Button variant="ghost" disabled={pending} onClick={() => act("pending_review")}>
                    Reset
                  </Button>
                )}
                {mentor.status !== "suspended" && (
                  <Button variant="outline" disabled={pending} onClick={() => act("suspended")}>
                    Suspend
                  </Button>
                )}
                {mentor.status !== "approved" && (
                  <Button disabled={pending} onClick={() => act("approved")}>
                    Approve
                  </Button>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</span>
      {items.map((it) => (
        <span key={it} className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">{it}</span>
      ))}
    </div>
  );
}
