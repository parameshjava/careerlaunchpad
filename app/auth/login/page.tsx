import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ProviderButtons } from "./ProviderButtons";

// Server component: the static shell renders HTML + CSS on first paint (no flash
// of under-styled content). Only the OAuth buttons need client JS — those live
// in <ProviderButtons/>.

const FEATURES = [
  "Build a career-ready profile in minutes",
  "Get matched with mentors who've been there",
  "Be discovered by employers hiring now",
];

export default async function LoginPage() {
  // Someone who already has a valid session should never see the sign-in screen
  // — send them straight to their surface (homePath routes unprovisioned users
  // to /auth/no-access). This stops "asked to sign in again" when a live session
  // lands on /auth/login.
  const ctx = await getAuthContext();
  if (ctx) redirect(ctx.homePath);

  return (
    <main className="flex w-full flex-1 flex-col lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#2563eb] via-[#4f46e5] to-[#7c3aed] p-12 text-white lg:flex lg:flex-col lg:justify-center lg:gap-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative max-w-md">
          <h2 className="text-[2rem] leading-tight font-extrabold tracking-tight">
            Bridge the gap between college and corporate.
          </h2>
          <p className="mt-4 text-white/80">
            Join thousands of students turning their degree into a career — with
            the profile, mentors and opportunities to get there.
          </p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <CheckIcon />
                </span>
                <span className="text-[0.95rem] text-white/90">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">Made you job-ready. © CareerLaunchpad</p>
      </aside>

      {/* Sign-in panel */}
      <section className="flex flex-1 items-center justify-center bg-background px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight">Welcome 👋</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Sign in or create your account. Students register in seconds — no invite needed.
            </p>
          </div>

          <ProviderButtons />

          <p className="text-muted-foreground mt-6 text-center text-xs lg:text-left">
            Admins &amp; employers: use the email you were invited with.
          </p>

          <p className="text-muted-foreground mt-8 text-center text-xs leading-relaxed">
            By continuing you agree to our{" "}
            <a href="#" className="hover:text-foreground underline underline-offset-2">Terms</a> and{" "}
            <a href="#" className="hover:text-foreground underline underline-offset-2">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </main>
  );
}

/* --- Icons --------------------------------------------------------------- */
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
