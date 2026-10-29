-- Read-only checks after 05-super-admin.sql and 06-bootstrap-super-admin.sql.
select count(*) as question_count from kkf_private.questions where quiz_version='kkf-v1';
select count(*) as session_count from public.kkf_sessions;
select count(*) as saved_answer_count from public.kkf_attempts;
select count(*) as super_admin_count from kkf_private.super_admins;
select role,active,count(*) as account_count from kkf_private.people group by role,active order by role,active;
select count(*) as unassigned_student_count from kkf_private.people p where p.role='student'
and not exists(select 1 from kkf_private.assignments a where a.student_email=p.email);
select has_function_privilege('authenticated','public.kkf_admin_service(uuid,text,jsonb)','EXECUTE') as browser_can_call_privileged_admin_rpc,
has_function_privilege('authenticated','public.kkf_set_student(text,text,boolean)','EXECUTE') as browser_can_use_old_registration;
-- Both privilege values above must be false.
select tablename,policyname,qual from pg_policies where schemaname='public' and tablename in ('kkf_sessions','kkf_attempts');
