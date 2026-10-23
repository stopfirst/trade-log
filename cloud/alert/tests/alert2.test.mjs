// alert2 서비스 통합 테스트(네트워크 없음: Supabase·텔레그램·Hyperliquid 모두 가짜 응답).
import test from 'node:test';
import {fromHtml} from '../src/format.mjs'; // 2.5.1: 텔레그램 HTML(제목 <b>) → plain으로 비교
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Alerter,readConfig,makeLogger,main} from '../src/alert.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),ADDR='0x'+'c'.repeat(40);
const env=dir=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0'});
const NOW0=Date.parse('2026-10-13T01:00:00Z'); // 화 10:00 KST · 월 21:00 ET (US 거래일 10/13)

test('config 기본값 = 손실한도 판정 v1.2(3/6/10, 0.5%·3일→1거래일, 위험 ×0.5), 시장별 덮어쓰기, 비밀키 거부',()=>{
 const c=readConfig(env('/tmp'));
 assert.deepEqual(c.limits.US,{day:3,week:6,month:10});assert.deepEqual(c.limits.HL,{day:3,week:6,month:10});
 assert.equal(c.streakLossPct,0.5);assert.equal(c.streakDays,3);assert.equal(c.streakStopDays,1);assert.equal(c.restartFactor,0.5);assert.equal(c.checkSec,60);assert.deepEqual(c.warn,[50,80]);
 const d=readConfig({...env('/tmp'),HL_RISK_PCT:'2,5,0',STREAK_STOP_DAYS:'2',RISK_CHECK_SEC:'300',US_EXTRA_HOLIDAYS:'2026-12-31'});
 assert.deepEqual(d.limits.HL,{day:2,week:5,month:null});assert.equal(d.streakStopDays,2);assert.equal(d.checkSec,300);
 assert.throws(()=>readConfig({...env('/tmp'),RISK_CHECK_SEC:'30'}),/CONFIG_INCOMPLETE/,'1–5분 범위');
 assert.throws(()=>readConfig({...env('/tmp'),SUPABASE_KEY:'sb_secret_x'}),/CONFIG_SECRET_KEY_REFUSED/);
 const sa=new Alerter({...env('/tmp'),DAILY_SUMMARY:'1'},{now:()=>NOW0,log:()=>{}});assert.equal(sa.summaryDue(NOW0),'summary:2026-10-12','미국 장 마감 후(21:00 ET) 요약');assert.equal(sa.summaryDue(Date.parse('2026-10-12T19:00:00Z')),null,'15:00 ET 이전 없음');assert.equal(sa.summaryDue(Date.parse('2026-10-11T01:00:00Z')),null,'토요일 없음');
 const lines=[];makeLogger(env('/tmp'),l=>lines.push(l))('ERROR',`x ${BOT} ${TOKEN} ${KEY}`);assert.ok(!lines[0].includes(BOT)&&!lines[0].includes(TOKEN)&&!lines[0].includes(KEY));
});

function world(){
 const w={now:NOW0,hlEq:'10000',fills:[],ledger:[],usCash:'765.44',usSec:'1234.56',usAsOf:NOW0-60000,orders:[],pushes:[],tg:[],dbEvents:[],dbFlows:[],dbState:[]};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,
   kw:{latest:{date:'2026-10-13',as_of:w.usAsOf,summary:{currency:'USD',reportedSecuritiesValue:w.usSec,cash:{apiId:'ust21160',currency:'USD',usd:w.usCash,krwIncluded:false}},positions:[]},orders:w.orders},
   acct_us:[],hl_address:ADDR,journal:{US:{revision:1,unchanged:body.p_us_revision===1,defaultRisk:1},HL:{revision:1,unchanged:body.p_hl_revision===1,defaultRisk:2}},
   risk:{state:w.dbState,events:w.dbEvents,flows:w.dbFlows}});
  if(url.endsWith('/rpc/risk_push')){const p=body.p_payload;w.pushes.push(p);for(const e of p.events||[])w.dbEvents.push({market:e.market,ref:e.ref,kind:e.kind});for(const f of p.flows||[])w.dbFlows.push(f);return J({ok:true});}
  if(url.includes('api.telegram.org')){w.tg.push(fromHtml(body.text));return J({ok:true,result:{}});}
  if(url==='https://api.hyperliquid.xyz/info'){
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[{token:0,coin:'USDC',total:'0',hold:'0'}]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:w.hlEq},time:Date.now()});case 'perpDexs':return J([null]);
    case 'userFillsByTime':return J(w.fills.filter(f=>f.time>=body.startTime));case 'userNonFundingLedgerUpdates':return J(w.ledger);case 'portfolio':return J([]);}
  }
  return J({message:'not found'},404);};
 return w;
}

test('check(): HL 하루 −3% → 중단 상태 저장·알림, 중단 중 진입 → 위반 기록, US 입금 추정은 손익에서 제외',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta2-'));const w=world();
 const a=new Alerter(env(dir),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await a.init();
 let r=await a.check();
 assert.equal(r.statuses.length,2);const hl=r.statuses.find(s=>s.market==='HL'),us=r.statuses.find(s=>s.market==='US');
 assert.equal(hl.equity.value,10000);assert.equal(us.equity.value,2000);assert.equal(hl.stopped,false);
 assert.deepEqual(w.pushes[0].states.map(s=>s.market).sort(),['hl','us']);assert.equal(w.tg.length,0);
 // +1분: HL 9650 → −3.5%
 w.now+=60000;w.hlEq='9650';r=await a.check();
 const hl2=r.statuses.find(s=>s.market==='HL');assert.equal(hl2.stopped,true);assert.equal(hl2.stops[0].until,Date.parse('2026-10-13T15:00:00Z'),'10/14 00:00 KST');
 const push=w.pushes.at(-1);assert.ok(push.events.some(e=>e.kind==='stop'&&e.market==='hl'&&e.ref==='HL:day:2026-10-13'));assert.equal(push.states.find(s=>s.market==='hl').status.stopped,true);
 assert.ok(w.tg.some(t=>/^⛔ 하이퍼리퀴드 거래 중단 · 하루 −3% 도달\n\n오늘: −3\.50%/.test(t)),w.tg.join('\n'));
 // +1분: 중단 중 BTC 신규 진입 + US 예수금 +500(매매 없음 = 입금 추정)
 w.now+=60000;w.fills.push({coin:'BTC',time:w.now-30000,sz:'0.01',startPosition:'0',side:'B',px:'60000',tid:777,dir:'Open Long',hash:'0x1'});
 w.usCash='1265.44';w.usAsOf=w.now-10000;r=await a.check();
 const p3=w.pushes.at(-1);
 const v=p3.events.find(e=>e.kind==='violation');assert.ok(v);assert.equal(v.detail.tid,777);assert.equal(v.market,'hl');
 assert.ok(w.tg.some(t=>/^🚫 하이퍼리퀴드 · 거래 중단 중 신규 진입\n\n종목: BTC /.test(t)));
 const f=p3.flows.find(x=>x.source==='us-implied');assert.ok(f);assert.equal(f.amount,500);
 const us3=r.statuses.find(s=>s.market==='US');assert.equal(us3.periods.day.pnl,0,'입금 500은 손익 아님');assert.equal(us3.equity.value,2500);
 // 같은 상태로 한 번 더 → 중복 알림·이벤트 없음
 const n=w.tg.length;w.now+=60000;r=await a.check();assert.equal(w.tg.length,n);assert.ok(!(w.pushes.at(-1)?.events||[]).some(e=>e.kind!=='restart'&&w.dbEvents.filter(d=>d.ref===e.ref).length>1));
 const saved=JSON.parse(await readFile(path.join(dir,'state2.json'),'utf8'));assert.equal(saved.v,2);assert.ok(saved.engine.HL.stops.length===1);
 // 재시작(로컬 상태 유지) 후 다음 날 0시 → 재시작 첫날 알림(HL 설정 위험 2% → 1%)
 const b=new Alerter(env(dir),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await b.init();
 w.now=Date.parse('2026-10-13T15:01:00Z');r=await b.check();
 const hl4=r.statuses.find(s=>s.market==='HL');assert.equal(hl4.stopped,false);assert.equal(hl4.halfRisk.active,true);
 assert.ok(w.tg.some(t=>/^✅ 하이퍼리퀴드 · 거래 중단 해제\n\n오늘: [^\n]+ 재시작 첫날\n1회 위험: 1% \(설정 2%의 50%\)/.test(t)),w.tg.at(-1));
});

test('Supabase 저장 실패 → 이벤트 보관 후 다음 확인 때 다시 저장, 텔레그램 실패 → 2시간 재시도',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta2-'));const w=world();let failPush=true,failTg=true;
 const base=w.fetcher;const fetcher=async(url,opts)=>{if(url.endsWith('/rpc/risk_push')&&failPush)return new Response('{"message":"x"}',{status:400});if(url.includes('telegram')&&failTg)return new Response('{"ok":false,"description":"Bad Request: chat not found"}',{status:400});return base(url,opts);};
 const a=new Alerter(env(dir),{fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await a.init();
 await a.check();w.now+=60000;w.hlEq='9600';await a.check();
 assert.equal(w.pushes.length,0);assert.equal(a.state.pending.events.length,1,JSON.stringify(a.state.pending.events));assert.equal(a.state.outbox.length,2,"중단 + 주간 사전 경고");
 failPush=false;failTg=false;w.now+=60000;await a.check();
 assert.ok(w.pushes.at(-1).events.some(e=>e.ref==='HL:day:2026-10-13'));assert.equal(a.state.pending.events.length,0);assert.ok(w.tg.some(t=>t.startsWith('⛔')));
});

test('CLI --flow / --clear-stops 사용법 오류는 코드 2',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ta2-'));const out=[];const orig=console.log;console.log=x=>out.push(String(x));
 try{assert.equal(await main(['--flow','XX','1'],env(dir)),2);assert.equal(await main(['--clear-stops'],env(dir)),2);}finally{console.log=orig;}
 assert.ok(out.some(l=>/사용법/.test(l)));
});
