import Link from "next/link";
import Image from "next/image";

/**
 * THE single shared top navbar for EVERY surface — marketing, auth, student,
 * employer, AND the dashboard console — so the bar is identical from page to
 * page. The brand lockup (logo + wordmark + tagline) and its dimensions are
 * fixed; only the two optional slots vary per surface:
 *   - `nav`   -> in-bar navigation links, placed between brand and the right
 *                slot (the console passes its Students/Import/Users links here).
 *   - `right` -> the trailing action:
 *       omit it  -> default "Get Started" CTA (public / marketing pages)
 *       pass null -> brand only (e.g. the login page itself)
 *       pass a node -> custom action (e.g. email + Sign out on signed-in pages)
 *
 * Tailwind-only, so it works on every surface (the marketing-only <Brand/>
 * can't, since it depends on app/landing.css). The marketing route group still
 * renders <Navbar/> + <Brand/>; its .navbar/.brand rules in app/landing.css are
 * kept pixel-matched to this component. If you change the lockup here, change
 * landing.css too (and vice-versa) — see CLAUDE.md → "One navbar, two impls".
 *
 * `showTagline` defaults to true; pass false on space-constrained surfaces.
 */
export function SiteHeader({
  nav,
  right,
  showTagline = true,
}: {
  nav?: React.ReactNode;
  right?: React.ReactNode;
  showTagline?: boolean;
}) {
  return (
    <header className="bg-background sticky top-0 z-50 border-b shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Dimensions mirror the marketing .navbar/.brand rules in app/landing.css so
          the bar looks identical on the marketing and app surfaces. */}
      <div className="flex items-center gap-3 px-[clamp(16px,4vw,28px)] py-2">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/logo-transparent.png"
            alt="CareerLaunchpad"
            width={84}
            height={86}
            className="h-[clamp(40px,9vw,84px)] w-auto shrink-0"
            priority
          />
          <span className="flex min-w-0 flex-col justify-center gap-1">
            <span className="text-[clamp(1.15rem,4.5vw,2.5rem)] font-extrabold leading-none tracking-[-0.022em]">
              Career
              <span className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent">
                Launchpad
              </span>
            </span>
            {showTagline && (
              // Hidden below 600px (matches landing.css) so the right-slot action
              // always fits on phones; full lockup from 600px up.
              <span className="text-muted-foreground hidden text-[clamp(0.72rem,2.3vw,1rem)] font-medium leading-tight min-[600px]:block">
                Connecting Rural Talent with Global Opportunities
              </span>
            )}
          </span>
        </Link>
        {nav && (
          <nav className="text-muted-foreground ml-6 hidden items-center gap-4 text-sm lg:flex">
            {nav}
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {right === undefined ? (
            <Link
              href="/auth/login"
              className="whitespace-nowrap rounded-[10px] bg-gradient-to-r from-[#2563eb] to-[#7c3aed] px-[clamp(12px,3vw,18px)] py-2.5 text-[clamp(0.82rem,2.4vw,0.95rem)] font-semibold text-white transition hover:brightness-105"
            >
              Get Started
            </Link>
          ) : (
            right
          )}
        </div>
      </div>
    </header>
  );
}
