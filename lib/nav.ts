// Role-aware navigation for the left sidebar. The console (and the student /
// employer surfaces) show DIFFERENT menus depending on the signed-in user's
// permissions — so the nav is derived from the RBAC context, never hard-coded
// per page. Items are plain serializable data (icon is a string key resolved to
// a lucide icon in the client SidebarNav) so a Server Component layout can build
// the menu and pass it across the RSC boundary.
import { type AuthContext, can } from "@/lib/auth";

/** Icon keys understood by SidebarNav (maps to a lucide-react icon). */
export type NavIcon =
  | "students"
  | "import"
  | "users"
  | "analytics"
  | "profile"
  | "employer"
  | "mentor"
  | "mail"
  | "exams"
  | "college";

export type NavItem = { label: string; href: string; icon: NavIcon };
export type NavSection = { title?: string; items: NavItem[] };

/** True if the user can see student records at all (drives the Students item). */
function canViewStudents(ctx: AuthContext): boolean {
  return (
    ctx.permissions.has("*") ||
    can(ctx, "user.manage") ||
    can(ctx, "student.profile.view") ||
    can(ctx, "student.profile.search") ||
    can(ctx, "college.students.view")
  );
}

/** True if the user can open the College Insights dashboard. */
function canViewAnalytics(ctx: AuthContext): boolean {
  return (
    ctx.permissions.has("*") ||
    can(ctx, "user.manage") ||
    can(ctx, "analytics.platform.view") ||
    can(ctx, "college.analytics.view")
  );
}

/** Mentor self-service items, shown to anyone who holds the `mentor` role. */
function mentorItems(): NavItem[] {
  return [
    { label: "Mentor hub", href: "/mentor", icon: "mentor" },
    { label: "Mentor profile", href: "/mentor/register", icon: "profile" },
  ];
}

/** True if the user can review/approve mentor registrations. */
function canReviewMentors(ctx: AuthContext): boolean {
  return ctx.permissions.has("*") || can(ctx, "mentor.review") || can(ctx, "user.manage");
}

/** True if the user can author the exam question bank (subjects/chapters/questions). */
function canAuthorExams(ctx: AuthContext): boolean {
  return (
    ctx.permissions.has("*") ||
    can(ctx, "exam.subject.manage") ||
    can(ctx, "exam.question.manage")
  );
}

/** True if the user can build/conduct exams (blueprints, sessions, results). */
function canConductExams(ctx: AuthContext): boolean {
  return (
    ctx.permissions.has("*") ||
    can(ctx, "exam.blueprint.manage") ||
    can(ctx, "exam.assign") ||
    can(ctx, "exam.results.view_all")
  );
}

/**
 * Build the sidebar for the current user. Because `mentor` is an ADDITIVE role,
 * mentor items are appended to whatever surface the user primarily lives on
 * (a student-mentor keeps their student menu and gains a Mentor group; a
 * console mentor gets one too) rather than replacing it.
 *
 * Console roles (owner, platform_admin, college_admin, support) get the
 * Administration + Insights groups, filtered to what their permissions allow.
 * Students and employers get their own short menu.
 */
export function buildNav(ctx: AuthContext): NavSection[] {
  const isMentor = ctx.roles.includes("mentor");
  // Shown to assigned exam staff AND blanket evaluators (mentors/employers with
  // exam.evaluate), regardless of their primary role.
  const evalItem: NavItem = { label: "Exam evaluation", href: "/dashboard/exams/evaluate", icon: "exams" };
  const canEvaluate = ctx.examEvaluator || can(ctx, "exam.evaluate");

  if (ctx.roles.includes("student")) {
    const items: NavItem[] = [
      { label: "My profile", href: "/student/register", icon: "profile" },
      { label: "My insights", href: "/student/insights", icon: "analytics" },
    ];
    if (can(ctx, "exam.attempt.take"))
      items.push({ label: "My exams", href: "/student/exams", icon: "exams" });
    if (canEvaluate) items.push(evalItem);
    const sections: NavSection[] = [{ items }];
    if (isMentor) sections.push({ title: "Mentoring", items: mentorItems() });
    return sections;
  }

  if (ctx.roles.includes("employer")) {
    const items: NavItem[] = [{ label: "Dashboard", href: "/employer", icon: "employer" }];
    if (canEvaluate) items.push(evalItem);
    return [{ items }];
  }

  // Console surfaces — only include items the user is actually permitted to use.
  const consoleRole = ctx.roles.some((r) =>
    ["owner", "platform_admin", "college_admin", "support", "coordinator"].includes(r),
  );
  if (consoleRole) {
    const admin: NavItem[] = [];
    if (canViewStudents(ctx)) admin.push({ label: "Students", href: "/dashboard", icon: "students" });
    if (canReviewMentors(ctx)) admin.push({ label: "Mentors", href: "/dashboard/mentors", icon: "mentor" });
    if (can(ctx, "student.intake.import"))
      admin.push({ label: "Import", href: "/dashboard/students/import", icon: "import" });
    if (can(ctx, "user.view") || can(ctx, "user.invite") || can(ctx, "user.manage"))
      admin.push({ label: "Users", href: "/dashboard/users", icon: "users" });
    // Owners and CareerLaunchpad admins manage the master college list.
    if (can(ctx, "college.manage"))
      admin.push({ label: "Colleges", href: "/dashboard/colleges", icon: "college" });
    // Manage the office @careerlaunchpad.ai addresses notifications are sent to.
    if (can(ctx, "user.manage"))
      admin.push({ label: "Notification emails", href: "/dashboard/notifications", icon: "mail" });
    // Owner-only: validate the email integration (SMTP).
    if (ctx.permissions.has("*"))
      admin.push({ label: "Test Email", href: "/dashboard/email-test", icon: "mail" });

    const insights: NavItem[] = [];
    if (canViewAnalytics(ctx))
      insights.push({ label: "College analytics", href: "/dashboard/analytics", icon: "analytics" });

    // Question Bank — the global CareerLaunchPad asset, its OWN top-level area,
    // independent of Exams.
    const bank: NavItem[] = [];
    if (canAuthorExams(ctx))
      bank.push({ label: "Question bank", href: "/dashboard/questions", icon: "exams" });

    // Exams — per-college conduct + evaluation.
    const exams: NavItem[] = [];
    if (canConductExams(ctx))
      exams.push({ label: "Exam papers", href: "/dashboard/exams", icon: "exams" });
    if (canEvaluate) exams.push(evalItem);

    const sections: NavSection[] = [];
    if (admin.length) sections.push({ title: "Administration", items: admin });
    if (bank.length) sections.push({ title: "Question Bank", items: bank });
    if (exams.length) sections.push({ title: "Exams", items: exams });
    if (insights.length) sections.push({ title: "Insights", items: insights });
    if (isMentor) sections.push({ title: "Mentoring", items: mentorItems() });
    return sections;
  }

  // Pure mentor (e.g. an external professional with no other role).
  if (isMentor) {
    const items = mentorItems();
    if (canEvaluate) items.push(evalItem);
    return [{ items }];
  }

  // Any other provisioned user who is only an exam evaluator.
  if (canEvaluate) return [{ items: [evalItem] }];

  return [];
}
