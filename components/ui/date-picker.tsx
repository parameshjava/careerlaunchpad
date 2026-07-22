"use client";

// Date-only picker — the shared shadcn Calendar in a Popover, matching the app's
// date pattern (DateTimePicker / the registration DOB picker). value/onChange use
// a "YYYY-MM-DD" string, a drop-in for <input type="date"> but consistent with
// every other admin/student date field. Optional dates get a Clear action.
import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = false,
}: {
  id?: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
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
          {date ? date.toLocaleDateString(undefined, { dateStyle: "medium" }) : placeholder}
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
