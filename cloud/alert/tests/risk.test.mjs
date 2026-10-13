// alert2 손실한도 판정 v1.2 — 달력·판정 엔진·원천 변환 fixture 테스트.  node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {usCalendar,hlCalendar,nyseHolidays,etWall,kstWall,untilText} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as src from '../src/sources.mjs';

const US=usCalendar(),HL=hlCalendar();
const Z=s=>Date.parse(s);
const CFG={limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000};

// ---------------- 달력 ----------------
test('NYSE 휴장일 2026–2028 = NYSE 공식 표(nyse.com/markets/hours-calendars)',()=>{
 const want={2026:['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25'],
  2027:['2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24'],
  2028:['2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25']};
 for(const [y,list] of Object.entries(want))assert.deepEqual([...nyseHolidays(Number(y))].sort(),list,y);
 assert.equal(US.isTradingDay('2027-12-31'),true,'2028-01-01 토요일 → 2027-12-31은 정상 거래일');
});
test('US 하루 경계 = 16:00 ET, 서머타임 시작·종료 자동',()=>{
 assert.equal(US.dayEnd('2026-03-06'),Z('2026-03-06T21:00:00Z'),'EST 금요일 마감 = 21:00Z');
 assert.equal(US.dayEnd('2026-03-09'),Z('2026-03-09T20:00:00Z'),'3/8 서머타임 시작 → 월요일 마감 20:00Z');
 assert.equal(US.dayStart('2026-03-09'),Z('2026-03-06T21:00:00Z'),'월요일 구간 시작 = 금요일 마감');
 assert.equal(US.dayOf(Z('2026-03-09T19:59:59Z')),'2026-03-09');
 assert.equal(US.dayOf(Z('2026-03-09T20:00:00Z')),'2026-03-10','16:00 ET 정각부터 다음 거래일');
 assert.equal(US.dayOf(Z('2026-03-07T15:00:00Z')),'2026-03-09','토요일 → 월요일 몫');
 assert.equal(US.dayEnd('2026-10-30'),Z('2026-10-30T20:00:00Z'),'EDT 금요일');
 assert.equal(US.dayEnd('2026-11-02'),Z('2026-11-02T21:00:00Z'),'11/1 서머타임 종료 → 월요일 마감 21:00Z');
 assert.equal(US.dayOf(Z('2026-11-02T20:30:00Z')),'2026-11-02','서머타임 종료 후 20:30Z = 15:30 ET → 아직 그날');
 // KST로 보면: 미국 마감 = 서머타임 05:00 KST / 표준시 06:00 KST
 assert.match(untilText(US.dayEnd('2026-10-14'),'US'),/^10\/15\(목\) 05:00 KST · 미국 10\/14 16:00 ET$/);
 assert.match(untilText(US.dayEnd('2026-11-04'),'US'),/^11\/05\(목\) 06:00 KST/);
});
test('US 휴장일 건너뜀(성금요일·추수감사절·노동절 주)',()=>{
 assert.equal(US.dayOf(Z('2026-04-02T21:00:00Z')),'2026-04-06','목요일 장 마감 후 → 성금요일·주말 건너 월요일');
 assert.equal(US.dayStart('2026-04-06'),US.dayEnd('2026-04-02'));
 assert.equal(US.dayOf(Z('2026-11-26T15:00:00Z')),'2026-11-27','추수감사절 → 다음 날');
 assert.equal(US.firstOf('2026-09-09','week'),'2026-09-08','노동절(월) 주 첫 거래일 = 화');
 assert.equal(US.periodStart('2026-09-09','week'),US.dayEnd('2026-09-04'));
 assert.equal(US.lastOf('2026-10-14','month'),'2026-10-30');assert.equal(US.firstOf('2026-11-03','month'),'2026-11-02');
 assert.equal(US.dayOf(Z('2026-10-31T15:00:00Z')),'2026-11-02','10/31(토) 체결 → 11월 첫 거래일 몫');
});
test('HL 하루 경계 = KST 24:00, 주=월요일 시작(KST)',()=>{
 assert.equal(HL.dayOf(Z('2026-10-13T14:59:59Z')),'2026-10-13');assert.equal(HL.dayOf(Z('2026-10-13T15:00:00Z')),'2026-10-14');
 assert.equal(HL.dayEnd('2026-10-13'),kstWall('2026-10-14'));assert.equal(HL.firstOf('2026-10-18','week'),'2026-10-12');assert.equal(HL.lastOf('2026-10-13','week'),'2026-10-18');
 assert.equal(HL.lastOf('2026-02-10','month'),'2026-02-28');
});

// ---------------- 엔진 도우미 ----------------
function runner(cal,{cfg=CFG,fallback=null}={}){
 let state=null;const refs=new Set();const all={messages:[],events:[]};
 return {
  step(now,equity,{flows=[],fills=[]}={}){
   const r=risk.step(state,{now,cal,cfg,equity:equity==null?null:{value:equity,t:now,source:'test'},flows,fills,fallbackStart:fallback,eventRefs:refs});
   state=r.state;for(const e of r.events)refs.add(e.ref);all.messages.push(...r.messages);all.events.push(...r.events);return r;},
  get state(){return state;},all,refs};
}
const H=(d,h,m=0)=>kstWall(d,h,m); // HL: KST 벽시계

test('하루 −3%: 장중 도달 즉시 그날 24:00 KST까지 중단, 중복 알림 없음, 다음 날 재시작 위험 절반',()=>{
 const R=runner(HL);
 R.step(H('2026-10-13',0,0)-60000,10000);           // 경계 직전 관측 → 10/13 시작 자산
 let r=R.step(H('2026-10-13',0,1),10000);
 assert.equal(r.status.periods.day.startEquity,10000);assert.equal(r.status.periods.day.startSource,'server');
 r=R.step(H('2026-10-13',10,0),9820);assert.ok(r.messages.some(m=>/🔔|⚠️/.test(m.text)),'50% 사전 경고');assert.equal(r.status.stopped,false);
 r=R.step(H('2026-10-13',11,0),9699);
 assert.equal(r.status.stopped,true);assert.equal(r.status.stops[0].rule,'day');assert.equal(r.status.stops[0].until,H('2026-10-14',0));
 assert.match(r.messages.find(m=>m.text.startsWith('⛔')).text,/⛔ 하이퍼리퀴드 오늘 손실 −3\.01%[\s\S]*~ 10\/14\(수\) 00:00 KST까지/);
 r=R.step(H('2026-10-13',11,1),9500);assert.equal(r.messages.filter(m=>m.text.startsWith('⛔')).length,0,'같은 날 중복 없음');
 r=R.step(H('2026-10-14',0,1),9500);
 assert.equal(r.status.stopped,false);assert.equal(r.status.halfRisk.active,true);assert.equal(r.status.halfRisk.factor,0.5);
 assert.match(r.messages.at(-1).text,/재시작 첫날 · 1회 위험 0\.5% \(설정 1%의 50%\)/);
 const d13=R.state.days['2026-10-13'];assert.equal(d13.final,true);assert.equal(d13.endEquity,9500);assert.equal(d13.pct,-5);
 r=R.step(H('2026-10-15',0,1),9500);assert.equal(r.status.halfRisk.active,false,'절반 위험은 첫 거래일만');
});

test('입출금은 손익에서 제외: 출금으로 자산이 줄어도 중단 없음, 입금이 손실을 가리지 못함',()=>{
 const R=runner(HL);R.step(H('2026-10-13',0)-60000,10000);R.step(H('2026-10-13',0,1),10000);
 let r=R.step(H('2026-10-13',9),9500,{flows:[{ref:'w1',at:H('2026-10-13',8),amount:-500}]});
 assert.equal(r.status.periods.day.pnl,0);assert.equal(r.status.stopped,false);
 // 입금 1000 + 실제 손실 −400 → 자산 10100이지만 −4%(분모는 시작 자산 10000 고정)
 const R2=runner(HL);R2.step(H('2026-10-13',0)-60000,10000);R2.step(H('2026-10-13',0,1),10000);
 r=R2.step(H('2026-10-13',9),10600,{flows:[{ref:'d1',at:H('2026-10-13',8),amount:1000}]});
 assert.equal(r.status.periods.day.pct,-4);assert.equal(r.status.stopped,true);
});

test('주 −6%: 장중 도달 → 그날 끝까지, 마감에도 −6% 이하 → 다음 거래일부터 주말까지 / 회복하면 다음 날 해제',()=>{
 const R=runner(HL,{cfg:{...CFG,limits:{day:50,week:6,month:50}}});
 R.step(H('2026-10-12',0)-60000,10000);R.step(H('2026-10-12',0,1),10000);       // 월요일 = 주 시작 10000
 R.step(H('2026-10-13',0,1),9700);                                                // 화요일 시작 9700
 let r=R.step(H('2026-10-13',12),9390);                                           // 주 −6.1% 장중
 assert.deepEqual(r.status.stops.map(s=>s.rule),['week-intraday']);assert.equal(r.status.stops[0].until,H('2026-10-14',0));
 assert.match(r.messages.at(-1).text,/주간 손실 −6\.10%[\s\S]*장중 도달[\s\S]*다음 거래일부터 이번 주 끝까지/);
 R.step(H('2026-10-13',23,59),9380);
 r=R.step(H('2026-10-14',0,1),9380);                                              // 마감 판정 −6.2%
 const wk=r.status.stops.find(s=>s.rule==='week');assert.ok(wk,'공식 주간 중단');assert.equal(wk.from,H('2026-10-14',0));assert.equal(wk.until,H('2026-10-19',0),'일요일 24:00 KST(=다음 월요일 00:00)까지');
 assert.equal(r.status.halfRisk.active,false,'중단 중에는 절반 위험 아님');
 // 회복 시나리오
 const Q=runner(HL,{cfg:{...CFG,limits:{day:50,week:6,month:50}}});
 Q.step(H('2026-10-12',0)-60000,10000);Q.step(H('2026-10-12',0,1),10000);Q.step(H('2026-10-13',12),9390);Q.step(H('2026-10-13',23,59),9500);
 r=Q.step(H('2026-10-14',0,1),9500);assert.equal(r.status.stops.length,0,'마감 −5% → 공식 중단 없음');assert.equal(r.status.halfRisk.active,true,'장중 중단 끝난 다음 날 = 재시작 첫날');
});

test('주 마지막 거래일(금) 마감 판정은 남은 거래일이 없어 추가 중단 없음 (US)',()=>{
 const R=runner(US,{cfg:{...CFG,limits:{day:50,week:6,month:50}}});
 R.step(US.dayEnd('2026-10-09')-60000,10000);R.step(US.dayEnd('2026-10-09')+60000,10000); // 월 10/12 시작
 R.step(US.dayEnd('2026-10-15')+60000,9800);                                              // 금 10/16 시작
 R.step(US.dayEnd('2026-10-16')-60000,9300);
 const r=R.step(US.dayEnd('2026-10-16')+60000,9300);
 assert.ok(!r.status.stops.some(s=>s.rule==='week'),'공식 주간 중단 없음');assert.equal(R.state.days['2026-10-16'].close_week,-7);
});

test('월 −10%: 마감 판정 → 다음 거래일부터 그 달 마지막 거래일 16:00 ET까지 (US, 서머타임 종료 걸침)',()=>{
 const R=runner(US,{cfg:{...CFG,limits:{day:50,week:50,month:10}}});
 R.step(US.dayEnd('2026-09-30')-60000,10000);R.step(US.dayEnd('2026-09-30')+60000,10000);  // 10/1 시작 = 월 시작
 R.step(US.dayEnd('2026-10-22')-60000,8950);
 const r=R.step(US.dayEnd('2026-10-22')+60000,8950);
 const s=r.status.stops.find(x=>x.rule==='month');assert.ok(s);assert.equal(s.until,US.dayEnd('2026-10-30'));assert.equal(s.from,US.dayEnd('2026-10-22'));
 assert.match(s.untilText,/10\/31\(토\) 05:00 KST · 미국 10\/30 16:00 ET/);
});

test('연속 손실: ≤−0.5%만 손실일, 거래 없는 날은 건너뜀, 3일 → 다음 1거래일 중단, 이후 카운트 초기화',()=>{
 const R=runner(HL,{cfg:{...CFG,limits:{day:50,week:50,month:50}}});
 const fill=(d,h)=>({key:'f'+d+h,t:H(d,h),symbol:'BTC',entry:false,side:'sell',qty:1,price:1});
 const days=[['2026-10-05',10000,true],['2026-10-06',9940,true],['2026-10-07',9870,false],['2026-10-08',9800,true],['2026-10-09',9760,true],['2026-10-10',9700,true]];
 // 10/05 −0.6%(거래) · 10/06 −0.7%(거래) · 10/07 −0.71%(거래 없음 → 건너뜀) · 10/08 −0.41%(거래, 손실일 아님 → 끊김) · 10/09 −0.61% · 10/10 −0.5%(경계 포함)
 R.step(H('2026-10-05',0)-60000,10000);
 const ends=[9940,9870,9800,9760,9700,9650];
 for(let i=0;i<days.length;i++){const [d,start,traded]=days[i];R.step(H(d,0,1),start,{fills:traded?[fill(d,5)]:[]});R.step(H(d,23,59),ends[i],{fills:traded?[fill(d,5)]:[]});}
 let r=R.step(H('2026-10-11',0,1),9650,{fills:[fill('2026-10-10',5),fill('2026-10-09',5),fill('2026-10-08',5)]});
 const D=R.state.days;
 assert.equal(D['2026-10-07'].trades,0);assert.equal(D['2026-10-07'].loss,false);
 assert.equal(D['2026-10-08'].loss,false,'−0.71%? 아님: 10/08 = 9800→9760 = −0.41% → 손실일 아님');
 assert.equal(D['2026-10-10'].loss,true,'−0.52%');
 assert.equal(r.status.streak.count,2,'10/09·10/10 손실 2일(10/08에서 끊김) → 아직 발동 아님');assert.ok(!r.status.stops.length);
 // 실제 연속 3: 10/09, 10/10 손실 + 10/11 손실(거래) → 10/12 하루 중단
 R.step(H('2026-10-11',23,59),9600,{fills:[fill('2026-10-11',3)]});
 r=R.step(H('2026-10-12',0,1),9600,{fills:[fill('2026-10-11',3)]});
 const s=r.status.stops.find(x=>x.rule==='streak');assert.ok(s,'연속 손실 중단');assert.equal(s.from,H('2026-10-12',0));assert.equal(s.until,H('2026-10-13',0));
 assert.match(r.messages.find(m=>m.text.includes('연속 손실일')).text,/3일 연속 손실일 \(10\/09\(금\) −0\.61%, 10\/10\(토\) −0\.52%, 10\/11\(일\) −0\.52%\)/);
 assert.equal(r.status.streak.count,0,'발동 후 카운트 초기화');
 r=R.step(H('2026-10-13',0,1),9600);assert.equal(r.status.halfRisk.active,true);
});

test('연속 손실: 거래 없는 손실일이 사이에 있어도 연속 유지 (US 거래일, 성금요일 휴장 걸침)',()=>{
 const R=runner(US,{cfg:{...CFG,limits:{day:50,week:50,month:50}}});
 const f=d=>({key:'k'+d,t:US.dayEnd(d)-3600000,symbol:'AMD',entry:false,side:'sell',qty:1,price:1});
 // 3/31 손실(거래) · 4/1 손실(거래 없음, 건너뜀) · 4/2 손실(거래) · [4/3 성금요일] · 4/6 손실(거래) → 4/7 중단
 const seq=[['2026-03-31',10000,9900,true],['2026-04-01',9900,9800,false],['2026-04-02',9800,9700,true],['2026-04-06',9700,9600,true]];
 R.step(US.dayStart('2026-03-31')-60000,10000);
 const fills=[];for(const [d,a,b,tr] of seq){if(tr)fills.push(f(d));R.step(US.dayStart(d)+60000,a,{fills});R.step(US.dayEnd(d)-60000,b,{fills});}
 const r=R.step(US.dayEnd('2026-04-06')+60000,9600,{fills});
 assert.equal(R.state.days['2026-04-01'].trades,0);
 const s=r.status.stops.find(x=>x.rule==='streak');assert.ok(s);assert.equal(s.until,US.dayEnd('2026-04-07'));
 assert.ok(!R.state.days['2026-04-03'],'휴장일 기록 없음');
});

test('중단 중 신규 진입 → 위반 알림·기록, 청산은 위반 아님, 중단 끝난 뒤 진입도 위반 아님',()=>{
 const R=runner(HL);R.step(H('2026-10-13',0)-60000,10000);R.step(H('2026-10-13',0,1),10000);R.step(H('2026-10-13',11),9600);
 const fills=[{key:'hl:1',tid:1,t:H('2026-10-13',12),symbol:'BTC',entry:true,side:'buy',qty:0.01,price:60000,desc:'Open Long 0.01 @ 60000'},
  {key:'hl:2',tid:2,t:H('2026-10-13',13),symbol:'ETH',entry:false,side:'sell',qty:1,price:3000},
  {key:'hl:3',tid:3,t:H('2026-10-14',1),symbol:'SOL',entry:true,side:'buy',qty:1,price:150}];
 let r=R.step(H('2026-10-13',12,1),9600,{fills:fills.slice(0,2)});
 assert.equal(r.events.filter(e=>e.kind==='violation').length,1);const v=r.events.find(e=>e.kind==='violation');
 assert.equal(v.detail.symbol,'BTC');assert.equal(v.detail.tid,1);assert.equal(v.rule,'day');
 assert.match(r.messages.find(m=>m.text.startsWith('🚫')).text,/거래 중단 중 신규 진입 감지 · BTC Open Long[\s\S]*규칙 위반/);
 r=R.step(H('2026-10-13',12,2),9600,{fills:fills.slice(0,2)});assert.equal(r.events.filter(e=>e.kind==='violation').length,0,'중복 없음');
 r=R.step(H('2026-10-14',1,1),9600,{fills});assert.equal(r.events.filter(e=>e.kind==='violation').length,0);
});

test('설치가 기간 중간: 주·월 시작 자산은 fallback(키움 마감 잔액) → 없으면 가장 이른 기록(근사 표시)',()=>{
 const rows=[{day:'2026-10-13',value:'2100.00',source:'close',etDate:'2026-10-12',captured_at:US.dayEnd('2026-10-12')+600000}];
 const fb=src.usFallback(rows,US);
 const R=runner(US,{fallback:fb});
 const r=R.step(Z('2026-10-13T14:00:00Z'),2050);                                   // 화 10/13 장중, 직전 관측 없음
 assert.equal(r.status.periods.day.startEquity,2100);assert.match(r.status.periods.day.startSource,/키움 마감 잔액 2026-10-12/);
 assert.equal(r.status.periods.week.startSource,'partial:2026-10-13','월요일 시작(10/9 마감) 기록 없음 → 근사');
 assert.ok(Math.abs(r.status.periods.day.pct-(-2.381))<0.001);
});

test('기간 고점 대비 하락폭은 정보만(중단 아님)',()=>{
 const R=runner(HL,{cfg:{...CFG,limits:{day:50,week:50,month:50}}});R.step(H('2026-10-12',0)-60000,10000);R.step(H('2026-10-12',0,1),10000);
 R.step(H('2026-10-12',5),11000);const r=R.step(H('2026-10-12',6),10400);
 assert.equal(r.status.periods.week.ddPct,round(-600/11000*100));assert.equal(r.status.stopped,false);
});
const round=x=>Math.round(x*1e4)/1e4;

// ---------------- 원천 변환 ----------------
test('키움: 자산 = 주식 평가 + USD 예수금, 주문 시각 = 한국 날짜+시각, 매수=진입',()=>{
 const latest={as_of:Z('2026-10-13T14:00:00Z'),summary:{currency:'USD',reportedSecuritiesValue:'1234.56',cash:{apiId:'ust21160',currency:'USD',usd:'765.44',krwIncluded:false}}};
 assert.deepEqual(src.usEquity(latest,Z('2026-10-13T14:05:00Z')).value,2000);
 assert.equal(src.usEquity(latest,Z('2026-10-13T15:00:00Z'),20).stale,true);
 const f=src.usFills([{orderDate:'2026-10-14',key:'2026-10-14:NVDA:1',symbol:'NVDA',side:'매수',qty:'2',price:'180.5',time:'00:31:05'},{orderDate:'2026-10-13',key:'2026-10-13:NVDA:9',symbol:'NVDA',side:'매도',qty:'0',price:'',time:'23:00:00'}]);
 assert.equal(f.length,1);assert.equal(f[0].t,Z('2026-10-13T15:31:05Z'));assert.equal(f[0].entry,true);
 assert.equal(US.dayOf(f[0].t),'2026-10-13','한국 10/14 00:31 = 미국 10/13 11:31 ET → 10/13 거래일');
});
test('키움 입출금 추정: 매매로 설명 안 되는 예수금 변화만(≥$50), 수수료 차이는 손익',()=>{
 const L=(asOf,cash)=>({as_of:asOf,summary:{currency:'USD',reportedSecuritiesValue:'0',cash:{apiId:'ust21160',currency:'USD',usd:String(cash),krwIncluded:false}}});
 let r=src.usImpliedFlow(null,L(1000,1000),[],50);assert.equal(r.flow,null);
 // 매수 2주 × 100 = 200, 예수금 −201(수수료 1) → F = −1 → 손익(수수료)
 r=src.usImpliedFlow(r.obs,L(2000,799),[{key:'a',side:'매수',qty:'2',price:'100'}],50);assert.equal(r.flow,null);
 // 입금 500(환전)
 r=src.usImpliedFlow(r.obs,L(3000,1299),[{key:'a',side:'매수',qty:'2',price:'100'}],50);assert.equal(r.flow.amount,500);assert.equal(r.flow.at,3000);
 // 매도 1주 × 120 + 출금 300
 r=src.usImpliedFlow(r.obs,L(4000,1119),[{key:'a',side:'매수',qty:'2',price:'100'},{key:'b',side:'매도',qty:'1',price:'120'}],50);assert.equal(r.flow.amount,-300);
 // 같은 스냅샷 재전송 → 무시
 const again=src.usImpliedFlow(r.obs,L(4000,1119),[],50);assert.equal(again.flow,null);
});
test('HL: 진입 판별(신규·추가·방향 전환), 현물 제외 / 입출금 원장 부호',()=>{
 const me='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40);
 const f=src.hlFills([{coin:'BTC',time:1,sz:'0.1',startPosition:'0',side:'B',px:'1',tid:1,dir:'Open Long'},{coin:'BTC',time:2,sz:'0.05',startPosition:'0.1',side:'A',px:'1',tid:2},
  {coin:'ETH',time:3,sz:'3',startPosition:'1',side:'A',px:'1',tid:3},{coin:'@107',time:4,sz:'1',startPosition:'0',side:'B',px:'1',tid:4},{coin:'xyz:TSLA',time:5,sz:'1',startPosition:'-1',side:'A',px:'1',tid:5}]);
 assert.deepEqual(f.map(x=>[x.tid,x.entry]),[[1,true],[2,false],[3,true],[5,true]]);
 const fl=src.hlFlows([{time:1,hash:'h1',delta:{type:'deposit',usdc:'1000'}},{time:2,hash:'h2',delta:{type:'withdraw',usdc:'100',fee:'1'}},
  {time:3,hash:'h3',delta:{type:'internalTransfer',usdc:'50',user:me,destination:other,fee:'0'}},{time:4,hash:'h4',delta:{type:'internalTransfer',usdc:'20',user:other,destination:me}},
  {time:5,hash:'h5',delta:{type:'accountClassTransfer',usdc:'300',toPerp:true}},{time:6,hash:'h6',delta:{type:'spotTransfer',token:'HYPE',amount:'3',usdcValue:'90',user:me,destination:other}},
  {time:7,hash:'h7',delta:{type:'vaultDeposit',vault:other,usdc:'200'}},{time:8,hash:'h8',delta:{type:'liquidation',accountValue:'1'}}],me);
 assert.deepEqual(fl.map(x=>[x.kind,x.amount]),[['deposit',1000],['withdraw',-101],['internalTransfer',-50],['internalTransfer',20],['vaultDeposit',-200]]);
});
test('HL portfolio 근사: BALANCE와의 차이를 최신점 기준으로 보정',()=>{
 const t0=HL.dayStart('2026-10-12');const pf=[['week',{accountValueHistory:[[t0-600000,'1000.0'],[t0+3600000,'1010'],[Date.now(),'1100']]}]];
 const fb=src.hlPortfolioFallback(pf,HL,{value:1050});
 assert.deepEqual(fb('2026-10-12'),{equity:950,at:t0,source:'HL portfolio 근사'});
});
