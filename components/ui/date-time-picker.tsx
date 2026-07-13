"use client";

// Date + time picker (shadcn Popover + Calendar + a time input), styled to match
// the app. value/onChange use the local "YYYY-MM-DDTHH:mm" string — a drop-in for
// <input type="datetime-local">.
import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const compose = (d: Date, time: string) => {
  const [h, m] = (time || "09:00").split(":");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${h ?? "09"}:${m ?? "00"}`;
};

export function DateTimePicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string; // "YYYY-MM-DDTHH:mm" (local) or ""
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;
  const time = value ? value.slice(11, 16) : "";

  const label = date
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Pick date & time";

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
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && onChange(compose(d, time))}
          className="p-3"
        />
        <div className="grid gap-1.5 border-t p-3">
          <Label htmlFor={id ? `${id}-time` : undefined} className="text-xs">
            Time
          </Label>
          <Input
            id={id ? `${id}-time` : undefined}
            type="time"
            value={time}
            onChange={(e) => onChange(compose(date ?? new Date(), e.target.value))}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
