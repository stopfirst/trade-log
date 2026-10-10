import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Alerter,readConfig,makeLogger,Telegram,main} from '../src/alert.mjs';

const BOT='123456789:AAH'+'x'.repeat(32);
const TOKEN='kwc_'+'A'.repeat(43);
const KEY='sb_publishable_'+'k'.repeat(24);
const baseEnv=dir=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,HL_LIVE_BALANCE:'0'});
const NOW=Date.parse('2026-10-12T05:00:00Z'); // KST 14:00, ET 01:00
const statusData=(pnl,{rev=1,unchanged=false}={})=>({ok:true,version:1,now:NOW,from:'2026-08-11',
 us:{kw:{days:[{date:'2026-10-12',as_of:1,total:String(pnl),rows:[{symbol:'NVDA',net:String(pnl),t:'13:00:00'}]}],latest:null},
  journal:unchanged?{exists:true,revision:rev,unchanged:true}:{exists:true,revision:rev,unchanged:false,settings:{limD:1,limW:null,limM:null,account:50000},trades:[],broker_days:[]}},
 hl:{raw:{registered:false,installed:true},journal:{exists:false}}});

function mockFetch(handler){const calls=[];const f=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;calls.push({url:String(url),body});const r=await handler(String(url),body,calls);return new Response(JSON.stringify(r.body),{status:r.status||200,headers:{'content-type':'application/json'}});};f.calls=calls;return f;}

test('config: refuses secret keys, explains missing fields, defaults',()=>{
 assert.throws(()=>readConfig({...baseEnv('/tmp'),SUPABASE_KEY:'sb_secret_abc'}),/CONFIG_SECRET_KEY_REFUSED/);
 try{readConfig({TELEGRAM_BOT_TOKEN:'여기에_붙여넣기'});assert.fail();}catch(e){assert.equal(e.message,'CONFIG_INCOMPLETE');assert.ok(e.fields.some(f=>f.startsWith('TELEGRAM_BOT_TOKEN')));assert.ok(e.fields.some(f=>f.startsWith('KW_COLLECTOR_TOKEN')));}
 const c=readConfig(baseEnv('/tmp'));
 assert.deepEqual(c.thresholds,[50,80,100]);assert.equal(c.streakN,3);assert.equal(c.includeUnrealized,false);assert.equal(c.dailySummary,true);assert.equal(c.activeSec,60);assert.equal(c.idleSec,600);
 const d=readConfig({...baseEnv('/tmp'),ALERT_THRESHOLDS:'90, 30',LOSS_STREAK_N:'0',US_LIMITS_PCT:'2,,8',INCLUDE_UNREALIZED:'1'});
 assert.deepEqual(d.thresholds,[30,90]);assert.equal(d.streakN,0);assert.deepEqual(d.usLimits,[2,null,8]);assert.equal(d.includeUnrealized,true);
 assert.throws(()=>readConfig({...baseEnv('/tmp'),US_LIMITS_PCT:'2,5'}),/CONFIG_INCOMPLETE/);
});

test('logger never prints the bot token, collector token or Supabase key',()=>{
 const lines=[];const env=baseEnv('/tmp');const log=makeLogger(env,l=>lines.push(l));
 log('ERROR',`fail https://api.telegram.org/bot${BOT}/sendMessage ${TOKEN} ${KEY} kwc_${'Z'.repeat(43)}`);
 assert.ok(!lines[0].includes(BOT)&&!lines[0].includes(TOKEN)&&!lines[0].includes(KEY)&&!lines[0].includes('Z'.repeat(20)),lines[0]);
});

test('check(): sends one Korean message per crossed level, persists state, no duplicate on the next check',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta-'));let pnl=-412.3;let rpcBodies=[];
 const fetcher=mockFetch(async(url,body)=>{
  if(url.endsWith('/rest/v1/rpc/alert_status')){rpcBodies.push(body);return {body:statusData(pnl,{unchanged:body.p_us_revision===1})};}
  if(url.includes('api.telegram.org')){assert.ok(url.includes('/sendMessage'));return {body:{ok:true,result:{message_id:1}}};}
  throw Error('unexpected '+url);});
 const lines=[];const a=new Alerter(baseEnv(dir),{fetcher,now:()=>NOW,log:makeLogger(baseEnv(dir),l=>lines.push(l)),sleep:async()=>{}});
 await a.init();
 let r=await a.check();
 const sent=fetcher.calls.filter(c=>c.url.includes('telegram')).map(c=>c.body);
 assert.equal(sent.length,2,'limit-not-set notice (week/month) + 82% alert');
 assert.match(sent[0].text,/^ℹ️ 미국주식 주 한도·월 한도 미설정/);
 assert.equal(sent[1].text,'⚠️ 미국주식 오늘 손실 -$412.30 · 하루 한도 $500.00의 82%');
 assert.equal(sent[1].chat_id,'987654321');
 assert.equal(rpcBodies[0].p_token,TOKEN);assert.equal(rpcBodies[0].p_us_revision,null);
 const saved=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));
 assert.ok(saved.sent['US:day:2026-10-12:80']&&saved.sent['US:day:2026-10-12:50']);
 assert.equal(saved.journal.US.revision,1);
 // second check: the journal is unchanged (revision cached), no new message
 r=await a.check();
 assert.equal(rpcBodies[1].p_us_revision,1);
 assert.equal(fetcher.calls.filter(c=>c.url.includes('telegram')).length,2);
 assert.equal(r.models[0].limits.day,1,'cached settings still used');
 // a restart (new process, same state file) does not repeat the 80% alert; 100% is new
 pnl=-520;const b=new Alerter(baseEnv(dir),{fetcher,now:()=>NOW,log:()=>{},sleep:async()=>{}});await b.init();await b.check();
 const after=fetcher.calls.filter(c=>c.url.includes('telegram')).map(c=>c.body.text);
 assert.equal(after.length,4);assert.match(after[2],/^ℹ️/);assert.match(after[3],/^⛔ 미국주식 오늘 손실 -\$520\.00 · 하루 한도 \$500\.00 도달\(104%\)/);
 assert.ok(!lines.join('\n').includes(BOT));
 await rm(dir,{recursive:true});
});

test('check(): a failed Telegram send is not marked, so the next check retries it',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta-'));let fail=true;
 const env={...baseEnv(dir),US_LIMITS_PCT:'1,2,4'};
 const fetcher=mockFetch(async url=>{
  if(url.includes('/rpc/alert_status'))return {body:statusData(-300)};
  if(fail)return {status:400,body:{ok:false,description:'Bad Request: chat not found'}};
  return {body:{ok:true,result:{}}};});
 const lines=[];const a=new Alerter(env,{fetcher,now:()=>NOW,log:makeLogger(env,l=>lines.push(l)),sleep:async()=>{}});await a.init();
 await a.check();
 assert.ok(lines.some(l=>/TELEGRAM_CHAT_NOT_FOUND/.test(l)));
 fail=false;const before=fetcher.calls.length;await a.check();
 const texts=fetcher.calls.slice(before).filter(c=>c.url.includes('telegram')).map(c=>c.body.text);
 assert.deepEqual(texts,['🔔 미국주식 오늘 손실 -$300.00 · 하루 한도 $500.00의 60%']);
 await rm(dir,{recursive:true});
});

test('Supabase errors are explained without secrets',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta-'));
 const fetcher=mockFetch(async()=>({status:404,body:{message:'Could not find the function public.alert_status'}}));
 const a=new Alerter(baseEnv(dir),{fetcher,now:()=>NOW,log:()=>{},sleep:async()=>{}});await a.init();
 await assert.rejects(a.check(),/SUPABASE_SQL_NOT_INSTALLED/);
 const f2=mockFetch(async()=>({status:401,body:{message:'invalid collector token'}}));
 const b=new Alerter(baseEnv(dir),{fetcher:f2,now:()=>NOW,log:()=>{},sleep:async()=>{}});await b.init();
 await assert.rejects(b.check(),/SUPABASE_TOKEN_REJECTED/);
 await rm(dir,{recursive:true});
});

test('Telegram 429 waits retry_after then succeeds',async()=>{
 let n=0;const waits=[];
 const f=mockFetch(async()=>(++n===1?{status:429,body:{ok:false,parameters:{retry_after:3}}}:{body:{ok:true,result:{}}}));
 await new Telegram(BOT,'1',f,async ms=>waits.push(ms)).send('hi');
 assert.deepEqual(waits,[3000]);assert.equal(n,2);
});

test('--find-chat lists chat ids from getUpdates; --test sends a test message with current numbers',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta-'));const orig=globalThis.fetch,origLog=console.log;const out=[];
 const fetcher=mockFetch(async(url,body)=>{
  if(url.endsWith('/getUpdates'))return {body:{ok:true,result:[{update_id:1,message:{date:1791000000,chat:{id:987654321,type:'private',first_name:'상익',username:'trader'},text:'안녕'}},{update_id:2,message:{date:1791000001,chat:{id:987654321,type:'private',first_name:'상익'}}}]}};
  if(url.endsWith('/sendMessage'))return {body:{ok:true,result:{}}};
  if(url.endsWith('/rpc/alert_status'))return {body:statusData(-100)};
  throw Error(url);});
 globalThis.fetch=fetcher;console.log=l=>out.push(String(l));
 try{
  const env=baseEnv(dir);delete env.TELEGRAM_CHAT_ID;
  assert.equal(await main(['--find-chat'],env),0);
  assert.ok(out.some(l=>l.includes('TELEGRAM_CHAT_ID=987654321')&&l.includes('private')),out.join('\n'));
  assert.equal(out.filter(l=>l.includes('TELEGRAM_CHAT_ID=')).length,1,'deduplicated');
  assert.equal(await main(['--test'],baseEnv(dir)),0);
  const msg=fetcher.calls.find(c=>c.url.endsWith('/sendMessage')).body.text;
  assert.match(msg,/^✅ 매매일지 알림 테스트 · 연결 정상\n미국주식 \(기준일 2026-10-1\d, Asia\/Seoul\)/);
  assert.ok(!out.join('\n').includes(BOT));
  // empty updates -> guidance, exit 1
  globalThis.fetch=mockFetch(async()=>({body:{ok:true,result:[]}}));
  assert.equal(await main(['--find-chat'],env),1);
  assert.ok(out.some(l=>l.includes('아무 메시지')));
 }finally{globalThis.fetch=orig;console.log=origLog;await rm(dir,{recursive:true});}
});
