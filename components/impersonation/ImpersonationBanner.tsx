import { cookies } from "next/headers";
import { exitImpersonation } from "@/app/impersonation/actions";

// Fixed BOTTOM strip (bottom avoids colliding with the top navbar on every
// surface) that stays visible for the whole impersonation session. Server
// component: reads the httpOnly marker cookie and renders nothing when absent.
// Mounted once in the root layout so it covers dashboard / student / employer /
// mentor without editing each shell.
export async function ImpersonationBanner() {
  const jar = await cookies();
  const raw = jar.get("cl-impersonating")?.value;
  if (!raw) return null;
  let label = "another user";
  try {
    label = (JSON.parse(raw).targetLabel as string) || label;
  } catch {}

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]">
      <span>
        Viewing as <b className="break-all">{label}</b>
      </span>
      <form action={exitImpersonation}>
        <button
          type="submit"
          className="rounded bg-amber-950/15 px-2.5 py-1 font-semibold underline underline-offset-2 hover:bg-amber-950/25"
        >
          Exit view-as
        </button>
      </form>
    </div>
  );
}
