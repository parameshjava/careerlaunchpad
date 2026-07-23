# Code Review — Batch Calendar PR (#65) — Fix Status

High-effort review (10 verified findings). Fixing one by one; status updated as each lands.

Legend: ⬜ Pending · 🔧 In progress · ✅ Fixed · ⏭️ Skipped · ✔️ No change needed

| # | Sev | File | Finding | Status |
|---|-----|------|---------|--------|
| F1 | 🔴 blocking | `app/api/admin/batches/[id]/sessions/route.ts` | GET default window is 150d but `parseWindow` caps at 62d → every no-arg request 400s; Schedule tab unusable | ✅ Fixed — default window now [now-14d, now+45d] (59d) |
| F2 | 🔴 correctness | `lib/session-schedule.ts` (update/cancel occurrence) + `lib/ics.ts` | Per-occurrence edit/cancel reuses the series `ics_uid` with no `RECURRENCE-ID` → mentor's whole series collapses/vanishes | ✅ Fixed — occurrence edit/cancel now sends `RECURRENCE-ID` for just that instance |
| F3 | 🔴 correctness | `components/batches/batch-roster.tsx` / `batch-roster-lazy.tsx` | `onChanged()` before `openReceipt()` unmounts the roster → receipt dialog never shows after recording payment | ✅ Fixed — lazy `onChanged` refreshes silently (no unmount), receipt survives |
| F4 | 🟠 correctness | `lib/session-schedule.ts` (series branch) | Recurring series with failed Zoom never sets `meeting_status='failed'` → no "No Zoom" badge | ✅ Fixed — stamp `failed`/`manual` onto generated occurrences after expand |
| F5 | 🟠 correctness | `lib/ics.ts` | `DTSTART` in UTC but `BYDAY` local → early-morning IST recurring classes land on wrong weekday | ✅ Fixed — `DTSTART;TZID=…` local wall-clock + `VTIMEZONE` |
| F6 | 🟠 correctness | `lib/mailer.ts` | Invite email HTML interpolates title/joinUrl unescaped → broken/garbled markup or injection | ✅ Fixed — HTML-escape all interpolated fields |
| F7 | 🟡 correctness | `lib/zoom/index.ts` | Zoom `end_date_time` includes millis (`.000Z`); API may reject the fractional-seconds form | ✅ Fixed — `zoomUtc()` strips millis on `start_time` + `end_date_time` |
| F8 | 🟠 correctness | `components/batches/batch-roster.tsx` | Receipt dialog "Loading" branch has no visible Close (default X disabled) | ✅ Fixed — Close button added to the loading branch |
| F9 | 🟡 cleanup | `app/api/admin/batches/[id]/sessions/[sessionId]/route.ts` | Series cancel loops per occurrence → N CANCEL emails + N Zoom deletes; should be one series-level cancel | ✅ Fixed — new `cancelClassSeries` (one Zoom delete, one email per mentor) |
| F10 | 🟡 cleanup | `lib/session-schedule.ts` | `updateClassSession` hardcodes `Asia/Kolkata` instead of the series timezone | ✅ Fixed — `sessionTimezone()` reads the series tz |

**All 10 findings fixed.** `npx tsc --noEmit` clean · `npm run build` exits 0.

## Notes
- F2, F5, F10 addressed together via the iCalendar rework in `lib/ics.ts` (emit `DTSTART;TZID=…` local wall-clock + a `VTIMEZONE`, plus `RECURRENCE-ID` for single-occurrence exceptions).
- F9 introduces a single `cancelClassSeries` (one Zoom delete, one email per mentor).
- Bonus (surfaced while fixing F2/F9): a single-occurrence cancel of a **series** no longer deletes the shared Zoom meeting (that would have broken the other occurrences) — only one-off cancels delete it.
- Still runtime-unverified (no DB/Zoom/browser here); verify on a live env with migrations applied.
