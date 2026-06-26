-- ============================================================================
-- 019_notification_email.sql
-- Notification addresses for internal people. Each owner / platform_admin /
-- mentor (and college_admin, personal-only) can have a 'personal' address (their
-- login email, seeded automatically) and an 'office' @careerlaunchpad.ai address
-- (added by the owner in the Notification-emails console). Each address has an
-- `active` flag so a personal address can be turned off later without deletion.
-- Students never appear here (they are notification SUBJECTS, not recipients).
-- Drives WHERE the §2 / §3 "awaiting approval" notifications are delivered
-- (see notification_recipients() below). See docs/EMAIL_NOTIFICATIONS_SPEC.md §4.
-- ============================================================================

create table if not exists public.notification_email (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_user(id) on delete cascade,
  email      text not null,
  kind       text not null default 'office' check (kind in ('personal', 'office')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per (user, address); case-insensitive so dupes can't sneak in.
create unique index if not exists notification_email_user_email_uniq
  on public.notification_email (user_id, lower(email));
create index if not exists notification_email_user_idx
  on public.notification_email (user_id);

-- ---------------------------------------------------------------------------
-- RLS — the list is OWNER-MANAGED: anyone with user.manage (owner via '*')
-- reads and writes every row. A user may additionally read their own rows so a
-- future "where do my notices go?" view is possible; they cannot self-edit.
-- ---------------------------------------------------------------------------
alter table public.notification_email enable row level security;

drop policy if exists notification_email_admin_all on public.notification_email;
create policy notification_email_admin_all on public.notification_email
  for all to authenticated
  using (public.has_permission('user.manage'))
  with check (public.has_permission('user.manage'));

drop policy if exists notification_email_self_read on public.notification_email;
create policy notification_email_self_read on public.notification_email
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Provisioning seed. Re-creates handle_new_user() (latest def: migration 014)
-- with one added step: seed a 'personal' address from the login email for
-- internal recipients + mentors. Owners are seeded separately (not invited), so
-- they're handled by the backfill below and by the recipient fallback.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  inv_role_key text;
begin
  -- Find a live invite for this verified email (case-insensitive).
  select * into inv
  from public.invite
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  -- No invite => do nothing. The user signs in but stays unprovisioned and is
  -- routed to the /auth/no-access "get started" screen, where they self-select
  -- a path (Student today) and register_as_student() provisions them.
  if not found then
    return new;
  end if;

  select key into inv_role_key from public.role where id = inv.role_id;

  -- Provision the platform account.
  insert into public.app_user (id, email, employer_id)
  values (new.id, new.email, inv.employer_id)
  on conflict (id) do update set employer_id = excluded.employer_id;

  -- Assign the invited role. scope_college_id is the AUTHORIZATION scope and is
  -- meaningful only for College Admins; a student's college lives solely on
  -- student_profile.college_id (single source of truth), so leave it NULL here.
  insert into public.user_role (user_id, role_id, scope_college_id)
  values (
    new.id,
    inv.role_id,
    case when inv_role_key = 'college_admin' then inv.scope_college_id else null end
  )
  on conflict do nothing;

  -- Students get a stub profile pre-linked to their college.
  if inv_role_key = 'student' then
    insert into public.student_profile (user_id, college_id, full_name)
    values (new.id, inv.scope_college_id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
    on conflict (user_id) do nothing;
  end if;

  -- Seed a 'personal' notification address (the login email) for internal
  -- recipients + mentors, so notifications have a default destination and the
  -- owner-managed list shows them with a personal row to toggle. Students are
  -- deliberately excluded.
  if inv_role_key in ('platform_admin', 'college_admin', 'mentor') and new.email is not null then
    insert into public.notification_email (user_id, email, kind)
    select new.id, new.email, 'personal'
    where not exists (
      select 1 from public.notification_email
      where user_id = new.id and lower(email) = lower(new.email)
    );
  end if;

  -- Mark the invite consumed.
  update public.invite
  set status = 'consumed', consumed_at = now()
  where id = inv.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill: seed a 'personal' address for every existing owner / platform_admin
-- / college_admin / mentor that doesn't already have one. (Owner is seeded
-- manually, never invited, so the trigger never fires for them — this catches
-- existing owners; future owners are added via the console / recipient fallback.)
-- ---------------------------------------------------------------------------
insert into public.notification_email (user_id, email, kind)
select distinct au.id, au.email, 'personal'
from public.app_user au
join public.user_role ur on ur.user_id = au.id
join public.role r       on r.id = ur.role_id
where r.key in ('owner', 'platform_admin', 'college_admin', 'mentor')
  and au.email is not null
  and not exists (
    select 1 from public.notification_email ne
    where ne.user_id = au.id and lower(ne.email) = lower(au.email)
  );

-- ---------------------------------------------------------------------------
-- notification_recipients() — the To list for "awaiting approval" notifications
-- (student / mentor submit). SECURITY DEFINER so the submitting low-privilege
-- user can resolve owner/admin addresses they cannot otherwise read. Returns the
-- ACTIVE addresses of every active owner / platform_admin / college_admin, with
-- a fallback to the account email when a recipient has no active rows at all.
-- Mentors are intentionally NOT recipients (their office address is contact-only).
-- p_audience is reserved for future variants; only 'owners_admins' is implemented.
-- ---------------------------------------------------------------------------
create or replace function public.notification_recipients(p_audience text default 'owners_admins')
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct email), '{}')
  from (
    -- explicit active notification addresses for recipient roles
    select lower(ne.email) as email
    from public.notification_email ne
    join public.app_user au on au.id = ne.user_id
    join public.user_role ur on ur.user_id = ne.user_id
    join public.role r       on r.id = ur.role_id
    where ne.active
      and au.status = 'active'
      and r.key in ('owner', 'platform_admin', 'college_admin')

    union

    -- fallback: the account email for recipients with NO active rows at all
    select lower(au.email) as email
    from public.app_user au
    join public.user_role ur on ur.user_id = au.id
    join public.role r       on r.id = ur.role_id
    where au.status = 'active'
      and au.email is not null
      and r.key in ('owner', 'platform_admin', 'college_admin')
      and not exists (
        select 1 from public.notification_email ne2
        where ne2.user_id = au.id and ne2.active
      )
  ) s
  where email is not null;
$$;

grant execute on function public.notification_recipients(text) to authenticated;
