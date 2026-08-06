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
  | "college"
  | "courses"
  | "batches"
  | "fees"
  | "reference"
  | "calendar"
  | "feedback";

/** Live badge keys understood by SidebarNav (resolved to a client widget). */
export type NavBadge = "exams";

export type NavItem = { label: string; href: string; icon: NavIcon; badge?: NavBadge };
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
export function buildNav(ctx: AuthContext, opts: { studentApproved?: boolean } = {}): NavSection[] {
  // Students still awaiting review don't get the "My exams" item — exams are
  // approval-gated (#45). Defaults to true so non-student surfaces are unaffected.
  const { studentApproved = true } = opts;
  const isMentor = ctx.roles.includes("mentor");
  // Shown to assigned exam staff AND blanket evaluators (mentors/employers with
  // exam.evaluate), regardless of their primary role.
  const evalItem: NavItem = { label: "Exam evaluation", href: "/dashboard/exams/evaluate", icon: "exams" };
  const canEvaluate = ctx.examEvaluator || can(ctx, "exam.evaluate");

  // Role precedence mirrors computeHomePath (lib/auth.ts): console → employer →
  // student → mentor. Keeping the same order here means the sidebar always
  // matches the surface a multi-role user actually lands on.
  const consoleRole = ctx.roles.some((r) =>
    ["owner", "platform_admin", "college_admin", "support", "coordinator"].includes(r),
  );
  if (consoleRole) {
    // Grouped by what the user acts on, one item per home, each permission-gated:
    //   Students (the domain) · Platform (its people + config) · Question Bank
    //   (content) · Exams (assessment) · Reports (read-only analytics).

    // People — students + the internal team (admins, staff, mentors) who run
    // the platform. Students keep their own high-volume console; the Team hub
    // segregates the internal actors into tabs. Add/delete live in the row menu.
    const people: NavItem[] = [];
    if (canViewStudents(ctx)) people.push({ label: "Students", href: "/dashboard", icon: "students" });
    if (can(ctx, "student.intake.import"))
      people.push({ label: "Import", href: "/dashboard/students/import", icon: "import" });
    // Team absorbs the old Users + Mentors pages — shown to anyone who can view
    // members, invite, manage, or review mentors.
    if (can(ctx, "user.view") || can(ctx, "user.invite") || can(ctx, "user.manage") || canReviewMentors(ctx))
      people.push({ label: "Team", href: "/dashboard/team", icon: "users" });

    // Platform — supporting configuration (colleges, organizations, tooling).
    const platform: NavItem[] = [];
    if (can(ctx, "college.manage"))
      platform.push({ label: "Colleges", href: "/dashboard/colleges", icon: "college" });
    if (can(ctx, "user.manage"))
      platform.push({ label: "Organizations", href: "/dashboard/employers", icon: "employer" });
    // The degree/branch catalogue the registration forms derive from (#99).
    if (can(ctx, "refdata.manage"))
      platform.push({ label: "Reference data", href: "/dashboard/reference", icon: "reference" });
    if (ctx.permissions.has("*"))
      platform.push({ label: "Test Email", href: "/dashboard/email-test", icon: "mail" });

    // Courses & Fees — the course catalog (and, in later phases, batches,
    // enrolment, and payments). All gated on the central finance permission.
    const finance: NavItem[] = [];
    if (ctx.permissions.has("*") || can(ctx, "finance.manage")) {
      finance.push({ label: "Courses", href: "/dashboard/courses", icon: "courses" });
      finance.push({ label: "Competitive Exams", href: "/dashboard/competitive-exams", icon: "exams" });
      finance.push({ label: "Batches", href: "/dashboard/batches", icon: "courses" });
    }

    // Question Bank — split: the taxonomy (subjects/chapters/passages) vs the
    // questions themselves, gated by their respective permissions.
    const bank: NavItem[] = [];
    if (ctx.permissions.has("*") || can(ctx, "exam.subject.manage"))
      bank.push({ label: "Subjects & Chapters", href: "/dashboard/subjects", icon: "exams" });
    if (ctx.permissions.has("*") || can(ctx, "exam.question.manage")) {
      bank.push({ label: "Questions", href: "/dashboard/questions", icon: "exams" });
      bank.push({ label: "Assessment questions", href: "/dashboard/assessment-questions", icon: "exams" });
    }

    // Exams — papers (create/conduct), results (read), evaluation. Sittings are
    // reached through each paper, not a separate menu item.
    const exams: NavItem[] = [];
    if (canConductExams(ctx))
      exams.push({ label: "Exam papers", href: "/dashboard/exams/papers", icon: "exams" });
    if (ctx.permissions.has("*") || can(ctx, "exam.results.view_all"))
      exams.push({ label: "Exam results", href: "/dashboard/exams/results", icon: "analytics" });
    if (canEvaluate) exams.push(evalItem);

    // Teaching quality — the chapter-feedback triage queue (#84). Deliberately its
    // own item rather than a Reports entry: it is a work queue, not a read-only
    // report, and the trip rules are worth only as much as the chance someone looks.
    const quality: NavItem[] = [];
    if (
      ctx.permissions.has("*") ||
      can(ctx, "feedback.view.identified") ||
      can(ctx, "feedback.action.manage") ||
      can(ctx, "feedback.form.manage")
    )
      quality.push({ label: "Feedback triage", href: "/dashboard/feedback", icon: "feedback" });

    // Reports — read-only analytics across domains.
    const reports: NavItem[] = [];
    if (canViewAnalytics(ctx))
      reports.push({ label: "College analytics", href: "/dashboard/analytics", icon: "analytics" });

    const sections: NavSection[] = [];
    if (people.length) sections.push({ title: "People", items: people });
    if (platform.length) sections.push({ title: "Platform", items: platform });
    if (finance.length) sections.push({ title: "Courses & Fees", items: finance });
    if (bank.length) sections.push({ title: "Question Bank", items: bank });
    if (exams.length) sections.push({ title: "Exams", items: exams });
    if (quality.length) sections.push({ title: "Teaching quality", items: quality });
    if (reports.length) sections.push({ title: "Reports", items: reports });
    // Mentoring stays a role-specific group (the mentor's own workspace).
    if (isMentor) sections.push({ title: "Mentoring", items: mentorItems() });
    return sections;
  }

  if (ctx.roles.includes("employer")) {
    const items: NavItem[] = [{ label: "Dashboard", href: "/employer", icon: "employer" }];
    if (canEvaluate) items.push(evalItem);
    return [{ items }];
  }

  if (ctx.roles.includes("student")) {
    const items: NavItem[] = [
      { label: "My profile", href: "/student/register", icon: "profile" },
      // "My batches" = what you're already in; "Courses" = what you can still join.
      // Adjacent on purpose, since students conflate the two.
      { label: "My batches", href: "/student/batches", icon: "batches" },
      { label: "My insights", href: "/student/insights", icon: "analytics" },
      { label: "Courses", href: "/student/courses", icon: "courses" },
      { label: "My fees", href: "/student/fees", icon: "fees" },
    ];
    if (studentApproved)
      items.push({ label: "My calendar", href: "/student/calendar", icon: "calendar" });
    if (can(ctx, "exam.attempt.take") && studentApproved)
      items.push({ label: "My exams", href: "/student/exams", icon: "exams", badge: "exams" });
    if (can(ctx, "chapter.quiz.take") && studentApproved)
      items.push({ label: "Assessments", href: "/student/quizzes", icon: "exams" });
    if (canEvaluate) items.push(evalItem);
    const sections: NavSection[] = [{ items }];
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
