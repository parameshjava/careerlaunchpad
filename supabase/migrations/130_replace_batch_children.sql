-- ============================================================================
-- 130_replace_batch_children.sql
-- Fix (code review #2): editing a batch replaced its colleges + fee lines with
-- three separate, non-transactional statements (delete batch_college, delete
-- fee_component, then reinsert). A failed reinsert left the batch stripped of
-- its fees and colleges with no rollback — showing ₹0 fee and rejecting every
-- self-enrol because no batch_college row matched.
--
-- Do the whole delete-then-reinsert inside ONE SECURITY DEFINER function so it
-- runs as a single transaction: any failure rolls the deletes back. The
-- finance.manage gate is preserved (auth.uid() still resolves to the caller).
-- Idempotent.
-- ============================================================================

create or replace function public.replace_batch_children(
  p_batch_id    uuid,
  p_college_ids uuid[],
  p_fee_lines   jsonb   -- [{ "label": text, "amount_paise": bigint, "sort_order": int }]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('finance.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  delete from public.batch_college where batch_id = p_batch_id;
  delete from public.fee_component  where batch_id = p_batch_id;

  if array_length(p_college_ids, 1) is not null then
    insert into public.batch_college (batch_id, college_id)
    select p_batch_id, c
    from unnest(p_college_ids) as c;
  end if;

  if jsonb_array_length(coalesce(p_fee_lines, '[]'::jsonb)) > 0 then
    insert into public.fee_component (batch_id, label, amount_paise, sort_order)
    select p_batch_id,
           (x->>'label')::text,
           (x->>'amount_paise')::bigint,
           coalesce((x->>'sort_order')::int, 0)
    from jsonb_array_elements(p_fee_lines) as x;
  end if;
end;
$$;

grant execute on function public.replace_batch_children(uuid, uuid[], jsonb) to authenticated;
