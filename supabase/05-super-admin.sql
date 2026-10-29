-- Upgrade the existing kkf-v1 database. Do NOT rerun 01-schema.sql.
-- Existing Auth identities, sessions, answers and legacy membership tables are retained.
begin;

create table if not exists kkf_private.people (
  email text primary key check(email=lower(btrim(email))),
  user_id uuid unique references auth.users(id) on delete set null,
  role text not null check(role in ('teacher','student')),
  display_name text not null default '' check(length(display_name)<=80),
  year_group text not null default '' check(length(year_group)<=30),
  active boolean not null default true,
  revision bigint not null default 1,
  invitation_status text not null default 'not_sent' check(invitation_status in ('not_sent','sending','sent','retry_needed','existing_account')),
  invite_token uuid,
  last_invite_attempt timestamptz,
  invited_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists kkf_private.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists kkf_private.assignments (
  student_email text not null references kkf_private.people(email) on delete cascade,
  teacher_id uuid not null references kkf_private.people(user_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key(student_email,teacher_id)
);
create index if not exists kkf_assignments_teacher on kkf_private.assignments(teacher_id,student_email);
create table if not exists kkf_private.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_email text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.kkf_attempts add column if not exists review_version bigint not null default 0;
create table if not exists kkf_private.review_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  question_id text not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_name text not null,
  checks boolean[] not null check(cardinality(checks)=2 and array_position(checks,null) is null),
  feedback text not null check(length(feedback)<=1000),
  reviewed_at timestamptz not null default now(),
  foreign key(session_id,question_id) references public.kkf_attempts(session_id,question_id) on delete cascade
);
create index if not exists kkf_review_history_session on kkf_private.review_history(session_id,reviewed_at);

-- Teachers take precedence if a legacy account was present in both pilot tables.
insert into kkf_private.people(email,user_id,role,display_name,invitation_status)
select lower(u.email),u.id,'teacher',coalesce(s.display_name,''),'existing_account'
from kkf_private.teachers t join auth.users u on u.id=t.user_id
left join kkf_private.students s on s.email=lower(u.email)
where u.email is not null on conflict(email) do nothing;
insert into kkf_private.people(email,user_id,role,display_name,active,created_at,invitation_status)
select s.email,u.id,'student',s.display_name,s.active,s.created_at,
case when u.email_confirmed_at is not null then 'existing_account' else 'not_sent' end
from kkf_private.students s left join auth.users u on lower(u.email)=s.email
on conflict(email) do nothing;

-- Preserve the latest pre-upgrade teacher review as the first history entry.
insert into kkf_private.review_history(session_id,question_id,reviewer_id,reviewer_name,checks,feedback,reviewed_at)
select a.session_id,a.question_id,a.teacher_reviewed_by,coalesce(nullif(p.display_name,''),'KKF Academy teacher'),
a.teacher_checks,a.teacher_feedback,a.teacher_reviewed_at
from public.kkf_attempts a left join kkf_private.people p on p.user_id=a.teacher_reviewed_by
where a.teacher_checks is not null and a.teacher_reviewed_at is not null
and not exists(select 1 from kkf_private.review_history h where h.session_id=a.session_id and h.question_id=a.question_id and h.reviewed_at=a.teacher_reviewed_at);

create or replace function kkf_private.is_super_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from kkf_private.super_admins s join kkf_private.people p on p.user_id=s.user_id
  join auth.users u on u.id=p.user_id where s.user_id=auth.uid() and p.active and u.email_confirmed_at is not null);
$$;
create or replace function kkf_private.is_teacher() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from kkf_private.people p where p.user_id=auth.uid() and p.role='teacher' and p.active)
  or kkf_private.is_super_admin();
$$;
create or replace function kkf_private.member_email() returns text
language plpgsql stable security definer set search_path='' as $$
declare e text; v_email text;
begin
  select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if e is null then raise exception 'Please sign in with a verified email.' using errcode='42501'; end if;
  select p.email into v_email from kkf_private.people p where p.active and
  (p.user_id=auth.uid() or (p.user_id is null and p.email=e))
  order by (p.user_id=auth.uid()) desc nulls last limit 1;
  if v_email is null then raise exception 'This account is not active for KKF Academy. Ask the Super Admin for access.' using errcode='42501'; end if;
  return v_email;
end;
$$;
create or replace function kkf_private.can_read_user(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.kkf_has_access() and (
    auth.uid()=p_user_id or kkf_private.is_super_admin() or
    (kkf_private.is_teacher() and exists(
      select 1 from kkf_private.assignments a join kkf_private.people p on p.email=a.student_email
      where a.teacher_id=auth.uid() and p.role='student' and
      (p.user_id=p_user_id or (p.user_id is null and p.email=(select lower(email) from auth.users where id=p_user_id)))
    ))
  );
$$;
create or replace function public.kkf_can_read_user(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$ select kkf_private.can_read_user(p_user_id); $$;
create or replace function public.kkf_profile() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text; p kkf_private.people;
begin
  e:=kkf_private.member_email();
  select * into p from kkf_private.people where email=e;
  return jsonb_build_object('id',auth.uid(),'email',e,'display_name',p.display_name,'role',p.role,
  'is_teacher',kkf_private.is_teacher(),'is_super_admin',kkf_private.is_super_admin(),'year_group',p.year_group);
end;
$$;
create or replace function public.kkf_start_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text; n text; s public.kkf_sessions;
begin
  e:=kkf_private.member_email();
  select display_name into n from kkf_private.people where email=e;
  insert into public.kkf_sessions(id,user_id,email,display_name,quiz_version)
  values(p_id,auth.uid(),e,coalesce(n,''),'kkf-v1') on conflict(id) do nothing;
  s:=kkf_private.lock_session(p_id); return to_jsonb(s);
end;
$$;
drop policy if exists kkf_read_sessions on public.kkf_sessions;
create policy kkf_read_sessions on public.kkf_sessions for select to authenticated
using(public.kkf_can_read_user(user_id));

-- Old direct registration is closed: every new membership goes through the admin backend.
create or replace function public.kkf_set_student(p_email text,p_display_name text default '',p_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Use Super Admin account management to register or change access.' using errcode='42501'; end;
$$;
revoke execute on function public.kkf_set_student(text,text,boolean) from authenticated,anon,public;

create or replace function public.kkf_roster() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() then raise exception 'Teacher access required.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.email) from (
    select p.email,p.display_name,p.year_group,p.active,p.user_id is not null as has_account,u.last_sign_in_at
    from kkf_private.people p left join auth.users u on u.id=p.user_id
    where p.role='student' and (kkf_private.is_super_admin() or exists(
      select 1 from kkf_private.assignments a where a.student_email=p.email and a.teacher_id=auth.uid()))
  ) r),'[]'::jsonb);
end;
$$;

drop function if exists public.kkf_report(text,integer,timestamptz);
drop function if exists public.kkf_report(text,integer,timestamptz,uuid,timestamptz,timestamptz);
create function public.kkf_report(p_search text default '',p_offset integer default 0,p_before timestamptz default null,
p_teacher uuid default null,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_total integer; v_snapshot timestamptz:=coalesce(p_before,now());
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() then raise exception 'Teacher access required.' using errcode='42501'; end if;
  if p_teacher is not null and not kkf_private.is_super_admin() and p_teacher<>auth.uid() then
    raise exception 'Only the Super Admin can filter other teachers.' using errcode='42501';
  end if;
  if p_search is null or length(p_search)>254 or p_offset is null or p_offset<0 or (p_from is not null and p_to is not null and p_from>=p_to) then
    raise exception 'Invalid report filter.';
  end if;
  with permitted as (
    select s.* from public.kkf_sessions s where kkf_private.can_read_user(s.user_id) and s.started_at<=v_snapshot
    and strpos(lower(s.email||' '||s.display_name),lower(p_search))>0
    and (p_from is null or s.started_at>=p_from) and (p_to is null or s.started_at<p_to)
    and (p_teacher is null or exists(select 1 from kkf_private.assignments a join kkf_private.people p on p.email=a.student_email
      where a.teacher_id=p_teacher and p.user_id=s.user_id))
  ) select count(*) into v_total from permitted;
  select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('attempts',coalesce((
    select jsonb_agg(to_jsonb(a)||jsonb_build_object('review_history',coalesce((
      select jsonb_agg(jsonb_build_object('id',h.id,'reviewer_name',h.reviewer_name,'checks',h.checks,'feedback',h.feedback,'reviewed_at',h.reviewed_at)
      order by h.reviewed_at desc,h.id) from kkf_private.review_history h where h.session_id=a.session_id and h.question_id=a.question_id
    ),'[]'::jsonb)) order by a.identified_at) from public.kkf_attempts a where a.session_id=s.id
  ),'[]'::jsonb)) order by s.started_at desc,s.id),'[]'::jsonb) into v_items
  from (select s.* from public.kkf_sessions s where kkf_private.can_read_user(s.user_id) and s.started_at<=v_snapshot
    and strpos(lower(s.email||' '||s.display_name),lower(p_search))>0
    and (p_from is null or s.started_at>=p_from) and (p_to is null or s.started_at<p_to)
    and (p_teacher is null or exists(select 1 from kkf_private.assignments a join kkf_private.people p on p.email=a.student_email
      where a.teacher_id=p_teacher and p.user_id=s.user_id))
    order by s.started_at desc,s.id limit 25 offset p_offset) s;
  return jsonb_build_object('items',v_items,'total',v_total,'snapshot_at',v_snapshot);
end;
$$;
create or replace function public.kkf_review_history(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.kkf_sessions s where s.id=p_session_id and kkf_private.can_read_user(s.user_id)) then
    raise exception 'Session not found.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'question_id',question_id,'reviewer_name',reviewer_name,
  'checks',checks,'feedback',feedback,'reviewed_at',reviewed_at) order by reviewed_at desc,id)
  from kkf_private.review_history where session_id=p_session_id),'[]'::jsonb);
end;
$$;
drop function if exists public.kkf_teacher_review(uuid,text,boolean[],text);
drop function if exists public.kkf_teacher_review(uuid,text,boolean[],text,bigint,uuid);
create function public.kkf_teacher_review(p_session_id uuid,p_question_id text,p_checks boolean[],p_feedback text default '',
p_expected_version bigint default null,p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.kkf_attempts; h kkf_private.review_history; n text;
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() or not exists(select 1 from public.kkf_sessions s
    where s.id=p_session_id and kkf_private.can_read_user(s.user_id)) then
    raise exception 'Teacher access to this student is required.' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_version is null then raise exception 'Refresh this page before saving a review.'; end if;
  if p_checks is null or array_ndims(p_checks)<>1 or cardinality(p_checks)<>2 or array_position(p_checks,null) is not null
    or p_feedback is null or length(p_feedback)>1000 then raise exception 'Review both criteria; feedback must be at most 1000 characters.'; end if;
  select * into a from public.kkf_attempts where session_id=p_session_id and question_id=p_question_id for update;
  if not found or a.finished_at is null then raise exception 'This activity is not finished yet.'; end if;
  if a.auto_checks is not null then raise exception 'Calculation results are marked automatically.'; end if;
  select * into h from kkf_private.review_history where id=p_request_id;
  if found then
    if h.reviewer_id<>auth.uid() or h.session_id<>p_session_id or h.question_id<>p_question_id or h.checks<>p_checks or h.feedback<>p_feedback then
      raise exception 'This review request was already used.';
    end if;
    return to_jsonb(a);
  end if;
  if a.review_version<>p_expected_version then raise exception 'Another review was saved. Refresh the report before reviewing again.' using errcode='40001'; end if;
  select coalesce(nullif(display_name,''),'KKF Academy teacher') into n from kkf_private.people where user_id=auth.uid();
  insert into kkf_private.review_history(id,session_id,question_id,reviewer_id,reviewer_name,checks,feedback)
  values(p_request_id,p_session_id,p_question_id,auth.uid(),coalesce(n,'KKF Academy teacher'),p_checks,p_feedback);
  update public.kkf_attempts set teacher_checks=p_checks,teacher_feedback=p_feedback,teacher_reviewed_at=clock_timestamp(),
    teacher_reviewed_by=auth.uid(),review_version=review_version+1 where session_id=p_session_id and question_id=p_question_id returning * into a;
  return to_jsonb(a);
end;
$$;

-- Admin directory is readable only by a currently active Super Admin.
create or replace function public.kkf_admin_people(p_search text default '',p_role text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; total integer; teachers jsonb;
begin
  if not kkf_private.is_super_admin() then raise exception 'Super Admin access required.' using errcode='42501'; end if;
  if p_search is null or length(p_search)>254 or p_role is null or p_role not in ('','teacher','student') or p_offset is null or p_offset<0 then raise exception 'Invalid user filter.'; end if;
  select count(*) into total from kkf_private.people p where (p_role='' or p.role=p_role) and strpos(lower(p.email||' '||p.display_name),lower(p_search))>0;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.email),'[]'::jsonb) into rows from (
    select p.email,p.user_id,p.role,p.display_name,p.year_group,p.active,p.revision,p.invitation_status,p.last_invite_attempt,p.invited_at,p.created_at,
    u.email_confirmed_at,u.last_sign_in_at,exists(select 1 from kkf_private.super_admins a where a.user_id=p.user_id) as is_super_admin,
    coalesce((select jsonb_agg(a.teacher_id order by a.teacher_id) from kkf_private.assignments a where a.student_email=p.email),'[]'::jsonb) as teacher_ids,
    coalesce((select jsonb_agg(jsonb_build_object('email',sp.email,'display_name',sp.display_name) order by sp.email)
      from kkf_private.assignments a join kkf_private.people sp on sp.email=a.student_email where a.teacher_id=p.user_id),'[]'::jsonb) as assigned_students
    from kkf_private.people p left join auth.users u on u.id=p.user_id
    where (p_role='' or p.role=p_role) and strpos(lower(p.email||' '||p.display_name),lower(p_search))>0
    order by p.email limit 25 offset p_offset
  ) r;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'email',email,'display_name',display_name,'active',active) order by display_name,email),'[]'::jsonb)
  into teachers from kkf_private.people where role='teacher' and user_id is not null;
  return jsonb_build_object('items',rows,'total',total,'teachers',teachers);
end;
$$;
create or replace function public.kkf_admin_audit(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not kkf_private.is_super_admin() then raise exception 'Super Admin access required.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 then raise exception 'Invalid page.'; end if;
  return jsonb_build_object('total',(select count(*) from kkf_private.admin_audit),'items',coalesce((
    select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc) from (
      select a.id,a.action,a.target_email,a.details,a.created_at,coalesce(nullif(p.display_name,''),p.email,'Former administrator') as actor_name
      from kkf_private.admin_audit a left join kkf_private.people p on p.user_id=a.actor_id order by a.created_at desc,a.id desc limit 25 offset p_offset
    ) r),'[]'::jsonb));
end;
$$;

-- This single service-only RPC is called by the Edge Function after getUser(jwt).
-- It rechecks the authenticated actor's current database role on every action.
create or replace function public.kkf_admin_service(p_actor uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p kkf_private.people; u auth.users; e text:=lower(btrim(p_data->>'email')); r text:=p_data->>'role';
 n text:=btrim(coalesce(p_data->>'display_name','')); y text:=btrim(coalesce(p_data->>'year_group',''));
 ids uuid[]; v_id uuid; created boolean:=false; rev bigint; token uuid;
begin
  if not exists(select 1 from kkf_private.super_admins a join kkf_private.people m on m.user_id=a.user_id
    join auth.users au on au.id=a.user_id where a.user_id=p_actor and m.active and au.email_confirmed_at is not null) then
    raise exception 'Super Admin access required.' using errcode='42501';
  end if;
  if p_action='authorize' then return jsonb_build_object('authorized',true); end if;
  if e is null or length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(e,0));
  select * into p from kkf_private.people where email=e for update;
  select * into u from auth.users where lower(email)=e;
  if p_action='lookup' then
    return jsonb_build_object('person',case when p.email is null then null else to_jsonb(p)-'invite_token' end,
      'auth_user_id',u.id,'email_confirmed',u.email_confirmed_at is not null);
  end if;
  if p_action in ('validate','register','update') then
    if r not in ('teacher','student') or r is null then raise exception 'Choose Teacher or Student.'; end if;
    if length(n)=0 or length(n)>80 or length(y)>30 then raise exception 'Enter a name up to 80 characters and year group up to 30 characters.'; end if;
    if jsonb_typeof(coalesce(p_data->'teacher_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'teacher_ids','[]'::jsonb))>100 then raise exception 'Invalid teacher assignments.'; end if;
    select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(coalesce(p_data->'teacher_ids','[]'::jsonb)) t(v);
    if r='teacher' and cardinality(ids)>0 then raise exception 'Teachers cannot be assigned as students.'; end if;
    if exists(select 1 from unnest(ids) i where not exists(select 1 from kkf_private.people t where t.user_id=i and t.role='teacher')) then raise exception 'Choose existing teachers.'; end if;
    if p.email is not null and p.role<>r then raise exception 'This email already has a different role. Use a separate account or contact the project owner.' using errcode='23505'; end if;
    if p_action='validate' then return jsonb_build_object('auth_user_id',u.id,'email_confirmed',u.email_confirmed_at is not null,'exists',p.email is not null); end if;
    if p_action='register' then
      v_id:=(p_data->>'user_id')::uuid;
      if v_id is null or u.id is null or u.id<>v_id then raise exception 'The account identity could not be verified.'; end if;
      if p.email is null then
        insert into kkf_private.people(email,user_id,role,display_name,year_group,created_by,invitation_status)
        values(e,v_id,r,n,case when r='student' then y else '' end,p_actor,case when u.email_confirmed_at is null then 'not_sent' else 'existing_account' end) returning * into p;
        insert into kkf_private.assignments(student_email,teacher_id,assigned_by) select e,i,p_actor from unnest(ids) i;
        insert into kkf_private.admin_audit(actor_id,action,target_email,details) values(p_actor,'account_registered',e,jsonb_build_object('role',r,'teacher_ids',ids));
        created:=true;
      elsif p.user_id is null then
        update kkf_private.people set user_id=v_id,updated_at=now(),revision=revision+1 where email=e returning * into p;
      elsif p.user_id<>v_id then raise exception 'This email is linked to a different account.';
      end if;
      return jsonb_build_object('created',created,'email',e,'user_id',p.user_id,'active',p.active,'email_confirmed',u.email_confirmed_at is not null,'invitation_status',p.invitation_status);
    end if;
    if p.email is null then raise exception 'Account not found.'; end if;
    rev:=(p_data->>'revision')::bigint;
    if rev is null or rev<>p.revision then raise exception 'This account changed. Refresh before saving.' using errcode='40001'; end if;
    if exists(select 1 from kkf_private.super_admins s where s.user_id=p.user_id) and p_data->>'active'='false' then raise exception 'Super Admin access cannot be disabled here.' using errcode='42501'; end if;
    if jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'Choose an access status.'; end if;
    update kkf_private.people set display_name=n,year_group=case when role='student' then y else '' end,
      active=(p_data->>'active')::boolean,revision=revision+1,updated_at=now() where email=e returning * into p;
    if r='student' then
      delete from kkf_private.assignments where student_email=e and not (teacher_id=any(ids));
      insert into kkf_private.assignments(student_email,teacher_id,assigned_by) select e,i,p_actor from unnest(ids) i on conflict do nothing;
    end if;
    insert into kkf_private.admin_audit(actor_id,action,target_email,details) values(p_actor,'account_updated',e,
      jsonb_build_object('active',p.active,'display_name',n,'year_group',y,'teacher_ids',ids));
    return jsonb_build_object('updated',true,'email',e);
  end if;
  if p.email is null or p.user_id is null then raise exception 'Account setup is incomplete. Use Create and invite to finish it.'; end if;
  if not p.active then raise exception 'Reactivate this account before sending an invitation.'; end if;
  if p_action='reserve_invitation' then
    if u.email_confirmed_at is not null then return jsonb_build_object('send',false,'reason','existing_account'); end if;
    if p.last_invite_attempt is not null and p.last_invite_attempt>now()-interval '60 seconds' then
      return jsonb_build_object('send',false,'reason','cooldown');
    end if;
    token:=gen_random_uuid();
    update kkf_private.people set last_invite_attempt=clock_timestamp(),invitation_status='sending',invite_token=token where email=e;
    return jsonb_build_object('send',true,'token',token,'user_id',p.user_id);
  end if;
  if p_action='invitation_result' then
    if p.invite_token is null or p.invite_token is distinct from (p_data->>'token')::uuid then raise exception 'Invitation state changed. Refresh the account list.' using errcode='40001'; end if;
    if p_data->>'status' not in ('sent','retry_needed','existing_account') then raise exception 'Invalid invitation result.'; end if;
    update kkf_private.people set invitation_status=p_data->>'status',invite_token=null,
      invited_at=case when p_data->>'status'='sent' then clock_timestamp() else invited_at end where email=e;
    insert into kkf_private.admin_audit(actor_id,action,target_email) values(p_actor,'invitation_'||(p_data->>'status'),e);
    return jsonb_build_object('recorded',true);
  end if;
  raise exception 'Unknown account action.';
end;
$$;

-- Private data remains unreachable through direct browser table calls.
alter table kkf_private.people enable row level security;
alter table kkf_private.super_admins enable row level security;
alter table kkf_private.assignments enable row level security;
alter table kkf_private.admin_audit enable row level security;
alter table kkf_private.review_history enable row level security;
revoke all on all tables in schema kkf_private from public,anon,authenticated;
revoke all on all sequences in schema kkf_private from public,anon,authenticated;
revoke all on all functions in schema kkf_private from public,anon,authenticated;
revoke all on function public.kkf_can_read_user(uuid),public.kkf_review_history(uuid),
 public.kkf_report(text,integer,timestamptz,uuid,timestamptz,timestamptz),
 public.kkf_teacher_review(uuid,text,boolean[],text,bigint,uuid),public.kkf_admin_people(text,text,integer),
 public.kkf_admin_audit(integer),public.kkf_admin_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kkf_can_read_user(uuid),public.kkf_review_history(uuid),
 public.kkf_report(text,integer,timestamptz,uuid,timestamptz,timestamptz),
 public.kkf_teacher_review(uuid,text,boolean[],text,bigint,uuid),public.kkf_admin_people(text,text,integer),
 public.kkf_admin_audit(integer) to authenticated;
grant execute on function public.kkf_admin_service(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
