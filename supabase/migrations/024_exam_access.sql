-- ============================================================================
-- 024_exam_access.sql   (additive — does not drop data)
-- Reworks WHO can see/do what, per product decision:
--
--   • Owner == Platform Admin: full, unscoped access to everything (bank + every
--     college's exams/papers/answer keys/results). Driven by is_exam_admin().
--   • College Admin: VIEW & EVALUATE their OWN college only — manage the student
--     roster and view their college's results. NO question bank, NO blueprint /
--     paper creation, NO answer keys. (Loses blueprint.manage / paper.generate /
--     paper.export_pdf; keeps assign + results.view_all.)
--   • Per-exam staff (employers / mentors / others), chosen when the exam is
--     created: new exam_staff table. They can view that exam's blueprint, answer
--     key and all results, and enter/adjust marks. Access via is_exam_staff_for_*.
--
-- Bank stays GLOBAL but is now admin-only to read/write; staff reach answer keys
-- and results through SECURITY DEFINER RPCs, never the bank tables directly.
-- ============================================================================

-- ---- helpers ----------------------------------------------------------------
-- Full exam admin = Owner ('*') or anyone in the platform_admin role.
create or replace function public.is_exam_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission('*') or exists (
    select 1 from public.user_role ur join public.role r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.key = 'platform_admin');
$$;

-- exam_staff: evaluators assigned to a specific exam (blueprint).
create table if not exists public.exam_staff (
  exam_id    uuid not null references public.exam(id) on delete cascade,
  user_id    uuid not null references public.app_user(id) on delete cascade,
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  primary key (exam_id, user_id)
);
create index if not exists exam_staff_user_idx on public.exam_staff (user_id);
alter table public.exam_staff enable row level security;

-- Assigned staff for an exam / a session (admins always qualify).
create or replace function public.is_exam_staff_for_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_exam_admin() or exists (
    select 1 from public.exam_staff where exam_id = p_exam_id and user_id = auth.uid());
$$;

create or replace function public.is_exam_staff_for_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_exam_staff_for_exam((select exam_id from public.exam_session where id = p_session_id));
$$;

grant execute on function public.is_exam_admin()              to authenticated;
grant execute on function public.is_exam_staff_for_exam(uuid) to authenticated;
grant execute on function public.is_exam_staff_for_session(uuid) to authenticated;

-- ---- exam_staff RLS: admins assign; staff read their own rows ----------------
drop policy if exists exam_staff_manage    on public.exam_staff;
drop policy if exists exam_staff_self_read on public.exam_staff;
create policy exam_staff_manage on public.exam_staff
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_staff_self_read on public.exam_staff
  for select to authenticated using (user_id = auth.uid());

-- ---- GLOBAL BANK → admin-only (College Admins lose all bank access) ----------
drop policy if exists subject_read   on public.subject;
drop policy if exists subject_manage on public.subject;
create policy subject_all on public.subject
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());

drop policy if exists chapter_read   on public.chapter;
drop policy if exists chapter_manage on public.chapter;
create policy chapter_all on public.chapter
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());

drop policy if exists passage_read   on public.passage;
drop policy if exists passage_manage on public.passage;
create policy passage_all on public.passage
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());

drop policy if exists question_read   on public.question;
drop policy if exists question_manage on public.question;
create policy question_all on public.question
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());

drop policy if exists question_option_read   on public.question_option;
drop policy if exists question_option_manage on public.question_option;
create policy question_option_all on public.question_option
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());

-- ---- exam blueprint: admin manages; college (own) + assigned staff read ------
drop policy if exists exam_manage on public.exam;
create policy exam_admin_manage on public.exam
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_read on public.exam
  for select to authenticated using (
    public.is_exam_admin()
    or public.has_college_permission('exam.results.view_all', college_id)
    or public.is_exam_staff_for_exam(id));

drop policy if exists exam_section_manage on public.exam_section;
create policy exam_section_admin_manage on public.exam_section
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_section_read on public.exam_section
  for select to authenticated using (exists (
    select 1 from public.exam e where e.id = exam_section.exam_id and (
      public.is_exam_admin()
      or public.has_college_permission('exam.results.view_all', e.college_id)
      or public.is_exam_staff_for_exam(e.id))));

drop policy if exists exam_section_chapter_manage on public.exam_section_chapter;
create policy exam_section_chapter_admin_manage on public.exam_section_chapter
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_section_chapter_read on public.exam_section_chapter
  for select to authenticated using (exists (
    select 1 from public.exam_section es join public.exam e on e.id = es.exam_id
    where es.id = exam_section_chapter.section_id and (
      public.is_exam_admin()
      or public.has_college_permission('exam.results.view_all', e.college_id)
      or public.is_exam_staff_for_exam(e.id))));

-- ---- sessions: admin manages; college reads own + assigns roster; staff read;
--      rostered students read.
drop policy if exists exam_session_manage       on public.exam_session;
drop policy if exists exam_session_student_read on public.exam_session;
create policy exam_session_admin_manage on public.exam_session
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_session_read on public.exam_session
  for select to authenticated using (
    public.is_exam_admin()
    or public.has_college_permission('exam.results.view_all', college_id)
    or public.is_exam_staff_for_exam(exam_id)
    or public.exam_is_rostered(id));

drop policy if exists exam_session_student_manage    on public.exam_session_student;
drop policy if exists exam_session_student_self_read on public.exam_session_student;
create policy exam_session_student_manage on public.exam_session_student
  for all to authenticated
  using (public.is_exam_admin()
         or public.has_college_permission('exam.assign', public.exam_session_college(session_id)))
  with check (public.is_exam_admin()
         or public.has_college_permission('exam.assign', public.exam_session_college(session_id)));
create policy exam_session_student_staff_read on public.exam_session_student
  for select to authenticated using (public.is_exam_staff_for_session(session_id));
create policy exam_session_student_self_read on public.exam_session_student
  for select to authenticated using (student_id = auth.uid());

-- ---- papers: admin + assigned staff (answer key); no college admin -----------
drop policy if exists exam_paper_manage on public.exam_paper;
create policy exam_paper_admin_manage on public.exam_paper
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_paper_staff_read on public.exam_paper
  for select to authenticated using (public.is_exam_staff_for_session(session_id));

drop policy if exists exam_paper_question_manage on public.exam_paper_question;
create policy exam_paper_question_admin_manage on public.exam_paper_question
  for all to authenticated using (public.is_exam_admin()) with check (public.is_exam_admin());
create policy exam_paper_question_staff_read on public.exam_paper_question
  for select to authenticated using (public.is_exam_staff_for_session(
    (select session_id from public.exam_paper where id = exam_paper_question.paper_id)));

-- ---- attempts/results: admin + college(own, results.view_all) + assigned staff
drop policy if exists exam_attempt_admin_read on public.exam_attempt;
create policy exam_attempt_read on public.exam_attempt
  for select to authenticated using (
    public.is_exam_admin()
    or public.has_college_permission('exam.results.view_all', public.exam_session_college(session_id))
    or public.is_exam_staff_for_session(session_id));

drop policy if exists exam_attempt_question_admin_read on public.exam_attempt_question;
create policy exam_attempt_question_read on public.exam_attempt_question
  for select to authenticated using (
    public.is_exam_admin()
    or public.has_college_permission('exam.results.view_all', public.exam_attempt_college(attempt_id))
    or public.is_exam_staff_for_session(
         (select session_id from public.exam_attempt where id = exam_attempt_question.attempt_id)));

-- ---- permission grants: platform_admin == owner; trim college_admin ----------
insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r
join public.permission p on (r.key = 'platform_admin' and p.key like 'exam.%')
on conflict do nothing;

delete from public.role_permission rp
using public.role r, public.permission p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key = 'college_admin'
  and p.key in ('exam.blueprint.manage', 'exam.paper.generate', 'exam.paper.export_pdf');

-- ============================================================================
-- RPC updates
-- ============================================================================

-- Blueprint sections are edited centrally only.
create or replace function public.replace_blueprint_sections(p_exam_id uuid, p_sections jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare sec jsonb; v_section_id uuid; q jsonb;
begin
  if not exists (select 1 from public.exam where id = p_exam_id) then raise exception 'Blueprint not found'; end if;
  if not public.is_exam_admin() then raise exception 'Forbidden'; end if;
  if exists (select 1 from public.exam_session where exam_id = p_exam_id) then
    raise exception 'Blueprint already has sittings; sections cannot be replaced';
  end if;

  delete from public.exam_section where exam_id = p_exam_id;
  for sec in select * from jsonb_array_elements(p_sections) loop
    insert into public.exam_section
      (exam_id, subject_id, num_questions, marks_per_question,
       pct_easy, pct_medium, pct_hard, pct_very_hard, position)
    values (p_exam_id, (sec->>'subject_id')::uuid, (sec->>'num_questions')::int,
       (sec->>'marks_per_question')::numeric, (sec->>'pct_easy')::int, (sec->>'pct_medium')::int,
       (sec->>'pct_hard')::int, (sec->>'pct_very_hard')::int, (sec->>'position')::int)
    returning id into v_section_id;
    if jsonb_typeof(sec->'chapter_quota') = 'array' then
      for q in select * from jsonb_array_elements(sec->'chapter_quota') loop
        insert into public.exam_section_chapter (section_id, subject_id, chapter_id, pct)
        values (v_section_id, (sec->>'subject_id')::uuid, (q->>'chapter_id')::uuid, (q->>'pct')::int);
      end loop;
    end if;
  end loop;
end;
$$;

-- Finalize in-progress attempts: admins or assigned staff (evaluators).
create or replace function public.grade_session_in_progress(p_session_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if not exists (select 1 from public.exam_session where id = p_session_id) then raise exception 'Session not found'; end if;
  if not public.is_exam_staff_for_session(p_session_id) then raise exception 'Forbidden'; end if;
  select array_agg(id) into v_ids from public.exam_attempt
    where session_id = p_session_id and status = 'in_progress';
  if v_ids is null then return 0; end if;
  perform public._grade_attempts(v_ids);
  return array_length(v_ids, 1);
end;
$$;

-- Answer key for a sitting — admins + assigned staff (students never get this).
create or replace function public.get_exam_answer_key(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_paper_id uuid;
begin
  if not public.is_exam_staff_for_session(p_session_id) then raise exception 'Forbidden'; end if;
  select id into v_paper_id from public.exam_paper where session_id = p_session_id limit 1;
  if v_paper_id is null then return jsonb_build_object('questions', '[]'::jsonb); end if;

  return jsonb_build_object('questions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', pq.position, 'stem', q.stem, 'kind', q.kind, 'answer_type', q.answer_type,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('label', o.label, 'is_correct', o.is_correct) order by o.position)
        from public.question_option o where o.question_id = q.id), '[]'::jsonb)
    ) order by pq.position)
    from public.exam_paper_question pq join public.question q on q.id = pq.question_id
    where pq.paper_id = v_paper_id), '[]'::jsonb));
end;
$$;

-- Enter/adjust marks (admins + assigned staff). p_marks: [{ position, marks }].
create or replace function public.set_attempt_marks(p_attempt_id uuid, p_marks jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; m jsonb;
begin
  select session_id into v_session from public.exam_attempt where id = p_attempt_id;
  if v_session is null then raise exception 'Attempt not found'; end if;
  if not public.is_exam_staff_for_session(v_session) then raise exception 'Forbidden'; end if;

  for m in select * from jsonb_array_elements(p_marks) loop
    update public.exam_attempt_question
      set awarded_marks = (m->>'marks')::numeric
      where attempt_id = p_attempt_id and position = (m->>'position')::int;
  end loop;

  update public.exam_attempt a
    set score = coalesce((select sum(awarded_marks) from public.exam_attempt_question
                          where attempt_id = a.id), 0),
        status = 'graded'
    where a.id = p_attempt_id;

  return jsonb_build_object('score', (select score from public.exam_attempt where id = p_attempt_id));
end;
$$;

grant execute on function public.get_exam_answer_key(uuid)       to authenticated;
grant execute on function public.set_attempt_marks(uuid, jsonb)  to authenticated;
