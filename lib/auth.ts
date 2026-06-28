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
  /** True if the user is assigned as staff/evaluator on any exam (exam_staff). */
  examEvaluator: boolean;
  /** Where this user should land after login. */
  homePath: string;
  /** Display name from the social provider, if any. */
  name: string | null;
  /** Profile photo URL from the social provider (Google/LinkedIn/GitHub/…), if any. */
  avatarUrl: string | null;
};

/**
 * Pull the profile photo + display name out of the OAuth user_metadata. Each
 * provider stuffs them under slightly different keys (Google/LinkedIn use
 * `picture`, GitHub/Supabase normalize to `avatar_url`; names land in
 * `full_name` or `name`), so we probe the common ones in order.
 */
function readProviderProfile(meta: Record<string, unknown> | undefined) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const m = meta ?? {};
  return {
    name: str(m.full_name) ?? str(m.name) ?? null,
    avatarUrl: str(m.avatar_url) ?? str(m.picture) ?? null,
  };
}

/** Roles that use the /dashboard console. */
const CONSOLE_ROLES = ["owner", "platform_admin", "college_admin", "support"];

function computeHomePath(roles: string[], provisioned: boolean): string {
  if (!provisioned) return "/auth/no-access";
  if (roles.some((r) => CONSOLE_ROLES.includes(r))) return "/dashboard";
  if (roles.includes("employer")) return "/employer";
  if (roles.includes("student")) return "/student";
  // A pure mentor (e.g. external professional) lands on the mentor hub.
  // Multi-role mentors (student/owner/admin who also mentor) keep the home
  // above and reach /mentor via the sidebar.
  if (roles.includes("mentor")) return "/mentor";
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
  const { name, avatarUrl } = readProviderProfile(user.user_metadata);

  // Is this user assigned as an exam evaluator? (exam_staff self-read RLS.) Only
  // worth checking for provisioned users; drives the "Exam evaluation" nav item.
  let examEvaluator = false;
  if (provisioned) {
    const { data: staffRows } = await supabase.from("exam_staff").select("exam_id").limit(1);
    examEvaluator = (staffRows?.length ?? 0) > 0;
  }

  return {
    userId: user.id,
    email: (ctx.email as string) ?? user.email ?? null,
    provisioned,
    status: (ctx.status as AuthContext["status"]) ?? null,
    roles,
    permissions: new Set((ctx.permissions as string[]) ?? []),
    collegeScopes: (ctx.college_scopes as string[]) ?? [],
    employerId: (ctx.employer_id as string) ?? null,
    examEvaluator,
    homePath: computeHomePath(roles, provisioned),
    name,
    avatarUrl,
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
