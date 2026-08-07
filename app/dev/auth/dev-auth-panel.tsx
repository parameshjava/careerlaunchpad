"use client";

/**
 * The local test-account panel. Interactive bits only — the guard, the data and
 * every mutation live server-side (app/dev/auth/{page,actions}.ts).
 */
import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEED_ROLES } from "@/lib/dev-auth";
import { devCreateUser, devSignInAs, devDeleteUser, type DevResult } from "./actions";

export type DevUser = {
  id: string;
  email: string;
  fullName: string | null;
  roles: string[];
  colleges: string[];
  status: string | null;
  /** No app_user row — never provisioned, so a self-registration candidate. */
  unprovisioned: boolean;
  staffStatus: string | null;
  isTestAccount: boolean;
};

export type DevCollege = { id: string; name: string; place: string | null };

const selectCls =
  "border-input bg-background h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

export function DevAuthPanel({
  users,
  colleges,
  signedInAs,
}: {
  users: DevUser[];
  colleges: DevCollege[];
  signedInAs: string | null;
}) {
  const router = useRouter();
  const [state, createAction, creating] = useActionState<DevResult, FormData>(devCreateUser, {});
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState("none");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const needsCollege = SEED_ROLES.find((r) => r.key === role)?.needsCollege ?? false;

  const visibleColleges = useMemo(() => {
    const q = collegeFilter.trim().toLowerCase();
    const list = q
      ? colleges.filter((c) => `${c.name} ${c.place ?? ""}`.toLowerCase().includes(q))
      : colleges;
    return list.slice(0, 200);
  }, [colleges, collegeFilter]);

  const visibleUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.email} ${u.fullName ?? ""} ${u.roles.join(" ")} ${u.colleges.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [users, userFilter]);

  function act(fn: () => Promise<DevResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {signedInAs && (
        <p className="rounded-lg border bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Currently signed in as <b className="break-all">{signedInAs}</b>.
        </p>
      )}

      {/* ---- create ---------------------------------------------------- */}
      <section className="bg-card rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Create a test account</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          No email is sent and no inbox is needed — the account is created already confirmed.
          Reserved test domains only (<code>.test</code>, <code>.example</code>,{" "}
          <code>example.com</code>, …), so this can never mint an account on a real address.
        </p>

        <form action={createAction} className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="dev-email">Email</Label>
            <Input id="dev-email" name="email" placeholder="staff@alpha.test" required />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="dev-name">Full name</Label>
            <Input id="dev-name" name="full_name" placeholder="Dr. Anitha Rao" />
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="dev-role">Role</Label>
            <select
              id="dev-role"
              name="role"
              className={selectCls}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {SEED_ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>

          {needsCollege && (
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="dev-college">College</Label>
              <Input
                placeholder="Filter colleges…"
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="mb-1"
              />
              <select
                id="dev-college"
                name="college_id"
                className={selectCls}
                value={collegeId}
                onChange={(e) => setCollegeId(e.target.value)}
                required
              >
                <option value="">Select a college…</option>
                {visibleColleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.place ? ` — ${c.place}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Showing {visibleColleges.length} of {colleges.length}. Filter to narrow.
              </p>
            </div>
          )}

          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>

        {state.error && <p className="text-destructive mt-3 text-sm">{state.error}</p>}
        {state.message && <p className="mt-3 text-sm text-emerald-700">{state.message}</p>}
      </section>

      {/* ---- sign in as ------------------------------------------------ */}
      <section className="bg-card rounded-2xl border p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Sign in as</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Mints a real session for that account — the JWT, RLS and the nav all resolve to
              them, so what you see is what they would see.
            </p>
          </div>
          <Input
            placeholder="Filter by email, name, role…"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>

        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

        <ul className="mt-4 grid gap-2 [&>li]:min-w-0">
          {visibleUsers.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.fullName || u.email}</p>
                <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {u.unprovisioned ? (
                    <Badge tone="amber">no role — can self-register</Badge>
                  ) : (
                    u.roles.map((r) => <Badge key={r}>{r}</Badge>)
                  )}
                  {u.staffStatus && <Badge tone="violet">staff: {u.staffStatus}</Badge>}
                  {u.colleges.map((c) => <Badge key={c} tone="muted">{c}</Badge>)}
                  {u.status === "suspended" && <Badge tone="rose">suspended</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={busy} onClick={() => act(() => devSignInAs(u.email))}>
                  Sign in
                </Button>
                {u.isTestAccount && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => act(() => devDeleteUser(u.email))}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {visibleUsers.length === 0 && (
          <p className="text-muted-foreground bg-muted/40 mt-4 rounded-lg border px-4 py-10 text-center text-sm">
            No accounts match.
          </p>
        )}
      </section>
    </div>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "amber" | "rose" | "violet" | "muted";
}) {
  const cls = {
    default: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${cls}`}>{children}</span>;
}
