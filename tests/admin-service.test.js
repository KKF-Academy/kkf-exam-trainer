import test from "node:test";
import assert from "node:assert/strict";
import { createAdminHandler } from "../supabase/functions/kkf-admin/handler.js";
const root="10000000-0000-4000-8000-000000000001", userId="20000000-0000-4000-8000-000000000001";
const site="https://kkf-exam-trainer.vercel.app";
const input={action:"create",email:" Student@Example.com ",display_name:"Student",role:"student",year_group:"Year 10",teacher_ids:[]};
function setup(overrides={}) {
  const calls=[];
  let account=overrides.existing ? userId : null;
  const state=()=>({person:account?{user_id:account,active:!overrides.disabled}:null,auth_user_id:account,email_confirmed:Boolean(overrides.confirmed)});
  const client={
    auth:{
      getUser:async(token)=>{calls.push(["getUser",token]);return overrides.invalidToken?{error:new Error("bad JWT")}:{data:{user:{id:overrides.actor||root,user_metadata:{role:"super_admin"}}}};},
      admin:{
        createUser:async(attributes)=>{calls.push(["createUser",attributes]);account=userId;return overrides.createRace?{error:{code:"email_exists"}}:{data:{user:{id:userId}}};},
        inviteUserByEmail:async(email,options)=>{calls.push(["invite",email,options]);if(overrides.sendThrows)throw new Error("network lost");return overrides.sendFails?{error:{message:"SMTP failure"}}:{data:{user:{id:account}}};}
      }
    },
    rpc:async(name,args)=>{
      calls.push([args.p_action,args.p_data,args.p_actor]);assert.equal(name,"kkf_admin_service");
      if(overrides.actor&&args.p_action==="authorize")return{error:{code:"42501",message:"Super Admin access required."}};
      if(args.p_action==="validate")return{data:{auth_user_id:account}};
      if(args.p_action==="lookup")return{data:state()};
      if(args.p_action==="register")return{data:{created:true,active:!overrides.disabled,user_id:account}};
      if(args.p_action==="reserve_invitation")return{data:overrides.cooldown?{send:false,reason:"cooldown"}:{send:true,user_id:account,token:"lease-token"}};
      if(args.p_action==="invitation_result"&&overrides.recordFails)return{error:{code:"40001",message:"state changed"}};
      return{data:{authorized:true}};
    }
  };
  const handler=createAdminHandler({createClient:(url,key,options)=>{
    assert.equal(key,"server-only-secret");assert.equal(options.auth.persistSession,false);return client;
  },env:{SUPABASE_URL:"https://project.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"server-only-secret"}});
  return{handler,calls};
}
async function run(handler,body=input,options={}) {
  const response=await handler(new Request(site+"/function",{method:options.method||"POST",
    headers:{Origin:options.origin||site,Authorization:options.authorization??"Bearer valid.user.jwt","Content-Type":"application/json"},
    body:options.method==="GET"||options.method==="OPTIONS"?undefined:JSON.stringify(body)}));
  return{status:response.status,body:response.status===204?null:await response.json(),headers:response.headers};
}
test("browser origins, methods and missing/malformed credentials cannot provision accounts",async()=>{
  for(const options of [{origin:"https://attacker.example"},{method:"GET"},{authorization:""},{authorization:"Bearer sb_publishable_anything"}]){
    const {handler,calls}=setup();const response=await run(handler,input,options);
    assert([401,403,405].includes(response.status));assert.equal(calls.length,0);
  }
  const {handler,calls}=setup();const preflight=await run(handler,{}, {method:"OPTIONS"});
  assert.equal(preflight.status,204);assert.equal(calls.length,0);
});
test("verified identity and current database Super Admin role are both required",async()=>{
  for(const overrides of [{invalidToken:true},{actor:"teacher-id"}]){
    const {handler,calls}=setup(overrides);
    const response=await run(handler,{...input,actor_id:root,is_super_admin:true});
    assert([401,403].includes(response.status));assert.equal(calls.some(c=>c[0]==="createUser"||c[0]==="invite"),false);
  }
});
test("one registration creates an unconfirmed identity, commits membership, then invites",async()=>{
  const {handler,calls}=setup();const response=await run(handler,{...input,user_id:"forged-id",redirectTo:"https://attacker.example"});
  assert.equal(response.status,200);assert.equal(response.body.invitation_status,"sent");
  const created=calls.find(c=>c[0]==="createUser")[1];
  assert.deepEqual(created,{email:"student@example.com",email_confirm:false});
  const registered=calls.find(c=>c[0]==="register");
  assert.equal(registered[1].user_id,userId);assert.equal(registered[2],root);
  assert(calls.findIndex(c=>c[0]==="register")<calls.findIndex(c=>c[0]==="invite"));
  assert.equal(calls.find(c=>c[0]==="invite")[2].redirectTo,site+"/");
  assert(!JSON.stringify(response.body).includes("server-only-secret"));
});
test("confirmed accounts are reused and no misleading invitation is sent",async()=>{
  const {handler,calls}=setup({existing:true,confirmed:true});
  const response=await run(handler);
  assert.equal(response.status,200);assert.equal(response.body.invitation_status,"existing_account");
  assert.equal(calls.some(c=>c[0]==="createUser"||c[0]==="invite"),false);
});
test("Auth creation races recover the same existing UUID",async()=>{
  const {handler,calls}=setup({createRace:true});
  assert.equal((await run(handler)).status,200);
  assert.equal(calls.find(c=>c[0]==="register")[1].user_id,userId);
  assert.equal(calls.filter(c=>c[0]==="createUser").length,1);
});
test("invitation failures preserve successful registration and permit a separate retry",async()=>{
  for(const flags of [{sendFails:true},{sendThrows:true}]){
    const {handler,calls}=setup(flags);const response=await run(handler);
    assert.equal(response.status,200);assert.equal(response.body.invitation_status,"retry_needed");
    assert(calls.some(c=>c[0]==="register"));
    assert.equal(calls.find(c=>c[0]==="invitation_result")[1].status,"retry_needed");
  }
  const {handler,calls}=setup({existing:true});
  const response=await run(handler,{action:"resend",email:"student@example.com"});
  assert.equal(response.body.invitation_status,"sent");
  assert.equal(calls.some(c=>c[0]==="createUser"||c[0]==="register"),false);
});
test("cooldowns and disabled accounts cannot trigger extra invitations",async()=>{
  for(const flags of [{existing:true,cooldown:true},{existing:true,confirmed:true,disabled:true}]){
    const {handler,calls}=setup(flags);const response=await run(handler,{action:"resend",email:"student@example.com"});
    assert([200,409].includes(response.status));assert.equal(calls.some(c=>c[0]==="invite"),false);
  }
});
test("an ambiguous status write never tells the admin that account creation failed",async()=>{
  const {handler}=setup({recordFails:true});const response=await run(handler);
  assert.equal(response.status,200);assert.equal(response.body.ok,true);assert.equal(response.body.invitation_status,"unknown");
});
test("invalid roles, teacher IDs and stale update payloads are rejected before writes",async()=>{
  for(const body of [{...input,role:"super_admin"},{...input,teacher_ids:["not-uuid"]},{...input,display_name:""},{...input,action:"update",active:true,revision:0}]){
    const {handler,calls}=setup();assert.equal((await run(handler,body)).status,400);
    assert.equal(calls.some(c=>["createUser","register","invite","update"].includes(c[0])),false);
  }
});
