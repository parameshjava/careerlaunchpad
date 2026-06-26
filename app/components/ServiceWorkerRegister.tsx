"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js so the site is installable as a PWA and works offline.
 * Production-only: a service worker in dev caches aggressively and fights HMR,
 * so we skip it during `next dev`. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
