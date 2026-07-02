"use client";

// The app-surface shell: a role-aware left sidebar + the page content, laid out
// as a fixed app shell. The parent layout is a non-scrolling h-dvh flex column
// (brand header on top); this fills the rest and makes ONLY the main panel
// scroll — the header and the sidebar stay put while data scrolls (no
// header-height math: the header simply takes its natural row height and the
// body flexes into what's left).
//
// The sidebar menu is built server-side from the RBAC context (lib/nav.ts) and
// passed in as data, so this component is purely presentational. It is:
//   • collapsible on desktop — an icon rail (icons only) ⇄ full width, the
//     modern pattern (VS Code / Linear / shadcn); the choice is remembered.
//   • a slide-in drawer on mobile — opened by a hamburger, closed by overlay/✕.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  Mail,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavIcon, NavSection } from "@/lib/nav";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  students: GraduationCap,
  import: Upload,
  users: Users,
  analytics: BarChart3,
  profile: UserRound,
  employer: LayoutDashboard,
  mentor: Handshake,
  mail: Mail,
  exams: ClipboardList,
  college: Building2,
};

const COLLAPSE_KEY = "cl-sidebar-collapsed";

// Roots are active only on an exact match; deeper routes also match their
// children (e.g. /dashboard/students/import highlights "Import").
const ROOTS = new Set(["/dashboard", "/student", "/employer", "/dashboard/questions"]);
function isActive(pathname: string, href: string): boolean {
  if (ROOTS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

const sectionKey = (section: NavSection, i: number) => section.title ?? `__untitled_${i}`;

function NavLinks({
  nav,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  nav: NavSection[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  // Titled sections collapse/expand; the one holding the active route starts
  // open. Untitled sections (no header) always show. Only applies in the full
  // sidebar — the icon rail shows every item.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    nav.forEach((s, i) => {
      m[sectionKey(s, i)] = s.items.some((it) => isActive(pathname, it.href));
    });
    return m;
  });

  // Keep the active section expanded as the route changes (preserve manual toggles).
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      nav.forEach((s, i) => {
        if (s.items.some((it) => isActive(pathname, it.href))) next[sectionKey(s, i)] = true;
      });
      return next;
    });
  }, [pathname, nav]);

  return (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {nav.map((section, i) => {
        const key = sectionKey(section, i);
        const hasTitle = !!section.title && !collapsed;
        // Untitled sections and the icon rail always show their items.
        const open = collapsed || !section.title || openMap[key];
        return (
          <div key={key} className="flex flex-col gap-1">
            {hasTitle && (
              <button
                type="button"
                onClick={() => setOpenMap((m) => ({ ...m, [key]: !open }))}
                aria-expanded={open}
                className="text-muted-foreground hover:text-foreground flex items-center justify-between gap-2 rounded-md px-3 pb-1 text-xs font-semibold tracking-wider uppercase transition-colors"
              >
                <span>{section.title}</span>
                <ChevronDown className={cn("size-3.5 transition-transform", open ? "" : "-rotate-90")} />
              </button>
            )}
            {open &&
              section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
                      collapsed ? "justify-center px-0" : "px-3",
                      active
                        ? // Clear brand highlight for the current page: tinted
                          // background, brand text/icon, and a left accent bar.
                          "bg-primary/10 text-primary font-semibold before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-1 before:rounded-full before:bg-primary before:content-['']"
                        : "text-sidebar-foreground/75 font-medium hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

export function ConsoleShell({
  nav,
  children,
}: {
  nav: NavSection[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail
  const hasNav = nav.some((s) => s.items.length > 0);

  // Restore the desktop collapsed preference after mount (avoids SSR mismatch).
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage disabled — keep the in-session choice */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Desktop sidebar — collapsible icon rail ⇄ full width; scrolls within. */}
      {hasNav && (
        <aside
          className={cn(
            "bg-sidebar hidden shrink-0 flex-col border-r transition-[width] duration-200 ease-in-out lg:flex",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <div
            className={cn(
              "flex h-12 shrink-0 items-center border-b px-2",
              collapsed ? "justify-center" : "justify-end",
            )}
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand menu" : "Collapse menu"}
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5"
            >
              {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavLinks nav={nav} pathname={pathname} collapsed={collapsed} />
          </div>
        </aside>
      )}

      {/* Content column: mobile toolbar stays put, only <main> scrolls. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {hasNav && (
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="hover:bg-accent inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
              Menu
            </button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-screen-2xl">{children}</div>
        </main>
      </div>

      {/* Mobile drawer (expandable / closable). */}
      {hasNav && open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="bg-sidebar absolute top-0 left-0 flex h-full w-72 max-w-[80%] flex-col border-r shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="hover:bg-accent rounded-md p-1.5"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavLinks nav={nav} pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
