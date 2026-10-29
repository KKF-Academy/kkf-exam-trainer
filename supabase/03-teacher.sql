-- Run after adding/inviting your own account under Supabase Authentication > Users.
-- Replace the ONE email below with the email you will use to sign in as a teacher.
-- This SQL is run only in the Supabase SQL Editor by the project owner.
do $$
declare
  v_email text := 'REPLACE_WITH_YOUR_TEACHER_EMAIL';
  v_user_id uuid;
begin
  if to_regclass('kkf_private.people') is not null then
    raise exception 'This project uses Super Admin account management. Register teachers in the app.';
  end if;
  select id into v_user_id from auth.users where lower(email)=lower(btrim(v_email));
  if v_user_id is null then
    raise exception 'No Auth account found. Invite this email in Authentication > Users first, then run this script again.';
  end if;
  insert into kkf_private.teachers(user_id) values(v_user_id) on conflict(user_id) do nothing;
end;
$$;
