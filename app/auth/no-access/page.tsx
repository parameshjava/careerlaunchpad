import Link from "next/link";
import { Button } from "@/components/ui/button";
import { registerAsStudent } from "./actions";

/**
 * Landing for a user who signed in successfully but isn't provisioned yet (no
 * invite matched their email). Instead of a dead end, this is the "how do you
 * want to get started?" screen: they pick a path and we provision them on the
 * spot. Student is live today; more roles light up over time.
 *
 * Content lives in the `paths` array below — add a role here (and flip
 * `available` / point `action` at a new self-register flow) when it ships.
 */
const paths: {
  key: string;
  emoji: string;
  title: string;
  description: string;
  available: boolean;
}[] = [
  {
    key: "student",
    emoji: "🎓",
    title: "Student",
    description:
      "Build a career-ready profile, get matched to opportunities, and bridge the gap from college to corporate.",
    available: true,
  },
  {
    key: "mentor",
    emoji: "🧭",
    title: "Mentor",
    description:
      "Guide students with feedback, mock interviews, and industry insight. Mentor onboarding is coming soon.",
    available: false,
  },
];

export default function NoAccessPage() {
  return (
    <main className="flex min-h-[calc(100vh-var(--header-h,72px))] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent">
              CareerLaunchpad
            </span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm sm:text-base">
            Your sign-in worked. Choose how you’d like to get started — you can finish
            setting up in a couple of minutes.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {paths.map((path) => (
            <div
              key={path.key}
              className="bg-card relative flex flex-col rounded-2xl border p-5 shadow-sm"
            >
              {!path.available && (
                <span className="bg-muted text-muted-foreground absolute top-4 right-4 rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium">
                  Coming soon
                </span>
              )}
              <div className="text-3xl" aria-hidden>
                {path.emoji}
              </div>
              <h2 className="mt-3 text-lg font-semibold">{path.title}</h2>
              <p className="text-muted-foreground mt-1 flex-1 text-sm">{path.description}</p>

              {path.available ? (
                <form action={registerAsStudent} className="mt-5">
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105"
                  >
                    {path.title} registration
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="outline" className="mt-5 w-full" disabled>
                  {path.title} registration
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-muted-foreground text-xs">
            Were you invited by an administrator? Sign out and sign back in with the exact
            email address that received the invite.
          </p>
          <div className="flex items-center gap-4">
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
            <Link href="/" className="text-muted-foreground text-sm hover:underline">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
