import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const root="10000000-0000-4000-8000-000000000001", ta="10000000-0000-4000-8000-000000000002",
tb="10000000-0000-4000-8000-000000000003", alice="20000000-0000-4000-8000-000000000001",
bob="20000000-0000-4000-8000-000000000002", outsider="30000000-0000-4000-8000-000000000001";
const sa="a0000000-0000-4000-8000-000000000001", sb="a0000000-0000-4000-8000-000000000002";
const call = async (name, values=[]) => (await db.query("select to_jsonb(public."+name+"("+values.map((_,i)=>"$"+(i+1)).join(",")+")) as result",values)).rows[0].result;
async function as(id, role="authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||""]);
  await db.exec("set role "+role);
}
async function service(action,data={},actor=root) { await as(null,"service_role");return call("kkf_admin_service",[actor,action,data]); }
const input=(email,role="student",teacher_ids=[])=>({email,role,display_name:"New person",year_group:"Year 10",teacher_ids});
before(async()=>{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;");
  await db.exec(await readFile(new URL("../supabase/01-schema.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/02-questions.sql",import.meta.url),"utf8"));
  const users=[[root,"root@example.com"],[ta,"a.teacher@example.com"],[tb,"b.teacher@example.com"],[alice,"alice@example.com"],[bob,"bob@example.com"],[outsider,"outsider@example.com"]];
  for(const [id,email]of users)await db.query("insert into auth.users values($1,$2,now(),now())",[id,email]);
  for(const id of [root,ta,tb])await db.query("insert into kkf_private.teachers values($1)",[id]);
  await db.exec("insert into kkf_private.students(email,display_name) values('alice@example.com','Alice'),('bob@example.com','Bob'),('pending@example.com','Pending');");
  for(const [id,session]of [[alice,sa],[bob,sb]]){
    await as(id);await call("kkf_start_session",[session]);await call("kkf_identify",[session,"heat-transfer","Explain","heat transfer"]);
    await call("kkf_submit_answer",[session,"heat-transfer","Air is a poor conductor so transfer is slower.","",""]);
    await call("kkf_finish_activity",[session,"heat-transfer",[true,true]]);
  }
  await as(ta);await call("kkf_teacher_review",[sa,"heat-transfer",[true,false],"Legacy feedback."]);
  await db.exec("reset role");
  const migration=await readFile(new URL("../supabase/05-super-admin.sql",import.meta.url),"utf8");
  await db.exec(migration);
  // Rerunning the upgrade must not delete, duplicate or broaden anything.
  await db.exec(migration);
  await db.query("insert into kkf_private.super_admins(user_id) values($1)",[root]);
});
after(()=>db.close());
test("upgrade preserves Auth identities, completed answers and the legacy teacher review",async()=>{
  await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int n from auth.users")).rows[0].n,6);
  assert.equal((await db.query("select count(*)::int n from kkf_private.people")).rows[0].n,6);
  assert.equal((await db.query("select count(*)::int n from public.kkf_attempts")).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from kkf_private.review_history")).rows[0].n,1);
  await as(root);assert.equal((await call("kkf_profile")).is_super_admin,true);
  assert.equal((await call("kkf_report")).total,2);
});
test("unassigned teachers cannot read historical sessions, attempt rows, reports or the roster",async()=>{
  await as(ta);
  assert.equal((await db.query("select * from public.kkf_sessions")).rows.length,0);
  assert.equal((await db.query("select * from public.kkf_attempts")).rows.length,0);
  assert.equal((await call("kkf_report",["alice",0])).total,0);
  assert.deepEqual(await call("kkf_roster"),[]);
  await assert.rejects(()=>call("kkf_review_history",[sa]),/not found/);
  await assert.rejects(()=>call("kkf_teacher_review",[sa,"heat-transfer",[true,true],"",0,crypto.randomUUID()]),/access/);
});
test("teachers and students cannot provision, self-promote or inspect admin data",async()=>{
  for(const id of [ta,alice,outsider]){
    await as(id);
    await assert.rejects(()=>call("kkf_admin_service",[root,"authorize",{}]),/permission denied/);
    await assert.rejects(()=>call("kkf_admin_people"),/Super Admin/);
    await assert.rejects(()=>call("kkf_admin_audit"),/Super Admin/);
    await assert.rejects(()=>call("kkf_set_student",["new@example.com","New",true]),/permission denied/);
    await assert.rejects(()=>db.query("insert into kkf_private.super_admins(user_id) values($1)",[id]),/permission denied/);
  }
  await as(null,"anon");await assert.rejects(()=>call("kkf_profile"),/permission denied/);
  await assert.rejects(()=>service("authorize",{},ta),/Super Admin/);
});
test("one student can have multiple teachers, with independent assignment scope",async()=>{
  let p;
  await as(root);p=(await call("kkf_admin_people",["alice","",0])).items[0];
  await service("update",{...input(p.email),display_name:p.display_name,active:true,revision:p.revision,teacher_ids:[ta,tb]});
  for(const id of [ta,tb]){
    await as(id);assert.equal((await call("kkf_report")).total,1);
    assert.equal((await db.query("select * from public.kkf_sessions")).rows[0].id,sa);
    assert.equal((await db.query("select * from public.kkf_attempts")).rows.length,1);
    assert.equal((await call("kkf_roster"))[0].email,"alice@example.com");
  }
  await as(root);assert.equal((await call("kkf_report")).total,2);
  assert.equal((await call("kkf_report",["",0,null,tb])).total,1);
  await as(ta);await assert.rejects(()=>call("kkf_report",["",0,null,tb]),/Super Admin/);
});
test("named review history and version checks prevent silent overwrites and duplicate retries",async()=>{
  const requestId=crypto.randomUUID();
  await as(ta);
  const first=await call("kkf_teacher_review",[sa,"heat-transfer",[true,true],"Updated review.",0,requestId]);
  assert.equal(first.review_version,1);
  assert.equal((await call("kkf_teacher_review",[sa,"heat-transfer",[true,true],"Updated review.",0,requestId])).review_version,1);
  await as(tb);
  await assert.rejects(()=>call("kkf_teacher_review",[sa,"heat-transfer",[false,false],"Stale review.",0,crypto.randomUUID()]),/Another review/);
  await call("kkf_teacher_review",[sa,"heat-transfer",[true,false],"Second teacher's review.",1,crypto.randomUUID()]);
  await as(alice);
  const history=await call("kkf_review_history",[sa]);
  assert.equal(history.length,3);
  assert(history.every(h=>h.reviewer_name&&h.reviewed_at));
  await as(bob);await assert.rejects(()=>call("kkf_review_history",[sa]),/not found/);
});
test("removing an assignment cuts every read/review path without deleting results",async()=>{
  await as(root);
  const p=(await call("kkf_admin_people",["alice","",0])).items[0];
  await service("update",{...input(p.email),display_name:p.display_name,active:true,revision:p.revision,teacher_ids:[tb]});
  await as(ta);
  assert.equal((await call("kkf_report")).total,0);
  assert.equal((await db.query("select * from public.kkf_attempts")).rows.length,0);
  await assert.rejects(()=>call("kkf_teacher_review",[sa,"heat-transfer",[true,true],"Denied",2,crypto.randomUUID()]),/access/);
  await as(tb);assert.equal((await call("kkf_report")).total,1);
  await as(root);assert.equal((await call("kkf_report")).total,2);
});
test("disabled students lose their own access, while retained results remain visible to assigned staff",async()=>{
  await as(root);const p=(await call("kkf_admin_people",["alice","",0])).items[0];
  await service("update",{...input(p.email),display_name:p.display_name,active:false,revision:p.revision,teacher_ids:[tb]});
  await as(alice);await assert.rejects(()=>call("kkf_profile"),/not active/);
  assert.equal((await db.query("select * from public.kkf_sessions")).rows.length,0);
  await as(tb);assert.equal((await call("kkf_report")).total,1);
  await as(root);
  const q=(await call("kkf_admin_people",["alice","",0])).items[0];
  await service("update",{...input(q.email),display_name:q.display_name,active:true,revision:q.revision,teacher_ids:[tb]});
});
test("disabled teachers lose access and a Super Admin cannot disable their own access",async()=>{
  await as(root);let p=(await call("kkf_admin_people",["b.teacher","",0])).items[0];
  await service("update",{...input(p.email,"teacher"),display_name:"Teacher B",active:false,revision:p.revision});
  await as(tb);await assert.rejects(()=>call("kkf_profile"),/not active/);
  assert.equal((await db.query("select * from public.kkf_attempts")).rows.length,0);
  await as(root);p=(await call("kkf_admin_people",["root","",0])).items[0];
  await assert.rejects(()=>service("update",{...input(p.email,"teacher"),display_name:"Root",active:false,revision:p.revision}),/cannot be disabled/);
});
test("provisioning reuses identity and preserves an existing profile on retries",async()=>{
  const id="40000000-0000-4000-8000-000000000001", email="new@example.com";
  assert.equal((await service("validate",input(email,"student",[ta]))).auth_user_id,null);
  await db.exec("reset role");await db.query("insert into auth.users(id,email) values($1,$2)",[id,email]);
  const created=await service("register",{...input(email,"student",[ta]),user_id:id});
  assert.equal(created.created,true);
  assert.equal((await service("register",{...input(email,"student",[]),display_name:"Changed on retry",user_id:id})).created,false);
  await as(root);let p=(await call("kkf_admin_people",[email,"",0])).items[0];
  assert.equal(p.display_name,"New person");assert.deepEqual(p.teacher_ids,[ta]);
  await assert.rejects(()=>service("validate",input(email,"teacher")),/different role/);
  await assert.rejects(()=>service("validate",input("badrole@example.com","super_admin")),/Teacher or Student/);
  await assert.rejects(()=>service("validate",input("badteacher@example.com","student",[alice])),/existing teachers/);
});
test("invitation reservation serializes retries and only its matching result can update status",async()=>{
  const email="new@example.com";
  const reserved=await service("reserve_invitation",{email});
  assert.equal(reserved.send,true);
  assert.equal((await service("reserve_invitation",{email})).reason,"cooldown");
  await assert.rejects(()=>service("invitation_result",{email,token:crypto.randomUUID(),status:"sent"}),/state changed/);
  await service("invitation_result",{email,token:reserved.token,status:"retry_needed"});
  await as(root);const p=(await call("kkf_admin_people",[email,"",0])).items[0];
  assert.equal(p.invitation_status,"retry_needed");
  assert.equal(p.user_id,"40000000-0000-4000-8000-000000000001");
  await assert.rejects(()=>service("update",{...input(email),active:true,revision:p.revision-1}),/changed/);
});
