// alert6(trade-alert 2.4.0) 손실한도 판정 v1.6 — 주·월 한도 분모 = 기간 시작 직전 마감 잔액(없으면 현재 기준액).  node --test tests/*.test.mjs
import test from 'node:test';
import {fromHtml} from '../src/format.mjs'; // 2.5.1: 텔레그램 HTML(제목 <b>) → plain으로 비교
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {usCalendar,hlCalendar,etWall,kstWall} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as day from '../src/day.mjs';
import {Alerter,VERSION,RULES,statusMeta,riskStartFor} from '../src/alert.mjs';

const US=usCalendar(),HL=hlCalendar(),UTC=day.utcCalendar();
const H=(d,h,m=0)=>kstWall(d,h,m);
const CFG={limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000,dayMode:'realized'};
const hlAcct=o=>Object.entries(o).map(([d,v])=>({market:'hl',day:d,value:String(v),source:'close'}));
const usAcct=o=>Object.entries(o).map(([et,v])=>({market:'us',day:day.utcDate(Date.parse(et+'T12:00:00Z')+86400000),value:String(v),source:'close',etDate:et,captured_at:etWall(et,16,10)}));
/** alert.mjs와 같은 방식으로 periodRealized를 만듦(denomAt = dayDenomFor(acct)) */
function PR(market,now,rows,{basis,acct=[],denomAt=true}={}){
 const cal=market==='HL'?UTC:US,key=market==='HL'?day.utcDate(now):US.dayOf(now),from=day.periodFrom(cal,key);
 const B={value:basis,mode:'basis',key:null,source:market==='HL'?'HL BALANCE':'키움 주식 평가 + USD 예수금'};const dn=day.dayDenomFor(acct,market,B);
 const days=[];for(let k=cal.isTradingDay(from)?from:cal.next(from);k<=key;k=cal.next(k)){const p=rows[k]??0;days.push({key:k,pnl:p,trades:p?1:0,denom:dn(k)});}
 return {key,cal,rows:Object.entries(rows).map(([label,pnl])=>({label,pnl})),days,basis:B,...(denomAt?{denomAt:dn}:{})};
}
function runner(cal,cfg=CFG){let state=null;const refs=new Set();const all={messages:[],events:[]};
 return {all,get state(){return state;},set state(v){state=v;},
  step(now,equity,pr){const r=risk.step(state,{now,cal,cfg,equity:{value:equity,t:now,source:'test'},flows:[],fills:[],eventRefs:refs,dayMode:'realized',dayRealized:null,periodMode:'realized',periodRealized:pr});
   state=r.state;for(const e of r.events)refs.add(e.ref);all.messages.push(...r.messages);all.events.push(...r.events);return r;}};}

test('HL 출금 후에도 분모 유지: 주 시작(10/19 월) 직전 마감 10/18 UTC 20,000 → 출금으로 BALANCE 5,000이어도 주 −1,000 = −5% (v1.5면 −20%)',()=>{
 const R=runner(HL),acct=hlAcct({'2026-10-17':19500,'2026-10-18':20000,'2026-09-30':21000});
 const t=H('2026-10-20',15);
 const r=R.step(t,5000,PR('HL',t,{'2026-10-19':-400,'2026-10-20':-600},{basis:5000,acct}));const W=r.status.periods.week,M=r.status.periods.month;
 assert.equal(W.startEquity,20000);assert.equal(W.startSource,'10/18 마감 20,000.00 USDC');assert.equal(W.denomKey,'2026-10-18');assert.equal(W.denomStart,'2026-10-19');assert.equal(W.denomMode,'close');
 assert.equal(W.pnl,-1000);assert.equal(W.pct,-5);assert.equal(W.budget,1200);assert.equal(r.status.stopped,false,'−5% < −6% 아님');
 assert.equal(M.startSource,'09/30 마감 21,000.00 USDC');assert.equal(M.denomStart,'2026-10-01');assert.equal(M.budget,2100);
 assert.equal(r.status.periodDenom,'start-close');assert.match(r.status.config.periodRule,/^주·월 = 기간 실현손익 합 ÷ 기간 시작 직전 마감 잔액/);
 // 같은 입력, denomAt 없음(v1.5) → 현재 기준액 5,000 → −20% 중단
 const R5=runner(HL);const r5=R5.step(t,5000,PR('HL',t,{'2026-10-19':-400,'2026-10-20':-600},{basis:5000,acct,denomAt:false}));
 assert.equal(r5.status.periods.week.pct,-20);assert.equal(r5.status.periods.week.startSource,'현재 기준액 5,000.00 USDC');assert.equal(r5.status.stopped,true);assert.equal(r5.status.periodDenom,undefined);
 // 50% 경고에도 새 기준 표기
 const R2=runner(HL);const r2=R2.step(t,5000,PR('HL',t,{'2026-10-20':-700},{basis:5000,acct}));
 assert.match(r2.messages.find(m=>/주간 한도 \d+% 사용/.test(m.text)).text,/^🔔 하이퍼리퀴드 · 주간 한도 58% 사용\n\n이번 주 실현: −3\.50% \(−700\.00 USDC\)\n한도: −6% \(−1,200\.00 USDC\)\n기준: 10\/18 마감 20,000\.00 USDC/);
});

test('한도 기준일이 기간 시작: RISK_START_DATE=2026-10-20 → 주·월 분모 = 10/19 UTC 마감(기준일 직전) · denomStart 10/20',()=>{
 const cfg={...CFG,riskStart:riskStartFor('2026-10-20','HL',HL)};const R=runner(HL,cfg),acct=hlAcct({'2026-10-18':20000,'2026-10-19':18000,'2026-09-30':21000});
 const t=H('2026-10-20',15),r=R.step(t,9000,PR('HL',t,{'2026-10-19':-5000,'2026-10-20':-300},{basis:9000,acct}));const W=r.status.periods.week,M=r.status.periods.month;
 assert.equal(W.startSource,'10/19 마감 18,000.00 USDC');assert.equal(W.denomStart,'2026-10-20');assert.equal(W.pnl,-300,'기준일 전 −5,000 제외');assert.equal(W.pct,-1.6667);assert.equal(W.cut,'2026-10-20');
 assert.equal(M.startSource,'10/19 마감 18,000.00 USDC');assert.equal(M.denomStart,'2026-10-20');assert.equal(M.budget,1800);
 assert.equal(r.status.stopped,false);
});

test('월 시작 직전 마감 없음 → 월만 현재 기준액 폴백 · 7일 넘은 마감 → 폴백',()=>{
 const R=runner(HL),acct=hlAcct({'2026-10-18':20000,'2026-09-20':30000}); // 9/20은 10/01 기준 11일 전 → 안 씀
 const t=H('2026-10-20',15),r=R.step(t,12000,PR('HL',t,{'2026-10-20':-100},{basis:12000,acct}));const W=r.status.periods.week,M=r.status.periods.month;
 assert.equal(W.startSource,'10/18 마감 20,000.00 USDC');assert.equal(M.startSource,'현재 기준액 12,000.00 USDC');assert.equal(M.denomMode,'basis');assert.equal(M.denomStart,'2026-10-01');assert.equal(M.budget,1200);
 // 7일 초과: 주 시작 10/19 기준 10/11(8일 전)만 있음 → 현재 기준액
 const R2=runner(HL),r2=R2.step(t,12000,PR('HL',t,{'2026-10-20':-100},{basis:12000,acct:hlAcct({'2026-10-11':20000})}));
 assert.equal(r2.status.periods.week.startSource,'현재 기준액 12,000.00 USDC');assert.equal(r2.status.periods.week.denomMode,'basis');
 // 7일 경계 안(10/12 = 7일 전)은 씀
 const R3=runner(HL),r3=R3.step(t,12000,PR('HL',t,{'2026-10-20':-100},{basis:12000,acct:hlAcct({'2026-10-12':20000})}));
 assert.equal(r3.status.periods.week.startSource,'10/12 마감 20,000.00 USDC');
 // 마감값 0 → 폴백(앱 v28PrevBefore와 같음)
 const R4=runner(HL),r4=R4.step(t,12000,PR('HL',t,{'2026-10-20':-100},{basis:12000,acct:hlAcct({'2026-10-17':20000,'2026-10-18':0})}));
 assert.equal(r4.status.periods.week.startSource,'현재 기준액 12,000.00 USDC');
});

test('US: 주 시작 10/19(월) 직전 = 10/16(금) ET 마감, 달 시작 10/01 직전 = 09/30 ET 마감 (etDate 키)',()=>{
 const R=runner(US),acct=usAcct({'2026-09-30':61000,'2026-10-15':62500,'2026-10-16':63000,'2026-10-19':63592.79});
 const t=etWall('2026-10-20',12),r=R.step(t,16236.08,PR('US',t,{'2026-10-19':-600,'2026-10-20':-400},{basis:16236.08,acct}));const W=r.status.periods.week,M=r.status.periods.month;
 assert.equal(W.startSource,'10/16 마감 $63,000.00');assert.equal(W.denomKey,'2026-10-16');assert.equal(W.denomStart,'2026-10-19');assert.equal(W.pct,-1.5873);assert.equal(W.budget,3780);
 assert.equal(M.startSource,'09/30 마감 $61,000.00');assert.equal(M.denomStart,'2026-10-01');assert.equal(M.budget,6100);
 assert.equal(r.status.stopped,false,'v1.5(÷ $16,236.08 = −6.16%)라면 중단');
 // 기준일 10/20 → 10/19 ET 마감(출금 전) $63,592.79
 const R2=runner(US,{...CFG,riskStart:riskStartFor('2026-10-20','US',US)}),r2=R2.step(t,16236.08,PR('US',t,{'2026-10-20':392.23},{basis:16236.08,acct}));
 assert.equal(r2.status.periods.week.startSource,'10/19 마감 $63,592.79');assert.equal(r2.status.periods.week.budget,3815.5674);assert.equal(r2.status.periods.month.budget,6359.279);assert.equal(r2.status.periods.week.pct,0.6168);
});

test('마감 판정(다음 키로 넘어갈 때)도 기간 분모 사용 · 메시지 기준 표기',()=>{
 const R=runner(HL),acct=hlAcct({'2026-10-18':10000});
 const t1=H('2026-10-20',10),t2=H('2026-10-21',9,5);
 R.step(t1,4000,PR('HL',t1,{'2026-10-20':-100},{basis:4000,acct}));
 let r=R.step(t1+3600000,4000,PR('HL',t1,{'2026-10-20':-650},{basis:4000,acct}));
 const st=r.status.stops.find(s=>s.rule==='week-intraday');assert.ok(st,'−6.5% 장중');assert.match(st.reason,/기준 10\/18 마감 10,000\.00 USDC/);
 assert.match(R.all.messages.find(m=>m.text.startsWith('⛔')).text,/주간 실현 −6% 장중 도달\n\n이번 주 실현: [^\n]+\n한도: −6% \(−600\.00 USDC\)\n기준: 10\/18 마감 10,000\.00 USDC/);
 r=R.step(t2,4000,PR('HL',t2,{'2026-10-20':-650},{basis:4000,acct}));
 const w=r.status.stops.find(s=>s.rule==='week');assert.ok(w);assert.equal(w.id,'HL:weekr:2026-10-19');assert.match(w.reason,/마감 10\/20 UTC · 기준 10\/18 마감 10,000\.00 USDC/);
});

test('처음 v1.6 적용: 새 분모로 성립하지 않는 v1.5 실현 주·월 중단 해제 + 🔄 1회, 성립하면 유지, 반복 없음',()=>{
 const t=H('2026-10-20',15),acct=hlAcct({'2026-10-18':20000,'2026-09-30':20000});
 // v1.5로 중단(÷ 5,000 = −20%)
 const R=runner(HL);R.step(t,5000,PR('HL',t,{'2026-10-20':-1000},{basis:5000,acct,denomAt:false}));
 assert.deepEqual(R.state.stops.filter(s=>!s.cleared).map(s=>s.rule).sort(),['month-intraday','week-intraday']);assert.equal(R.state.periodDenom,undefined);
 // 2.4.0으로 업데이트 → ÷ 20,000 = −5% → 둘 다 해제
 let r=R.step(t+60000,5000,PR('HL',t,{'2026-10-20':-1000},{basis:5000,acct}));
 assert.equal(r.status.stopped,false);assert.equal(r.events.filter(e=>e.kind==='clear'&&e.rule==='denom-period-start').length,2);
 const m=r.messages.filter(x=>x.text.startsWith('🔄'));assert.equal(m.length,1);
 assert.match(m[0].text,/^🔄 하이퍼리퀴드 · 손실 한도 판정 v1\.6 — 주·월 분모 변경\n\n주·월 분모: 기간 시작 직전 마감 잔액 \(없으면 현재 기준액\)/);
 assert.match(m[0].text,/\n이번 주 기준: 10\/18 마감 20,000\.00 USDC · 한도 −6% = −1,200\.00 USDC · 지금 실현 −5\.00%/);
 assert.match(m[0].text,/이번 달 기준: 09\/30 마감 20,000\.00 USDC · 한도 −10% = −2,000\.00 USDC/);
 assert.match(m[0].text,/\n중단 해제: (\d건\n· )?주간 실현 −6% 장중 도달 \(~ /);
 assert.equal(R.state.periodDenom,'start-close');assert.deepEqual(r.status.clearedBasis.length,2);
 r=R.step(t+120000,5000,PR('HL',t,{'2026-10-20':-1000},{basis:5000,acct}));assert.equal(r.messages.filter(x=>x.text.startsWith('🔄')).length,0,'반복 없음');assert.equal(r.status.stopped,false);
 // 새 분모로도 주는 성립(−6.5%) → 주 유지, 달(−6.5% > −10%)만 해제, 🔄 1회
 const R2=runner(HL);R2.step(t,5000,PR('HL',t,{'2026-10-20':-1300},{basis:5000,acct,denomAt:false}));
 r=R2.step(t+60000,5000,PR('HL',t,{'2026-10-20':-1300},{basis:5000,acct}));
 assert.ok(r.status.stops.some(s=>s.rule==='week-intraday'),'−6.5% 그대로 중단');assert.ok(!r.status.stops.some(s=>s.rule==='month-intraday'));
 assert.deepEqual(r.events.filter(e=>e.rule==='denom-period-start').map(e=>e.detail.stopId),['HL:monthr-intraday:2026-10-20']);
 assert.equal(r.messages.filter(x=>x.text.startsWith('🔄')).length,1);assert.match(r.messages.find(x=>x.text.startsWith('🔄')).text,/중단 해제: 월간 실현 −10% 장중 도달/);assert.equal(r.status.stopped,true);
});

test('서비스: alert5.sql(v5) acct 40일로 월 시작 직전 마감까지 읽음 → status·describe·statusMeta v1.6, SQL v3이면 v1.4 폴백 그대로',async()=>{
 assert.equal(VERSION,'2.5.1');assert.equal(RULES,'손실한도 판정 v1.6');
 assert.match(statusMeta({dayBasis:'realized',periodBasis:'realized',periodDenom:'start-close'}).basis.label,/주·월 ÷ 기간 시작 직전 마감\(없으면 현재 기준액\)/);
 assert.match(statusMeta({dayBasis:'realized',periodBasis:'realized'}).basis.label,/주·월 ÷ 현재 기준액/);
 const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24);
 const w={now:kstWall('2026-10-20',12,30),tg:[],pushes:[],dayVersion:5};
 const acct=usAcct({'2026-09-30':61000,'2026-10-16':63000,'2026-10-19':63592.79});
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:{date:'2026-10-20',as_of:w.now-60000,summary:{currency:'USD',reportedSecuritiesValue:'0',cash:{apiId:'ust21160',currency:'USD',usd:'16236.08',krwIncluded:false}},positions:[]},orders:[]},
   acct_us:[],hl_address:null,journal:{US:{revision:1,unchanged:body.p_us_revision===1,defaultRisk:1,account:60000},HL:{revision:1,unchanged:true,defaultRisk:1,account:null}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:w.dayVersion,kw_days:[{date:'2026-10-19',as_of:1,total:'-600',count:2},{date:'2026-10-20',as_of:2,total:'-400',count:1}],acct,hl:null});
  if(url.endsWith('/rpc/risk_push')){w.pushes.push(body.p_payload);return J({ok:true});}
  if(url.includes('api.telegram.org')){w.tg.push(fromHtml(body.text));return J({ok:true,result:{}});}
  return J({message:'not found'},404);};
 const env=dir=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',ALERT_MARKETS:'US'});
 const a=new Alerter(env(await mkdtemp(path.join(tmpdir(),'ta6-'))),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await a.init();
 const r=await a.check();const s=r.statuses[0];
 assert.equal(s.version,'2.5.1');assert.equal(s.rules,'손실한도 판정 v1.6');assert.equal(s.periodDenom,'start-close');
 assert.equal(s.periods.week.startSource,'10/16 마감 $63,000.00');assert.equal(s.periods.week.pct,-1.5873);assert.equal(s.periods.month.startSource,'09/30 마감 $61,000.00');
 assert.equal(s.stopped,false,'2.3.0이면 −6.16% 주간 실현 중단(alert5.test)');
 assert.equal(w.pushes.at(-1).states[0].status.periods.week.denomStart,'2026-10-19');
 assert.match(a.describe(r.statuses),/주간   −1\.59% \/ 6%  \(26%\)\n  · 손익 −\$1,000\.00\n  · 기준 10\/16 마감 \$63,000\.00 · 한도 −\$3,780\.00/);
 assert.match(a.describe(r.statuses),/월간   [^\n]+\n  · 손익 [^\n]+\n  · 기준 09\/30 마감 \$61,000\.00/);assert.match(a.summaryText(r.statuses,w.now),/^📊 손실 한도 요약 · 미국 \d\d\/\d\d\(.\) 장마감\n\n🇺🇸 미국주식 · 거래일 [^\n]+\n오늘   [^\n]+\n주간   −1\.59% \/ 6%  \(26%\)\n/);
 // SQL v3(alert3.sql만) → 주·월은 v1.4(자산 변화)로 폴백 — v1.6 필드 없음
 const w3={...w};const b=new Alerter(env(await mkdtemp(path.join(tmpdir(),'ta6b-'))),{fetcher:async(u,o)=>{w.dayVersion=3;return w.fetcher(u,o);},now:()=>w.now,log:()=>{},sleep:async()=>{}});await b.init();
 const r3=await b.check();assert.equal(r3.statuses[0].periodBasis,'equity');assert.equal(r3.statuses[0].periodDenom,undefined);void w3;
});
