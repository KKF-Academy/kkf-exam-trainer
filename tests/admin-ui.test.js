import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
import {Window} from "happy-dom";
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function setup(entry,backend,auth){
  const window=new Window({url:"https://kkf-test.example/"});window.document.write(await readFile(new URL("../dist/"+(entry==="auth-ui.js"?"admin.html":"admin.html"),import.meta.url),"utf8"));
  for(const key of ["document","sessionStorage","location"])globalThis[key]=window[key];
  globalThis.window=window;window.HTMLElement.prototype.scrollIntoView=function(){};
  const compiled=await build({entryPoints:[new URL("../dist/"+entry,import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"browser",target:"es2022",plugins:[{name:"mock-services",setup(builder){
    builder.onResolve({filter:/^\.\/backend\.js$/},()=>({path:"backend",namespace:"mock"}));
    if(entry!=="auth-ui.js")builder.onResolve({filter:/^\.\/auth-ui\.js$/},()=>({path:"auth",namespace:"mock"}));
    builder.onLoad({filter:/.*/,namespace:"mock"},({path})=>({contents:path==="backend"?backend:auth,loader:"js"}));
  }}]});
  const module=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
  return {window,module,$:id=>document.getElementById(id)};
}
const teacherA="10000000-0000-4000-8000-000000000002",teacherB="10000000-0000-4000-8000-000000000003";
const directory={items:[{email:"student@example.com",display_name:'Student <img src=x onerror="bad">',role:"student",year_group:"Year 10",active:true,user_id:"s",revision:4,email_confirmed_at:"2026-10-20",teacher_ids:[teacherA],assigned_students:[]}],total:1,teachers:[
  {user_id:teacherA,email:"a@example.com",display_name:"Teacher A",active:true},{user_id:teacherB,email:"b@example.com",display_name:"Teacher B",active:true}]};
test("Super Admin registration sends one request with multiple teachers and preserves failed drafts",async()=>{
  globalThis.adminCalls=[];globalThis.adminFail=true;
  globalThis.directory=structuredClone(directory);
  const {window:w,$}=await setup("admin.js",`export async function rpc(){return globalThis.directory;}export async function adminRequest(p){globalThis.adminCalls.push(p);if(globalThis.adminFail)throw new Error("Offline");return{ok:true,message:"Account ready. Invitation accepted for sending.",invitation_status:"sent"};}`,
  `export async function mountAuth({adminOnly,onReady}){if(!adminOnly)throw new Error("Admin gate required");await onReady({is_super_admin:true});}`);
  assert.equal($("admin-content").hidden,false);assert.equal(document.querySelectorAll("#people-rows img").length,0);
  $("new-name").value="New student";$("new-email").value="new@example.com";$("new-year").value="Year 11";
  for(const checkbox of $("new-teacher-choices").querySelectorAll("input"))checkbox.checked=true;
  const form=$("create-person-form"),button=form.querySelector("button");
  form.dispatchEvent(new w.SubmitEvent("submit",{cancelable:true,submitter:button}));await tick();
  assert.equal($("new-email").value,"new@example.com");assert.match($("create-status").textContent,/Offline/);
  assert.deepEqual(globalThis.adminCalls[0].teacher_ids,[teacherA,teacherB]);assert.equal(globalThis.adminCalls[0].action,"create");
  globalThis.adminFail=false;
  form.dispatchEvent(new w.SubmitEvent("submit",{cancelable:true,submitter:button}));await tick();
  assert.equal($("new-email").value,"");assert.match($("create-status").textContent,/Account ready/);
  document.querySelector("[data-edit]").click();assert.equal($("edit-email").readOnly,true);
  $("edit-name").value="Updated student";$("edit-active").checked=false;
  $("edit-person-form").dispatchEvent(new w.SubmitEvent("submit",{cancelable:true,submitter:$("edit-person-form").querySelector("button")}));await tick();
  const update=globalThis.adminCalls.at(-1);assert.equal(update.action,"update");assert.equal(update.revision,4);assert.equal(update.active,false);
  await w.happyDOM.close();
});
test("a teacher cannot open Super Admin management even with a valid session",async()=>{
  let ready=false;
  const {window:w,module,$}=await setup("auth-ui.js",`export const configured=true;export async function currentProfile(){return{id:"teacher",email:"teacher@example.com",is_teacher:true,is_super_admin:false};}export const client={auth:{async getSession(){return{data:{session:{}}};}}};`,"");
  await module.mountAuth({adminOnly:true,onReady:async()=>{ready=true;},onSignedOut:async()=>{}});
  assert.equal(ready,false);assert.equal($("admin-content").hidden,true);assert.match($("account-panel").textContent,/Super Admin access/);
  await w.happyDOM.close();
});
test("a valid student session sees a permission message instead of a reusable OTP form",async()=>{
  let ready=false;
  const {window:w,module,$}=await setup("auth-ui.js",`export const configured=true;export async function currentProfile(){return{id:"student",email:"student@example.com",is_teacher:false,is_super_admin:false};}export const client={auth:{async getSession(){return{data:{session:{}}};},async signOut(){return{error:null};}}};`,"");
  await module.mountAuth({teacherOnly:true,onReady:async()=>{ready=true;},onSignedOut:async()=>{}});
  assert.equal(ready,false);assert.match($("account-panel").textContent,/This account has student access/);
  assert.equal(document.getElementById("verify-form"),null);
  assert.equal(document.querySelector('a[href="./"]').textContent.includes("KKF"),true);
  $("switch-account").click();await tick();
  assert(document.getElementById("login-form"));
  await w.happyDOM.close();
});
