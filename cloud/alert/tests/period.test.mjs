// alert5(trade-alert 2.3.0) 손실한도 판정 v1.5 — 주·월 한도·연속 손실일 = 실현손익 기준 엔진 테스트.  node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {usCalendar,hlCalendar,etWall,kstWall} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as v14 from './fixtures/risk-v14.mjs';
import * as day from '../src/day.mjs';
import {riskStartFor} from '../src/alert.mjs';

const US=usCalendar(),HL=hlCalendar(),UTC=day.utcCalendar();
const H=(d,h,m=0)=>kstWall(d,h,m);
const CFG={limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000,dayMode:'realized'};
/** rows: {label: pnl} · trades: {key: n} (없으면 pnl≠0이면 1) · denom: 숫자(모든 날 같은 분모) */
function PRd(market,now,rows,{basis=16236.08,trades={},denom=null}={}){
 const cal=market==='HL'?UTC:US,key=market==='HL'?day.utcDate(now):US.dayOf(now),from=day.periodFrom(cal,key);
 const R=Object.entries(rows).map(([label,pnl])=>({label,pnl}));
 const days=[];for(let k=cal.isTradingDay(from)?from:cal.next(from);k<=key;k=cal.next(k)){const p=rows[k]??0;days.push({key:k,pnl:p,trades:trades[k]??(p?1:0),denom:{value:denom??basis,mode:denom?'close':'basis'}});}
 return {key,cal,rows:R,days,basis:{value:basis,mode:'basis',source:market==='HL'?'HL BALANCE':'키움 주식 평가 + USD 예수금'}};
}
function runner(cal,{cfg=CFG,engine=risk}={}){
 let state=null;const refs=new Set();const all={messages:[],events:[]};
 return {cfg,set state(v){state=v;},get state(){return state;},all,refs,
  step(now,equity,{flows=[],fills=[],dayRealized=null,periodMode,periodRealized=null,fallbackStart=null,anchorAt=null}={}){
   const r=engine.step(state,{now,cal,cfg:this.cfg,equity:equity==null?null:{value:equity,t:now,source:'test'},flows,fills,eventRefs:refs,fallbackStart,anchorAt,dayMode:this.cfg.dayMode,dayRealized,periodMode,periodRealized});
   state=r.state;for(const e of r.events)refs.add(e.ref);all.messages.push(...r.messages);all.events.push(...r.events);return r;}};
}
const dayR=(market,now,pnl,base=63592.79)=>{const k=market==='HL'?day.utcDate(now):US.dayOf(now);return {key:k,pnl,until:market==='HL'?day.utcStart(k)+86400000:US.dayEnd(k),denom:{value:base,mode:'close',key:'x',expected:true,closeAt:now-3600000},parts:{trades:pnl,funding:0}};};

test('periodMode 없음(또는 equity) → v1.4 엔진과 결과 동일(v1.5 필드 periodBasis·periodRule·streak.basis만 추가)',()=>{
 const strip=r=>{const s=structuredClone(r);delete s.status.periodBasis;delete s.status.config.periodRule;delete s.status.streak.basis;for(const m of s.messages)m.text=m.text.replace(/\n\d\d\/\d\d부터 적용 · 그 전엔 판정·알림 안 함\(기록만\)/,'');return s;}; // 2.5.0: 미래 기준일 🔄에 붙는 한 줄은 비교에서 뺌
 for(const [cal,dm,pm,rs] of [[HL,'equity',undefined,null],[HL,'realized','equity',null],[US,'realized',undefined,null],[US,'equity','equity',riskStartFor('2026-10-20','US',US)],[HL,'realized',undefined,riskStartFor('2026-10-20','HL',HL)]]){
  const cfg={...CFG,dayMode:dm,riskStart:rs};const A=runner(cal,{cfg}),B=runner(cal,{cfg,engine:v14});
  const fill=(t,e)=>({key:'k'+t,t,symbol:'X',entry:e,side:e?'buy':'sell',qty:1,price:1});
  const t0=cal===HL?H('2026-10-17',0,5):US.dayStart('2026-10-16')+60000;let eq=10000;
  for(let i=0;i<60;i++){const t=t0+i*3*3600000;eq=Math.round(eq*(1+(((i*7919)%13)-7)/400));
   const o={fills:[fill(t,i%3===0)],dayRealized:dm==='realized'?{key:new Date(t).toISOString().slice(0,10),pnl:-(i%9)*15,until:t+3600000,denom:{value:2000,mode:'basis',source:'x'}}:null,periodMode:pm};
   const a=A.step(t,eq,o),b=B.step(t,eq,o);assert.deepEqual(strip(a),b,`step ${i}`);assert.equal(a.status.periodBasis,'equity');}
  assert.ok(B.all.events.some(e=>e.kind==='stop'),'시나리오에 중단 포함');
 }
});

test('출금(입출금 추정 실패): 자산 63,592.79 → 16,236.08 (−74.47%)이어도 실현 +$392.23이면 주·월 중단 없음 · 자산 변화는 참고로만',()=>{
 const R=runner(US,{cfg:{...CFG,riskStart:riskStartFor('2026-10-20','US',US)}});
 const t1=H('2026-10-20',5,10),t2=H('2026-10-20',13);
 R.step(t1,63592.79,{periodMode:'realized',periodRealized:PRd('US',t1,{'2026-10-20':0},{basis:63592.79}),dayRealized:dayR('US',t1,0)});
 const r=R.step(t2,16236.08,{periodMode:'realized',periodRealized:PRd('US',t2,{'2026-10-20':392.23,'2026-10-19':-5000}),dayRealized:dayR('US',t2,392.23)});
 const s=r.status;
 assert.equal(s.stopped,false);assert.equal(s.stops.length,0);assert.ok(!r.messages.some(m=>m.text.startsWith('⛔')),r.messages.map(m=>m.text).join('\n'));
 assert.equal(s.periodBasis,'realized');assert.equal(s.periods.week.basis,'realized');
 assert.equal(s.periods.week.pnl,392.23,'기준일(10/20) 전 10/19 −5000은 제외');assert.equal(s.periods.week.pct,2.4158);assert.equal(s.periods.week.startEquity,16236.08);assert.equal(s.periods.week.startSource,'현재 기준액 $16,236.08');
 assert.equal(s.periods.month.pnl,392.23);assert.equal(s.periods.week.cut,'2026-10-20');
 assert.equal(s.periods.weekEquity.pct,-74.4687,'참고: 미실현 포함 자산 변화');assert.equal(s.periods.weekEquity.pnl,-47356.71);
 assert.equal(s.periods.week.ref.pct,-74.4687);
 assert.equal(s.config.periodRule.startsWith('주·월 = 기간 실현손익 합 ÷ 현재 기준액'),true);
});

test('실현 손실로는 걸림: 주 실현 −$1,000 ÷ 기준액 $16,000 = −6.25% → 주간 실현 장중 중단(그날 끝까지) · 메시지에 참고 줄 · 다음 날 마감 판정 → 주 끝까지',()=>{
 const R=runner(HL);const t1=H('2026-10-20',10),t2=H('2026-10-20',15);
 R.step(t1,16500,{periodMode:'realized',periodRealized:PRd('HL',t1,{'2026-10-19':-300},{basis:16500})});
 let r=R.step(t2,16000,{periodMode:'realized',periodRealized:PRd('HL',t2,{'2026-10-19':-300,'2026-10-20':-700},{basis:16000})});
 const s=r.status;assert.equal(s.stopped,true);const st=s.stops[0];
 assert.equal(st.rule,'week-intraday');assert.equal(st.label,'주간 실현 −6% 장중 도달');assert.equal(st.id,'HL:weekr-intraday:2026-10-20');assert.equal(st.until,Date.parse('2026-10-21T00:00:00Z'),'HL 실현 하루 끝 = UTC 00:00 = KST 09:00');
 const m=r.messages.find(x=>x.text.startsWith('⛔'));assert.match(m.text,/⛔ 하이퍼리퀴드 주간 실현손익 −6\.25% \(−1,000\.00 USDC\) · 주간 한도 −6% \(−960\.00 USDC\) 장중 도달\n기준: 현재 기준액 16,000\.00 USDC/);
 assert.match(m.text,/참고: 미실현 포함 자산 변화 −3\.03% \(−500\.00 USDC\) — 판정에는 쓰지 않음/);
 assert.ok(R.all.events.some(e=>e.kind==='stop'&&e.detail.label==='주간 실현 −6% 장중 도달'));
 // 같은 날 다시 → 중복 없음, 경고(50/80%)는 먼저 지나감
 r=R.step(t2+60000,16000,{periodMode:'realized',periodRealized:PRd('HL',t2,{'2026-10-19':-300,'2026-10-20':-700},{basis:16000})});assert.equal(r.messages.length,0);
 // 다음 UTC 날 → 마감 판정(10/20 마감 −6.25%) → 10/21 09:00 KST부터 주 끝(10/26 09:00 KST)까지
 const t3=H('2026-10-21',9,5);r=R.step(t3,16000,{periodMode:'realized',periodRealized:PRd('HL',t3,{'2026-10-19':-300,'2026-10-20':-700},{basis:16000})});
 const w=r.status.stops.find(x=>x.rule==='week');assert.ok(w,'마감 판정 중단');assert.equal(w.id,'HL:weekr:2026-10-19');assert.equal(w.from,Date.parse('2026-10-21T00:00:00Z'));assert.equal(w.until,Date.parse('2026-10-26T00:00:00Z'));
 assert.equal(w.label,'주간 실현 −6% (마감 판정)');
});

test('월 경계: 주(9/28~10/4)는 9월 손실 포함, 달(10월)은 제외 · 경고 50/80%',()=>{
 const R=runner(HL);const t=H('2026-10-02',12);
 const r=R.step(t,10000,{periodMode:'realized',periodRealized:PRd('HL',t,{'2026-09-28':-400,'2026-09-30':-200,'2026-10-01':-100,'2026-10-02':-50},{basis:10000})});
 const P=r.status.periods;assert.equal(P.week.pnl,-750);assert.equal(P.week.pct,-7.5);assert.equal(P.month.pnl,-150);assert.equal(P.month.pct,-1.5);assert.equal(P.month.key,'2026-10');assert.equal(P.week.key,'2026-09-28');
 assert.ok(r.status.stops.some(s=>s.rule==='week-intraday'));assert.ok(!r.status.stops.some(s=>s.rule.startsWith('month')));
 // US: 주말 라벨(토 10/3 한국 날짜)도 앱처럼 그 주·그 달에 포함, 9/30 라벨은 10월에서 제외
 const U=runner(US);const tu=etWall('2026-10-02',12);
 const ru=U.step(tu,20000,{periodMode:'realized',periodRealized:PRd('US',tu,{'2026-09-30':-900,'2026-10-01':-300,'2026-10-02':-250},{basis:20000})});
 assert.equal(ru.status.periods.week.pnl,-1450);assert.equal(ru.status.periods.month.pnl,-550);
 assert.ok(ru.messages.some(m=>/🔔|⚠️/.test(m.text)&&/주간 실현손익 −7\.25%/.test(m.text))===false,'−7.25%는 경고가 아니라 중단');
 assert.ok(ru.status.stops.some(s=>s.id==='US:weekr-intraday:2026-10-02'));
 const W=runner(US);const rw=W.step(tu,20000,{periodMode:'realized',periodRealized:PRd('US',tu,{'2026-10-01':-700},{basis:20000})});
 assert.ok(rw.messages.some(m=>/^🔔 미국주식 주간 실현손익 −3\.50% \(−\$700\.00\) · 한도 −6% \(−\$1,200\.00\)의 58%/.test(m.text)),rw.messages.map(m=>m.text).join('\n'));
});

test('기준일(RISK_START_DATE): 기준일 전 실현손익은 주·월 합계에서 제외 · 기준일 전이면 판정 안 함',()=>{
 const rs=riskStartFor('2026-10-21','HL',HL);const R=runner(HL,{cfg:{...CFG,riskStart:rs}});
 const t=H('2026-10-21',12);const r=R.step(t,10000,{periodMode:'realized',periodRealized:PRd('HL',t,{'2026-10-19':-900,'2026-10-20':-200,'2026-10-21':-30},{basis:10000})});
 assert.equal(r.status.periods.week.pnl,-30);assert.equal(r.status.periods.week.cut,'2026-10-21');assert.equal(r.status.stopped,false);
 const F=runner(HL,{cfg:{...CFG,riskStart:riskStartFor('2026-10-25','HL',HL)}});const rf=F.step(t,10000,{periodMode:'realized',periodRealized:PRd('HL',t,{'2026-10-21':-900},{basis:10000})});
 assert.equal(rf.status.periods.week.pct,null);assert.equal(rf.status.periods.week.missing,'before-start');assert.equal(rf.status.stopped,false);
});

test('업데이트 후 첫 판정: 자산 변화로 걸린 주·월 중단 해제(clear basis-realized) · 🔄 1회 · 재시작 첫날 절반도 없어짐 · 성립하면 유지',()=>{
 // v1.4 상태: US 10/20 장중 자산 −74%로 주·월 장중 중단 + 10/19 하루 장중 중단은 그대로(하루는 v1.3 실현 기준이라 해당 없음)
 const rs=riskStartFor('2026-10-20','US',US);const R=runner(US,{cfg:{...CFG,riskStart:rs}});
 const t1=H('2026-10-20',5,10),t2=H('2026-10-20',12,30),t3=H('2026-10-20',13);
 R.step(t1,63592.79,{dayRealized:dayR('US',t1,0)});
 let r=R.step(t2,16236.08,{dayRealized:dayR('US',t2,392.23)});
 assert.deepEqual(r.status.stops.map(s=>s.rule).sort(),['month-intraday','week-intraday'],'v1.4: 출금이 손실로 잡혀 주·월 장중 중단');
 assert.equal(r.status.periods.week.pct,-74.4687);
 r=R.step(t3,16236.08,{dayRealized:dayR('US',t3,392.23),periodMode:'realized',periodRealized:PRd('US',t3,{'2026-10-20':392.23})});
 assert.equal(r.status.stopped,false);assert.equal(r.status.stops.length,0);assert.equal(r.status.halfRisk.active,false,'해제된 중단은 재시작 절반도 없음');
 assert.deepEqual(r.status.clearedBasis.sort(),['US:month-intraday:2026-10-20@2026-10-20','US:week-intraday:2026-10-20@2026-10-20']);
 const ev=r.events.filter(e=>e.kind==='clear');assert.equal(ev.length,2);assert.ok(ev.every(e=>e.rule==='basis-realized'&&e.ref.endsWith(':realized')&&e.detail.basis==='realized'));
 const m=r.messages.find(x=>x.text.startsWith('🔄'));assert.ok(m);
 assert.match(m.text,/^🔄 미국주식 손실 한도 판정 v1\.5 — 주·월 한도와 연속 손실일을 실현손익 기준으로 판정합니다\(앱과 같은 기준\)\n주·월 % = 기간 실현손익 ÷ 현재 기준액 \$16,236\.08 · 입출금은 손실로 잡지 않습니다/);
 assert.match(m.text,/지금: 이번 주 실현 \+2\.42% \(\+\$392\.23\) · 이번 달 \+2\.42%/);assert.match(m.text,/새 기준으로 성립하지 않는 중단 해제: 주간 −6% 장중 도달 \(~ 10\/21\(수\) 05:00 KST · 미국 10\/20 16:00 ET\), 월간 −10% 장중 도달/);
 r=R.step(t3+60000,16236.08,{dayRealized:dayR('US',t3,392.23),periodMode:'realized',periodRealized:PRd('US',t3,{'2026-10-20':392.23})});
 assert.equal(r.messages.length,0,'🔄은 한 번만');assert.equal(r.events.length,0);
 // 이미 끝난 중단에서 온 '재시작 첫날 절반'도 없어짐(HL: 10/20 KST 하루에 끝난 주 장중 중단)
 const Q=runner(HL);const a=H('2026-10-19',22),b=H('2026-10-19',23),c=H('2026-10-20',10);
 Q.step(a,10000);Q.step(b,9300);let q=Q.step(c,9800);
 assert.equal(q.status.halfRisk.active,true,'v1.4: 10/20 00:00 KST에 끝난 주 장중 중단 → 오늘 절반');
 q=Q.step(c+60000,9800,{periodMode:'realized',periodRealized:PRd('HL',c,{'2026-10-19':-20},{basis:9800})});
 assert.equal(q.status.halfRisk.active,false);assert.match(q.messages.find(x=>x.text.startsWith('🔄')).text,/오늘 재시작 첫날\(위험 절반\)도 없앱니다: 주간 −6% 장중 도달/);
 // 새 기준으로도 성립(실현 주 −7.5%)하면 기존 중단 유지
 const K=runner(HL);K.step(a,10000);K.step(b,9300);const tk=H('2026-10-19',23,30);
 const k=K.step(tk,9300,{periodMode:'realized',periodRealized:PRd('HL',tk,{'2026-10-19':-700},{basis:9300})});
 // 기존 중단(KST 자정까지)은 유지, 실현 기준 하루 끝(UTC 00:00 = KST 09:00)까지 실현 장중 중단이 이어서 걸림
 assert.equal(k.status.stopped,true);assert.deepEqual(k.status.stops.map(s=>s.id),['HL:week-intraday:2026-10-19','HL:weekr-intraday:2026-10-19']);assert.equal(k.events.filter(e=>e.kind==='clear').length,0);
 assert.equal(k.status.stops[1].until,Date.parse('2026-10-20T00:00:00Z'));assert.doesNotMatch(k.messages.find(x=>x.text.startsWith('🔄')).text,/해제/);
});

test('연속 손실일(실현): 그날 실현 ÷ 직전 마감 ≤ −0.5%가 3일 연속 → 다음 1거래일 중단 · 거래 없는 날은 건너뜀 · 이익일이 끊음',()=>{
 const R=runner(HL);const P=(t,rows,tr)=>({periodMode:'realized',periodRealized:PRd('HL',t,rows,{basis:10000,denom:10000,trades:tr})});
 const rows={'2026-10-12':30,'2026-10-13':-60,'2026-10-14':-80,'2026-10-16':-55};const tr={'2026-10-15':0};
 R.step(H('2026-10-16',20),10000,P(H('2026-10-16',20),rows,tr));
 let r=R.step(H('2026-10-17',9,1),10000,P(H('2026-10-17',9,1),rows,tr));
 const s=r.status.stops.find(x=>x.rule==='streak');assert.ok(s,r.messages.map(m=>m.text).join('\n'));
 assert.equal(s.id,'HL:streakr:2026-10-16');assert.equal(s.label,'3일 연속 실현 손실일');assert.equal(s.from,Date.parse('2026-10-17T00:00:00Z'));assert.equal(s.until,Date.parse('2026-10-18T00:00:00Z'));
 assert.match(r.messages.find(m=>m.key==='HL:streakr:2026-10-16').text,/3일 연속 실현 손실일 \(10\/13 UTC −0\.60%, 10\/14 UTC −0\.80%, 10\/16 UTC −0\.55%\)/);
 assert.equal(r.status.streak.basis,'realized');assert.equal(r.status.streak.count,0,'발동 후 새로 셈');
 // −0.4%(기준 미달)는 손실일 아님
 const Q=runner(HL);const rows2={'2026-10-13':-60,'2026-10-14':-40,'2026-10-16':-55};Q.step(H('2026-10-16',20),10000,P(H('2026-10-16',20),rows2,{}));
 const q=Q.step(H('2026-10-17',9,1),10000,P(H('2026-10-17',9,1),rows2,{}));assert.ok(!q.status.stops.length);assert.equal(q.status.streak.count,1);
 // 출금으로 자산이 급감한 날도 실현 +이면 손실일 아님(자산 변화는 쓰지 않음)
 const W=runner(HL);const rows3={'2026-10-14':-60,'2026-10-15':-60,'2026-10-16':20};W.step(H('2026-10-16',20),10000,P(H('2026-10-16',20),rows3,{}));
 const w=W.step(H('2026-10-17',9,1),2000,P(H('2026-10-17',9,1),rows3,{}));assert.ok(!w.status.stops.some(x=>x.rule==='streak'));assert.equal(w.status.streak.count,0);
});

test('실현 데이터 없음(일시 장애) → 주·월 판정 건너뜀(자산 변화로 되돌아가지 않음) · note',()=>{
 const R=runner(HL);R.step(H('2026-10-19',22),10000);
 const r=R.step(H('2026-10-20',10),5000,{periodMode:'realized',periodRealized:null,dayRealized:dayR('HL',H('2026-10-20',10),0,10000)});
 assert.equal(r.status.stopped,false,'자산 −50%여도 주·월 중단 없음');assert.equal(r.status.periods.week.missing,'data');assert.equal(r.status.periodBasis,'realized');
 assert.equal(r.status.note,'주·월 실현손익 데이터를 읽지 못해 주·월·연속 손실 판정을 건너뜀');
});

test('day.mjs: HL 날짜별 실현(API·Supabase 합계 중 건수 많은 쪽) · US 행 라벨/거래일 묶기 · 분모',()=>{
 const t=Date.parse('2026-10-20T03:00:00Z');
 const fills=[{coin:'BTC',dir:'Close Long',feeToken:'USDC',closedPnl:'-10',fee:'1',time:t,tid:1}];
 const d=day.hlPeriodDays(fills,[{time:t,coin:'BTC',usdc:'-1'}],[{day:'2026-10-20',fills:1,trades:-11,funding:-1,funding_count:1},{day:'2026-10-19',fills:3,trades:-30,funding:0,funding_count:0}],'2026-10-19','2026-10-20');
 assert.deepEqual(d.map(x=>[x.key,x.pnl,x.trades,x.src]),[['2026-10-19',-30,3,'db'],['2026-10-20',-12,1,'api']]);
 const u=day.usPeriodDays([{date:'2026-10-17',total:'-5',count:1,as_of:1},{date:'2026-10-16',total:'-7',count:1,as_of:1},{date:'2026-10-16',total:'-8',count:2,as_of:2},{date:'2026-10-19',total:'3',count:1,as_of:1}],US,'2026-10-15','2026-10-20');
 assert.deepEqual(u.rows.map(x=>[x.label,x.pnl]),[['2026-10-16',-8],['2026-10-17',-5],['2026-10-19',3]]);
 assert.deepEqual(u.days.map(x=>[x.key,x.pnl,x.trades]),[['2026-10-15',0,0],['2026-10-16',-13,3],['2026-10-19',3,1],['2026-10-20',0,0]],'토 10/17 라벨 → 금 10/16');
 assert.deepEqual(day.basisDenom('16236.08',4000,'US'),{value:16236.08,mode:'basis',key:null,source:'키움 주식 평가 + USD 예수금'});
 assert.equal(day.basisDenom(null,4000,'HL').source,'앱 설정 계좌 기준액');assert.equal(day.basisDenom(0,0,'HL'),null);
 const dn=day.dayDenomFor([{market:'hl',day:'2026-10-18',value:'900',source:'close'}],'HL',{value:1000,mode:'basis'});assert.equal(dn('2026-10-19').value,900);assert.equal(dn('2026-10-19').mode,'close');assert.equal(dn('2026-10-30').value,1000);
 assert.equal(day.periodFrom(UTC,'2026-10-20'),'2026-10-01');assert.equal(day.periodFrom(UTC,'2026-11-03'),'2026-10-20');
});
