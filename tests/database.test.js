import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ACTIVITIES } from "../dist/data.js";
const db = new PGlite();
const teacher = "11111111-1111-4111-8111-111111111111", alice = "22222222-2222-4222-8222-222222222222", bob = "33333333-3333-4333-8333-333333333333", stranger = "44444444-4444-4444-8444-444444444444";
const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function as(id, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ""]);
  await db.exec("set role " + role);
}
async function call(name, values = []) {
  const placeholders = values.map((_, i) => "$" + (i + 1)).join(",");
  return (await db.query(`select to_jsonb(public.${name}(${placeholders})) as value`, values)).rows[0].value;
}
before(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon;`);
  await db.exec(await readFile(new URL("../supabase/01-schema.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/02-questions.sql", import.meta.url), "utf8"));
  await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,now())", [teacher, "teacher@example.com", alice, "alice@example.com", bob, "bob@example.com", stranger, "stranger@example.com"]);
  await db.query("insert into kkf_private.teachers values ($1)", [teacher]);
  await db.exec("insert into kkf_private.students(email,display_name) values ('alice@example.com','Alice'),('bob@example.com','Bob')");
});
after(() => db.close());
test("anonymous callers and unregistered authenticated users cannot access the application", async () => {
  await as(null, "anon");
  await assert.rejects(() => call("kkf_profile"), /permission denied/);
  await as(stranger);
  await assert.rejects(() => call("kkf_start_session", [session]), /not registered/);
  assert.equal((await db.query("select * from public.kkf_sessions")).rows.length, 0);
});
test("only a verified registered account can start a session; retries use the same session", async () => {
  await as(alice);
  let s = await call("kkf_start_session", [session]);
  assert.equal(s.email, "alice@example.com");
  assert.equal(s.user_id, alice);
  const retry = await call("kkf_start_session", [session]);
  assert.equal(retry.id, session);
  assert.equal((await db.query("select * from public.kkf_sessions")).rows.length, 1);
});
test("students cannot view or write another student\u2019s session or grant themselves teacher access", async () => {
  await as(bob);
  assert.equal((await db.query("select * from public.kkf_sessions")).rows.length, 0);
  await assert.rejects(() => call("kkf_identify", [session, "heat-transfer", "Explain", "heat transfer"]), /not found/);
  await assert.rejects(() => db.query("update public.kkf_sessions set email=$1", ["bob@example.com"]), /permission denied/);
  await assert.rejects(() => db.query("insert into kkf_private.teachers values ($1)", [bob]), /permission denied/);
  await assert.rejects(() => call("kkf_report"), /Teacher access required/);
  await assert.rejects(() => call("kkf_set_student", ["bad@example.com", "", true]), /Teacher access required/);
});
test("server scores first selections, enforces order and preserves submissions on retries", async () => {
  await as(alice);
  await assert.rejects(() => call("kkf_identify", [session, "gradient", "Calculate", "gradient"]), /current activity/);
  const first = await call("kkf_identify", [session, "heat-transfer", "Describe", "air pressure"]);
  assert.equal(first.command_correct, false);
  assert.equal(first.topic_correct, false);
  const retry = await call("kkf_identify", [session, "heat-transfer", "Explain", "heat transfer"]);
  assert.equal(retry.selected_command, "Describe");
  await assert.rejects(() => call("kkf_finish_activity", [session, "heat-transfer", [true, true]]), /Submit an answer/);
  await assert.rejects(() => call("kkf_submit_answer", [session, "heat-transfer", "   ", "", ""]), /Write an answer/);
  const a = await call("kkf_submit_answer", [session, "heat-transfer", "Air is a poor conductor, so heat transfer slows.", "", ""]);
  const a2 = await call("kkf_submit_answer", [session, "heat-transfer", "Changed after seeing model", "", ""]);
  assert.equal(a2.answer, a.answer);
  await call("kkf_finish_activity", [session, "heat-transfer", [false, false]]);
  const locked = await call("kkf_finish_activity", [session, "heat-transfer", [true, true]]);
  assert.deepEqual(locked.self_checks, [false, false]);
});
test("calculation points come from the server catalogue and cannot be changed by self-review", async () => {
  await as(alice);
  await call("kkf_identify", [session, "gradient", "Calculate", "gradient"]);
  await assert.rejects(() => call("kkf_submit_answer", [session, "gradient", "Working", "NaN", "none"]), /numerical/);
  const a = await call("kkf_submit_answer", [session, "gradient", "(11-3)/(5-1)=2", "2.00", "kg"]);
  assert.deepEqual(a.auto_checks, [true, false]);
  const finished = await call("kkf_finish_activity", [session, "gradient", [true, true]]);
  assert.deepEqual(finished.self_checks, [false, false]);
  await assert.rejects(() => db.query("update public.kkf_attempts set auto_checks=array[true,true]"), /permission denied/);
});
test("teachers can review written answers and students can read but cannot alter teacher feedback", async () => {
  await as(bob);
  await assert.rejects(() => call("kkf_teacher_review", [session, "heat-transfer", [true, true], "Excellent link."]), /Teacher access/);
  await as(teacher);
  const a = await call("kkf_teacher_review", [session, "heat-transfer", [true, true], "Clear reason and link."]);
  assert.equal(a.teacher_reviewed_by, teacher);
  assert.deepEqual(a.teacher_checks, [true, true]);
  await assert.rejects(() => call("kkf_teacher_review", [session, "gradient", [true, true], ""]), /automatically/);
  const report = await call("kkf_report", ["alice", 0]);
  assert.equal(report.total, 1);
  assert.equal(report.items[0].email, "alice@example.com");
  assert.equal(report.items[0].attempts.length, 2);
  await as(alice);
  const row = (await db.query("select * from public.kkf_attempts where question_id='heat-transfer'")).rows[0];
  assert.equal(row.teacher_feedback, "Clear reason and link.");
  await assert.rejects(() => db.query("update public.kkf_attempts set teacher_feedback='Fake review'"), /permission denied/);
});
test("completing eight activities closes a session and reports every saved attempt", async () => {
  await as(alice);
  for (const q of ACTIVITIES.slice(2)) {
    await call("kkf_identify", [session, q.id, q.command, q.topic]);
    await call("kkf_submit_answer", [session, q.id, "My attempted answer and working.", String(q.expected ?? ""), q.unit ?? ""]);
    await call("kkf_finish_activity", [session, q.id, [true, true]]);
  }
  const s = (await db.query("select * from public.kkf_sessions")).rows[0];
  assert(s.completed_at);
  assert.equal((await db.query("select * from public.kkf_attempts")).rows.length, 8);
  await as(teacher);
  const data = await call("kkf_report", ["ALICE", 0, (/* @__PURE__ */ new Date()).toISOString()]);
  assert.equal(data.items[0].attempts.length, 8);
});
test("roster changes are restricted to teachers and disabled students lose database access", async () => {
  await as(teacher);
  await call("kkf_set_student", [" ALICE@EXAMPLE.COM ", "Alice", false]);
  const roster = await call("kkf_roster");
  assert.equal(roster.find((r) => r.email === "alice@example.com").active, false);
  await as(alice);
  assert.equal((await db.query("select * from public.kkf_sessions")).rows.length, 0);
  await assert.rejects(() => call("kkf_profile"), /not registered/);
  await as(teacher);
  await call("kkf_set_student", ["alice@example.com", "Alice", true]);
});
test("RLS still hides populated attempts from another student", async () => {
  await as(bob);
  assert.equal((await db.query("select * from public.kkf_attempts")).rows.length, 0);
  await as(alice);
  assert.equal((await db.query("select * from public.kkf_attempts")).rows.length, 8);
});
test("an unverified roster member is denied access", async () => {
  await as(teacher);
  await call("kkf_set_student", ["stranger@example.com", "", true]);
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [stranger]);
  await as(stranger);
  await assert.rejects(() => call("kkf_profile"), /verified email/);
});
