-- ============================================================================
-- 170_feedback_form_versions.sql
-- Make the feedback instrument editable without hand-written SQL (issue #84 §F9,
-- and the `feedback.form.manage` permission 159 seeded but never used).
--
-- WHAT WAS MISSING
--   159 built the instrument as versioned DATA — six items plus a screener as rows in
--   feedback_form_item, with answers referencing an item id so re-wording a question
--   can never rewrite history. Correct, and completely unreachable: nothing in the app
--   references feedback.form.manage, so "add a seventh question" meant someone writing
--   INSERTs against production by hand. A design that can only be exercised through
--   psql will, in practice, be exercised by editing the live version in place — which
--   is the single thing §F9 exists to prevent.
--
-- THE INVARIANTS LIVE HERE, NOT IN THE ROUTE
--   1) A published version is IMMUTABLE. Items can be written only while the form is
--      'draft'; the trigger below refuses everything else, so no future endpoint,
--      migration or console session can quietly re-word a live question.
--   2) Exactly one active version per scope. Publishing retires the incumbent inside
--      one transaction (159's partial unique index would otherwise reject the second
--      'active' row and leave a half-done switch).
--   3) Version numbers are assigned by the database (max + 1), never by the client.
--   4) A form that any request has used can never be deleted — that is the history
--      the versioning was for.
--
-- WHAT DOES NOT CHANGE
--   Open windows keep the form they opened with (chapter_feedback_request.form_id).
--   Publishing v2 affects the NEXT chapter completion, never a form a student is
--   part-way through. Nothing here touches an existing response or answer.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Immutability of a published version, enforced by trigger.
--    A statement-level check would be cheaper but cannot see WHICH form the row
--    belongs to; this is a per-row guard on a table written a handful of times a year.
-- ---------------------------------------------------------------------------
create or replace function public._feedback_form_item_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from public.feedback_form
   where id = coalesce(new.form_id, old.form_id);

  -- `v_status is null` means the parent form row is already gone, which happens on
  -- exactly one path: the FK cascade from discard_feedback_form_draft's DELETE. That
  -- delete has already proved the form was a draft and unused, so blocking here would
  -- only make discarding impossible. A write with no parent form is unreachable
  -- anyway — the FK would reject it first.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'This form version is % — publish a new draft instead of editing it', v_status;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists feedback_form_item_draft_only on public.feedback_form_item;
create trigger feedback_form_item_draft_only
  before insert or update or delete on public.feedback_form_item
  for each row execute function public._feedback_form_item_guard();

-- The 159 seed ran before this trigger existed, so it is unaffected. Any future seed
-- must insert the form as 'draft', add items, then publish — the same path the UI takes.

-- ---------------------------------------------------------------------------
-- 2. Start a new draft, optionally seeded from an existing version.
--    Copying from the active version is the overwhelmingly common intent ("same
--    form, one extra question"), and doing it in SQL means the copy carries every
--    column — a UI-side copy would silently drop whatever field was added last.
-- ---------------------------------------------------------------------------
create or replace function public.create_feedback_form_draft(
  p_copy_from uuid default null,
  p_scope text default 'chapter'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_version int;
begin
  if not public.has_permission('feedback.form.manage') then
    raise exception 'Forbidden';
  end if;

  -- One draft at a time per scope. Two half-written instruments is a state nobody
  -- can reason about, and "which draft did I mean?" is not a question worth adding.
  if exists (select 1 from public.feedback_form where scope = p_scope and status = 'draft') then
    raise exception 'A draft already exists for this scope — publish or discard it first';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.feedback_form where scope = p_scope;

  insert into public.feedback_form (scope, version, status, created_by)
  values (p_scope, v_version, 'draft', auth.uid())
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.feedback_form_item
      (form_id, dimension_key, prompt, short_label, item_group, sort_order,
       response_type, choices, required, allow_na)
    select v_id, i.dimension_key, i.prompt, i.short_label, i.item_group, i.sort_order,
           i.response_type, i.choices, i.required, i.allow_na
    from public.feedback_form_item i
    where i.form_id = p_copy_from;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Publish a draft: retire the incumbent and activate this one, atomically.
-- ---------------------------------------------------------------------------
create or replace function public.publish_feedback_form(p_form_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_scope  text;
  v_status text;
  v_items  int;
begin
  if not public.has_permission('feedback.form.manage') then
    raise exception 'Forbidden';
  end if;

  select scope, status into v_scope, v_status
  from public.feedback_form where id = p_form_id;
  if v_scope is null then raise exception 'Form version not found'; end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be published (this one is %)', v_status;
  end if;

  select count(*) into v_items from public.feedback_form_item where form_id = p_form_id;
  -- An empty instrument would open windows nobody can answer, and
  -- submit_chapter_feedback would accept a response with no answers at all.
  if v_items = 0 then
    raise exception 'Add at least one question before publishing';
  end if;
  if not exists (
    select 1 from public.feedback_form_item
    where form_id = p_form_id and response_type = 'rating5'
  ) then
    raise exception 'A feedback form needs at least one rating question';
  end if;

  -- Retire first: 159's feedback_form_one_active_idx allows exactly one active row
  -- per scope, so the order here is the difference between a switch and an error.
  update public.feedback_form
     set status = 'retired'
   where scope = v_scope and status = 'active';

  update public.feedback_form
     set status = 'active', published_at = now()
   where id = p_form_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Discard a draft. Only ever a draft, and only one never used by a request —
--    both conditions are already true of a draft, and both are checked anyway
--    because this is the one function in the file that destroys anything.
-- ---------------------------------------------------------------------------
create or replace function public.discard_feedback_form_draft(p_form_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_status text;
begin
  if not public.has_permission('feedback.form.manage') then
    raise exception 'Forbidden';
  end if;

  select status into v_status from public.feedback_form where id = p_form_id;
  if v_status is null then raise exception 'Form version not found'; end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be discarded (this one is %)', v_status;
  end if;
  if exists (select 1 from public.chapter_feedback_request where form_id = p_form_id) then
    raise exception 'This version has already been used to ask students — it cannot be deleted';
  end if;

  -- Items go with it via the FK cascade. The draft-only trigger fires on that
  -- cascade with the parent row already deleted, which is the null case it allows.
  delete from public.feedback_form where id = p_form_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The catalogue the admin screen reads: every version, its items, and how many
--    windows it has been used for — one round trip. Usage is the number that makes
--    versioning legible ("v1 asked 84 chapters; v2 is asking now").
-- ---------------------------------------------------------------------------
create or replace function public.feedback_form_catalogue(p_scope text default 'chapter')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.has_permission('feedback.form.manage') then
    raise exception 'Forbidden';
  end if;

  select coalesce(jsonb_agg(x order by x->>'version' desc), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
             'id', f.id,
             'scope', f.scope,
             'version', f.version,
             'status', f.status,
             'published_at', f.published_at,
             'created_at', f.created_at,
             'request_count', (select count(*) from public.chapter_feedback_request r
                                where r.form_id = f.id),
             'response_count', (select count(*)
                                  from public.chapter_feedback_request r
                                  join public.chapter_feedback_response resp
                                    on resp.request_id = r.id
                                 where r.form_id = f.id),
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'dimension_key', i.dimension_key,
                        'prompt', i.prompt,
                        'short_label', i.short_label,
                        'item_group', i.item_group,
                        'sort_order', i.sort_order,
                        'response_type', i.response_type,
                        'choices', i.choices,
                        'required', i.required,
                        'allow_na', i.allow_na)
                      order by i.sort_order, i.dimension_key)
               from public.feedback_form_item i where i.form_id = f.id), '[]'::jsonb)
           ) as x
    from public.feedback_form f
    where f.scope = p_scope
  ) t;

  return v;
end $$;

grant execute on function public.create_feedback_form_draft(uuid, text)   to authenticated;
grant execute on function public.publish_feedback_form(uuid)             to authenticated;
grant execute on function public.discard_feedback_form_draft(uuid)       to authenticated;
grant execute on function public.feedback_form_catalogue(text)           to authenticated;
-- _feedback_form_item_guard is deliberately NOT revoked: Postgres checks EXECUTE on a
-- trigger function when the trigger is created, and a revoke here risks the item
-- writes it guards. Called directly it raises "can only be called as a trigger", so
-- there is nothing to protect.

commit;
