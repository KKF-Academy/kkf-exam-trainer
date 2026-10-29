-- Read-only installation checks. Run in the SQL Editor after setup.
select count(*) as expected_eight_questions from kkf_private.questions where quiz_version='kkf-v1';
select u.email as teacher_email from kkf_private.teachers t join auth.users u on u.id=t.user_id;
select tablename,rowsecurity from pg_tables where schemaname='public' and tablename in ('kkf_sessions','kkf_attempts');
select has_table_privilege('authenticated','public.kkf_attempts','UPDATE') as must_be_false,
       has_table_privilege('authenticated','public.kkf_sessions','INSERT') as must_also_be_false;
select email,display_name,active from kkf_private.students order by email;
select email,started_at,completed_at from public.kkf_sessions order by started_at desc limit 20;
