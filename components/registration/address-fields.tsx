"use client";

// Step 1's address group: PIN code, Village/Mandal/City, District, State —
// fillable in one tap from the phone's location, or from the PIN, or by searching
// for the place by name (issue #101). Shared by the student wizard and the admin
// "Add a student" page through StepBody, so the two can't diverge.
//
// FOUR WAYS IN, ALL RESOLVED BY GOOGLE MAPS PLATFORM
//   📍 Use my current location → browser Geolocation → /api/geo/reverse
//   PIN code (6 digits)        → /api/geo/pincode/:pin
//   Search by place name       → /api/geo/search
//   🗺 Pin on map              → Google Maps → /api/geo/reverse
// The local PIN catalogue #101 first shipped is retired: we are not
// curating Indian geodata. Every lookup is server-side, so the API key never reaches
// the browser, and a failure degrades to typing rather than to stale data.
//
// PREFILL AND ASK — NEVER COMMIT SILENTLY
//   Not because the geocoder is unsure where the point is — it isn't — but because it
//   cannot know whether that point is the student's HOME. A phone in a hostel or a
//   coaching centre is not, and city_village/district are read as *home* by mentor
//   matching (ref_mentor_preference.same_district) and catchment analytics. Hence the
//   explicit "edit it if your home town is different" line rather than a success toast,
//   and every field staying editable afterwards.
//
// MOBILE IS THE PRIMARY SURFACE (CLAUDE.md): single column under `sm`, ≥44px
// touch targets, 16px inputs (Input's text-base md:text-sm — anything smaller and
// iOS Safari zooms the page on focus), and results announced via aria-live.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LoaderCircle, Map as MapIcon, MapPin, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { basemapConfigured } from "@/components/registration/location-map";
import {
  ADDRESS_LINE_MAX,
  FLAT_BUILDING_MAX,
  MAX_ACCURACY_M,
  districtMatches,
  formatDistance,
  normalizePincodeInput,
  type AddressSource,
  type GeoCandidate,
  type PincodeRecord,
} from "@/lib/geo";

// MapLibre is ~200 KB gzipped and most students never open the map, so it is
// fetched only when asked for. ssr:false because it touches window on mount.
const LocationMap = dynamic(() => import("@/components/registration/location-map"), {
  ssr: false,
  loading: () => (
    <div className="border-input text-muted-foreground grid h-64 place-items-center rounded-lg border text-sm sm:h-80">
      Loading map…
    </div>
  ),
});

export type AddressValue = {
  /** Flat / building / street — the student's own typing. NEVER auto-filled and never
   * cleared by us: no geocoder returns a flat number, and clearing someone's own
   * typing when they nudge the pin would be discarding their work (migration 163). */
  flat_building: string;
  /** The geocoder's formatted_address, verbatim. Auto-filled on every declared
   * location so it always describes the current pin. */
  address: string;
  pincode: string;
  city_village: string;
  district: string;
  state: string;
  /** The pin the student dropped, if they used the map. Kept so reopening the form
   * shows the pin where they left it — see migration 163. */
  latitude: number | null;
  longitude: number | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "resolving" }
  | { kind: "error"; message: string; recoverable?: boolean }
  | { kind: "resolved"; record: PincodeRecord; note?: string }
  | { kind: "choose"; candidates: GeoCandidate[] };

export function AddressFields({
  value,
  onChange,
  onSourceChange,
}: {
  value: AddressValue;
  /** Patch semantics: only the keys that changed, so a caller's other Step 1
   * fields are never clobbered by this component. */
  onChange: (patch: Partial<AddressValue>) => void;
  /** How the address was last captured — persisted as student_profile.address_source
   * (a data-quality hint; see migration 163). */
  onSourceChange?: (source: AddressSource) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [geoAllowed, setGeoAllowed] = useState<boolean | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // The last GPS fix, held in memory and never sent anywhere. It exists so that
  // opening the map after "Use my current location" starts at the student's actual
  // position instead of a map of India. Not persisted — only a pin the student
  // deliberately places is stored (migration 163).
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null);
  const pinId = useId();

  // Is the location button even worth showing? Geolocation needs a secure
  // context (HTTPS; localhost counts, so dev works), and a previously DENIED
  // permission can't be re-prompted from JS — on iOS Safari there is no
  // programmatic reset at all, so re-offering the button would be a dead end.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation || !window.isSecureContext) {
      setGeoAllowed(false);
      return;
    }
    if (!navigator.permissions?.query) {
      setGeoAllowed(true); // no Permissions API (older Safari): offer it and let the prompt decide
      return;
    }
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (!cancelled) setGeoAllowed(s.state !== "denied");
      })
      .catch(() => {
        if (!cancelled) setGeoAllowed(true);
      });
    return () => { cancelled = true; };
  }, []);

  /** Apply a resolved address to the fields. */
  const apply = useCallback(
    (record: PincodeRecord, source: AddressSource, note?: string) => {
      const patch: Partial<AddressValue> = {
        pincode: record.pincode,
        district: record.district,
        state: record.state,
      };

      // A DECLARED LOCATION REPLACES THE WHOLE ADDRESS, NOT PART OF IT.
      //
      // Dropping a pin, tapping "use my current location" or picking a place from
      // search is the student saying "I am HERE". Leaving any part of the previous
      // address behind produces a record that is wrong in a way nobody can see: a
      // student who had a Kadapa address and then pinned Bengaluru ended up with
      // "Kadapa" as their village under a Karnataka PIN, and would have kept
      // "Flat 302, Sai Residency" from a building 400 km away.
      //
      // So the address line is replaced with the geocoder's own prose for the new
      // location, and the student adds their flat number to it — the one part no
      // geocoder anywhere can know.
      //
      // Typing a PIN is different and deliberately does none of this: a PIN says
      // nothing about which building inside it you live in, so it only fills what is
      // blank and leaves the rest alone.
      const declared = source === "map" || source === "gps" || source === "search";

      if (declared) {
        patch.city_village = record.localities[0] ?? "";
        // Replaced outright, including when the geocoder has nothing to offer: a line
        // left over from a previous location is worse than a blank one, because it is
        // wrong in a way nobody can see.
        //
        // flat_building is deliberately NOT touched. Unlike this field it was never
        // auto-filled, so it cannot be stale-from-our-doing — and someone adjusting the
        // pin onto the right rooftop still lives in flat 302.
        patch.address = record.address ?? "";
      } else if (!value.city_village.trim() && record.localities.length > 0) {
        patch.city_village = record.localities[0];
      }

      onChange(patch);
      onSourceChange?.(source);
      setStatus({ kind: "resolved", record, note });
    },
    [onChange, onSourceChange, value.city_village],
  );

  // ── PIN → address ────────────────────────────────────────────────────────
  const lastLookup = useRef<string>("");
  const resolvePin = useCallback(
    async (pin: string, source: AddressSource = "pincode") => {
      if (pin.length !== 6) return;
      if (lastLookup.current === pin) return; // don't re-fetch the same PIN on every keystroke/blur
      lastLookup.current = pin;
      setStatus({ kind: "resolving" });
      try {
        const res = await fetch(`/api/geo/pincode/${pin}`);
        if (res.status === 404) {
          setStatus({
            kind: "error",
            message: "We don't recognise that PIN code — please type your district and state.",
            recoverable: true,
          });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const { result } = (await res.json()) as { result: PincodeRecord };
        apply(result, source);
      } catch {
        setStatus({
          kind: "error",
          message: "Couldn't look that PIN code up. You can still type your address.",
          recoverable: true,
        });
      }
    },
    [apply],
  );

  // Auto-resolve as soon as six digits are in — no "Find" button to discover.
  useEffect(() => {
    const pin = value.pincode;
    if (pin.length === 6) void resolvePin(pin);
    else if (pin.length < 6) lastLookup.current = "";
  }, [value.pincode, resolvePin]);

  // ── map pin → address ────────────────────────────────────────────────────
  // We keep the student's exact coordinates and resolve the PIN/district/state around
  // them, rather than snapping the pin to any area's centre.
  const applyPin = useCallback(
    async (coords: { lat: number; lng: number }) => {
      setMapOpen(false);
      onChange({ latitude: coords.lat, longitude: coords.lng });
      onSourceChange?.("map");
      setStatus({ kind: "resolving" });
      try {
        const qs = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng) });
        const res = await fetch(`/api/geo/reverse?${qs}`);
        const body = await res.json();
        if (!res.ok) {
          // The pin still stands — only the naming failed. Say so, and leave the
          // fields for the student rather than discarding their placement.
          setStatus({
            kind: "error",
            message: body?.message ?? "Pin saved, but we couldn't match a PIN code — please fill in the fields.",
            recoverable: true,
          });
          return;
        }
        const candidates = (body.candidates ?? []) as GeoCandidate[];
        if (candidates.length === 0) {
          setStatus({ kind: "error", message: "Pin saved. Please enter your PIN code.", recoverable: true });
          return;
        }
        lastLookup.current = candidates[0].pincode;
        // A hand-placed pin is a deliberate act, so its top candidate is trusted
        // further than a GPS fix's — the student chose this spot on a map they
        // could see. Still shown, still editable.
        apply(candidates[0], "map", "Filled from your pin — add your flat or house number.");
      } catch {
        setStatus({ kind: "error", message: "Pin saved. Please enter your PIN code.", recoverable: true });
      }
    },
    [apply, onChange, onSourceChange],
  );

  // ── GPS → candidates ─────────────────────────────────────────────────────
  function useMyLocation() {
    if (!navigator.geolocation) return;
    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLastFix({ lat: latitude, lng: longitude });
        setStatus({ kind: "resolving" });
        try {
          const qs = new URLSearchParams({
            lat: String(latitude),
            lng: String(longitude),
            accuracy: Number.isFinite(accuracy) ? String(Math.round(accuracy)) : "",
          });
          const res = await fetch(`/api/geo/reverse?${qs}`);
          const body = await res.json();
          if (!res.ok) {
            setStatus({
              kind: "error",
              message: body?.message ?? "Couldn't work out your address. Please enter your PIN code.",
              recoverable: true,
            });
            return;
          }
          const candidates = (body.candidates ?? []) as GeoCandidate[];
          if (candidates.length === 0) {
            setStatus({ kind: "error", message: "No PIN code found near you. Please enter it yourself.", recoverable: true });
            return;
          }
          // One clearly-good answer: fill it, but SAY it may not be their home.
          // Anything less certain: make the student pick.
          if (candidates.length === 1 || candidates[0].confidence === "high") {
            apply(
              candidates[0],
              "gps",
              "Filled from where you are now — add your flat number, and edit it if your home town is different.",
            );
            if (candidates.length > 1) setStatus({ kind: "choose", candidates });
          } else {
            setStatus({ kind: "choose", candidates });
          }
        } catch {
          setStatus({ kind: "error", message: "Couldn't work out your address. Please enter your PIN code.", recoverable: true });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // Terminal: no way to re-prompt. Hide the button and point at the PIN box.
          setGeoAllowed(false);
          setStatus({
            kind: "error",
            message: "Location permission was declined. Enter your PIN code below instead.",
            recoverable: true,
          });
          return;
        }
        setStatus({
          kind: "error",
          message: "Couldn't get your location. Enter your PIN code below instead.",
          recoverable: true,
        });
      },
      // enableHighAccuracy asks for GPS rather than a wifi/IP guess, which is what
      // keeps the fix under MAX_ACCURACY_M. It can take 20s+ indoors and drains
      // battery, so the timeout is short and the catch above degrades to the PIN
      // path rather than leaving a spinner. maximumAge accepts a fix from the last
      // minute — re-locating for a form field the student may revisit is waste.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  const busy = status.kind === "locating" || status.kind === "resolving";
  // A district the student typed that disagrees with the PIN. Shown, never
  // enforced: Andhra Pradesh reorganised 13 districts into 26 in 2022, so the
  // postal directory and a student's lived answer legitimately differ, and
  // blocking on it would lock real students out of registration.
  const mismatch =
    status.kind === "resolved" &&
    value.district.trim() !== "" &&
    !districtMatches(value.district, status.record.district);

  return (
    <div className="grid gap-3 sm:col-span-2">
      {/* ── the three entry points ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={pinId}>PIN Code</Label>
          <Input
            id={pinId}
            value={value.pincode}
            onChange={(e) => {
              onChange({ pincode: normalizePincodeInput(e.target.value) });
              if (status.kind !== "idle") setStatus({ kind: "idle" });
            }}
            // numeric keypad on phones without the spinner arrows `type=number` adds
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="522201"
            className="sm:w-32"
            aria-describedby={`${pinId}-status`}
          />
        </div>

        {/* Phones get ONE full-width affordance per row: side by side, "Use my
            current location" (~210px) plus "Search my place" (~150px) exceeds a
            320px viewport and the second one clips. `grid` under `sm`, inline flex
            from `sm` up — same element, no JS media query. */}
        <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {geoAllowed !== false && (
            <Button
              type="button"
              variant="outline"
              onClick={useMyLocation}
              disabled={busy}
              // ≥44px: a thumb target on a phone.
              className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <MapPin className="size-4" aria-hidden />
              )}
              {status.kind === "locating" ? "Locating…" : "Use my current location"}
            </Button>
          )}
          <PlaceSearch
            onPick={(record) => {
              lastLookup.current = record.pincode;
              apply(record, "search");
            }}
          />
          {/* Hidden entirely when no basemap is configured — an "Adjust on map"
              button that opens a grey box is worse than no button. */}
          {basemapConfigured() && !mapOpen && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMapOpen(true)}
              className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            >
              <MapIcon className="size-4" aria-hidden />
              {value.latitude != null ? "Adjust pin on map" : "Pin on map"}
            </Button>
          )}
        </div>
      </div>

      {mapOpen && (
        <LocationMap
          // Open where we already believe the student is: their own pin first, then
          // the resolved PIN's centroid, so they are never dropped on a map of India
          // and asked to find their street.
          lat={value.latitude ?? lastFix?.lat ?? null}
          lng={value.longitude ?? lastFix?.lng ?? null}
          onPick={applyPin}
          onCancel={() => setMapOpen(false)}
        />
      )}

      {/* ── what happened ──────────────────────────────────────────────── */}
      {/* aria-live so a screen reader hears the result of a tap that changed
          fields further down the form. */}
      <div id={`${pinId}-status`} aria-live="polite" className="grid gap-2 text-sm">
        {status.kind === "resolving" && <p className="text-muted-foreground">Looking that up…</p>}
        {status.kind === "error" && (
          <p className={cn(status.recoverable ? "text-muted-foreground" : "text-destructive")}>
            {status.message}
          </p>
        )}
        {status.kind === "resolved" && (
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">
              {status.record.district}, {status.record.state}
            </span>
            {status.note ? ` — ${status.note}` : null}
          </p>
        )}
        {status.kind === "choose" && (
          <div className="grid gap-1.5">
            <p className="text-muted-foreground">
              We couldn&apos;t pin down exactly where you are. Which of these is right?
            </p>
            <ul className="grid gap-1.5">
              {status.candidates.map((c) => (
                <li key={c.pincode}>
                  <button
                    type="button"
                    onClick={() => {
                      lastLookup.current = c.pincode;
                      apply(c, "gps", "Edit any field if your home town is different.");
                    }}
                    className="border-input hover:bg-accent flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{c.localities[0] ?? c.pincode}</span>
                      <span className="text-muted-foreground">
                        {" "}— {c.district}, {c.state} · {c.pincode}
                      </span>
                    </span>
                    {/* Only when we actually have a distance. A provider answer
                        resolves the point itself, so it reports 0 — rendering that
                        would read as "0 m away", which is worse than silence. */}
                    {c.distanceKm > 0 && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatDistance(c.distanceKm)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStatus({ kind: "idle" })}
              className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
            >
              None of these — I&apos;ll type it
            </button>
          </div>
        )}
        {mismatch && status.kind === "resolved" && (
          <p className="text-muted-foreground">
            Heads up: PIN {status.record.pincode} is in{" "}
            <span className="text-foreground font-medium">{status.record.district}</span>, but you
            entered <span className="text-foreground font-medium">{value.district}</span>. Both can
            be right if your district was recently reorganised — keep whichever is correct.
          </p>
        )}
      </div>

      {/* ── the fields themselves, always editable ─────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* TWO fields, split along known-vs-unknowable rather than street-vs-area.
            The flat comes first because it is the only box the student must fill; the
            address below it arrives complete and should need no editing. */}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${pinId}-flat`}>Flat / Building / Street</Label>
          <Input
            id={`${pinId}-flat`}
            value={value.flat_building}
            onChange={(e) => onChange({ flat_building: e.target.value })}
            placeholder="e.g. Flat 302, Sai Residency"
            maxLength={FLAT_BUILDING_MAX}
            autoComplete="address-line1"
          />
          <p className="text-muted-foreground text-xs">
            Your flat, building or street — the one part we can never fill in for you.
          </p>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${pinId}-address`}>Address</Label>
          <textarea
            id={`${pinId}-address`}
            value={value.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="Filled in from your PIN code, location or map pin"
            maxLength={ADDRESS_LINE_MAX}
            rows={2}
            autoComplete="street-address"
            // Matches Input's shape and its 16px-on-mobile rule (anything smaller and
            // iOS Safari zooms the page on focus).
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full resize-y rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none transition-colors focus-visible:ring-3 md:text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Village / Mandal / City</Label>
          {/* A native datalist rather than a custom dropdown: the localities for one
              PIN are a short hint list, the student may legitimately type a hamlet
              that isn't in it, and a <datalist> stays typeable while offering the
              suggestions. */}
          <Input
            value={value.city_village}
            onChange={(e) => onChange({ city_village: e.target.value })}
            placeholder="e.g. Tenali"
            list={status.kind === "resolved" ? `${pinId}-localities` : undefined}
            autoComplete="address-level3"
          />
          {status.kind === "resolved" && (
            <datalist id={`${pinId}-localities`}>
              {status.record.localities.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label>District</Label>
          <Input
            value={value.district}
            onChange={(e) => onChange({ district: e.target.value })}
            placeholder="e.g. Guntur"
            autoComplete="address-level2"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>State</Label>
          <Input
            value={value.state}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="e.g. Andhra Pradesh"
            autoComplete="address-level1"
          />
        </div>
      </div>

      {geoAllowed === false && (
        <p className="text-muted-foreground text-xs">
          Enter your PIN code and we&apos;ll fill in the district and state for you.
        </p>
      )}
    </div>
  );
}

// ── search by place name ───────────────────────────────────────────────────
// Server-searched, 250ms debounce. Handles BOTH response shapes from
// /api/geo/search: provider predictions (a place_id that needs a second lookup)
// and catalogue rows (the address is already there). The two are distinguished by
// `needsDetails` rather than by sniffing the payload.
type Suggestion = {
  placeId: string | null;
  label: string;
  secondary: string;
  record?: PincodeRecord;
};

function PlaceSearch({ onPick }: { onPick: (record: PincodeRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One token per search, so the provider bills the whole typing session once
  // rather than per keystroke. Reset after a pick, which ends the session.
  const session = useRef<string>("");
  if (!session.current && typeof crypto !== "undefined" && crypto.randomUUID) {
    session.current = crypto.randomUUID();
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ q: query, session: session.current });
        const res = await fetch(`/api/geo/search?${qs}`);
        if (res.ok) setResults((await res.json()).results ?? []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function choose(s: Suggestion) {
    // Catalogue rows already carry the address; predictions need the second call.
    if (s.record) {
      onPick(s.record);
      close();
      return;
    }
    if (!s.placeId) return;
    setPicking(true);
    try {
      const res = await fetch(`/api/geo/search?place_id=${encodeURIComponent(s.placeId)}`);
      if (res.ok) {
        const { result } = (await res.json()) as { result: PincodeRecord };
        onPick(result);
        close();
      }
    } finally {
      setPicking(false);
    }
  }

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    // A new session token for the next search — the old one is spent.
    if (typeof crypto !== "undefined" && crypto.randomUUID) session.current = crypto.randomUUID();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full sm:min-h-9 sm:w-auto"
      >
        <Search className="size-4" aria-hidden />
        Search my place
      </Button>
    );
  }

  return (
    <div ref={boxRef} className="relative w-full sm:w-72">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Village, area or district…"
          aria-label="Search for your village, area or district"
          className="pr-8 pl-8"
        />
        <button
          type="button"
          onClick={close}
          aria-label="Close search"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
        >
          {picking ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}
        </button>
      </div>
      {(results.length > 0 || (query.trim().length >= 2 && !searching)) && (
        <ul className="border-input bg-popover absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((r, i) => (
            <li key={r.placeId ?? `${r.label}-${i}`}>
              <button
                type="button"
                disabled={picking}
                onClick={() => void choose(r)}
                className="hover:bg-accent flex min-h-11 w-full flex-col items-start px-3 py-2 text-left sm:min-h-9"
              >
                <span>{r.label}</span>
                {r.secondary && <span className="text-muted-foreground text-xs">{r.secondary}</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="text-muted-foreground px-3 py-6 text-center">
              No match — type your PIN code or fill the fields in by hand.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Accuracy ceiling, re-exported so callers can explain the limit in copy
 * without importing lib/geo directly. */
export { MAX_ACCURACY_M };
