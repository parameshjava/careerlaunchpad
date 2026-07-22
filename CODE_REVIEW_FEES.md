# Code Review — Fee Management (PR #57, `feat/fee-management`)

High-effort review of the fee-management branch vs `origin/main`. **10 verified findings**, most-severe first. Verdicts: **CONFIRMED** (reproduced) / **PLAUSIBLE** (likely, not fully reproduced).

**All 10 fixed** and validated: `npx tsc --noEmit` + `npm run build` pass; the four new SQL migrations (129–132) were applied to a throwaway Postgres 16 and smoke-tested (re-enrol, atomic batch-children swap, atomic receipt/balance, revoked grant, waived backfill).

| # | Severity | Verdict | Status | Location | Issue |
|---|----------|---------|--------|----------|-------|
| 1 | High | CONFIRMED | ✅ Fixed | `lib/enrollment-query.ts:425` | Rejected self-enrol locks student out of batch |
| 2 | High | CONFIRMED | ✅ Fixed | `app/api/admin/batches/[id]/route.ts:94` | Batch update deletes fee/college rows, no rollback |
| 3 | High | CONFIRMED | ✅ Fixed | `supabase/migrations/125_fees.sql:236` | `next_fee_receipt_no` callable by any student |
| 4 | High | CONFIRMED | ✅ Fixed | `lib/enrollment-write.ts:168` | Bulk enrol drops installments on insert failure |
| 5 | High | PLAUSIBLE | ✅ Fixed | `lib/enrollment-write.ts:210` | Non-atomic payment allows double-pay race |
| 6 | Med | CONFIRMED | ✅ Fixed | `components/students/my-fees.tsx:61` | Outstanding total includes pending enrolments |
| 7 | Med | CONFIRMED | ✅ Fixed | `lib/batch-query.ts:64` | Batch student count includes cancelled/pending |
| 8 | Med | CONFIRMED | ✅ Fixed | `lib/enrollment-write.ts:245` | Fully-waived enrolment never marked completed |
| 9 | Med | CONFIRMED | ✅ Fixed | `lib/enrollment-write.ts:83` | Installment/paid_on dates off-by-one in IST (UTC) |
| 10 | Low | PLAUSIBLE | ✅ Fixed | `lib/enrollment-query.ts:214` | Receipt prior-paid drops same-timestamp payments |

**New migrations:** `129_self_enroll_reenrol.sql`, `130_replace_batch_children.sql`, `131_record_payment.sql`, `132_backfill_waived_completed.sql`.

---

## 1. Rejected self-enrolment permanently blocks re-enrolment — CONFIRMED
**`lib/enrollment-query.ts:425`** (also `127_student_self_enroll.sql:56`, `125_fees.sql:208`)

A rejected (cancelled) self-enrolment permanently blocked the student from ever re-enrolling in that batch, through any path. `fetchOpenBatchesForStudent` marked the batch "already enrolled" regardless of status, `enroll_self`'s duplicate guard was status-blind, and the `unique(student_id, batch_id)` constraint rejected a fresh row — so the admin couldn't re-add them either.

**✅ Fix applied** (migration `129_self_enroll_reenrol.sql`):
- Replaced the `unique(student_id, batch_id)` constraint with a **partial unique index** `student_enrollment_live_uniq … where status <> 'cancelled'` — a student holds at most one *live* enrolment per batch, and cancelled history no longer blocks a fresh one.
- `enroll_self` duplicate guard now ignores cancelled rows (`and e.status <> 'cancelled'`).
- `fetchOpenBatchesForStudent` builds `enrolledSet` from non-cancelled rows only (`.neq("status", "cancelled")`).
- The admin enrol screen (`enrol/page.tsx`) derives `enrolledIds` from non-cancelled roster rows.
- *Verified:* re-enrol after cancel succeeds; a second *live* enrolment is still blocked by the index.

## 2. Batch full-update deletes children before reinsert, no rollback — CONFIRMED
**`app/api/admin/batches/[id]/route.ts:94`**

Batch update deleted `fee_component`/`batch_college` then reinserted in separate non-transactional steps; a failed reinsert permanently wiped the batch's fee lines and colleges (₹0 fee, self-enrol rejects everyone).

**✅ Fix applied** (migration `130_replace_batch_children.sql`):
- New SECURITY DEFINER RPC `replace_batch_children(batch_id, college_ids[], fee_lines jsonb)` does the delete-then-reinsert inside **one transaction** — any failure rolls the deletes back. The `finance.manage` gate is preserved.
- PATCH route calls the RPC instead of the separate `deleteBatchChildren` + `writeBatchChildren`; the now-dead `deleteBatchChildren` helper was removed.
- *Verified:* fee lines swap atomically to the new total.

## 3. `next_fee_receipt_no` granted to `authenticated` — CONFIRMED
**`supabase/migrations/125_fees.sql:236`**

The RPC was granted EXECUTE to every `authenticated` user, so any signed-in student could advance the shared `fee_receipt_seq` from the browser and gouge gaps in the official receipt series.

**✅ Fix applied** (migration `131_record_payment.sql`):
- **Revoked** EXECUTE on `next_fee_receipt_no(text)` from `authenticated` and `public`. It is now only reachable from the SECURITY DEFINER `record_payment` RPC (which runs as owner and ignores the grant).
- *Verified:* `has_function_privilege('authenticated', …)` returns `false`.

## 4. Bulk enrol silently drops installment schedule — CONFIRMED
**`lib/enrollment-write.ts:168`**

`enrolStudentsBulk` inserted installment rows without checking the error, so a failed insert left the enrolment with no schedule while still reporting success (single-enrol already rolled back on failure).

**✅ Fix applied** (`lib/enrollment-write.ts`):
- The bulk installment insert is now error-checked; on failure it deletes the just-created enrolment and reports the student under `skipped` with the reason — matching `enrolStudent`'s behaviour.

## 5. `recordPayment` non-atomic balance check → double-pay race — PLAUSIBLE
**`lib/enrollment-write.ts:210`**

`recordPayment` read the balance and inserted the payment in separate steps, so two concurrent/double-submitted payments could both pass the `amount <= balance` guard and both post.

**✅ Fix applied** (migration `131_record_payment.sql` + `lib/enrollment-write.ts`):
- New SECURITY DEFINER RPC `record_payment(...)` locks the enrolment row (`SELECT … FOR UPDATE`) before reading the balance, so concurrent payments serialise and the check is race-free. It also re-checks `finance.manage`, validates amount/mode/status, mints the receipt, inserts the payment, and advances status — all in one transaction.
- `recordPayment` in TS now delegates to the RPC and maps SQLSTATE → HTTP status.
- *Verified:* partial payment stays `active`, over-balance is rejected, full settlement → `completed`.

## 6. "Outstanding" sums pending (not-yet-payable) enrolments — CONFIRMED
**`components/students/my-fees.tsx:61`**

The "Outstanding" summary summed balances of all non-cancelled enrolments, including `pending` ones awaiting approval (which aren't yet payable — payment is refused until approved).

**✅ Fix applied** (`components/students/my-fees.tsx`):
- Outstanding now sums only `active`/`completed` enrolments; `pending` is excluded. The "Courses" count still shows all non-cancelled enrolments.

## 7. Batch student count includes cancelled/pending — CONFIRMED
**`lib/batch-query.ts:64`**

`fetchBatches` counted `student_enrollment` with no status filter, so cancelled/pending rows inflated the displayed headcount.

**✅ Fix applied** (`lib/batch-query.ts`):
- Dropped the unfiltered `student_enrollment(count)` embed; the count is now a separate status-filtered query (`status in ('active','completed')`) tallied in JS, so zero-count batches still appear.

## 8. Fully-waived (net 0) enrolment never reaches `completed` — CONFIRMED
**`lib/enrollment-write.ts:245`**

Status only advanced to `completed` inside `recordPayment`, but a `full_waiver` enrolment (balance 0) never has a payment recorded, so it stayed `active` forever.

**✅ Fix applied** (`lib/enrollment-write.ts` + migration `132_backfill_waived_completed.sql`):
- `enrolStudent` and `enrolStudentsBulk` enrol net-0 rows directly as `completed`.
- Migration 132 backfills existing `active` + `net_fee_paise = 0` rows to `completed`.
- *Verified:* backfill flips a waived `active` row to `completed`.

## 9. Installment/`paid_on` dates off-by-one in IST — CONFIRMED
**`lib/enrollment-write.ts:83`**

Installment due dates, the `paid_on` default, and the "today" overdue comparison all used `new Date().toISOString().slice(0,10)` (UTC), which is a day behind between 00:00–05:30 IST.

**✅ Fix applied** (`lib/enrollment-write.ts`, `lib/enrollment-query.ts`):
- Added an IST (UTC+5:30) date helper (`istToday`/`istDate`/`istMonthsFromToday`) used for installment `due_on` (both enrol paths), the `paid_on` default (passed explicitly so the DB's UTC `current_date` is never used), and the overdue-vs-`today` comparison in `fetchStudentFees`.

## 10. Receipt "previously-paid" drops same-timestamp payments — PLAUSIBLE
**`lib/enrollment-query.ts:214`**

`getFeeReceipt` computed previously-paid with a strict `.lt('created_at', p.created_at)`, so payments sharing an identical `created_at` were excluded, overstating the printed balance.

**✅ Fix applied** (`lib/enrollment-query.ts`):
- Fetches the enrolment's payments and sums those ordered strictly before this one by **`(created_at, id)`**, so equal-timestamp payments are counted deterministically (an enrolment has only a handful of payments, so this is cheaper than a fragile `.or()` filter).
