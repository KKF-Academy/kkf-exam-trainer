import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
import {newSession} from '../dist/engine.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
async function setup(file){const window=new Window({url:'https://kkf-test.example/'});window.document.write(await readFile(new URL('../dist/'+file,import.meta.url),'utf8'));for(const k of ['document','sessionStorage','location'])globalThis[k]=window[k];globalThis.window=window;window.HTMLElement.prototype.scrollIntoView=function(){};return window;}
async function loadMocked(entry,backend,auth){const result=await build({entryPoints:[new URL('../dist/'+entry,import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'mock-services',setup(b){b.onResolve({filter:/^\.\/backend\.js$/},()=>({path:'backend',namespace:'test'}));b.onResolve({filter:/^\.\/auth-ui\.js$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},({path})=>({contents:path==='backend'?backend:auth,loader:'js'}));}}]});return await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
test('connected student UI keeps the attempt when saving fails, then saves before advancing',async()=>{
 const w=await setup('index.html');globalThis.mockState=newSession();globalThis.mockFail=true;globalThis.mockSaves=[];
 const backend=`export const configured=true;export async function loadLatest(){return globalThis.mockState;}export async function ensureSession(s){s.sessionId='test-session';}export async function saveIdentification(s){globalThis.mockSaves.push('identify');}export async function saveAnswer(s){if(globalThis.mockFail)throw new Error('Offline');globalThis.mockSaves.push('answer');}export async function saveReview(){globalThis.mockSaves.push('review');}`;
 await loadMocked('app.js',backend,`export async function mountAuth({onReady}){await onReady({id:'student-a',email:'a@example.com',is_teacher:false});}`);
 const $=id=>document.getElementById(id);
 for(const [name,value]of[['command','Explain'],['topic','heat transfer']]){const e=[...document.querySelectorAll('input[name="'+name+'"]')].find(e=>e.value===value);e.checked=true;e.dispatchEvent(new w.Event('change'));}
 $('identify-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 $('answer').value='Air is a poor conductor so energy transfer is slower.';$('answer').dispatchEvent(new w.Event('input'));
 $('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert($('answer-form'));assert($('sync-status').textContent.includes('Not saved'));assert.equal($('answer').value,'Air is a poor conductor so energy transfer is slower.');
 globalThis.mockFail=false;$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert($('saved-answer'));assert.equal($('answer-form'),null);
 for(const e of document.querySelectorAll('input[name="review"]')){e.checked=true;e.dispatchEvent(new w.Event('change'));}$('finish-activity').click();await tick();assert($('identify-form'));assert.deepEqual(globalThis.mockSaves,['identify','answer','review']);
 await w.happyDOM.close();
});
test('teacher DOM renders original responses safely and saves review feedback',async()=>{
 const w=await setup('teacher.html');
 const row={session_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',question_id:'heat-transfer',selected_command:'Explain',selected_topic:'heat transfer',command_correct:true,topic_correct:true,answer:'<img src=x onerror="bad">',numeric_value:'',unit:'',self_checks:[true,true],auto_checks:null,teacher_checks:null,finished_at:'2026-10-20T10:00:00Z',submitted_at:'2026-10-20T10:00:00Z',teacher_feedback:''};
 globalThis.reportData={items:[{id:row.session_id,email:'alice@example.com',display_name:'Alice',started_at:'2026-10-20T10:00:00Z',completed_at:null,attempts:[row]}],total:1};
 globalThis.mockRpc=async(name,p)=>{if(name==='kkf_report')return globalThis.reportData;if(name==='kkf_roster')return[];if(name==='kkf_teacher_review')return {...row,teacher_checks:p.p_checks,teacher_feedback:p.p_feedback};throw new Error('Unexpected call '+name);};
 await loadMocked('teacher.js',`export async function rpc(name,p){return globalThis.mockRpc(name,p);}`,`export async function mountAuth({onReady}){await onReady({is_teacher:true});}`);
 const $=id=>document.getElementById(id);assert.equal($('teacher-content').hidden,false);assert($('session-rows').textContent.includes('Alice'));
 document.querySelector('[data-session]').click();assert.equal(document.querySelectorAll('#session-detail img').length,0);
 const form=document.querySelector('.teacher-review');form.elements.namedItem('criterion-0').checked=true;form.elements.namedItem('feedback').value='Link the property to the effect.';
 form.dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,submitter:form.querySelector('button')}));await tick();assert($('report-status').textContent.includes('saved'));assert($('session-detail').textContent.includes('Teacher-reviewed'));assert.equal(globalThis.reportData.items[0].attempts[0].teacher_feedback,'Link the property to the effect.');
 await w.happyDOM.close();
});

test('account loading failure preserves drafts, and explicit successful sign-out clears them',async()=>{
 const w=await setup('index.html');globalThis.mockSignOutError=true;
 const backend=`export const configured=true;export async function currentProfile(){return {email:'a@example.com'};}export const client={auth:{async getSession(){return {data:{session:{}}};},async signOut(){return {error:globalThis.mockSignOutError?new Error('Offline'):null};}}};`;
 const module=await loadMocked('auth-ui.js',backend,'');const callbacks=[];
 await module.mountAuth({onReady:async()=>{throw new Error('Offline');},onSignedOut:async(clear=true)=>callbacks.push(clear)});
 assert.deepEqual(callbacks,[false]);document.getElementById('leave-account').click();await tick();assert.deepEqual(callbacks,[false]);
 globalThis.mockSignOutError=false;document.getElementById('leave-account').click();await tick();assert.deepEqual(callbacks,[false,true]);
 await w.happyDOM.close();
});
