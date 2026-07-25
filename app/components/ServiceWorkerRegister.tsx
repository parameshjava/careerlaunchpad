"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js so the site is installable as a PWA and works offline.
 * Production-only: a service worker in dev caches aggressively and fights HMR,
 * so we skip it during `next dev`. Renders nothing.
 *
 * Dev guard: if a production build was ever run on this origin (e.g. localhost),
 * its service worker stays registered and keeps serving cached, immutable-style
 * `/_next/static/*` chunks — so `next dev` code changes never reach the browser.
 * Rather than just skipping registration in dev, we actively UNREGISTER any
 * leftover worker and drop its caches, so a stale prod SW self-destructs the
 * moment you load the app in dev — no manual DevTools "Unregister" dance.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Tear down any leftover worker + its caches (best-effort, fire-and-forget).
      navigator.serviceWorker.getRegistrations().then(
        (regs) => regs.forEach((r) => r.unregister()),
        () => {},
      );
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)), () => {});
      }
      return;
    }

    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
