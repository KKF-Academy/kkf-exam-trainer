-- KKF Academy pilot backend. Run once in a NEW Supabase project's SQL Editor.
-- Re-running the full file is not a migration strategy; it deliberately fails on existing tables.
begin;
create schema kkf_private;
revoke all on schema kkf_private from public, anon, authenticated;

create table kkf_private.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table kkf_private.students (
  email text primary key check(email = lower(btrim(email))),
  display_name text not null default '' check(length(display_name) <= 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table kkf_private.questions (
  quiz_version text not null,
  question_id text not null,
  position integer not null check(position between 1 and 8),
  subject text not null,
  command text not null check(command in ('Explain','Describe','Calculate','Compare')),
  topic text not null,
  topic_options jsonb not null,
  question text not null,
  model text not null,
  criteria jsonb not null,
  expected numeric,
  unit text,
  primary key(quiz_version,question_id),
  unique(quiz_version,position)
);
create table public.kkf_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  quiz_version text not null check(quiz_version = 'kkf-v1'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notice_version text not null default '2026-10-20'
);
create index kkf_sessions_user_date on public.kkf_sessions(user_id,started_at desc);
create table public.kkf_attempts (
  session_id uuid not null references public.kkf_sessions(id) on delete cascade,
  question_id text not null,
  selected_command text not null,
  selected_topic text not null,
  command_correct boolean not null,
  topic_correct boolean not null,
  identified_at timestamptz not null default now(),
  answer text not null default '' check(length(answer) <= 1600),
  numeric_value text not null default '' check(length(numeric_value) <= 30),
  unit text not null default '',
  submitted_at timestamptz,
  self_checks boolean[] not null default array[false,false],
  auto_checks boolean[],
  finished_at timestamptz,
  teacher_checks boolean[],
  teacher_feedback text not null default '' check(length(teacher_feedback) <= 1000),
  teacher_reviewed_at timestamptz,
  teacher_reviewed_by uuid references auth.users(id) on delete set null,
  primary key(session_id,question_id),
  check(array_ndims(self_checks)=1 and cardinality(self_checks)=2 and array_position(self_checks,null) is null),
  check(auto_checks is null or (array_ndims(auto_checks)=1 and cardinality(auto_checks)=2 and array_position(auto_checks,null) is null)),
  check(teacher_checks is null or (array_ndims(teacher_checks)=1 and cardinality(teacher_checks)=2 and array_position(teacher_checks,null) is null))
);

create function kkf_private.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from kkf_private.teachers where user_id=auth.uid());
$$;
create function kkf_private.member_email() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_email text;
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Please sign in with a verified email.' using errcode='42501'; end if;
  if not kkf_private.is_teacher() and not exists(select 1 from kkf_private.students where email=v_email and active) then
    raise exception 'This email is not registered for KKF Academy. Ask your tutor for access.' using errcode='42501';
  end if;
  return v_email;
end;
$$;
create function public.kkf_has_access() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform kkf_private.member_email(); return true;
exception when insufficient_privilege then return false;
end;
$$;
create function public.kkf_is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select kkf_private.is_teacher() and public.kkf_has_access();
$$;
create function public.kkf_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_name text;
begin
  v_email := kkf_private.member_email();
  select display_name into v_name from kkf_private.students where email=v_email;
  return jsonb_build_object('id',auth.uid(),'email',v_email,'display_name',coalesce(v_name,''),'is_teacher',kkf_private.is_teacher());
end;
$$;

alter table public.kkf_sessions enable row level security;
alter table public.kkf_attempts enable row level security;
revoke all on public.kkf_sessions,public.kkf_attempts from public,anon,authenticated;
grant select on public.kkf_sessions,public.kkf_attempts to authenticated;
create policy kkf_read_sessions on public.kkf_sessions for select to authenticated
using(public.kkf_has_access() and (user_id=(select auth.uid()) or public.kkf_is_teacher()));
create policy kkf_read_attempts on public.kkf_attempts for select to authenticated
using(exists(select 1 from public.kkf_sessions s where s.id=session_id));

create function kkf_private.lock_session(p_id uuid) returns public.kkf_sessions
language plpgsql security definer set search_path = '' as $$
declare s public.kkf_sessions;
begin
  perform kkf_private.member_email();
  select * into s from public.kkf_sessions where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Session not found.' using errcode='42501'; end if;
  return s;
end;
$$;
create function public.kkf_start_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_name text; s public.kkf_sessions;
begin
  v_email:=kkf_private.member_email();
  select display_name into v_name from kkf_private.students where email=v_email;
  insert into public.kkf_sessions(id,user_id,email,display_name,quiz_version)
    values(p_id,auth.uid(),v_email,coalesce(v_name,''),'kkf-v1') on conflict(id) do nothing;
  s:=kkf_private.lock_session(p_id); return to_jsonb(s);
end;
$$;
create function public.kkf_identify(p_session_id uuid,p_question_id text,p_command text,p_topic text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.kkf_sessions; q kkf_private.questions; a public.kkf_attempts; n integer;
begin
  s:=kkf_private.lock_session(p_session_id);
  select * into a from public.kkf_attempts where session_id=s.id and question_id=p_question_id;
  if found then return to_jsonb(a); end if; -- first submission is immutable; retries are safe
  if s.completed_at is not null then raise exception 'This session is complete.'; end if;
  select * into q from kkf_private.questions where quiz_version=s.quiz_version and question_id=p_question_id;
  if not found then raise exception 'Unknown question version.'; end if;
  select count(*) into n from public.kkf_attempts where session_id=s.id and finished_at is not null;
  if q.position<>n+1 then raise exception 'Complete the current activity first.'; end if;
  if p_command is null or p_command not in ('Explain','Describe','Calculate','Compare') or p_topic is null or not q.topic_options ? p_topic then
    raise exception 'Choose a command word and a topic.';
  end if;
  insert into public.kkf_attempts(session_id,question_id,selected_command,selected_topic,command_correct,topic_correct)
  values(s.id,q.question_id,p_command,p_topic,p_command=q.command,p_topic=q.topic) returning * into a;
  return to_jsonb(a);
end;
$$;
create function public.kkf_submit_answer(p_session_id uuid,p_question_id text,p_answer text,p_numeric text default '',p_unit text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.kkf_sessions; q kkf_private.questions; a public.kkf_attempts; v_num numeric; v_checks boolean[];
begin
  s:=kkf_private.lock_session(p_session_id);
  select * into a from public.kkf_attempts where session_id=s.id and question_id=p_question_id;
  if not found then raise exception 'Identify the command and topic first.'; end if;
  if a.submitted_at is not null then return to_jsonb(a); end if;
  if p_answer is null or length(btrim(p_answer))=0 or length(p_answer)>1600 then raise exception 'Write an answer or working (maximum 1600 characters).'; end if;
  select * into q from kkf_private.questions where quiz_version=s.quiz_version and question_id=p_question_id;
  if q.command='Calculate' then
    if p_numeric is null or length(p_numeric)>30 or btrim(p_numeric) !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' or p_unit is null or p_unit not in ('none','m/s2','m/s','N','kg') then
      raise exception 'Enter a numerical result and choose a unit.';
    end if;
    begin v_num:=btrim(p_numeric)::numeric;
    exception when numeric_value_out_of_range or invalid_text_representation then raise exception 'Enter a finite numerical result.'; end;
    v_checks:=array[abs(v_num-q.expected)<0.000001,p_unit=q.unit];
  end if;
  update public.kkf_attempts set answer=p_answer,numeric_value=case when q.command='Calculate' then p_numeric else '' end,
    unit=case when q.command='Calculate' then p_unit else '' end,auto_checks=v_checks,submitted_at=now()
    where session_id=s.id and question_id=p_question_id returning * into a;
  return to_jsonb(a);
end;
$$;
create function public.kkf_finish_activity(p_session_id uuid,p_question_id text,p_self_checks boolean[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.kkf_sessions; a public.kkf_attempts; n integer;
begin
  s:=kkf_private.lock_session(p_session_id);
  select * into a from public.kkf_attempts where session_id=s.id and question_id=p_question_id;
  if not found or a.submitted_at is null then raise exception 'Submit an answer first.'; end if;
  if a.finished_at is not null then return to_jsonb(a); end if;
  if p_self_checks is null or array_ndims(p_self_checks)<>1 or cardinality(p_self_checks)<>2 or array_position(p_self_checks,null) is not null then raise exception 'Review both answer criteria.'; end if;
  update public.kkf_attempts set self_checks=case when auto_checks is null then p_self_checks else array[false,false] end,finished_at=now()
    where session_id=s.id and question_id=p_question_id returning * into a;
  select count(*) into n from public.kkf_attempts where session_id=s.id and finished_at is not null;
  if n=8 then update public.kkf_sessions set completed_at=now() where id=s.id; end if;
  return to_jsonb(a);
end;
$$;
create function public.kkf_teacher_review(p_session_id uuid,p_question_id text,p_checks boolean[],p_feedback text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.kkf_attempts;
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() then raise exception 'Teacher access required.' using errcode='42501'; end if;
  if p_checks is null or array_ndims(p_checks)<>1 or cardinality(p_checks)<>2 or array_position(p_checks,null) is not null or p_feedback is null or length(p_feedback)>1000 then raise exception 'Review both criteria; feedback must be at most 1000 characters.'; end if;
  select * into a from public.kkf_attempts where session_id=p_session_id and question_id=p_question_id for update;
  if not found or a.finished_at is null then raise exception 'This activity is not finished yet.'; end if;
  if a.auto_checks is not null then raise exception 'Calculation results are marked automatically.'; end if;
  update public.kkf_attempts set teacher_checks=p_checks,teacher_feedback=p_feedback,teacher_reviewed_at=now(),teacher_reviewed_by=auth.uid()
    where session_id=p_session_id and question_id=p_question_id returning * into a;
  return to_jsonb(a);
end;
$$;
create function public.kkf_roster() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() then raise exception 'Teacher access required.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.email) from (select s.*,u.id is not null as has_account,u.last_sign_in_at from kkf_private.students s left join auth.users u on lower(u.email)=s.email) r),'[]'::jsonb);
end;
$$;
create function public.kkf_set_student(p_email text,p_display_name text default '',p_active boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare e text:=lower(btrim(p_email));
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() then raise exception 'Teacher access required.' using errcode='42501'; end if;
  if e is null or length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_display_name is null or length(p_display_name)>80 or p_active is null then raise exception 'Enter a valid email and a name of at most 80 characters.'; end if;
  insert into kkf_private.students(email,display_name,active) values(e,btrim(p_display_name),p_active)
    on conflict(email) do update set display_name=excluded.display_name,active=excluded.active;
end;
$$;
create function public.kkf_report(p_search text default '',p_offset integer default 0,p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb; v_total integer; v_snapshot timestamptz:=coalesce(p_before,now());
begin
  perform kkf_private.member_email();
  if not kkf_private.is_teacher() then raise exception 'Teacher access required.' using errcode='42501'; end if;
  if p_search is null or length(p_search)>254 or p_offset is null or p_offset<0 then raise exception 'Invalid report filter.'; end if;
  select count(*) into v_total from public.kkf_sessions where started_at<=v_snapshot and strpos(lower(email||' '||display_name),lower(p_search))>0;
  select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.identified_at) from public.kkf_attempts a where a.session_id=s.id),'[]'::jsonb)) order by s.started_at desc,s.id),'[]'::jsonb)
    into v_items from (select * from public.kkf_sessions where started_at<=v_snapshot and strpos(lower(email||' '||display_name),lower(p_search))>0 order by started_at desc,id limit 25 offset p_offset) s;
  return jsonb_build_object('items',v_items,'total',v_total,'snapshot_at',v_snapshot);
end;
$$;

-- Revoke default function execution; grant only the public application API.
revoke all on all tables in schema kkf_private from public,anon,authenticated;
revoke all on all functions in schema kkf_private from public,anon,authenticated;
revoke all on function public.kkf_has_access(),public.kkf_is_teacher(),public.kkf_profile(),public.kkf_start_session(uuid),public.kkf_identify(uuid,text,text,text),public.kkf_submit_answer(uuid,text,text,text,text),public.kkf_finish_activity(uuid,text,boolean[]),public.kkf_teacher_review(uuid,text,boolean[],text),public.kkf_roster(),public.kkf_set_student(text,text,boolean),public.kkf_report(text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.kkf_has_access(),public.kkf_is_teacher(),public.kkf_profile(),public.kkf_start_session(uuid),public.kkf_identify(uuid,text,text,text),public.kkf_submit_answer(uuid,text,text,text,text),public.kkf_finish_activity(uuid,text,boolean[]),public.kkf_teacher_review(uuid,text,boolean[],text),public.kkf_roster(),public.kkf_set_student(text,text,boolean),public.kkf_report(text,integer,timestamptz) to authenticated;
commit;
