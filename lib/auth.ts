/**
 * Server-side auth + RBAC helpers for the app surfaces.
 *
 * The DATABASE is the real authorization boundary (RLS + `has_permission()` in
 * supabase/migrations/003,004,009). These helpers exist for *routing* and for
 * *hiding UI* — never rely on them alone for security; the matching RLS policy
 * must also allow the action.
 *
 * `getAuthContext()` calls the `auth_context()` SQL function (migration 009) to
 * fetch roles/permissions/scopes in one round-trip.
 */
import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  email: string | null;
  /** false = signed in but no app_user row (no invite matched) → not provisioned. */
  provisioned: boolean;
  status: "active" | "suspended" | null;
  roles: string[];
  permissions: Set<string>;
  collegeScopes: string[];
  employerId: string | null;
  /** Where this user should land after login. */
  homePath: string;
};

/** Roles that use the /dashboard console. */
const CONSOLE_ROLES = ["owner", "college_admin", "support"];

function computeHomePath(roles: string[], provisioned: boolean): string {
  if (!provisioned) return "/auth/no-access";
  if (roles.some((r) => CONSOLE_ROLES.includes(r))) return "/dashboard";
  if (roles.includes("employer")) return "/employer";
  if (roles.includes("student")) return "/student";
  return "/auth/no-access";
}

/** Current Supabase auth user, or null if not signed in. */
export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Full RBAC context for the current request.
 * Returns null when there is no signed-in user. When signed in but not yet
 * provisioned (no invite consumed), returns a context with provisioned=false.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("auth_context");
  const ctx = (!error && data) ? (data as Record<string, unknown>) : { provisioned: false };

  const provisioned = ctx.provisioned === true;
  const roles = (ctx.roles as string[]) ?? [];

  return {
    userId: user.id,
    email: (ctx.email as string) ?? user.email ?? null,
    provisioned,
    status: (ctx.status as AuthContext["status"]) ?? null,
    roles,
    permissions: new Set((ctx.permissions as string[]) ?? []),
    collegeScopes: (ctx.college_scopes as string[]) ?? [],
    employerId: (ctx.employer_id as string) ?? null,
    homePath: computeHomePath(roles, provisioned),
  };
}

/** True if the context grants `perm` (the '*' wildcard grants everything). */
export function can(ctx: AuthContext | null, perm: string): boolean {
  if (!ctx || !ctx.provisioned) return false;
  return ctx.permissions.has("*") || ctx.permissions.has(perm);
}

/**
 * Guard for server actions / route handlers. Returns the context if the user
 * holds `perm`, otherwise throws (the DB will also reject via RLS).
 */
export async function requirePermission(perm: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!can(ctx, perm)) {
    throw new Error(`Forbidden: missing permission '${perm}'`);
  }
  return ctx!;
}
