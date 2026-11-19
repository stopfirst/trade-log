// 2.20.0 (alert23): 매일 복기 알림 '일지 동기화 기다림' — 어제 서버가 체결을 봤는데 일지(review_gaps)에 그날 거래 0건이면 sent 표시 없이
// REMIND_RECHECK_MIN마다 다시 확인(23:00 KST까지) · REVIEW_NUDGE_AT 안내 1번 · 일지 생기면 발송 · 체결 없으면/확인 실패면 예전 · REMIND_WAIT_JOURNAL=0 = 2.19.0
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import * as rm from '../src/remind.mjs';
import {Alerter,readConfig,remindDry,VERSION} from '../src/alert.mjs';

const DAY='2026-11-18',TODAY='2026-11-19';
const at=(hm,d=TODAY)=>Date.parse(`${d}T${hm}:00+09:00`);
const ev=(date,price,shares,time='10:00:00')=>({date,time,price,shares,fee:0});
const T=(o={})=>({id:'a',name:'BTC',direction:'long',entries:[ev(DAY,100,1)],fills:[],stop0:null,target:null,planRR:null,rrTp:null,
 entryNote:false,stopNote:false,react:false,tfIn:null,tfOut:null,ecom:null,xcom:null,eOld:false,xOld:false,avoidable:null,feePend:false,initialRisk:null,srvViol:false,hide:null,...o});
// HL 원시 체결(userFillsByTime): 11/18 UTC 안 6건 + 11/17 1건 + 현물(@) 1건
const HF=(tid,iso,coin='BTC',side='B',start=0)=>({coin,side,sz:'1',px:'100',startPosition:String(start),tid,time:Date.parse(iso),closedPnl:'0',fee:'0',hash:'0x'+tid,dir:'Open Long',oid:tid});
const HL6=[HF(1,'2026-11-18T00:30:00Z'),HF(2,'2026-11-18T03:00:00Z','BTC','A',1),HF(3,'2026-11-18T10:00:00Z','ETH'),HF(4,'2026-11-18T12:00:00Z','ETH','A',1),HF(5,'2026-11-18T20:00:00Z','SOL'),HF(6,'2026-11-18T23:59:00Z','SOL','A',1),
 HF(7,'2026-11-17T23:59:00Z'),HF(8,'2026-11-18T05:00:00Z','@107')];
// 키움 주문: 주문일·시각 = 한국 → ET 날짜. 11/18 ET 정규장 = 11/18 23:30 ~ 11/19 06:00 KST
const KO=(key,od,tm,qty=1,side='매수')=>({orderDate:od,time:tm,key,symbol:'META',side,qty,price:500});
const US2=[KO('k1','2026-11-18','23:40:00'),KO('k2','2026-11-19','05:10:00',1,'매도'),KO('k3','2026-11-18','10:00:00'),KO('k4','2026-11-19','01:00:00',0)]; // k3 = 11/17 ET 저녁, k4 = 미체결

test('2.20.0 설정: REMIND_WAIT_JOURNAL 기본 켬·0 끔 · REVIEW_NUDGE_AT 기본 12:00·0 끔·형식 오류 12:00 · REMIND_RECHECK_MIN 기본 15·10~60 · readConfig',()=>{
 assert.equal(VERSION,'2.20.0');
 const w=rm.waitConfig({});assert.equal(w.enabled,true);assert.deepEqual(w.nudge,[12,0]);assert.equal(w.nudgeText,'12:00');assert.equal(w.recheckMin,15);assert.equal(w.nudgeBad,false);
 for(const v of ['0','off','false','끔'])assert.equal(rm.waitConfig({REMIND_WAIT_JOURNAL:v}).enabled,false,v);
 assert.equal(rm.waitConfig({REVIEW_NUDGE_AT:'0'}).nudge,null);assert.deepEqual(rm.waitConfig({REVIEW_NUDGE_AT:'9:05'}).nudge,[9,5]);assert.equal(rm.waitConfig({REVIEW_NUDGE_AT:'9:05'}).nudgeText,'09:05');
 const b=rm.waitConfig({REVIEW_NUDGE_AT:'정오'});assert.equal(b.nudgeBad,true);assert.deepEqual(b.nudge,[12,0]);
 assert.equal(rm.waitConfig({REMIND_RECHECK_MIN:'10'}).recheckMin,10);assert.equal(rm.waitConfig({REMIND_RECHECK_MIN:'5'}).recheckMin,15);assert.equal(rm.waitConfig({REMIND_RECHECK_MIN:'5'}).recheckBad,true);
 const env={TELEGRAM_BOT_TOKEN:'123456:'+'A'.repeat(35),STATE_DIRECTORY:'/tmp'},o={needSupabase:false,needTelegram:false};
 assert.equal(readConfig(env,o).remindWait.enabled,true);assert.equal(readConfig({...env,REMIND_WAIT_JOURNAL:'0'},o).remindWait.enabled,false);});

test('fillCounts: HL = 무기한 체결 UTC 날짜(현물·다른 날 제외) · US = 체결 수량 > 0 ET 날짜 · null = 확인 실패 · 없음 = 0',()=>{
 assert.deepEqual(rm.fillCounts({HL:HL6,US:US2},DAY),{HL:6,US:2,total:8,failed:[]});
 assert.deepEqual(rm.fillCounts({HL:null,US:[]},DAY),{HL:0,US:0,total:0,failed:['HL']});
 assert.deepEqual(rm.fillCounts({},DAY),{HL:0,US:0,total:0,failed:[]});assert.deepEqual(rm.fillCounts(undefined,DAY).total,0);
 const J={HL:{trades:[T(),T({entries:[ev('2026-11-17',1,1)],fills:[ev(DAY,1,1)]}),T({entries:[ev('2026-11-17',1,1)]})]},US:{trades:[T({hide:true})]}};
 assert.deepEqual(rm.journalDayCount(J,DAY),{HL:2,US:1,total:3});assert.deepEqual(rm.journalDayCount({},DAY),{HL:0,US:0,total:0});
 assert.match(rm.nudgeText(DAY,{total:6,HL:6,US:0}),/^📝 어제\(11\/18 수\) 체결 6건\(HL\)이 아직 일지에 없어요 — 앱을 열면 복기 알림을 보낼게요$/);});

const setup=(env={},S0)=>{const S=S0||{sent:{},outbox:[]},logs=[];let journal={},calls=0;
 const rpc={call:async(n,b)=>{calls++;assert.equal(n,'review_gaps');assert.equal(b.p_since,DAY);return {ok:true,journal};}};
 const R=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig(env),journal:rm.journalConfig(env),wait:rm.waitConfig(env),state:()=>S,log:(l,m)=>logs.push(l+' '+m)});
 return {R,S,logs,set:j=>{journal=j;},calls:()=>calls};};

test('체결 있고 일지 없음 → 대기(sent 없음) · 15분 안엔 RPC 안 함 · 다시 확인 · 12:00 안내 1번 · 일지 생기면 그때 발송',async()=>{
 const {R,S,logs,set,calls}=setup();const seen={HL:HL6,US:[]};set({HL:{from:'2026-11-01',trades:[]},US:{trades:[]}});
 assert.equal(await R.afterCheck(at('09:31'),seen),null);assert.equal(calls(),1);assert.equal(S.sent['remind:'+TODAY],undefined,'sent 표시 안 함');
 assert.equal(S.remindWait.date,TODAY);assert.equal(S.remindWait.day,DAY);assert.deepEqual(S.remindWait.fills,{HL:6,US:0});
 assert.ok(logs.some(x=>/INFO 매일 복기 알림: 2026-11-18 체결 6건\(HL\)인데 일지에 그날 거래 0건 → 앱 동기화 기다림\(15분마다 다시 확인 · 23:00 KST까지 · 12:00까지 없으면 안내 1번\)/.test(x)));
 assert.ok(!logs.some(x=>/거래 없음/.test(x)),'예전처럼 거래 없음 → 안 보냄 하지 않음');
 assert.equal(await R.afterCheck(at('09:32'),seen),null);assert.equal(await R.afterCheck(at('09:45'),seen),null);assert.equal(calls(),1,'15분 안엔 review_gaps 안 부름');
 assert.equal(await R.afterCheck(at('09:46'),seen),null);assert.equal(calls(),2);assert.equal(S.remindWait.checks,2);
 assert.equal(await R.afterCheck(at('11:59'),seen),null);assert.equal(S.outbox.length,0);
 const n=await R.afterCheck(at('12:00'),seen);assert.match(n,/어제\(11\/18 수\) 체결 6건\(HL\)이 아직 일지에 없어요 — 앱을 열면 복기 알림을 보낼게요/);
 assert.equal(S.outbox.length,1);assert.ok(S.sent['remind-nudge:'+TODAY]);assert.equal(S.sent['remind:'+TODAY],undefined);
 const c=calls();assert.equal(await R.afterCheck(at('12:05'),seen),null);assert.equal(calls(),c,'안내 뒤에도 15분 간격');
 assert.equal(await R.afterCheck(at('12:30'),seen),null);assert.equal(S.outbox.length,1,'안내는 1번만');
 // 앱을 열어 일지 동기화
 set({HL:{from:'2026-11-01',trades:[T({name:'BTC'}),T({name:'ETH',ecom:true})]},US:{trades:[]}});
 assert.equal(await R.afterCheck(at('12:40'),seen),null,'15분 전이면 아직');
 const m=await R.afterCheck(at('12:46'),seen);assert.match(m,/📝 복기 시간 · 11\/18\(수\) 거래 2건\n일지 빈 칸 1건 · 다 채운 거래 1건/);assert.ok(S.sent['remind:'+TODAY]);assert.equal(S.remindWait,undefined);
 assert.ok(logs.some(x=>/일지에 그날 거래 2건 들어옴\(기다린 지 195분\) → 판정/.test(x)));
 assert.equal(await R.afterCheck(at('13:30'),seen),null);assert.equal(S.outbox.length,2,'하루 1번');});

test('23:00 KST 마감 → 안 보냄 로그·sent 표시 · 다음 날 새로 · 재시작해도 상태(state2.json) 이어서 · 일지 이미 있으면 바로',async()=>{
 const {R,S,logs,set,calls}=setup({REVIEW_NUDGE_AT:'0'});const seen={HL:HL6};set({});
 assert.equal(await R.afterCheck(at('09:31'),seen),null);assert.ok(S.remindWait);
 // 재시작: 같은 S로 새 Reminder → 15분 간격 그대로
 const r2=setup({REVIEW_NUDGE_AT:'0'},S);r2.set({});assert.equal(await r2.R.afterCheck(at('09:40'),seen),null);assert.equal(r2.calls(),0);
 assert.equal(await r2.R.afterCheck(at('12:00'),seen),null);assert.equal(S.outbox.length,0,'안내 끔(REVIEW_NUDGE_AT=0)');
 assert.equal(await r2.R.afterCheck(at('22:59'),seen),null);const c=r2.calls();
 assert.equal(await r2.R.afterCheck(at('23:00'),seen),null);assert.equal(r2.calls(),c,'마감 뒤엔 조회 안 함');
 assert.ok(r2.logs.some(x=>/INFO 매일 복기 알림: 2026-11-18 체결 6건이 23:00까지 일지에 안 들어옴 → 마감, 안 보냄/.test(x)));
 assert.ok(S.sent['remind:'+TODAY]);assert.equal(S.remindWait,undefined);assert.equal(S.outbox.length,0);
 // 다음 날: 일지에 어제(11/19) 거래 있음 → 바로 발송
 const r3=setup({},S);const J={HL:{from:'2026-11-01',trades:[T({entries:[ev('2026-11-19',100,1)]})]}};
 r3.R.rpc={call:async(n,b)=>{assert.equal(b.p_since,'2026-11-19');return {ok:true,journal:J};}};
 assert.match(await r3.R.afterCheck(at('09:31','2026-11-20'),{HL:[HF(9,'2026-11-19T02:00:00Z')]}),/거래 1건/);});

test('체결 없음 → 예전처럼 거래 없음·안 보냄 · 확인 실패(+체결 0) → 예전 + WARN 1회 · 실패해도 다른 시장 체결 있으면 대기 · 스위치 0 = 2.19.0 · seen 없는 예전 호출',async()=>{
 {const {R,S,logs,set}=setup();set({});assert.equal(await R.afterCheck(at('09:31'),{HL:[HF(7,'2026-11-17T10:00:00Z')],US:[]}),null);
  assert.ok(S.sent['remind:'+TODAY]);assert.equal(S.remindWait,undefined);assert.ok(logs.some(x=>/2026-11-18 거래 없음 → 안 보냄/.test(x)));}
 {const {R,S,logs,set}=setup();set({});assert.equal(await R.afterCheck(at('09:31'),{HL:null,US:[]}),null);
  assert.ok(S.sent['remind:'+TODAY]);assert.equal(logs.filter(x=>/^WARN .*체결 확인 실패\(HL\) → 일지 동기화 기다림 없이 예전처럼 판정/.test(x)).length,1);assert.ok(logs.some(x=>/거래 없음 → 안 보냄/.test(x)));}
 {const {R,S,logs,set}=setup();set({});assert.equal(await R.afterCheck(at('09:31'),{HL:null,US:US2}),null);
  assert.equal(S.sent['remind:'+TODAY],undefined);assert.deepEqual(S.remindWait.fills,{HL:0,US:2});assert.ok(logs.some(x=>/체결 2건\(US\)인데 .* · 체결 확인 실패 HL/.test(x)));}
 {const {R,S,logs,set}=setup({REMIND_WAIT_JOURNAL:'0'});set({});assert.equal(await R.afterCheck(at('09:31'),{HL:HL6}),null);
  assert.ok(S.sent['remind:'+TODAY]);assert.equal(S.remindWait,undefined);assert.ok(logs.some(x=>/거래 없음 → 안 보냄/.test(x)));assert.equal(S.outbox.length,0);}
 {const {R,S,set}=setup();set({});assert.equal(await R.afterCheck(at('09:31')),null);assert.ok(S.sent['remind:'+TODAY],'seen 없음 = 예전 동작');}
 // 기다리던 중 스위치를 끄고 재시작 → 기다림 버리고 예전대로
 {const S={sent:{},outbox:[],remindWait:{date:TODAY,day:DAY,since:at('09:31'),last:at('09:31'),fills:{HL:6,US:0},checks:1}};const {R,set}=setup({REMIND_WAIT_JOURNAL:'0'},S);set({});
  assert.equal(await R.afterCheck(at('09:35'),{HL:HL6}),null);assert.ok(S.sent['remind:'+TODAY]);assert.equal(S.remindWait,undefined);}
 // 일지에 그날 거래가 있으면(숨김·단타뿐이어도) 동기화된 것 → 예전 판정
 {const {R,S,set}=setup();set({HL:{from:'2026-11-01',trades:[T({hide:true})]}});assert.equal(await R.afterCheck(at('09:31'),{HL:HL6}),null);assert.ok(S.sent['remind:'+TODAY]);assert.equal(S.remindWait,undefined);}
 // 일지 조회 실패 중엔 기다림 유지
 {const {R,S,set}=setup();set({});await R.afterCheck(at('09:31'),{HL:HL6});R.rpc={call:async()=>{throw Error('HTTP_500');}};
  assert.equal(await R.afterCheck(at('09:50'),{HL:HL6}),null);assert.ok(S.remindWait);assert.equal(S.sent['remind:'+TODAY],undefined);}});

const E={SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:'sb_publishable_'+'k'.repeat(24),KW_COLLECTOR_TOKEN:'kwc_'+'A'.repeat(43),TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32),SCALP_MIN:'0'};
const MAIN='0x'+'c'.repeat(40);
const J=(r)=>new Response(JSON.stringify(r),{status:200,headers:{'content-type':'application/json'}});
test('--remind-dry: 체결 n건 / 일지 n건 / 기다림 한 줄 · 기다림이면 안내 미리 보기 · 끔 · 확인 실패',async()=>{
 const out=[],orig=console.log;let journal={};const calls=[];
 const rpc={call:async(n,b)=>{calls.push(n);if(n==='risk_status')return {ok:true,hl_address:MAIN,kw:{orders:US2}};return {ok:true,journal};}};
 let hlFail=false;const fetcher=async(url,o)=>{const b=JSON.parse(o.body);assert.equal(url,'https://api.hyperliquid.xyz/info');if(hlFail)return new Response('x',{status:500});assert.equal(b.type,'userFillsByTime');assert.equal(b.user,MAIN);return J(HL6.filter(f=>f.time>=b.startTime));};
 console.log=(...a)=>out.push(a.join(' '));
 try{assert.equal(await remindDry(['--remind-dry','--day',DAY],E,()=>{},{rpc,fetcher}),0);const a=out.join('\n');out.length=0;
  journal={HL:{from:'2026-11-01',trades:[T(),T({name:'ETH'})]},US:{trades:[]}};
  assert.equal(await remindDry(['--remind-dry','--day',DAY],E,()=>{},{rpc,fetcher}),0);const b=out.join('\n');out.length=0;
  journal={};assert.equal(await remindDry(['--remind-dry','--day',DAY],{...E,REMIND_WAIT_JOURNAL:'0'},()=>{},{rpc,fetcher}),0);const c=out.join('\n');out.length=0;
  hlFail=true;const r2={call:async n=>n==='risk_status'?{ok:true,hl_address:MAIN,kw:{orders:[]}}:{ok:true,journal:{}}};
  assert.equal(await remindDry(['--remind-dry','--day',DAY],E,()=>{},{rpc:r2,fetcher}),0);const d=out.join('\n');
  console.log=orig;
  assert.equal(calls[0],'review_gaps');
  assert.match(a,/체결 8건\(HL 6 · US 2\) \/ 일지 0건 \/ 기다림: 예 — 일지 동기화 전, 15분마다 다시 확인 · 23:00 KST까지 · 12:00 안내 1번/);
  assert.match(a,/지금은 알림 대신 기다립니다/);assert.match(a,/어제\(11\/18 수\) 체결 8건\(HL 6 · US 2\)이 아직 일지에 없어요/);assert.match(a,/\(보내지 않았습니다\)/);
  assert.match(b,/체결 8건\(HL 6 · US 2\) \/ 일지 2건 \/ 기다림: 아니오/);assert.match(b,/거래 2건/);
  assert.match(c,/기다림: 끔\(REMIND_WAIT_JOURNAL=0 — 2\.19\.0과 같음\)/);assert.match(c,/대상 거래 없음/);
  assert.match(d,/체결 0건 · 체결 확인 실패 HL \/ 일지 0건 \/ 기다림: 아니오\(체결 확인 실패 → 예전 동작\)/);}
 finally{console.log=orig;}});

test('서비스(Alerter.check): HL 주계정 체결(userFillsByTime)·키움 주문을 복기 알림에 넘김 → 일지 없으면 기다림 · 동기화되면 발송 · 텔레그램은 가짜',async()=>{
 const w={now:at('09:31'),gaps:0,journal:{},alerts:[]};
 const fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:null,orders:[]},acct_us:[],hl_address:MAIN,journal:{HL:{revision:1,unchanged:false,defaultRisk:1,account:3000}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[],acct:[],hl:{address:MAIN,fills:[],funding:[],days:[]}});
  if(url.endsWith('/rpc/review_gaps')){w.gaps++;return J({ok:true,journal:w.journal});}
  if(/\/rpc\/(risk_push|fresh_status|revenge_push|flip_push|revenge_data|mag_status)$/.test(url))return J({ok:true,version:15,orders:[],realized:[],positions:[],journal:{}});
  if(url.includes('api.telegram.org')){w.alerts.push(body.text);return J({ok:true,result:{message_id:1}});}
  if(url==='https://api.hyperliquid.xyz/info'){switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[]});
   case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:'3000'},time:w.now});case 'perpDexs':return J([null]);
   case 'userFillsByTime':return J(HL6.filter(f=>f.time>=body.startTime));case 'userFunding':return J([]);case 'frontendOpenOrders':return J([]);
   case 'userNonFundingLedgerUpdates':return J([]);case 'portfolio':return J([]);case 'subAccounts':return J([]);default:return J(null);}}
  return new Response('{}',{status:404});};
 const dir=await mkdtemp(path.join(tmpdir(),'ta23-')),logs=[];
 const env={SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:E.SUPABASE_KEY,KW_COLLECTOR_TOKEN:E.KW_COLLECTOR_TOKEN,TELEGRAM_BOT_TOKEN:E.TELEGRAM_BOT_TOKEN,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',QUICK_REVIEW:'0',MAG:'0',ALERT_MARKETS:'HL',REVENGE_ALERT:'0',FLIP_ALERT:'0',SCALP_MIN:'0'};
 const a=new Alerter(env,{fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();
 await a.check();assert.equal(w.gaps,1);assert.equal(a.state.remindWait?.fills?.HL,6);assert.equal(a.state.sent['remind:'+TODAY],undefined);const rv=()=>w.alerts.filter(x=>/복기|일지/.test(x));assert.equal(rv().length,0);
 assert.ok(logs.some(x=>/일지 동기화 기다림 켜짐|앱 동기화 기다림/.test(x)));
 w.now=at('09:40');await a.check();assert.equal(w.gaps,1,'15분 안');
 w.journal={HL:{from:'2026-11-01',trades:[T()]}};w.now=at('09:47');await a.check();assert.equal(w.gaps,2);assert.equal(rv().length,1);assert.match(rv()[0],/복기 시간/);assert.ok(a.state.sent['remind:'+TODAY]);});
