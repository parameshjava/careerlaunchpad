"use client";

/**
 * Employer (organization) management. Excel-style grid: logo, name, website,
 * status, actions. Owners/Admins (user.manage) add, edit and suspend orgs;
 * Employer users are invited to one via the Users page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/data-table";
import { SortHeader, StatusBadge } from "@/components/data-table-parts";
import { createEmployer, updateEmployer, setEmployerStatus } from "./actions";

export type Employer = {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  status: "active" | "suspended";
};

const columns: ColumnDef<Employer>[] = [
  {
    id: "index",
    header: "#",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.index + 1}</span>,
  },
  {
    id: "logo",
    header: "Logo",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.original.logo_url} alt="" className="size-8 rounded object-contain" />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "name",
    meta: { label: "Organization" },
    header: ({ column }) => <SortHeader column={column}>Organization</SortHeader>,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "website",
    header: "Website",
    cell: ({ row }) =>
      row.original.website ? (
        <a href={row.original.website} target="_blank" rel="noreferrer" className="text-primary break-all hover:underline">
          {row.original.website}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge tone={row.original.status === "suspended" ? "amber" : "emerald"}>
        {row.original.status}
      </StatusBadge>
    ),
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const e = row.original;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <EmployerDialog mode="edit" employer={e} />
          <form action={setEmployerStatus}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="status" value={e.status === "suspended" ? "active" : "suspended"} />
            <Button type="submit" variant="outline" size="sm">
              {e.status === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
          </form>
        </div>
      );
    },
  },
];

export function EmployersManager({ employers }: { employers: Employer[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <EmployerDialog mode="create" />
      </div>
      <DataTable
        columns={columns as ColumnDef<Employer, unknown>[]}
        data={employers}
        searchKey="name"
        searchPlaceholder="Search organizations…"
      />
    </div>
  );
}

function EmployerDialog({ mode, employer }: { mode: "create" | "edit"; employer?: Employer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setName(employer?.name ?? "");
    setWebsite(employer?.website ?? "");
    setLogo(employer?.logo_url ?? "");
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true); setError(null);
    const res = mode === "create"
      ? await createEmployer(name, website, logo)
      : await updateEmployer(employer!.id, name, website, logo);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === "create" ? (
        <Button onClick={openDialog}>Add organization</Button>
      ) : (
        <Button variant="outline" size="sm" onClick={openDialog} title="Edit organization"><Pencil className="size-3.5" /></Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Add organization" : "Edit organization"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="emp-name">Organization name</Label>
              <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp-site">Website <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="emp-site" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp-logo">Logo URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="emp-logo" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
