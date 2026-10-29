-- Run once after 05-super-admin.sql. Use your EXISTING verified teacher email.
-- This is the only manual role bootstrap; subsequent registrations happen in the app.
do $$
declare
  v_email text:=lower(btrim('REPLACE_WITH_YOUR_EXISTING_TEACHER_EMAIL'));
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email)=v_email and email_confirmed_at is not null;
  if v_id is null then raise exception 'Use the email of your existing verified teacher account.'; end if;
  if not exists(select 1 from kkf_private.people where user_id=v_id and role='teacher' and active) then
    raise exception 'That account must already be an active teacher.';
  end if;
  insert into kkf_private.super_admins(user_id) values(v_id) on conflict do nothing;
end;
$$;
