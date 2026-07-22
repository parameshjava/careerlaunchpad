-- ============================================================================
-- 131_record_payment.sql
-- Fixes two code-review findings at once:
--
--   #5 (double-pay race): recordPayment read the balance and inserted the
--      payment in separate statements, so two concurrent/double-submitted
--      payments could both pass the "amount <= balance" guard and both post.
--
--   #3 (receipt sequence burn): next_fee_receipt_no was granted to every
--      authenticated user, so any signed-in student could advance the shared
--      fee_receipt_seq from the browser and gouge gaps in the official series.
--
-- Both are solved by moving payment recording into ONE SECURITY DEFINER RPC:
--   * it re-checks finance.manage itself (so it can't be abused),
--   * it locks the enrolment row (FOR UPDATE) before reading the balance, so
--     concurrent payments serialise and the balance check is race-free,
--   * it mints the receipt number internally (as owner), so the direct
--     next_fee_receipt_no grant can be revoked from `authenticated`.
-- Idempotent.
-- ============================================================================

-- Students can no longer burn the receipt sequence directly. The function is
-- still callable by SECURITY DEFINER routines (record_payment) which run as the
-- owner and so ignore this grant.
revoke execute on function public.next_fee_receipt_no(text) from authenticated;
revoke execute on function public.next_fee_receipt_no(text) from public;

create or replace function public.record_payment(
  p_enrollment_id uuid,
  p_amount_paise  bigint,
  p_mode          text,
  p_reference_no  text default null,
  p_paid_on       date default null,
  p_notes         text default null
)
returns table (payment_id uuid, receipt_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_student       uuid;
  v_batch         uuid;
  v_college       uuid;
  v_net           bigint;
  v_status        text;
  v_paid          bigint;
  v_balance       bigint;
  v_academic_year text;
  v_receipt       text;
  v_payment_id    uuid;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Enter a valid payment amount' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('cash', 'upi', 'card', 'online') then
    raise exception 'Invalid payment mode' using errcode = '22023';
  end if;

  -- Lock the enrolment so concurrent payments on it serialise: the second call
  -- waits here until the first commits, then reads the updated paid-to-date.
  select student_id, batch_id, college_id, net_fee_paise, status
    into v_student, v_batch, v_college, v_net, v_status
  from public.student_enrollment
  where id = p_enrollment_id
  for update;
  if not found then
    raise exception 'Enrolment not found' using errcode = 'P0002';
  end if;
  if v_status = 'pending' then
    raise exception 'This enrolment is awaiting approval — approve it before recording a payment' using errcode = '22023';
  end if;
  if v_status = 'cancelled' then
    raise exception 'This enrolment has been cancelled' using errcode = '22023';
  end if;

  select coalesce(sum(amount_paise), 0) into v_paid
  from public.payment where enrollment_id = p_enrollment_id;
  v_balance := greatest(v_net - v_paid, 0);
  if p_amount_paise > v_balance then
    raise exception 'Amount exceeds the outstanding balance' using errcode = '22023';
  end if;

  select academic_year into v_academic_year from public.batch where id = v_batch;
  v_receipt := public.next_fee_receipt_no(v_academic_year);

  insert into public.payment (
    enrollment_id, student_id, college_id, receipt_no, amount_paise,
    mode, reference_no, paid_on, notes, created_by
  ) values (
    p_enrollment_id, v_student, v_college, v_receipt, p_amount_paise,
    p_mode, p_reference_no, coalesce(p_paid_on, current_date), p_notes, v_uid
  )
  returning id into v_payment_id;

  update public.student_enrollment
     set status = case when v_paid + p_amount_paise >= v_net then 'completed' else 'active' end,
         updated_at = now()
   where id = p_enrollment_id;

  return query select v_payment_id, v_receipt;
end;
$$;

grant execute on function public.record_payment(uuid, bigint, text, text, date, text) to authenticated;
