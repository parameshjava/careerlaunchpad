"use client";

/**
 * International phone input (country flag + dial-code selector) built on
 * react-international-phone's `usePhoneInput` hook, with a custom, SEARCHABLE
 * country dropdown (the library's default dropdown has no search box). Styled to
 * match the shadcn Input. Stores the full E.164 number (e.g. "+919000000000").
 *
 * The dial code lives in the (read-only) country button, NOT the editable input
 * (`disableDialCodeAndPrefix`), so it's always visible but can never be deleted —
 * it changes only by picking another country from the dropdown.
 *
 * Default country: detected from the browser's TIME ZONE (e.g. "Asia/Kolkata" →
 * India), which reflects physical location — NOT navigator.language, which is the
 * UI language ("en-US" is a common default worldwide) and misreports location.
 * Falls back to the locale region, then India. Mounts client-side (behind a
 * loading gate in the forms that use it), so reading browser APIs on mount is
 * safe and won't cause a hydration mismatch.
 */
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  usePhoneInput,
  defaultCountries,
  parseCountry,
  FlagImage,
} from "react-international-phone";
import { getCountryForTimezone } from "countries-and-timezones";
import "react-international-phone/style.css";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Parse the full country list once (module scope — it never changes).
const COUNTRIES = defaultCountries.map(parseCountry);

// Physical location via IANA time zone → iso2; else the locale region; else India.
function browserDefaultCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const country = tz ? getCountryForTimezone(tz) : null;
    if (country?.id) return country.id.toLowerCase();
  } catch {
    // Intl / tz unavailable — fall through to locale, then India.
  }
  if (typeof navigator !== "undefined") {
    const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const loc of locales) {
      const region = loc?.split("-")[1];
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toLowerCase();
    }
  }
  return "in";
}

export function PhoneField({
  value,
  onChange,
  placeholder = "90000 00000",
  id,
}: {
  value: string;
  onChange: (phone: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const detectedCountry = useMemo(browserDefaultCountry, []);
  // New (empty) entries follow the browser's detected location. When EDITING an
  // existing number the value decides the country — the library guesses it from
  // the dial code, so a saved "+91…" stays India even if you're now abroad.
  // Legacy numbers stored WITHOUT a country code can't be guessed, so we seed
  // India (not the current location) rather than silently switching their code.
  const defaultCountry = value.trim() ? "in" : detectedCountry;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { inputValue, country, setCountry, handlePhoneValueChange } = usePhoneInput({
    defaultCountry,
    value,
    // Keep the dial code out of the editable input (shown in the button instead),
    // so it's readable but not deletable. onChange still returns full E.164.
    disableDialCodeAndPrefix: true,
    inputRef,
    // EMPTY MEANS EMPTY. data.phone is always full E.164, so an untouched field
    // reports the bare dial code ("+91") rather than "". Every caller then stores
    // a country code as if it were a number, and the shared phone regex
    // (`{5,19}` after the first char) rejects it — so leaving an OPTIONAL Mobile
    // Number blank made step 1 unsaveable with "phone: invalid format" on a field
    // the user never touched. It bit the staff form and the mentor form
    // identically; the student form hid it only because phone is mandatory there,
    // where the same value made a blank field look filled to the required-field
    // check and produced "enter a valid number" instead of "this is required".
    // Normalising here fixes all three at the source.
    onChange: (data) => onChange(data.phone === `+${data.country.dialCode}` ? "" : data.phone),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const digits = q.replace(/[^\d]/g, "");
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || (digits && c.dialCode.includes(digits)),
    );
  }, [query]);

  return (
    <div className="flex items-stretch gap-2">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Country code: ${country.name} +${country.dialCode}`}
            className="border-input bg-background hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
          >
            <FlagImage iso2={country.iso2} size="20px" />
            <span className="text-muted-foreground text-xs tabular-nums">+{country.dialCode}</span>
            <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,90vw)] p-0">
          <div className="p-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code…"
                className="h-8 pl-8"
                aria-label="Search country"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto pb-2" role="listbox">
            {filtered.length === 0 ? (
              <li className="text-muted-foreground px-3 py-6 text-center text-sm">No country found.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.iso2}>
                  <button
                    type="button"
                    onClick={() => {
                      setCountry(c.iso2);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "hover:bg-accent flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm",
                      c.iso2 === country.iso2 && "bg-accent/60 font-medium",
                    )}
                  >
                    <FlagImage iso2={c.iso2} size="20px" className="shrink-0" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">+{c.dialCode}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>

      <Input
        ref={inputRef}
        id={id}
        type="tel"
        inputMode="tel"
        value={inputValue}
        onChange={handlePhoneValueChange}
        placeholder={placeholder}
        className="flex-1"
      />
    </div>
  );
}
