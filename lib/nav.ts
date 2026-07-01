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
    // Grouped by what the user acts on, one item per home, each permission-gated:
    //   Students (the domain) · Platform (its people + config) · Question Bank
    //   (content) · Exams (assessment) · Reports (read-only analytics).

    // Students — everything about students (add/delete live in the row menu).
    const students: NavItem[] = [];
    if (canViewStudents(ctx)) students.push({ label: "Students", href: "/dashboard", icon: "students" });
    if (can(ctx, "student.intake.import"))
      students.push({ label: "Import", href: "/dashboard/students/import", icon: "import" });

    // Platform — the people who run it + supporting configuration.
    const platform: NavItem[] = [];
    if (can(ctx, "user.view") || can(ctx, "user.invite") || can(ctx, "user.manage"))
      platform.push({ label: "Users", href: "/dashboard/users", icon: "users" });
    if (canReviewMentors(ctx)) platform.push({ label: "Mentors", href: "/dashboard/mentors", icon: "mentor" });
    if (can(ctx, "college.manage"))
      platform.push({ label: "Colleges", href: "/dashboard/colleges", icon: "college" });
    if (can(ctx, "user.manage"))
      platform.push({ label: "Organizations", href: "/dashboard/employers", icon: "employer" });
    if (ctx.permissions.has("*"))
      platform.push({ label: "Test Email", href: "/dashboard/email-test", icon: "mail" });

    // Question Bank — split: the taxonomy (subjects/chapters/passages) vs the
    // questions themselves, gated by their respective permissions.
    const bank: NavItem[] = [];
    if (ctx.permissions.has("*") || can(ctx, "exam.subject.manage"))
      bank.push({ label: "Subjects & Chapters", href: "/dashboard/questions/structure", icon: "exams" });
    if (ctx.permissions.has("*") || can(ctx, "exam.question.manage"))
      bank.push({ label: "Questions", href: "/dashboard/questions", icon: "exams" });

    // Exams — per-college conduct + evaluation.
    const exams: NavItem[] = [];
    if (canConductExams(ctx))
      exams.push({ label: "Exam papers", href: "/dashboard/exams", icon: "exams" });
    if (canEvaluate) exams.push(evalItem);

    // Reports — read-only analytics across domains.
    const reports: NavItem[] = [];
    if (canViewAnalytics(ctx))
      reports.push({ label: "College analytics", href: "/dashboard/analytics", icon: "analytics" });

    const sections: NavSection[] = [];
    if (students.length) sections.push({ title: "Students", items: students });
    if (platform.length) sections.push({ title: "Platform", items: platform });
    if (bank.length) sections.push({ title: "Question Bank", items: bank });
    if (exams.length) sections.push({ title: "Exams", items: exams });
    if (reports.length) sections.push({ title: "Reports", items: reports });
    // Mentoring stays a role-specific group (the mentor's own workspace).
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
