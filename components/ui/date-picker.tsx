"use client";

// Date-only picker — the shared shadcn Calendar in a Popover, matching the app's
// date pattern (DateTimePicker). value/onChange use a "YYYY-MM-DD" string, a
// drop-in for <input type="date"> but consistent with every other admin/student
// date field. Optional dates get a Clear action.
//
// Exposes the react-day-picker knobs a date-of-birth field needs
// (captionLayout, startMonth/endMonth, disabled matcher) so there's no reason to
// fork a bespoke DOB picker — pass them straight through.
import { useState } from "react";
import type { Matcher } from "react-day-picker";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatISODate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = false,
  disabled,
  captionLayout,
  startMonth,
  endMonth,
  defaultMonth,
}: {
  id?: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
  /** react-day-picker matcher for un-selectable days (e.g. `{ after: maxDob }`). */
  disabled?: Matcher | Matcher[];
  /** "label" (default) or "dropdown" month/year selectors (handy for DOB). */
  captionLayout?: React.ComponentProps<typeof Calendar>["captionLayout"];
  startMonth?: Date;
  endMonth?: Date;
  defaultMonth?: Date;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn("w-full justify-start gap-2 font-normal", !date && "text-muted-foreground")}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          {value ? formatISODate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(fmt(d));
              setOpen(false);
            }
          }}
          disabled={disabled}
          captionLayout={captionLayout}
          startMonth={startMonth}
          endMonth={endMonth}
          defaultMonth={defaultMonth ?? date}
          className="p-3"
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="size-3.5" /> Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
