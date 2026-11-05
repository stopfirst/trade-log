// alert19(trade-alert 2.15.0) — '오늘은 여기까지' = 같은 날 연속 손실 청산 3회(이익 청산이면 리셋, 순손익 0은 유지).
// 손-이-손-손(없음) · 손-손-손(있음) · 손-0-손-손(있음) · 날짜 경계(HL UTC 00:00 · US 16:00 ET) · 도달 뒤 이익 청산이 있어도 그날 진입은 위반 ·
// DAILY_LOSS_STREAK_MODE=count(2.14.0) · 설정 오류 · 서버 단타 예외 'n연패 후 진입'(scalp.mjs)도 같은 함수.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rv from '../src/revenge.mjs';
import * as sc from '../src/scalp.mjs';
import {usCalendar,etWall} from '../src/calendar.mjs';
import {readConfig} from '../src/alert.mjs';

const MIN=60000,HOUR=3600000;
const CFG=rv.revengeConfig({}),COUNT={...CFG,streakMode:'count'};
const utcDay=ms=>new Date(ms).toISOString().slice(0,10);
const D0=Date.parse('2026-11-01T00:00:00Z'); // = 11/01 09:00 KST, HL 하루 시작
const C=(i,pnl,o={})=>({market:'HL',key:'hl:c'+i,seg:'HL:S'+i+':'+(D0+i*10*MIN-MIN),symbol:'S'+i,dir:'long',time:D0+i*10*MIN,pnl,notional:100,stopRisk:null,tid:'c'+i,...o});
const E=(t,o={})=>({market:'HL',key:'hl:e'+t,seg:'HL:X:'+t,symbol:'X',dir:'long',time:t,notional:50,stopRisk:null,tid:'e'+t,...o});
const seq=pnls=>pnls.map((p,i)=>C(i+1,p));
const J=(closes,cfg=CFG,entries=[])=>rv.judge({closes,entries},cfg,utcDay);

test('설정: DAILY_LOSS_STREAK_MODE 기본 consecutive · count/횟수 · 연속 · 잘못된 값은 CONFIG_INCOMPLETE',()=>{
 assert.equal(CFG.streakMode,'consecutive');assert.equal(rv.revengeConfig({DAILY_LOSS_STREAK_MODE:'count'}).streakMode,'count');
 assert.equal(rv.revengeConfig({DAILY_LOSS_STREAK_MODE:'횟수'}).streakMode,'count');assert.equal(rv.revengeConfig({DAILY_LOSS_STREAK_MODE:'Consecutive'}).streakMode,'consecutive');
 assert.ok(rv.revengeConfig({DAILY_LOSS_STREAK_MODE:'maybe'}).errors.some(e=>e.startsWith('DAILY_LOSS_STREAK_MODE')));
 const env={SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:'sb_publishable_'+'k'.repeat(24),KW_COLLECTOR_TOKEN:'kwc_'+'A'.repeat(43),TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32),TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:'/tmp'};
 assert.equal(readConfig(env).revenge.streakMode,'consecutive');assert.equal(readConfig({...env,DAILY_LOSS_STREAK_MODE:'count'}).revenge.streakMode,'count');
 assert.throws(()=>readConfig({...env,DAILY_LOSS_STREAK_MODE:'x'}),e=>e.message==='CONFIG_INCOMPLETE'&&e.fields.some(f=>f.startsWith('DAILY_LOSS_STREAK_MODE')));
 assert.equal(sc.scalpConfig({}).streakMode,'consecutive');assert.equal(sc.scalpConfig({DAILY_LOSS_STREAK_MODE:'count',SCALP_MIN:'0'}).streakMode,'count');
});

test('streakReach: 손-이-손-손 = 없음 · 손-손-손 = 3번째 · 손-0-손-손 = 4번째(0은 유지) · count는 횟수',()=>{
 const r=(p,mode)=>{const x=rv.streakReach(seq(p),3,{mode});return x?x.close.key:null;};
 assert.equal(r([-1,5,-1,-1]),null);assert.equal(r([-1,-1,-1]),'hl:c3');assert.equal(r([-1,0,-1,-1]),'hl:c4');
 assert.equal(r([-1,5,-1,-1],'count'),'hl:c4');assert.equal(r([-1,-1,0.01,-1,-1,-1]),'hl:c6','+0.01도 이익 → 리셋');
 assert.deepEqual(rv.streakReach(seq([-1,0,-2,-3]),3).losses.map(c=>c.pnl),[-1,-2,-3],'연속 손실 목록(0은 빠짐)');
 assert.equal(rv.streakReach(seq([-1,-1,-1]),0),null,'0 = 끔');
});

test('judge: 손-이-손-손 → 오늘은 여기까지 없음 · 이후 진입 위반 없음 (count면 있음)',()=>{
 const cl=seq([-10,25,-10,-10]),ent=[E(D0+50*MIN)];
 const a=J(cl,CFG,ent);assert.equal(a.stops.length,0);assert.equal(a.alerts.filter(x=>x.kinds.includes('streak')).length,0);
 const b=J(cl,COUNT,ent);assert.equal(b.stops.length,1);assert.ok(b.alerts[0].kinds.includes('streak'));
});

test('judge: 손-손-손 → 3번째 청산에 1회 · 그 뒤 진입마다 위반(뒤에 이익 청산이 와도) · 그 전 진입은 아님',()=>{
 const cl=[...seq([-10,-20,-30]),C(5,80)],ents=[E(D0+25*MIN),E(D0+35*MIN),E(D0+3*HOUR)];
 const r=J(cl,CFG,ents);assert.equal(r.stops.length,1);assert.equal(r.stops[0].at,D0+30*MIN);assert.deepEqual(r.stops[0].losses.map(c=>c.pnl),[-10,-20,-30]);assert.equal(r.stops[0].mode,'consecutive');
 assert.deepEqual(r.alerts.filter(a=>a.kinds.includes('streak')).map(a=>a.entry.time),[D0+35*MIN,D0+3*HOUR]);
 const a=r.alerts.find(x=>x.entry.time===D0+3*HOUR);assert.equal(a.streakLosses,3);assert.equal(a.streakMode,'consecutive');
 const txt=rv.entryText({...a,kinds:['streak']},CFG,usCalendar());assert.match(txt,/^⛔ \[오늘은 여기까지 위반\]/);assert.match(txt,/오늘\(UTC 11\/01\) 연속 손실 3회 뒤 진입 — 오늘은 여기까지 규칙 위반/);
 const st=rv.stopText(r.stops[0],usCalendar());assert.match(st,/^🛑 \[오늘은 여기까지\] 🟦 하이퍼리퀴드 · 오늘 연속 손실 3회/);assert.match(st,/합계: −\$60\.00/);
 assert.equal(rv.alertItem(a,{now:1}).detail.streakMode,'consecutive');
});

test('judge: 손-0-손-손 → 4번째 청산에 도달(손익 0은 리셋 안 함) · 이-손-손-이-손-손-손 → 마지막에',()=>{
 let r=J(seq([-10,0,-10,-10]));assert.equal(r.stops.length,1);assert.equal(r.stops[0].at,D0+40*MIN);assert.equal(r.stops[0].losses.length,3);
 r=J(seq([5,-1,-1,5,-1,-1,-1]));assert.equal(r.stops[0].at,D0+70*MIN);
 assert.equal(J(seq([-10,-0.5,-10]),{...CFG,minLoss:1}).stops.length,0,'REVENGE_MIN_LOSS_USD 이하 손실은 손실도 이익도 아님(유지)');
 assert.equal(J(seq([-10,-0.5,-10,-10]),{...CFG,minLoss:1}).stops.length,1);
});

test('날짜 경계: HL UTC 00:00(KST 09:00)에서 리셋 — 전날 손-손 + 오늘 손 = 없음 · 오늘 손-손-손 = 있음',()=>{
 const c=(t,p,i)=>({...C(i,p),time:t});
 let r=J([c(D0-20*MIN,-1,1),c(D0-10*MIN,-1,2),c(D0+10*MIN,-1,3)],CFG,[E(D0+20*MIN)]);assert.equal(r.stops.length,0);assert.equal(r.alerts.filter(a=>a.kinds.includes('streak')).length,0);
 r=J([c(D0-20*MIN,-1,1),c(D0-10*MIN,-1,2),c(D0-5*MIN,-1,3),c(D0+10*MIN,-1,4)],CFG,[E(D0+20*MIN)]);
 assert.deepEqual(r.stops.map(s=>s.day),['2026-10-31'],'전날 3연속은 전날 것');assert.equal(r.alerts.filter(a=>a.kinds.includes('streak')).length,0,'오늘 진입은 위반 아님(리셋)');
});

test('날짜 경계: US 16:00 ET — 15:50 손 · 15:55 손 · 16:05 손(다음 거래일) = 없음, 같은 거래일 손-이-손-손 = 없음, 손-손-손 = 있음',()=>{
 const US=usCalendar(),dayOf=ms=>US.dayOf(ms);
 const u=(t,p,i)=>({market:'US',key:'us:'+i,seg:'US:S'+i+':1',symbol:'S'+i,dir:'long',time:t,pnl:p,notional:100,orderKey:'k'+i});
 const J2=cl=>rv.judge({closes:cl,entries:[]},CFG,dayOf).stops;
 assert.equal(J2([u(etWall('2026-10-30',15,50),-5,1),u(etWall('2026-10-30',15,55),-5,2),u(etWall('2026-10-30',16,5),-5,3)]).length,0);
 assert.equal(J2([u(etWall('2026-10-30',10,0),-5,1),u(etWall('2026-10-30',11,0),9,2),u(etWall('2026-10-30',12,0),-5,3),u(etWall('2026-10-30',13,0),-5,4)]).length,0);
 const s=J2([u(etWall('2026-10-30',10,0),-5,1),u(etWall('2026-10-30',11,0),-5,2),u(etWall('2026-10-30',12,0),-5,3)]);assert.equal(s.length,1);assert.equal(s[0].day,'2026-10-30');
});

test('드라이런 머리말·종류 이름: 연속(기본) / count',()=>{
 const res=[{market:'HL',closes:3,losses:3,entries:1,alerts:[],stops:J(seq([-1,-1,-1])).stops}];
 const t=rv.dryReport(res,CFG,usCalendar(),{from:'2026-10-01',to:'2026-10-31'}).text;
 assert.match(t,/오늘은 여기까지 연속 손실 3회/);assert.match(t,/🛑 2026-11-01 연속 손실 3회 도달/);assert.match(t,/연속 손실 N회 뒤 진입 0/);
 const t2=rv.dryReport([{...res[0],stops:J(seq([-1,-1,-1]),COUNT).stops}],COUNT,usCalendar(),{from:'2026-10-01',to:'2026-10-31'}).text;assert.match(t2,/오늘은 여기까지 손실 청산 3회/);assert.match(t2,/🛑 2026-11-01 손실 청산 3회 도달/);
});

// 서버 단타 예외(매일 복기 알림) — 앱 v99 포팅 v99Flags 'n연패 후 진입'도 같은 streakReach
const TS=s=>Date.parse('2026-10-31T'+s+':00Z');
const ev=(s,px)=>{const ts=TS(s),d=new Date(ts).toISOString();return {date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:1,price:px,fee:0};};
const tr=(id,a,b,p1)=>({id,name:id,direction:'long',entries:[ev(a,100)],fills:[ev(b,p1)],initialRisk:100});
test('단타 예외 n연패 후 진입: 손-이-손-손 없음 · 손-손-손 있음 · 손-0-손-손 있음 · count는 2.14.0 그대로',()=>{
 const run=(pnls,mode)=>{const ts=pnls.map((p,i)=>tr('T'+i,`0${i}:00`,`0${i}:10`,100+p));const nx=tr('NEXT','09:00','09:05',101);const m=sc.v99Flags([...ts,nx],true,{cool:0,maxLoss:3,mode});return (m.get(nx)||[]).map(f=>f.label);};
 assert.deepEqual(run([-1,5,-1,-1]),[]);assert.deepEqual(run([-1,-1,-1]),['3연패 후 진입']);assert.deepEqual(run([-1,0,-1,-1]),['3연패 후 진입']);
 assert.deepEqual(run([-1,5,-1,-1],'count'),['3연패 후 진입']);assert.deepEqual(run([-1,-1,5]),[]);
 // 다른 날(청산일 ≠ 진입일) 손실은 안 셈
 const ts=[-1,-1,-1].map((p,i)=>({...tr('P'+i,`2${i}:00`,`2${i}:10`,99),entries:[{...ev(`2${i}:00`,100),date:'2026-10-30',timestamp:TS(`2${i}:00`)-86400000}],fills:[{...ev(`2${i}:10`,99),date:'2026-10-30',timestamp:TS(`2${i}:10`)-86400000}]}));
 const nx=tr('NEXT','09:00','09:05',101);assert.deepEqual((sc.v99Flags([...ts,nx],true,{cool:0,maxLoss:3}).get(nx)||[]).map(f=>f.label),[]);
});
