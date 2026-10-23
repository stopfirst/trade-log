// alert7(trade-alert 2.5.0, 2.5.1에서 문구 기대값만 갱신) — 미래 한도 기준일(RISK_START_DATE): 기존 중단 전부 해제, 그 전엔 판정·알림·재시작 절반 없음, 요약 'MM/DD부터 적용'.
// node --test tests/*.test.mjs
import test from 'node:test';
import {fromHtml} from '../src/format.mjs'; // 2.5.1: 텔레그램 HTML(제목 <b>) → plain으로 비교
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {usCalendar,hlCalendar,etWall,kstWall} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as day from '../src/day.mjs';
import {Alerter,VERSION,riskStartFor} from '../src/alert.mjs';

const US=usCalendar(),HL=hlCalendar(),UTC=day.utcCalendar();
const H=(d,h,m=0)=>kstWall(d,h,m);
const CFG={limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000,dayMode:'realized'};
const RS20=riskStartFor('2026-10-20','HL',HL),RS26=riskStartFor('2026-10-26','HL',HL);
function PR(market,now,rows,basis){
 const cal=market==='HL'?UTC:US,key=market==='HL'?day.utcDate(now):US.dayOf(now),from=day.periodFrom(cal,key);
 const B={value:basis,mode:'basis',key:null,source:'x'};const dn=day.dayDenomFor([],market,B);
 const days=[];for(let k=cal.isTradingDay(from)?from:cal.next(from);k<=key;k=cal.next(k)){const p=rows[k]??0;days.push({key:k,pnl:p,trades:p?1:0,denom:dn(k)});}
 return {key,cal,rows:Object.entries(rows).map(([label,pnl])=>({label,pnl})),days,basis:B,denomAt:dn};
}
const DR=(key,pnl,until,base)=>({key,pnl,until,denom:{value:base,mode:'basis',source:'x'}});
function runner(cal){let state=null;const refs=new Set();const all={messages:[],events:[]};
 return {all,get state(){return state;},set state(v){state=v;},
  step(now,equity,cfg,{pr=null,dr=null}={}){const r=risk.step(state,{now,cal,cfg,equity:{value:equity,t:now,source:'test'},flows:[],fills:[],eventRefs:refs,dayMode:'realized',dayRealized:dr,periodMode:pr?'realized':undefined,periodRealized:pr});
   state=r.state;for(const e of r.events)refs.add(e.ref);all.messages.push(...r.messages);all.events.push(...r.events);return r;}};}

test('버전 2.6.0',()=>{assert.equal(VERSION,'2.6.0');});

test('HL 실데이터 모양: 10/20 기준일로 걸린 월간 중단(~11/01 09:00 KST) + 하루 중단(~10/24 09:00) → 기준일 10/26으로 바꾸면 둘 다 해제 · 🔄 1회 · 그 전엔 기록만',()=>{
 const R=runner(HL),c20={...CFG,riskStart:RS20},c26={...CFG,riskStart:RS26};
 // 10/23 10:00 KST(UTC 10/23): 이번 달 실현 −12,000 ÷ 기준 20,000 = −60% → 월 장중 중단(그날 끝까지) + 하루 −4,000 = −20% → 하루 중단
 const t1=H('2026-10-23',10);
 let r=R.step(t1,8000,c20,{pr:PR('HL',t1,{'2026-10-21':-8000,'2026-10-23':-4000},20000),dr:DR('2026-10-23',-4000,H('2026-10-24',9),20000)});
 assert.equal(r.status.stopped,true);assert.ok(r.status.stops.some(s=>s.rule==='day'));
 // 실제 앱에 보이던 '거래 중단 ~11/01 09:00 KST'(월간 마감 판정)도 넣음
 R.state.stops.push({id:'HL:monthr:2026-10@2026-10-20',rule:'month',basis:'realized',from:H('2026-10-20',9),until:H('2026-11-01',9),since:'2026-10-20',reason:'월간 실현 −58.30%',createdAt:t1});
 const t2=H('2026-10-23',13);
 r=R.step(t2,8000,c26,{pr:PR('HL',t2,{'2026-10-21':-8000,'2026-10-23':-4500},20000),dr:DR('2026-10-23',-4500,H('2026-10-24',9),20000)});
 assert.equal(r.status.stopped,false,'중단 전부 해제');assert.equal(r.status.stops.length,0);
 const cl=r.events.filter(e=>e.kind==='clear'&&e.rule==='risk-start');assert.ok(cl.length>=2,'하루(10/24에 끝나는 것)와 월간 둘 다 clear 기록 '+cl.length);
 assert.ok(cl.some(e=>e.detail.until===H('2026-10-24',9)),'기준일 전에 끝나는 하루 중단도 해제(2.4.0은 유지)');
 const m=r.messages.filter(x=>x.text.startsWith('🔄'));assert.equal(m.length,1);
 assert.match(m[0].text,/^🔄 하이퍼리퀴드 · 손실 한도 10\/26부터 새로 셈\n\n한도 적용: 10\/26\(월\) 09:00 KST부터\n그 전: 판정·알림 안 함 \(기록만\)/);assert.match(m[0].text,/\n중단 해제: \d건\n(· [^\n]*\n)*· [^\n]*월간/);
 assert.equal(r.status.halfRisk.active,false,'해제 직후 재시작 절반 없음');
 assert.equal(r.status.riskStart.before,true);assert.match(r.status.note,/기준일 10\/26 전/);
 assert.equal(r.status.periods.day.missing,'before-start');assert.equal(r.status.periods.week.pct,null);assert.equal(r.status.periods.month.pct,null);
 // 그 뒤 기준일 전 큰 손실 → 중단·경고 없음
 const t3=H('2026-10-25',20);
 r=R.step(t3,5000,c26,{pr:PR('HL',t3,{'2026-10-21':-8000,'2026-10-23':-4500,'2026-10-25':-3000},20000),dr:DR('2026-10-25',-3000,H('2026-10-26',9),20000)});
 assert.equal(r.status.stopped,false);assert.equal(r.messages.length,0,'메시지 없음(🔄 다시 안 보냄)');
 // 기준 시각(10/26 09:00 KST) 지나면 판정: 10/26 하루 −700 ÷ 20,000 = −3.5% → 중단 @2026-10-26
 const t4=H('2026-10-26',10);
 r=R.step(t4,4300,c26,{pr:PR('HL',t4,{'2026-10-23':-4500,'2026-10-25':-3000,'2026-10-26':-700},20000),dr:DR('2026-10-26',-700,H('2026-10-27',9),20000)});
 assert.equal(r.status.riskStart.before,false);assert.equal(r.status.periods.week.pnl,-700,'주 합계는 기준일 키부터(10/26만)');
 assert.ok(r.status.stops.some(s=>s.id==='HL:dayr:2026-10-26@2026-10-26'),'10/26부터 하루 한도 판정');assert.equal(r.status.stopped,true);
});

test('기준일 전: 오늘 끝난 중단이 있어도 재시작 첫날(위험 절반) 없음 · 기준일이 지난 뒤 생긴 중단은 유지(2.4.0과 같음)',()=>{
 const R=runner(HL),c26={...CFG,riskStart:RS26};
 const t0=H('2026-10-23',8);R.step(t0,10000,c26);
 R.state.stops.push({id:'HL:dayr:2026-10-22@2026-10-26',rule:'day',from:H('2026-10-22',10),until:H('2026-10-23',9),since:'2026-10-26',createdAt:t0}); // 같은 기준일 표시(해제 대상 아님) · 오늘 09:00 끝남
 const r=R.step(H('2026-10-23',11),10000,c26);assert.equal(r.status.halfRisk.active,false);assert.equal(r.messages.filter(x=>x.text.startsWith('✅')).length,0);
 // 기준일 지난 상태(10/20)에서는 기준일 전에 끝난 중단은 건드리지 않음(2.4.0과 같음)
 const Q=runner(HL),c20={...CFG,riskStart:RS20};Q.step(H('2026-10-23',8),10000,c20);
 Q.state.stops.push({id:'HL:dayr:2026-10-23@2026-10-20',rule:'day',from:H('2026-10-23',9),until:H('2026-10-24',9),since:'2026-10-20',createdAt:0});
 const q=Q.step(H('2026-10-23',12),10000,c20);assert.equal(q.status.stopped,true,'기준일 지난 뒤 생긴 중단은 유지');
});

test('US: 기준일 10/26(월) = 10/23 16:00 ET(10/24 05:00 KST)부터 · 그 전 금요일 장중 중단 해제 · 판정 없음',()=>{
 const R=runner(US),c20={...CFG,riskStart:riskStartFor('2026-10-20','US',US)},c26={...CFG,riskStart:riskStartFor('2026-10-26','US',US)};
 assert.equal(c26.riskStart.at,etWall('2026-10-23',16));
 const t1=etWall('2026-10-23',11);
 let r=R.step(t1,9000,c20,{dr:DR('2026-10-23',-400,etWall('2026-10-23',16),10000)});assert.equal(r.status.stopped,true);
 r=R.step(etWall('2026-10-23',11,5),9000,c26,{dr:DR('2026-10-23',-450,etWall('2026-10-23',16),10000)});
 assert.equal(r.status.stopped,false);assert.equal(r.status.periods.day.missing,'before-start');assert.match(r.messages[0].text,/^🔄 미국주식 · 손실 한도 10\/26부터 새로 셈\n\n한도 적용: 10\/26\(월\) 미국 장부터 \(KST 10\/26 22:30~\)\n그 전: 판정·알림 안 함 \(기록만\)/);
});

test('서비스: RISK_START_DATE를 미래(10/26)로 바꿔 재시작 → 기존 US 하루 중단 해제·🔄 1회·요약 "10/26부터 적용"',async()=>{
 const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24);
 const w={now:etWall('2026-10-23',11),tg:[],pushes:[],today:-2500};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:{date:'2026-10-24',as_of:w.now-60000,summary:{currency:'USD',reportedSecuritiesValue:'0',cash:{apiId:'ust21160',currency:'USD',usd:'60000',krwIncluded:false}},positions:[]},orders:[]},
   acct_us:[],hl_address:null,journal:{US:{revision:1,unchanged:body.p_us_revision===1,defaultRisk:1,account:60000},HL:{revision:1,unchanged:true,defaultRisk:1,account:null}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[{date:'2026-10-23',as_of:2,total:String(w.today),count:1}],acct:[],hl:null});
  if(url.endsWith('/rpc/risk_push')){w.pushes.push(body.p_payload);return J({ok:true});}
  if(url.includes('api.telegram.org')){w.tg.push(fromHtml(body.text));return J({ok:true,result:{}});}
  return J({message:'not found'},404);};
 const dir=await mkdtemp(path.join(tmpdir(),'ta7-'));
 const env=rs=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',ALERT_MARKETS:'US',RISK_START_DATE:rs});
 const a=new Alerter(env('2026-10-20'),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await a.init();
 let r=await a.check();assert.equal(r.statuses[0].stopped,true,JSON.stringify(r.statuses[0].periods.day)+'10/20 기준: 오늘 −2,500 ÷ 60,000 = −4.17% → 하루 중단');
 w.tg.length=0;w.now+=120000;
 const b=new Alerter(env('2026-10-26'),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await b.init();
 r=await b.check();const s=r.statuses[0];
 assert.equal(s.stopped,false);assert.equal(s.version,'2.6.0');assert.equal(s.riskStart.date,'2026-10-26');assert.equal(s.riskStart.before,true);
 assert.equal(w.tg.filter(t=>t.startsWith('🔄')).length,1);assert.match(w.tg.find(t=>t.startsWith('🔄')),/중단 해제: 하루/);
 assert.ok(w.pushes.at(-1).events.some(e=>e.kind==='clear'&&e.rule==='risk-start'),'risk_events clear 기록');
 assert.match(b.summaryText(r.statuses,w.now),/\n오늘   — 10\/26부터\n주간   — 10\/26부터\n월간   — 10\/26부터\n연속 손실: 0\/3일\n중단: 없음\n한도 적용: 10\/26\(월\) 미국 장부터 \(KST 10\/26 22:30~\)$/);assert.doesNotMatch(b.summaryText(r.statuses,w.now),/※/,'요약엔 ※ 기준일 중복 줄 없음');
 assert.match(b.describe(r.statuses),/오늘   — 10\/26부터/);
 w.tg.length=0;w.now+=120000;w.today=-5000;r=await b.check();assert.equal(r.statuses[0].stopped,false);assert.equal(w.tg.length,0,'기준일 전 손실 더 커져도 알림 없음');
});
