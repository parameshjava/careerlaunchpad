-- ============================================================================
-- 20260622000004_rls_policies.sql
-- Row-Level Security for every table (spec §3.1 scoping note, §7).
-- Authorization = "any of my roles grants the permission, or I hold '*'".
-- College Admin grants are additionally resource-scoped to their college.
-- ============================================================================

alter table public.role            enable row level security;
alter table public.permission      enable row level security;
alter table public.role_permission enable row level security;
alter table public.app_user        enable row level security;
alter table public.user_role       enable row level security;
alter table public.college         enable row level security;
alter table public.employer        enable row level security;
alter table public.invite          enable row level security;
alter table public.student_profile enable row level security;
alter table public.job             enable row level security;
alter table public.application     enable row level security;
alter table public.conversation    enable row level security;
alter table public.message         enable row level security;

-- ---- RBAC metadata: readable by all signed-in users, managed by role.manage --
create policy role_read on public.role
  for select to authenticated using (true);
create policy role_manage on public.role
  for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

create policy permission_read on public.permission
  for select to authenticated using (true);
create policy permission_manage on public.permission
  for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

create policy role_permission_read on public.role_permission
  for select to authenticated using (true);
create policy role_permission_manage on public.role_permission
  for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

-- ---- app_user: self-read; Owner (user.manage) sees/manages everyone ----------
create policy app_user_self_read on public.app_user
  for select to authenticated
  using (id = auth.uid() or public.has_permission('user.manage'));
create policy app_user_manage on public.app_user
  for all to authenticated
  using (public.has_permission('user.manage'))
  with check (public.has_permission('user.manage'));

-- ---- user_role: self-read; Owner manages -------------------------------------
create policy user_role_self_read on public.user_role
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('user.manage'));
create policy user_role_manage on public.user_role
  for all to authenticated
  using (public.has_permission('user.manage'))
  with check (public.has_permission('user.manage'));

-- ---- college: readable by all (dropdowns); Owner manages; College Admin edits own
create policy college_read on public.college
  for select to authenticated using (true);
create policy college_owner_manage on public.college
  for all to authenticated
  using (public.has_permission('college.manage'))
  with check (public.has_permission('college.manage'));
create policy college_admin_update on public.college
  for update to authenticated
  using (public.has_college_permission('college.profile.manage', id))
  with check (public.has_college_permission('college.profile.manage', id));

-- ---- employer: readable by signed-in users; Owner manages --------------------
create policy employer_read on public.employer
  for select to authenticated using (true);
create policy employer_manage on public.employer
  for all to authenticated
  using (public.has_permission('user.manage'))
  with check (public.has_permission('user.manage'));

-- ---- invite: Owner only (user.invite) ----------------------------------------
create policy invite_manage on public.invite
  for all to authenticated
  using (public.has_permission('user.invite'))
  with check (public.has_permission('user.invite'));

-- ---- student_profile (base table) --------------------------------------------
-- Student manages own row. College Admin reads own-college students. Owner reads all.
-- NOTE: employers do NOT get base-table SELECT (it carries phone) — they read the
-- masked view `student_profile_public` instead, enforcing §5.3 at the data layer.
create policy student_profile_self on public.student_profile
  for all to authenticated
  using (user_id = auth.uid() and public.has_permission('student.profile.manage_own'))
  with check (user_id = auth.uid() and public.has_permission('student.profile.manage_own'));
create policy student_profile_college_admin on public.student_profile
  for select to authenticated
  using (public.has_college_permission('college.students.view', college_id));
create policy student_profile_owner on public.student_profile
  for select to authenticated
  using (public.has_permission('user.manage'));

-- ---- job ---------------------------------------------------------------------
-- Everyone signed-in can browse open jobs (students need job.browse). Employer
-- manages jobs for its own org.
create policy job_browse on public.job
  for select to authenticated
  using (
    (status = 'open' and public.has_permission('job.browse'))
    or employer_id = (select employer_id from public.app_user where id = auth.uid())
    or public.has_permission('*')
  );
create policy job_employer_manage on public.job
  for all to authenticated
  using (
    public.has_permission('job.post')
    and employer_id = (select employer_id from public.app_user where id = auth.uid())
  )
  with check (
    public.has_permission('job.post')
    and employer_id = (select employer_id from public.app_user where id = auth.uid())
  );

-- ---- application -------------------------------------------------------------
-- Student sees/creates own applications. Employer sees/updates applications to
-- its own jobs.
create policy application_student on public.application
  for all to authenticated
  using (student_id = auth.uid() and public.has_permission('job.apply'))
  with check (student_id = auth.uid() and public.has_permission('job.apply'));
create policy application_employer_read on public.application
  for select to authenticated
  using (
    public.has_permission('job.applicants.view')
    and job_id in (
      select j.id from public.job j
      where j.employer_id = (select employer_id from public.app_user where id = auth.uid())
    )
  );
create policy application_employer_update on public.application
  for update to authenticated
  using (
    public.has_permission('job.applicants.view')
    and job_id in (
      select j.id from public.job j
      where j.employer_id = (select employer_id from public.app_user where id = auth.uid())
    )
  )
  with check (true);

-- ---- conversation: the employer party and the student party only -------------
create policy conversation_party on public.conversation
  for select to authenticated
  using (
    student_id = auth.uid()
    or employer_id = (select employer_id from public.app_user where id = auth.uid())
  );
create policy conversation_employer_create on public.conversation
  for insert to authenticated
  with check (
    public.has_permission('student.contact.initiate')
    and employer_id = (select employer_id from public.app_user where id = auth.uid())
    and initiated_by = auth.uid()
  );
-- Student flips contact_revealed when they respond/consent (§5.3).
create policy conversation_student_update on public.conversation
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- ---- message: parties of the conversation can read; parties can send ---------
create policy message_party_read on public.message
  for select to authenticated
  using (
    conversation_id in (
      select c.id from public.conversation c
      where c.student_id = auth.uid()
         or c.employer_id = (select employer_id from public.app_user where id = auth.uid())
    )
  );
create policy message_party_send on public.message
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and conversation_id in (
      select c.id from public.conversation c
      where (c.student_id = auth.uid() and public.has_permission('message.respond'))
         or (c.employer_id = (select employer_id from public.app_user where id = auth.uid())
             and public.has_permission('student.contact.initiate'))
    )
  );

-- ============================================================================
-- Contact-privacy view (spec §5.3): employers search/view full profiles here.
-- security_invoker = false (default) so the view runs with its owner's rights
-- and bypasses the base-table policy that withholds the table from employers.
-- The view itself enforces who may see rows (search/view permission) and masks
-- phone unless a contact-revealed conversation exists with the viewing employer.
-- ============================================================================
create or replace view public.student_profile_public as
select
  sp.user_id,
  sp.full_name,
  sp.photo_url,
  sp.college_id,
  sp.degree,
  sp.branch,
  sp.graduation_year,
  sp.cgpa,
  sp.skills,
  sp.resume_url,
  sp.portfolio_url,
  sp.github_url,
  sp.linkedin_url,
  sp.projects,
  sp.internships,
  sp.certifications,
  sp.achievements,
  sp.desired_roles,
  sp.desired_locations,
  sp.job_type,
  sp.open_to_opportunities,
  -- phone revealed only after the student consents in a conversation with the
  -- viewing employer user (§5.3); masked otherwise.
  case
    when exists (
      select 1 from public.conversation c
      where c.student_id = sp.user_id
        and c.contact_revealed
        and c.initiated_by = auth.uid()
    ) then sp.phone
    else null
  end as phone
from public.student_profile sp
where public.has_permission('student.profile.search')
   or public.has_permission('student.profile.view')
   or public.has_permission('*');

grant select on public.student_profile_public to authenticated;
