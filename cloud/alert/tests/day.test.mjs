// alert3 손실한도 판정 v1.3 — 하루 한도(실현손익 ÷ 직전 마감) 단위 테스트.  node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {usCalendar,hlCalendar,etWall,kstWall} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as day from '../src/day.mjs';

const US=usCalendar(),HL=hlCalendar();
const CFG={dayMode:'realized',limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000};
const Z=s=>Date.parse(s);
const fill=(time,closedPnl,fee,o={})=>({coin:'BTC',dir:'Close Long',feeToken:'USDC',time,closedPnl:String(closedPnl),fee:String(fee),tid:o.tid??time,side:'A',sz:'0.01',px:'60000',startPosition:'0.01',...o});
const acctHL=(d,v,source='close')=>({market:'hl',day:d,value:v,source,captured_at:Date.parse(d+'T00:00:00Z')+86400000+300000});
const acctUS=(d,v,et,extra={})=>({market:'us',day:d,value:v,source:'close',etDate:et,captured_at:etWall(et,16,15),...extra});

test('HL 하루 경계 = UTC 00:00(KST 09:00): 08:59 KST 체결은 전날, 09:00 KST부터 오늘 · 현물·비USDC 수수료·비무기한 제외',()=>{
 const f=[fill(Z('2026-10-19T23:59:59Z'),-100,1,{tid:1}),fill(Z('2026-10-20T00:00:00Z'),-20,0.5,{tid:2}),fill(Z('2026-10-20T13:00:00Z'),5,0.25,{tid:3,dir:'Open Long',closedPnl:'0'}),
  fill(Z('2026-10-20T01:00:00Z'),-999,0,{tid:4,coin:'@107',dir:'Buy'}),fill(Z('2026-10-20T01:00:00Z'),-999,0,{tid:5,coin:'PURR/USDC'}),fill(Z('2026-10-20T01:00:00Z'),-999,0,{tid:6,feeToken:'HYPE'}),fill(Z('2026-10-20T01:00:00Z'),-999,0,{tid:7,dir:'Spot Dust Conversion'})];
 const r=day.hlDayRealized(f,[],'2026-10-20');
 assert.equal(r.from,kstWall('2026-10-20',9),'KST 09:00 시작');assert.equal(r.until,kstWall('2026-10-21',9));
 assert.equal(r.parts.fills,2);assert.equal(r.parts.trades,-20.75,'(−20 −0.5) + (0 −0.25)');assert.equal(r.pnl,-20.75);
 assert.equal(day.hlDayRealized(f,[],'2026-10-19').pnl,-101,'KST 10/20 08:59:59 체결 = UTC 10/19 몫');
 assert.equal(day.utcDate(kstWall('2026-10-20',8,59)),'2026-10-19');assert.equal(day.utcDate(kstWall('2026-10-20',9)),'2026-10-20');
});

test('HL 펀딩 포함 + API·Supabase 수집분 중복 없이 합침(tid / time+coin)',()=>{
 const t=Z('2026-10-20T05:00:00Z');
 const api=[fill(t,-50,1,{tid:11})],db=[{tid:11,time:t,coin:'BTC',dir:'Close Long',closedPnl:'-50',fee:'1',feeToken:'USDC'},{tid:12,time:t+1000,coin:'ETH',dir:'Close Short',closedPnl:'10',fee:'0.5',feeToken:'USDC'}];
 const fApi=[{time:Z('2026-10-20T08:00:00Z'),hash:'0xa',delta:{type:'funding',coin:'BTC',usdc:'-3.5',szi:'0.1'}}],fDb=[{time:Z('2026-10-20T08:00:00Z'),coin:'BTC',usdc:'-3.5'},{time:Z('2026-10-20T09:00:00Z'),coin:'BTC',usdc:'-2'},{time:Z('2026-10-19T23:00:00Z'),coin:'BTC',usdc:'-100'}];
 const fills=day.mergeHlFills(api,db),fund=day.mergeHlFunding(fApi,fDb);
 assert.equal(fills.length,2);assert.equal(fund.length,3);
 const r=day.hlDayRealized(fills,fund,'2026-10-20');
 assert.equal(r.parts.trades,-41.5);assert.equal(r.parts.funding,-5.5,'전날 UTC 펀딩 제외');assert.equal(r.pnl,-47);assert.equal(r.parts.fundingCount,2);
});

test('분모 = 직전 마감(7일 이내, >0) → 없으면 현재 기준액 → 앱 설정 기준액 (앱 v28Denom과 같은 규칙)',()=>{
 let d=day.dayDenom({acct:[acctHL('2026-10-18',1900),acctHL('2026-10-19',2000)],k0:'2026-10-20',market:'HL',current:2150,manual:3000});
 assert.deepEqual([d.value,d.mode,d.key,d.expected],[2000,'close','2026-10-19',true]);assert.equal(d.closeAt,Z('2026-10-20T00:00:00Z'));
 assert.equal(risk.basisText(d,'HL'),'전일 마감 2,000.00 USDC');
 d=day.dayDenom({acct:[acctHL('2026-10-16',2500,'approx')],k0:'2026-10-20',market:'HL',current:2150});
 assert.deepEqual([d.value,d.expected,d.source],[2500,false,'approx']);assert.equal(risk.basisText(d,'HL'),'10/16 마감 2,500.00 USDC','전일이 아니면 MM/DD 마감 · approx도 사용');
 d=day.dayDenom({acct:[acctHL('2026-10-12',1000)],k0:'2026-10-20',market:'HL',current:2150});
 assert.deepEqual([d.value,d.mode,d.source],[2150,'basis','HL BALANCE'],'8일 전 마감은 무시');assert.equal(risk.basisText(d,'HL'),'현재 기준액 2,150.00 USDC');
 d=day.dayDenom({acct:[acctHL('2026-10-18',1900),acctHL('2026-10-19',0)],k0:'2026-10-20',market:'HL',current:null,manual:3000});
 assert.deepEqual([d.value,d.mode,d.source],[3000,'basis','앱 설정 계좌 기준액'],'마지막 마감 0 → 이전 마감으로 내려가지 않고 폴백(앱과 동일)');
 assert.equal(day.dayDenom({acct:[],k0:'2026-10-20',market:'HL'}),null);
 assert.equal(day.dayDenom({acct:[acctHL('2026-10-20',5000)],k0:'2026-10-20',market:'HL',current:2150}).mode,'basis','오늘 키는 직전 마감 아님');
});

test('US 분모 키 = etDate(없으면 captured_at 미국 날짜 → day−1), 같은 키는 늦은 day, 전일 = 직전 평일',()=>{
 const acct=[acctUS('2026-10-17',5000,'2026-10-16'),{market:'us',day:'2026-10-18',value:5100,source:'close',captured_at:etWall('2026-10-16',20)},{market:'us',day:'2026-10-15',value:4900,source:'close'}];
 const rows=day.closeRows(acct,'US');assert.deepEqual(Object.keys(rows).sort(),['2026-10-14','2026-10-16']);assert.equal(rows['2026-10-16'].value,5100,'같은 키 → day가 늦은 행');
 const d=day.dayDenom({acct,k0:'2026-10-19',market:'US',current:5250});
 assert.deepEqual([d.value,d.key,d.expected],[5100,'2026-10-16',true],'월요일의 전일 = 금요일');assert.equal(d.closeAt,etWall('2026-10-16',16));
 assert.equal(risk.basisText(d,'US'),'전일 마감 $5,100.00');
 const b=day.dayDenom({acct:[],k0:'2026-10-19',market:'US',current:5250,manual:4000});assert.equal(risk.basisText(b,'US'),'현재 기준액 $5,250.00');
 assert.equal(day.dayDenom({acct:[],k0:'2026-10-19',market:'US',current:null,manual:4000}).value,4000);
});

test('US 분자 = 키움 일별 실현손익(ust21640 reportedTotal) — 그 거래일 행, 같은 날 여러 스냅샷이면 최신 as_of, 없으면 0',()=>{
 const kw=[{date:'2026-10-16',as_of:1,total:'-10.5',count:1},{date:'2026-10-19',as_of:5,total:'-61.25',count:2},{date:'2026-10-19',as_of:3,total:'-1',count:1}];
 assert.equal(day.usDayRealized(kw,'2026-10-19').pnl,-61.25);assert.equal(day.usDayRealized(kw,'2026-10-19').parts.rows,2);
 const n=day.usDayRealized(kw,'2026-10-20');assert.equal(n.pnl,0);assert.equal(n.parts.reported,false);
});

// ---------------- 엔진 ----------------
function hlRun(){let st=null;const refs=new Set();const msgs=[];return {
 step(now,{pnl,trades=pnl,funding=0,eq=null,denom={value:2000,mode:'close',key:'2026-10-19',expected:true,closeAt:Z('2026-10-20T00:00:00Z')},flows=[],fills=[],key=day.utcDate(now)}){
  const D={key,from:day.utcStart(key),until:day.utcStart(key)+86400000,pnl,parts:{trades,funding,fees:0,fills:1,fundingCount:0},denom};
  const r=risk.step(st,{now,cal:HL,cfg:CFG,equity:eq==null?null:{value:eq,t:now,source:'test'},flows,fills,eventRefs:refs,dayMode:'realized',dayRealized:D});
  st=r.state;for(const e of r.events)refs.add(e.ref);msgs.push(...r.messages);return r;},msgs,get state(){return st;}};}

test('HL 직전 마감 있음: 실현 −50%/−80% 사전 알림 1회씩 → −3%(= −60) 도달 시 중단 ~ 다음 UTC 00:00(KST 09:00), 메시지에 기준·참고(미실현) 표기',()=>{
 const h=hlRun(),t0=Z('2026-10-20T01:00:00Z');
 let r=h.step(t0,{pnl:-10,eq:2000});assert.equal(r.messages.length,0);assert.equal(r.status.periods.day.pct,-0.5);assert.equal(r.status.periods.day.budget,60);assert.equal(r.status.periods.day.basis,'realized');
 assert.equal(r.status.periods.day.startSource,'전일 마감 2,000.00 USDC');assert.ok(r.status.periods.dayEquity,'자산 변화 기준은 참고로 남음');
 r=h.step(t0+60000,{pnl:-31,eq:1960});assert.equal(r.messages.length,1);assert.match(r.messages[0].text,/^🔔 하이퍼리퀴드 · 하루 한도 51% 사용\n\n오늘 실현: −1\.55% \(−31\.00 USDC\)\n한도: −3% \(−60\.00 USDC\)\n기준: 전일 마감 2,000\.00 USDC/);
 assert.match(r.messages[0].text,/\n참고: 미실현 포함 −2\.00% \(−40\.00 USDC\) · 판정 제외/);
 r=h.step(t0+120000,{pnl:-32,eq:1950});assert.equal(r.messages.length,0,'같은 단계 재알림 없음');
 r=h.step(t0+180000,{pnl:-49,eq:1950});assert.equal(r.messages.length,1);assert.match(r.messages[0].text,/^⚠️ 하이퍼리퀴드 · 하루 한도 81% 사용\n/);
 r=h.step(t0+240000,{pnl:-60,trades:-55,funding:-5,eq:1920});
 assert.equal(r.status.stopped,true);const s=r.status.stops[0];assert.equal(s.id,'HL:dayr:2026-10-20');assert.equal(s.until,kstWall('2026-10-21',9),'KST 10/21 09:00까지');assert.equal(s.label,'하루 실현 −3%');
 const m=r.messages.find(x=>x.text.startsWith('⛔'));assert.ok(m);
 assert.match(m.text,/^⛔ 하이퍼리퀴드 거래 중단 · 하루 실현 −3% 도달\n\n오늘 실현: −3\.00% \(−60\.00 USDC\)\n한도: −3% \(−60\.00 USDC\)\n기준: 전일 마감 2,000\.00 USDC\n내역: 체결 −55\.00 USDC \+ 펀딩 −5\.00 USDC\n참고: 미실현 포함 −4\.00% \(−80\.00 USDC\) · 판정 제외\n신규 진입 중단: /);
 assert.match(m.text,/\n신규 진입 중단: ~ 10\/21\(수\) 09:00 KST까지\n\n주문은 막지 않습니다/);
 r=h.step(t0+300000,{pnl:-80,eq:1900});assert.equal(r.events.length,0,'중단 중복 없음');
 // KST 자정이 지나도(UTC 15:00) 같은 UTC 날 → 중단 유지
 r=h.step(kstWall('2026-10-21',0,30),{pnl:-80,eq:1900});assert.equal(r.status.stopped,true);
 // KST 09:00 = 새 UTC 날 → 해제 + 재시작 첫날 절반
 r=h.step(kstWall('2026-10-21',9,1),{pnl:0,eq:1900,denom:{value:1900,mode:'close',key:'2026-10-20',expected:true,closeAt:Z('2026-10-21T00:00:00Z')}});
 assert.equal(r.status.stopped,false);assert.equal(r.status.halfRisk.active,true);assert.ok(r.messages.some(x=>/재시작 첫날/.test(x.text)));
});

test('하루 판정은 실현 기준: 미실현으로 자산이 −5%여도 실현 0이면 하루 중단 없음 / 주 −6% 장중 규칙은 자산 기준 그대로',()=>{
 const h=hlRun(),t0=Z('2026-10-20T01:00:00Z');
 h.step(t0,{pnl:0,eq:2000});let r=h.step(t0+60000,{pnl:0,eq:1900});
 assert.equal(r.status.stopped,false);assert.equal(r.status.periods.day.pct,0);assert.equal(r.status.periods.dayEquity.pct,-5);
 assert.ok(!r.messages.some(x=>/하루/.test(x.text)),'하루 경고 없음');
 r=h.step(t0+120000,{pnl:0,eq:1870});assert.equal(r.status.stopped,true,'주 −6.5% 장중 도달');assert.equal(r.status.stops[0].rule,'week-intraday');
});

test('HL 직전 마감 없음 → 현재 기준액(BALANCE) 분모, 메시지 "현재 기준액" · 분모 없음 → 하루 판정 건너뜀(note)',()=>{
 const h=hlRun(),t0=Z('2026-10-20T03:00:00Z');
 let r=h.step(t0,{pnl:-70,eq:2150,denom:{value:2150,mode:'basis',key:null,source:'HL BALANCE'}});
 assert.equal(r.status.periods.day.pct,-3.2558);assert.equal(r.status.periods.day.budget,64.5);assert.equal(r.status.stopped,true);
 assert.match(r.messages[0].text,/기준: 현재 기준액 2,150\.00 USDC/);assert.match(r.messages[0].text,/참고: 미실현 포함 0\.00%|참고: 미실현 포함 \+?0/,'관측 시작 = 현재 → 0');
 const g=hlRun();r=g.step(t0,{pnl:-70,eq:null,denom:null});assert.equal(r.status.periods.day.pct,null);assert.match(r.status.note,/분모/);assert.equal(r.status.stopped,false);
});

test('US: 키움 실현 −$61 ÷ 전일 마감 $2,000 → 중단 ~ 그날 16:00 ET, 다음 거래일 새 분모',()=>{
 let st=null;const refs=new Set();
 const run=(now,pnl,denom)=>{const k=US.dayOf(now);const D={key:k,from:US.dayStart(k),until:US.dayEnd(k),pnl,parts:{rows:1,reported:true},denom};const r=risk.step(st,{now,cal:US,cfg:CFG,equity:{value:2000+pnl,t:now,source:'t'},flows:[],fills:[],eventRefs:refs,dayMode:'realized',dayRealized:D});st=r.state;for(const e of r.events)refs.add(e.ref);return r;};
 const t0=Z('2026-10-20T14:30:00Z'); // 10/20 23:30 KST = 10:30 ET
 const den={value:2000,mode:'close',key:'2026-10-19',expected:true,closeAt:etWall('2026-10-19',16)};
 let r=run(t0,-20,den);assert.equal(r.status.stopped,false);
 r=run(t0+3600000,-61,den);assert.equal(r.status.stopped,true);assert.equal(r.status.stops[0].until,etWall('2026-10-20',16));
 assert.match(r.messages.find(m=>m.text.startsWith('⛔')).text,/^⛔ 미국주식 거래 중단 · 하루 실현 −3% 도달\n\n오늘 실현: −3\.05% \(−\$61\.00\)\n한도: −3% \(−\$60\.00\)\n기준: 전일 마감 \$2,000\.00\n참고: 미실현 포함/);
 r=run(etWall('2026-10-20',16,5),0,{value:1939,mode:'close',key:'2026-10-20',expected:true,closeAt:etWall('2026-10-20',16)});
 assert.equal(r.status.today,'2026-10-21');assert.equal(r.status.stopped,false);assert.equal(r.status.periods.day.startSource,'전일 마감 $1,939.00');
});

test('dayMode 없음(alert3.sql 미설치·DAY_LIMIT_BASIS=equity) → v1.2 하루 판정(자산 변화) 그대로',()=>{
 const r1=risk.step(null,{now:kstWall('2026-10-20',10),cal:HL,cfg:{...CFG,dayMode:'equity'},equity:{value:1000,t:kstWall('2026-10-20',10),source:'t'},flows:[],fills:[]});
 const r2=risk.step(r1.state,{now:kstWall('2026-10-20',10,1),cal:HL,cfg:{...CFG,dayMode:'equity'},equity:{value:960,t:kstWall('2026-10-20',10,1),source:'t'},flows:[],fills:[]});
 assert.equal(r2.status.stopped,true);assert.equal(r2.status.stops[0].id,'HL:day:2026-10-20');assert.equal(r2.status.dayBasis,'equity');assert.equal(r2.status.periods.dayEquity,undefined);
});
