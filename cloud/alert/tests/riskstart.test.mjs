// alert4(trade-alert 2.2.0) 손실한도 판정 v1.4 — 한도 기준일(RISK_START_DATE) 테스트.  node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {usCalendar,hlCalendar,etWall,kstWall} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as old from './fixtures/risk-v13.mjs';
import {readConfig,riskStartFor,engineCfg} from '../src/alert.mjs';
import * as src from '../src/sources.mjs';

const US=usCalendar(),HL=hlCalendar();
const H=(d,h,m=0)=>kstWall(d,h,m);
const CFG={limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000};
const RS_HL=riskStartFor('2026-10-20','HL',HL),RS_US=riskStartFor('2026-10-20','US',US);
function runner(cal,{cfg=CFG,anchorAt=null,engine=risk}={}){
 let state=null;const refs=new Set();const all={messages:[],events:[]};
 return {cfg,
  step(now,equity,{flows=[],fills=[],dayRealized=null,dayMode}={}){
   const c=this.cfg;const r=engine.step(state,{now,cal,cfg:dayMode?{...c,dayMode}:c,equity:equity==null?null:{value:equity,t:now,source:'test'},flows,fills,eventRefs:refs,anchorAt,dayMode:dayMode||c.dayMode,dayRealized});
   state=r.state;for(const e of r.events)refs.add(e.ref);all.messages.push(...r.messages);all.events.push(...r.events);return r;},
  get state(){return state;},all,refs};
}

test('RISK_START_DATE 설정·검증, 시장별 기준 시각(HL UTC 00:00 = KST 09:00 · US 그 날짜 ET 거래일 시작)',()=>{
 const E={TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32),TELEGRAM_CHAT_ID:'1'};
 assert.equal(readConfig(E,{needSupabase:false}).riskStartDate,null,'기본 = 없음');
 assert.equal(readConfig({...E,RISK_START_DATE:' 2026-10-20 '},{needSupabase:false}).riskStartDate,'2026-10-20');
 for(const bad of ['2026-13-01','2026-02-30','20261020','오늘'])assert.throws(()=>readConfig({...E,RISK_START_DATE:bad},{needSupabase:false}),/CONFIG_INCOMPLETE/,bad);
 assert.deepEqual(RS_HL,{date:'2026-10-20',day:'2026-10-20',realKey:'2026-10-20',at:H('2026-10-20',9)});
 assert.equal(RS_US.day,'2026-10-20');assert.equal(RS_US.at,etWall('2026-10-19',16),'US 10/20 거래일 = 10/19 16:00 ET(= 10/20 05:00 KST)부터');
 assert.equal(RS_US.at,H('2026-10-20',5));
 const sat=riskStartFor('2026-10-24','US',US);assert.equal(sat.day,'2026-10-26','토요일 → 다음 거래일(월)');assert.equal(sat.at,etWall('2026-10-23',16));
 const c=readConfig({...E,RISK_START_DATE:'2026-10-20'},{needSupabase:false});
 assert.deepEqual(engineCfg(c,'HL',1,'realized',HL).riskStart,RS_HL);assert.equal(engineCfg(readConfig(E,{needSupabase:false}),'HL',1,'realized',HL).riskStart,null);
});

test('주 중간 기준일(HL 화 10/20): 월요일 손실 제외, 주 = 기준 시각(UTC 00:00 직전 서버 관측)부터 · 미설정이면 주 −6% 장중 중단',()=>{
 const seq=R=>{R.step(H('2026-10-19',0,5),10000);R.step(H('2026-10-19',22),9500);R.step(H('2026-10-20',8,50),9500);return R.step(H('2026-10-20',10),9350);};
 const A=runner(HL,{cfg:{...CFG,riskStart:RS_HL}}),B=runner(HL);
 const a=seq(A),b=seq(B);
 assert.ok(b.status.stops.some(s=>s.rule==='week-intraday'),'미설정: 10000 → 9350 = −6.5% 주 장중 도달');
 assert.equal(a.status.stopped,false,'기준일: 9500(08:50 관측) → 9350 = −1.58%');
 assert.equal(a.status.periods.week.startEquity,9500);assert.equal(a.status.periods.week.pct,-1.5789);assert.equal(a.status.periods.week.cut,'2026-10-20');
 assert.match(a.status.periods.week.startSource,/^기준일 10\/20 · 서버 관측$/);
 assert.equal(a.status.periods.day.startEquity,9500,'v1.2 하루(KST 10/20)도 KST 09:00 이전 몫 제외');
 assert.equal(a.status.periods.month.startEquity,9500);
 assert.equal(a.status.riskStart.date,'2026-10-20');assert.equal(a.status.riskStart.base.equity,9500);assert.equal(a.status.config.riskStart,'2026-10-20');
 assert.ok(A.all.messages.some(m=>/^🔄 하이퍼리퀴드 손실 한도 기준일 10\/20 — 10\/20\(화\) 09:00 KST부터 다시 셉니다/.test(m.text)));
 // 기준 시각 이후 손실은 그대로 셈: 9500 → 8900 = −6.3% → 주 장중 중단(새 id)
 const r=A.step(H('2026-10-20',11),8900);const s=r.status.stops.find(x=>x.rule==='week-intraday');
 assert.ok(s,'기준일 이후 −6.3%');assert.equal(s.id,'HL:week-intraday:2026-10-20@2026-10-20');
 assert.ok(r.messages.some(m=>/시작 9,500\.00 USDC · 기준일 10\/20부터\) · 주간 한도 −6% 장중 도달/.test(m.text)));
 // 다음 주는 평소대로(월요일 시작)
 const n=A.step(H('2026-10-26',0,5),8900);assert.equal(n.status.periods.week.cut,undefined);assert.equal(n.status.periods.month.cut,'2026-10-20','10월은 아직 기준일부터');
 assert.equal(A.step(H('2026-11-02',0,5),8900).status.periods.month.cut,undefined,'11월 = 평소');
});

test('달 중간 기준일(US 10/20): 10월 초 손실 제외, 기준 자산 = 10/20 거래일 시작 관측 · 미설정이면 월 −10% 장중 중단',()=>{
 const seq=R=>{R.step(US.dayStart('2026-10-15')+60000,10000);R.step(etWall('2026-10-19',12),9200);R.step(etWall('2026-10-19',16,5),9200);return R.step(etWall('2026-10-20',12),8950);};
 const A=runner(US,{cfg:{...CFG,riskStart:RS_US}}),B=runner(US);const a=seq(A),b=seq(B);
 assert.ok(b.status.stops.some(s=>s.rule==='month-intraday'),'미설정: 10000 → 8950 = −10.5%');
 assert.equal(a.status.stopped,false);assert.equal(a.status.periods.month.startEquity,9200);assert.equal(a.status.periods.month.cut,'2026-10-20');assert.equal(a.status.periods.month.pct,-2.7174);
 assert.equal(a.status.periods.week.startEquity,9200,'주(10/19 월 시작)도 기준일부터');
 assert.equal(a.status.periods.day.cut,undefined,'US 하루 = 거래일 경계 그대로(10/20 거래일 시작 = 기준 시각)');
 assert.equal(a.status.riskStart.base.at,etWall('2026-10-19',16,5));
 // 10/19 마감 판정(주·월): 기준일 전 거래일이라 판정하지 않음
 assert.ok(!A.all.events.some(e=>e.kind==='stop'));
});

test('기준 자산: 경계 직전 관측이 없으면 마감 잔액(anchorAt), 그것도 없으면 첫 관측(근사)이고 나중에 마감 잔액으로 바뀜',()=>{
 let anchor=null;const A=runner(HL,{cfg:{...CFG,riskStart:RS_HL},anchorAt:ms=>anchor&&{...anchor,at:ms}});
 A.step(H('2026-10-19',0,5),10000);let r=A.step(H('2026-10-20',12),9800);
 assert.equal(r.status.riskStart.base.approx,true);assert.match(r.status.riskStart.base.source,/^첫 관측 12:00 KST$/);assert.equal(r.status.periods.week.startEquity,9800);
 anchor={equity:9900,source:'HL 마감 10/19 UTC'};r=A.step(H('2026-10-20',12,1),9800);
 assert.equal(r.status.riskStart.base.approx,false);assert.equal(r.status.periods.week.startEquity,9900);assert.equal(r.status.periods.week.startSource,'기준일 10/20 · HL 마감 10/19 UTC');
 anchor={equity:1,source:'x'};r=A.step(H('2026-10-20',12,2),9800);assert.equal(r.status.periods.week.startEquity,9900,'확정된 기준 자산은 바뀌지 않음');
 // HL portfolio 근사(가장 가까운 점 ≤ 2시간, BALANCE 보정)
 const pf=[['day',{accountValueHistory:[[H('2026-10-20',8,45),'990'],[H('2026-10-20',11),'1000']]}]];
 assert.deepEqual(src.hlPortfolioAt(pf,H('2026-10-20',9),{value:1010}),{equity:1000,at:H('2026-10-20',8,45),source:'HL portfolio 근사'});
 assert.equal(src.hlPortfolioAt(pf,H('2026-10-20',4),{value:1010}),null);
});

test('연속 손실: 기준일 이전 손실일은 세지 않음, 기준일(HL 첫날)은 기준 시각부터의 변화로 판정',()=>{
 const fill=(d,h)=>({key:'f'+d+h,t:H(d,h),symbol:'BTC',entry:false,side:'sell',qty:1,price:1});
 const big={...CFG,limits:{day:50,week:50,month:50}};
 const play=R=>{const out=[];let eq=10000;
  for(const d of ['2026-10-17','2026-10-18','2026-10-19']){R.step(H(d,0,1),eq,{fills:[fill(d,5)]});eq-=100;R.step(H(d,23,59),eq,{fills:[fill(d,5)]});}
  out.push(R.step(H('2026-10-20',0,1),eq,{fills:[fill('2026-10-19',5)]}));return out;};
 const A=runner(HL,{cfg:{...big,riskStart:RS_HL}}),B=runner(HL,{cfg:big});
 const [b]=play(B),[a]=play(A);
 assert.ok(b.status.stops.some(s=>s.rule==='streak'),'미설정: 10/17–10/19 3일 손실 → 10/20 중단');
 assert.ok(!a.status.stops.length,'기준일: 이전 손실일 제외');assert.equal(a.status.streak.count,0);
 assert.equal(A.state.days['2026-10-19'].preStart,true);
 // 10/20: 00:01 9700 → 08:55 9750(기준 직전 관측) → 23:59 9650 = 기준부터 −1.03% (KST 하루 전체 9700→9650 = −0.52%)
 A.step(H('2026-10-20',8,55),9750,{fills:[fill('2026-10-20',10)]});A.step(H('2026-10-20',23,59),9650,{fills:[fill('2026-10-20',10)]});
 let r=A.step(H('2026-10-21',0,1),9650,{fills:[fill('2026-10-20',10)]});
 const d20=A.state.days['2026-10-20'];assert.equal(d20.cutPct,-1.0256);assert.equal(d20.pct,-0.5155,'KST 하루 전체 9700→9650');assert.equal(d20.loss,true,'기준부터 −1.03% → 손실일');
 assert.equal(r.status.streak.count,1);
 A.step(H('2026-10-21',23,59),9600,{fills:[fill('2026-10-21',10)]});A.step(H('2026-10-22',0,1),9600,{fills:[fill('2026-10-21',10)]});
 A.step(H('2026-10-22',23,59),9550,{fills:[fill('2026-10-22',10)]});r=A.step(H('2026-10-23',0,1),9550,{fills:[fill('2026-10-22',10)]});
 const s=r.status.stops.find(x=>x.rule==='streak');assert.ok(s,'10/20–10/22 3일 → 10/23 중단');assert.equal(s.id,'HL:streak:2026-10-22@2026-10-20');
});

test('이전 중단 해제: 기준일 설정 전 걸린 중단(주 장중·전날 하루)은 해제·기록, 재시작 절반도 없음 · 기준일 이후 손실이면 새로 걸림',()=>{
 const R=runner(HL);
 R.step(H('2026-10-19',0,5),10000);R.step(H('2026-10-19',20),9650); // 하루 −3.5% → 10/19 24:00까지
 let r=R.step(H('2026-10-20',8,50),9300);                              // 주 −7% → 장중 중단 ~ 10/21 00:00
 assert.ok(r.status.stops.some(s=>s.rule==='week-intraday'));
 R.cfg={...CFG,riskStart:RS_HL};
 r=R.step(H('2026-10-20',10),9300);
 assert.equal(r.status.stopped,false,'해제');assert.equal(r.status.halfRisk.active,false,'10/20 00:00에 끝난 10/19 하루 중단도 해제 → 재시작 절반 없음');
 const clears=r.events.filter(e=>e.kind==='clear');assert.deepEqual(clears.map(e=>e.detail.stopId).sort(),['HL:day:2026-10-19','HL:week-intraday:2026-10-20']);
 assert.ok(clears.every(e=>e.rule==='risk-start'&&/^clear:HL:.+:start:2026-10-20$/.test(e.ref)));
 assert.deepEqual(r.status.riskStart.cleared.sort(),['HL:day:2026-10-19','HL:week-intraday:2026-10-20']);
 const msg=r.messages.find(m=>m.text.startsWith('🔄'));assert.match(msg.text,/기준일 이전 손실로 걸린 중단 해제: 주간 −6% 장중 도달 \(~ 10\/21\(수\) 00:00 KST\)/);
 assert.equal(R.state.riskStart.base.equity,9300,'08:50 관측(10분 전)');
 // 다시 실행해도 해제·안내 반복 없음
 r=R.step(H('2026-10-20',10,1),9300);assert.ok(!r.events.length&&!r.messages.length);
 // 기준 이후 −3%(v1.2 하루) → 새 중단
 r=R.step(H('2026-10-20',11),9000);assert.ok(r.status.stops.some(s=>s.id==='HL:day:2026-10-20@2026-10-20'));
 // 기준일을 빼면(미설정) 남은 중단은 그대로 유지(since 표시 있음)
 R.cfg=CFG;r=R.step(H('2026-10-20',11,1),9000);assert.ok(r.status.stops.some(s=>s.id==='HL:day:2026-10-20@2026-10-20'));
});

test('하루 실현 한도: 기준일 전 키(UTC 10/19)는 판정 안 함, 기준일 키부터 판정(HL·US)',()=>{
 const den={value:2000,mode:'close',key:'2026-10-19',expected:true,source:'close',closeAt:H('2026-10-20',9)};
 const A=runner(HL,{cfg:{...CFG,dayMode:'realized',riskStart:RS_HL}});
 let r=A.step(H('2026-10-20',8,30),2000,{dayRealized:{key:'2026-10-19',pnl:-100,until:H('2026-10-20',9),denom:den}});
 assert.equal(r.status.periods.day.missing,'before-start');assert.equal(r.status.stopped,false);assert.match(r.status.note,/기준일 10\/20 전 — 10\/20\(화\) 09:00 KST부터 판정/);
 r=A.step(H('2026-10-20',9,30),1930,{dayRealized:{key:'2026-10-20',pnl:-61,until:H('2026-10-21',9),denom:den}});
 assert.equal(r.status.stops[0].id,'HL:dayr:2026-10-20@2026-10-20');assert.equal(r.status.note,null);
 const U=runner(US,{cfg:{...CFG,dayMode:'realized',riskStart:riskStartFor('2026-10-21','US',US)}});
 r=U.step(etWall('2026-10-20',12),2000,{dayRealized:{key:'2026-10-20',pnl:-100,until:etWall('2026-10-20',16),denom:den}});
 assert.equal(r.status.periods.day.missing,'before-start');assert.equal(r.status.stopped,false);assert.equal(r.status.periods.week.pct,null);
 r=U.step(etWall('2026-10-21',12),2000,{dayRealized:{key:'2026-10-21',pnl:-70,until:etWall('2026-10-21',16),denom:den}});
 assert.equal(r.status.stops[0].id,'US:dayr:2026-10-21@2026-10-21');
});

test('미래 기준일: 그 전에는 판정·중단 없음',()=>{
 const R=runner(HL,{cfg:{...CFG,riskStart:riskStartFor('2026-10-22','HL',HL)}});
 R.step(H('2026-10-20',0,5),10000);const r=R.step(H('2026-10-20',12),9000);
 assert.equal(r.status.stopped,false);assert.equal(r.status.periods.day.pct,null);assert.equal(r.status.periods.week.beforeStart,true);assert.match(r.status.note,/기준일 10\/22 전/);
});

test('미설정이면 v1.3 엔진과 결과 동일(상태·메시지·이벤트, riskStart 필드만 추가)',()=>{
 const strip=r=>{const s=structuredClone(r);delete s.status.riskStart;delete s.status.config.riskStart;delete s.state.riskStart;return s;};
 for(const [cal,dm] of [[HL,undefined],[HL,'realized'],[US,undefined]]){
  const A=runner(cal,{cfg:{...CFG,dayMode:dm}}),B=runner(cal,{cfg:{...CFG,dayMode:dm},engine:old});
  const fill=(t,e)=>({key:'k'+t,t,symbol:'X',entry:e,side:e?'buy':'sell',qty:1,price:1});
  const t0=cal===HL?H('2026-10-19',0,5):US.dayStart('2026-10-19')+60000;let eq=10000;
  for(let i=0;i<60;i++){const t=t0+i*3*3600000;eq=Math.round(eq*(1+(((i*7919)%13)-7)/400));
   const o={fills:[fill(t,i%3===0)],dayRealized:dm?{key:new Date(t).toISOString().slice(0,10),pnl:-(i%9)*15,until:t+3600000,denom:{value:2000,mode:'basis',source:'x'}}:null};
   const a=A.step(t,eq,o),b=B.step(t,eq,o);assert.deepEqual(strip(a),b,`step ${i}`);}
  assert.ok(B.all.events.length>0,'시나리오에 중단 포함');
 }
});
