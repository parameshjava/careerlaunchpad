"use client";

/**
 * Employer (organization) management. Excel-style grid: logo, name, website,
 * status, actions. Owners/Admins (user.manage) add, edit and suspend orgs;
 * Employer users are invited to one via the Users page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createEmployer, updateEmployer, setEmployerStatus } from "./actions";

export type Employer = {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  status: "active" | "suspended";
};

const cell = "border-border border px-3 py-2 align-middle";

export function EmployersManager({ employers }: { employers: Employer[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <EmployerDialog mode="create" />
      </div>
      <div className="bg-card rounded-xl border p-2 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className={`${cell} w-12 font-semibold`}>#</th>
                <th className={`${cell} w-16 font-semibold`}>Logo</th>
                <th className={`${cell} font-semibold`}>Organization</th>
                <th className={`${cell} font-semibold`}>Website</th>
                <th className={`${cell} font-semibold`}>Status</th>
                <th className={`${cell} font-semibold`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employers.length === 0 && (
                <tr><td className={`${cell} text-muted-foreground text-center`} colSpan={6}>No organizations yet.</td></tr>
              )}
              {employers.map((e, i) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className={`${cell} text-muted-foreground tabular-nums`}>{i + 1}</td>
                  <td className={cell}>
                    {e.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.logo_url} alt="" className="size-8 rounded object-contain" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`${cell} font-medium`}>{e.name}</td>
                  <td className={`${cell} break-all`}>
                    {e.website ? (
                      <a href={e.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{e.website}</a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={cell}>
                    <Badge variant="secondary" className={e.status === "suspended" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}>
                      {e.status}
                    </Badge>
                  </td>
                  <td className={cell}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
