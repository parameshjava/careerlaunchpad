"use client";

// Pin-drop map for Step 1's address. The student pans to their building and drops a
// pin; we reverse-geocode it and keep the coordinates so a courier can find the door.
//
// WHY GOOGLE MAPS AND NOT THE MAPLIBRE/OSM MAP THIS REPLACED
//   Not preference — licence. Google's Maps Platform Service Specific Terms state
//   that Geocoding API content "must not be used in conjunction with a non-Google
//   map". Once address resolution moved to Google (#101 follow-up), the
//   self-hosted Protomaps/OSM basemap became a ToS violation rather than a clever
//   cost saving, so it is gone along with its 2.6 GB tile archive.
//
//   Read the other way: choosing an OSM basemap would force a non-Google geocoder.
//   The two decisions are one decision, and it is worth knowing that before someone
//   "optimises" the tiles back.
//
// LOADED LAZILY, AND THAT IS NOT AN OPTIMISATION DETAIL
//   The Maps JS API is a few hundred KB. /student/register is already a ~390 KB
//   first load on a form whose entire purpose (#101) was to be fast on a cheap
//   phone, and most students finish their address from the PIN box without ever
//   opening a map. The parent imports this via next/dynamic({ssr:false}) and the
//   script tag below is only injected when the map is actually opened.
//
// DEGRADES TO NOTHING WHEN UNCONFIGURED
//   Without NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY the parent hides the button
//   entirely rather than opening a grey box.
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isInIndia } from "@/lib/geo";

/**
 * Browser key for the Maps JS API. This one IS public — a JS map cannot work
 * otherwise — which is why it must be a DIFFERENT key from GOOGLE_MAPS_SERVER_KEY
 * and restricted by HTTP referrer in the Cloud console, and limited to the Maps
 * JavaScript API. The geocoding key stays server-side and is never exposed.
 */
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
export const basemapConfigured = () => BROWSER_KEY !== "";

/** Roughly the centre of India, for a student with no fix and no PIN yet. */
const INDIA_CENTRE = { lat: 22.0, lng: 79.0, zoom: 5 };
/** Close enough to see individual buildings once we know where they are. */
const PIN_ZOOM = 18;

// One shared loader promise: React can mount this twice (Strict Mode) and the student
// may open the map more than once, but the Maps script must be injected exactly once —
// a second <script> throws "You have included the Google Maps JavaScript API multiple
// times".
let loader: Promise<void> | null = null;

/** Set by Google's gm_authFailure hook — a rejected key, referrer, or billing state.
 * Kept module-level so the message survives the promise that already resolved. */
let authFailed = false;
export const mapAuthFailed = () => authFailed;

/** The global name Google will call once the API is genuinely usable. */
const READY_CALLBACK = "__clpMapsReady";

/**
 * Load the Maps JS API, resolving only when it is actually usable.
 *
 * THE BUG THIS FIXES — resolving on `script.onload` is WRONG with `loading=async`.
 * The bootstrap script returns before `google.maps` is populated, so
 * `new google.maps.Map(...)` threw on the FIRST open and the component fell into its
 * "map couldn't load" state; by the second click the library had finished loading and
 * it worked. That intermittent, only-the-first-time behaviour is the signature of this
 * mistake.
 *
 * The fix is Google's documented bootstrap: pass `callback=`, and let the API tell us
 * when it is ready. `onload` is kept only to notice a script that 404s.
 */
function loadMapsApi(): Promise<void> {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    const w = window as unknown as Record<string, unknown> & {
      google?: { maps?: { Map?: unknown } };
    };

    // Test for the CONSTRUCTOR, not just the namespace: with loading=async,
    // `google.maps` can exist as a partial object while `Map` is still undefined.
    if (w.google?.maps?.Map) return resolve();

    // Google calls this on an invalid key, a disallowed referrer, or a billing
    // problem. Without it those failures look identical to a network error, which
    // is a miserable thing to debug.
    w.gm_authFailure = () => {
      authFailed = true;
      loader = null;
      reject(new Error("maps auth failure"));
    };
    w[READY_CALLBACK] = () => resolve();

    const s = document.createElement("script");
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(BROWSER_KEY)}` +
      // region/language bias so Indian place names and boundaries render the way
      // students expect rather than with US defaults.
      `&region=IN&language=en&loading=async&callback=${READY_CALLBACK}`;
    s.async = true;
    s.onerror = () => reject(new Error("maps script failed"));
    document.head.appendChild(s);

    // A rejected key can leave the callback simply never firing, which would strand
    // the student on a spinner forever. Fail loudly instead.
    setTimeout(() => reject(new Error("maps load timed out")), 10_000);
  }).catch((e) => {
    // Let a later attempt retry rather than caching the failure forever.
    loader = null;
    throw e;
  });
  return loader;
}

type LatLng = { lat: number; lng: number };

export default function LocationMap({
  lat,
  lng,
  onPick,
  onCancel,
}: {
  lat: number | null;
  lng: number | null;
  /** Confirmed pin. The caller reverse-geocodes it and stores the coordinates. */
  onPick: (coords: LatLng) => void;
  onCancel: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  // A ref, so the geolocation callback and the click handler share ONE marker instead
  // of each creating their own.
  const markerRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [locating, setLocating] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(
    lat != null && lng != null && isInIndia(lat, lng) ? { lat, lng } : null,
  );
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (!basemapConfigured()) {
      setState("failed");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        await loadMapsApi();
        if (cancelled || !holder.current) return;
        // Typed loosely on purpose: @types/google.maps is not a dependency, and
        // adding it to describe a handful of calls would be more surface than it saves.
        const g = (window as unknown as { google: any }).google; // eslint-disable-line @typescript-eslint/no-explicit-any
        // Belt to the callback's braces: if this is ever reached with a partially
        // initialised namespace, fail into the recoverable state rather than throwing
        // an opaque TypeError.
        if (!g?.maps?.Map) throw new Error("maps not ready");

        const known = pin;
        const map = new g.maps.Map(holder.current, {
          center: known ? { lat: known.lat, lng: known.lng } : { lat: INDIA_CENTRE.lat, lng: INDIA_CENTRE.lng },
          zoom: known ? PIN_ZOOM : INDIA_CENTRE.zoom,
          // TWO VIEWS, NOT FOUR, with the street map as the DEFAULT (product decision).
          // It reads faster on a small screen and on a slow connection, and the street
          // name is usually what someone recognises. Satellite is one tap away for the
          // case the street map cannot serve — a layout with no named roads, where you
          // identify your own rooftop instead.
          //
          // `terrain` and `satellite`-without-labels are omitted deliberately: neither
          // helps you find a house, and a four-way control on a 256px-tall phone map is
          // mostly a way to mis-tap. Note `hybrid` (imagery WITH labels) is the satellite
          // option here, not bare `satellite` — unlabelled imagery loses the street
          // names that make the pin placeable.
          mapTypeId: "roadmap",
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: g.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            // Top-left: the zoom control sits top-right, and the Google attribution is
            // bottom-left, so this is the corner with nothing to collide with.
            position: g.maps.ControlPosition.TOP_LEFT,
            mapTypeIds: ["roadmap", "hybrid"],
          },
          // Worth having on a phone: the inline map is 256px tall, and placing a pin on
          // the right building at that size is fiddly. Google's own exit button makes it
          // hard to get stuck in.
          fullscreenControl: true,
          // Street View and tilt/rotate stay off — neither helps place a pin, and both
          // are ways to lose the map with a stray thumb.
          streetViewControl: false,
          rotateControl: false,
          gestureHandling: "greedy",
        });

        // THE MARKER IS CREATED ON DEMAND, NOT UP FRONT.
        // An earlier version always placed one at `pin ?? INDIA_CENTRE`, so a student
        // who opened the map cold saw a pin sitting in Madhya Pradesh — a spot they had
        // never chosen, one tap away from being saved as their address. No position
        // means no marker.
        const place = (p: LatLng, recentre: boolean) => {
          if (cancelled) return;
          if (!markerRef.current) {
            markerRef.current = new g.maps.Marker({ position: p, map, draggable: true });
            markerRef.current.addListener("dragend", () => {
              const q = markerRef.current?.getPosition();
              if (q) setPin({ lat: q.lat(), lng: q.lng() });
            });
          } else {
            markerRef.current.setPosition(p);
          }
          if (recentre) {
            map.setCenter(p);
            map.setZoom(PIN_ZOOM);
          }
          setPin(p);
        };

        if (known) place(known, false);

        // Tapping the map places or moves the pin — dragging a small marker with a
        // thumb is fiddly, and tap-to-place is what every delivery app trains people on.
        map.addListener("click", (e: { latLng?: { lat: () => number; lng: () => number } }) => {
          if (!e.latLng) return;
          place({ lat: e.latLng.lat(), lng: e.latLng.lng() }, false);
        });

        if (!cancelled) setState("ready");

        // OPENED WITH NO KNOWN POSITION → ASK THE DEVICE.
        // Showing the whole country and expecting someone to pan from Nagpur to their
        // street is not a usable way to mark a building. The permission is the same one
        // "Use my current location" asks for, so this is usually already granted and
        // instant. Low accuracy is fine — we only need somewhere to START; the student
        // then adjusts, and the accuracy gate on /api/geo/reverse does not apply to a
        // deliberately placed pin.
        if (!known && navigator.geolocation) {
          setLocating(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocating(false);
              const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              // Refuse a fix from outside India rather than flying the map to it.
              if (isInIndia(p.lat, p.lng)) place(p, true);
            },
            // Denied or unavailable: stay on the country view and let them tap. Not an
            // error state — the map still works, it just starts further out.
            () => setLocating(false),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
          );
        }
      } catch {
        if (!cancelled) setState("failed");
      }
    })();

    return () => { cancelled = true; };
    // Mount-only: re-running would rebuild the map under the student every time they
    // nudge the pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "failed") {
    return (
      <div className="border-input grid gap-2 rounded-lg border p-3 text-sm">
        <p className="text-muted-foreground">
          {mapAuthFailed()
            ? "The map key was rejected — this needs fixing in the Google Cloud console, not by you. Your PIN code and address fields still work as normal."
            : "The map couldn't load. Your PIN code and address fields still work as normal."}
        </p>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 justify-self-start sm:min-h-9">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="border-input grid gap-2 overflow-hidden rounded-lg border">
      <div className="relative">
        {/* Tall enough to give context on a phone without pushing the rest of the
            step off-screen; taller from sm up where there is room. */}
        <div ref={holder} className="h-64 w-full sm:h-80" />
        {state === "loading" && (
          <div className="bg-muted/60 absolute inset-0 grid place-items-center">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            <span className="sr-only">Loading map…</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {locating
            ? "Finding your location…"
            : pin
              ? "Drag the pin — or tap the map — to mark your building. Switch to Satellite to spot your rooftop."
              : "Tap the map to mark your building, then zoom in to place it exactly."}
        </p>
        <div className="grid gap-2 sm:flex sm:items-center">
          <Button
            type="button"
            onClick={() => pin && onPick(pin)}
            disabled={!pin}
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
          >
            Use this location
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
