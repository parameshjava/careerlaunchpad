import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { devAuthEnabled, isAllowedTestEmail } from "@/lib/dev-auth";
import { DevAuthPanel, type DevCollege, type DevUser } from "./dev-auth-panel";
import { devSignOut } from "./actions";

export const metadata: Metadata = { title: "Dev sign-in" };
// Never prerender or cache: the account list changes as you seed, and the guard
// must be evaluated per request.
export const dynamic = "force-dynamic";

/**
 * Local-only "sign in as anyone" page, so testing a role does not mean owning an
 * email address. Enabled ONLY by BYPASS_AUTH=true on a local `next dev` server —
 * see lib/dev-auth.ts for the three fail-closed conditions and why this mints a
 * real session rather than faking one.
 *
 * notFound() rather than a redirect or a 403 when disabled: on a deployed
 * environment this route should be indistinguishable from one that does not
 * exist.
 */
/** Every college, in pages — see the note at the call site. */
async function fetchAllColleges(admin: ReturnType<typeof createAdminClient>) {
  const PAGE = 1000;
  const out: DevCollege[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("college")
      .select("id, name, place")
      .order("name")
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    out.push(...(data as DevCollege[]));
    if (data.length < PAGE) break;
  }
  return { data: out };
}

export default async function DevAuthPage() {
  if (!devAuthEnabled()) notFound();

  const admin = createAdminClient();
  const supabase = await createClient();

  const [{ data: { user: current } }, authList, { data: members }, { data: colleges }, { data: staff }] =
    await Promise.all([
      supabase.auth.getUser(),
      // auth.users is the full list — an account with no role has no app_user
      // row, and those are exactly the ones a self-registration test needs.
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin
        .from("app_user")
        .select("id, email, full_name, status, user_role(role:role_id(key), college:scope_college_id(name))")
        .neq("status", "deleted"),
      // Paged, because the panel's filter is CLIENT-side and PostgREST caps a
      // response at its db-max-rows (1,000 here) whatever .limit() asks for. With
      // ~1,258 colleges that silently hid everything late in the alphabet — the
      // filter reported "no match" for a college that plainly exists.
      fetchAllColleges(admin),
      admin.from("college_staff_profile").select("user_id, status"),
    ]);

  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  const memberById = new Map(
    (members ?? []).map((m) => {
      const roleRows = (m.user_role ?? []) as {
        role: { key?: string } | { key?: string }[] | null;
        college: { name?: string } | { name?: string }[] | null;
      }[];
      return [
        m.id as string,
        {
          fullName: (m.full_name as string | null) ?? null,
          status: (m.status as string | null) ?? null,
          roles: roleRows.map((r) => one(r.role)?.key).filter((k): k is string => !!k),
          colleges: Array.from(
            new Set(roleRows.map((r) => one(r.college)?.name).filter((n): n is string => !!n)),
          ),
        },
      ];
    }),
  );

  const staffStatusById = new Map(
    ((staff ?? []) as { user_id: string; status: string }[]).map((s) => [s.user_id, s.status]),
  );

  const users: DevUser[] = (authList.data?.users ?? [])
    .filter((u) => !!u.email)
    .map((u) => {
      const m = memberById.get(u.id);
      const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
      return {
        id: u.id,
        email: u.email!,
        fullName: m?.fullName ?? meta.full_name ?? meta.name ?? null,
        roles: m?.roles ?? [],
        colleges: m?.colleges ?? [],
        status: m?.status ?? null,
        unprovisioned: !m,
        staffStatus: staffStatusById.get(u.id) ?? null,
        isTestAccount: isAllowedTestEmail(u.email!),
      };
    })
    // Test accounts first (they're what you're here for), then by email.
    .sort((a, b) =>
      a.isTestAccount === b.isTestAccount ? a.email.localeCompare(b.email) : a.isTestAccount ? -1 : 1,
    );

  return (
    <main className="bg-muted/30 min-h-dvh p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">⚠️ Local development only</p>
          <p className="mt-1">
            This page signs you in as any account without a password. It exists because{" "}
            <code>BYPASS_AUTH=true</code> is set and you are on a local <code>next dev</code>{" "}
            server. It is inert on every Vercel deployment and in any production build — see{" "}
            <code>lib/dev-auth.ts</code>. Do not set <code>BYPASS_AUTH</code> in Vercel.
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Dev sign-in</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Create throwaway accounts and switch between them, so validating a role doesn&rsquo;t
              mean owning an inbox.
            </p>
          </div>
          {current && (
            <form action={devSignOut}>
              <Button type="submit" variant="outline" size="sm">Sign out</Button>
            </form>
          )}
        </div>

        <DevAuthPanel
          users={users}
          colleges={(colleges ?? []) as DevCollege[]}
          signedInAs={current?.email ?? null}
        />

        <section className="bg-card rounded-2xl border p-5 text-sm">
          <h2 className="font-semibold">Walking the college-staff flow</h2>
          <ol className="text-muted-foreground mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Create <code>admin@alpha.test</code> as <b>College Admin</b> at some college — that is
              who approves.
            </li>
            <li>
              Create <code>staff@alpha.test</code> with <b>No role</b>, sign in as them, and pick the
              same college on <code>/college-staff/register</code>.
            </li>
            <li>
              Finish the 3 steps and submit. Come back here, sign in as the college admin, and the
              registration is waiting under <b>Pending approval</b>.
            </li>
            <li>
              Approve it, sign back in as the staff member: they now land on{" "}
              <code>/dashboard</code> with only that college&rsquo;s data.
            </li>
            <li>
              To check the invite half instead, sign in as the college admin and use{" "}
              <b>Invite staff</b> — the invitee is approved the moment you sign in as them.
            </li>
            <li>
              Create a second college admin at a <i>different</i> college and confirm they cannot see
              any of the above.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
