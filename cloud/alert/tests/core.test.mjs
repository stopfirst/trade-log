import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.mjs';

const CFG={thresholds:[50,80,100],streakN:3,streakRepeat:true,includeUnrealized:false,dailySummary:true,summaryTime:[16,15]};
const ms=s=>Date.parse(s);
// US journal with limits 1%/2%/4% of a manual $50,000 basis -> $500 / $1,000 / $2,000
const usJournal=(trades=[],extra={})=>({exists:true,revision:1,settings:{limD:1,limW:2,limM:4,account:50000},trades,broker_days:[],...extra});
const manual=(id,date,pnl,{time='10:00:00',name='T'+id}={})=>({id,name,market:'US',direction:'long',entries:[{id:'e',date,time,shares:10,price:100,fee:0}],fills:[{id:'f',date,time:time.replace(/^10/,'11'),shares:10,price:100+pnl/10,fee:0}],funding:[]});
const usData=(days=[],latest=null)=>({us:{kw:{days,latest}},hl:{raw:{registered:false}}});

test('periodKey: week starts Monday, month = YYYY-MM (same as app)',()=>{
 assert.equal(core.periodKey('2026-10-11','week'),'2026-10-05'); // Sunday -> Monday before
 assert.equal(core.periodKey('2026-10-12','week'),'2026-10-12'); // Monday
 assert.equal(core.periodKey('2026-10-31','month'),'2026-10');
 assert.equal(core.periodKey('2026-03-01','week'),'2026-02-23');
});

test('today: US with Kiwoom = Korean date, US manual only = US Eastern date, HL = UTC',()=>{
 const t=ms('2026-10-12T15:30:00Z'); // KST 10-13 00:30, ET 10-12 11:30
 const withKw=core.buildUS(usData([{date:'2026-10-12',as_of:1,total:'0',rows:[]}]),usJournal());
 const manualOnly=core.buildUS(usData(),usJournal());
 const hl=core.buildHL({hl:{raw:{registered:false}}},{exists:true,settings:{},trades:[]});
 assert.equal(core.todayFor(withKw,t),'2026-10-13');
 assert.equal(core.todayFor(manualOnly,t),'2026-10-12');
 assert.equal(core.todayFor(hl,t),'2026-10-12');
 // HL day boundary is 00:00 UTC = 09:00 KST
 assert.equal(core.todayFor(hl,ms('2026-10-12T23:59:59Z')),'2026-10-12');
 assert.equal(core.todayFor(hl,ms('2026-10-13T00:00:00Z')),'2026-10-13');
 // US Eastern date around midnight with DST (EDT, UTC-4)
 assert.equal(core.todayFor(manualOnly,ms('2026-10-13T03:59:00Z')),'2026-10-12');
 assert.equal(core.todayFor(manualOnly,ms('2026-10-13T04:00:00Z')),'2026-10-13');
});

test('tradeLedger: average cost exits, entry fees on entry date, short sign, invalid trade has no ledger',()=>{
 const t={id:'a',market:'US',direction:'long',entries:[{date:'2026-10-05',time:'10:00',shares:10,price:100,fee:1},{date:'2026-10-05',time:'11:00',shares:10,price:110,fee:1}],fills:[{date:'2026-10-06',time:'10:00',shares:5,price:100,fee:0.5},{date:'2026-10-07',time:'10:00',shares:15,price:120,fee:0.5}]};
 const c=core.tradeLedger(t);
 assert.equal(c.valid,true);assert.equal(c.done,true);
 assert.deepEqual(c.ledger.map(e=>[e.date,Math.round(e.usd*100)/100]),[['2026-10-05',-1],['2026-10-05',-1],['2026-10-06',-25.5],['2026-10-07',224.5]]);
 const s=core.tradeLedger({id:'s',market:'HL',direction:'short',entries:[{date:'2026-10-05',shares:2,price:100,fee:0}],fills:[{date:'2026-10-05',time:'01:00',shares:2,price:90,fee:0.1}],funding:[]});
 assert.equal(Math.round(s.pnl*100)/100,19.9);
 const bad=core.tradeLedger({id:'b',market:'US',entries:[{date:'2026-10-05',shares:1,price:10}],fills:[{date:'2026-10-06',shares:5,price:10}]});
 assert.equal(bad.valid,false);assert.deepEqual(bad.ledger,[]);
});

test('US: a Kiwoom daily report replaces manual records of that date (app effectiveLedger); other dates use manual records',()=>{
 const days=[{date:'2026-10-12',as_of:5,total:'-300.5',rows:[{symbol:'NVDA',net:'-300.5',t:'23:10:00'}]}];
 const trades=[manual('m1','2026-10-12',-999),manual('m2','2026-10-09',-100)];
 const m=core.buildUS(usData(days),usJournal(trades));
 const p=core.periodSums(m,ms('2026-10-12T05:00:00Z')); // KST 10-12 14:00
 assert.equal(p.today,'2026-10-12');
 assert.equal(p.day.sum,-300.5);
 assert.equal(p.week.sum,-300.5);                 // week of 10-12 (Mon) excludes Fri 10-09
 assert.equal(p.month.sum,-400.5);
 assert.equal(p.day.budget,500);assert.ok(Math.abs(p.day.ratio-0.601)<1e-9);
 // app-saved broker days and collector days are merged, newer as_of wins
 const m2=core.buildUS(usData(days),usJournal([],{broker_days:[{date:'2026-10-12',as_of:9,total:'-10',rows:[]},{date:'2026-10-10',as_of:1,total:'-5',rows:[]}]}));
 const p2=core.periodSums(m2,ms('2026-10-12T05:00:00Z'));
 assert.equal(p2.day.sum,-10);assert.equal(p2.month.sum,-15);
 // entries after "today" are not counted (app: e.date<=today)
 const m3=core.buildUS(usData([{date:'2026-10-13',as_of:1,total:'-50',rows:[]}]),usJournal());
 assert.equal(core.periodSums(m3,ms('2026-10-12T05:00:00Z')).day.sum,0);
});

test('US account basis: Kiwoom total (securities + USD cash) > app setting > .env override',()=>{
 const latest={date:'2026-10-12',as_of:1,summary:{currency:'USD',reportedSecuritiesValue:'1234.56',cash:{apiId:'ust21160',currency:'USD',usd:'765.44',krwIncluded:false}},positions:[{symbol:'AAPL',quantity:'3',reportedPnl:'14.7'}]};
 let m=core.buildUS(usData([],latest),usJournal());
 assert.equal(m.basis,2000);assert.equal(m.basisSource,'키움 총 계좌금액');assert.equal(m.unrealized,14.7);
 m=core.buildUS(usData([],{...latest,summary:{currency:'USD',reportedSecuritiesValue:'1234.56'}}),usJournal());
 assert.equal(m.basis,50000);assert.equal(m.basisSource,'앱 계좌 기준액');
 m=core.buildUS(usData([],latest),usJournal(),{basisOverride:9000,limitsOverride:[3,null,10]});
 assert.equal(m.basis,9000);assert.deepEqual(m.limits,{day:3,week:null,month:10});
 // unrealized only when enabled
 const loss=core.buildUS(usData([{date:'2026-10-12',as_of:1,total:'-100',rows:[]}],{...latest,positions:[{symbol:'A',quantity:'1',reportedPnl:'-200'}]}),usJournal());
 assert.equal(core.periodSums(loss,ms('2026-10-12T05:00:00Z')).day.sum,-100);
 assert.equal(core.periodSums(loss,ms('2026-10-12T05:00:00Z'),{includeUnrealized:true}).day.sum,-300);
});

test('HL: collector fills (closedPnl-fee) + funding by UTC date; synced trades of the journal are not double counted',()=>{
 const data={hl:{raw:{registered:true,address:'0xabc',fills_daily:[{date:'2026-10-12',pnl:-120.25},{date:'2026-10-11',pnl:-30}],funding_daily:[{date:'2026-10-12',amount:-1.75}],closed:[{coin:'ETH',closed_at:ms('2026-10-12T01:00:00Z'),pnl:-50},{coin:'BTC',closed_at:ms('2026-10-12T02:00:00Z'),pnl:-60}]}}};
 const synced={id:'s1',name:'ETH',market:'HL',direction:'long',sync:{source:'hyperliquid'},entries:[{date:'2026-10-12',shares:1,price:100,fee:0}],fills:[{date:'2026-10-12',time:'01:00',shares:1,price:1,fee:0}],funding:[]};
 const man={...manual('m1','2026-10-12',-20),market:'HL'};
 const m=core.buildHL(data,{exists:true,settings:{limD:1,account:10000},trades:[synced,man]},{liveBalance:20000});
 const p=core.periodSums(m,ms('2026-10-12T12:00:00Z'));
 assert.equal(p.day.sum,-142);           // -120.25 -1.75 -20
 assert.equal(p.week.sum,-142);          // 10-11 is a Sunday: previous week
 assert.equal(p.month.sum,-172);
 assert.equal(m.basis,20000);assert.equal(m.basisSource,'하이퍼리퀴드 BALANCE');
 assert.equal(p.day.budget,200);
 // without collector: journal only, including synced trades and unassigned account funding
 const j={exists:true,settings:{account:10000},trades:[synced],account_funding:[{sourceKey:'x',timestamp:ms('2026-10-12T08:00:00Z'),amount:'-2'}]};
 const m2=core.buildHL({hl:{raw:{registered:false}}},j);
 assert.equal(core.periodSums(m2,ms('2026-10-12T12:00:00Z')).day.sum,-101);
 assert.equal(m2.basis,10000);
});

test('limit rules: 50/80/100% once per period, the highest crossed level only, new period alerts again',()=>{
 const state={sent:{}};
 const mk=pnl=>core.buildUS(usData([{date:'2026-10-12',as_of:1,total:String(pnl),rows:[]}]),usJournal([],{settings:{limD:1,limW:null,limM:null,account:50000}}));
 const now=ms('2026-10-12T05:00:00Z');
 assert.deepEqual(core.evaluate([mk(-200)],now,state,CFG),[]);                       // 40%
 let out=core.evaluate([mk(-412.3)],now,state,CFG);                                    // 82% -> one message
 assert.equal(out.length,1);
 assert.equal(out[0].text,'⚠️ 미국주식 오늘 손실 -$412.30 · 하루 한도 $500.00의 82%');
 assert.deepEqual(out[0].keys,['US:day:2026-10-12:50','US:day:2026-10-12:80']);
 for(const k of out[0].keys)state.sent[k]='2026-10-12T05:00:00.000Z';
 assert.deepEqual(core.evaluate([mk(-450)],now,state,CFG),[],'no repeat inside the same day');
 out=core.evaluate([mk(-510)],now,state,CFG);
 assert.equal(out.length,1);assert.match(out[0].text,/^⛔ 미국주식 오늘 손실 -\$510\.00 · 하루 한도 \$500\.00 도달\(102%\)/);
 for(const k of out[0].keys)state.sent[k]='x';
 assert.deepEqual(core.evaluate([mk(-900)],now,state,CFG),[]);
 // recovering and falling again on the same day does not repeat
 assert.deepEqual(core.evaluate([mk(-100)],now,state,CFG),[]);
 // next day (new period key) alerts again
 const next=core.buildUS(usData([{date:'2026-10-13',as_of:1,total:'-260',rows:[]}]),usJournal([],{settings:{limD:1,account:50000}}));
 out=core.evaluate([next],ms('2026-10-13T05:00:00Z'),state,CFG);
 assert.equal(out.length,1);assert.match(out[0].text,/^🔔 미국주식 오늘 손실 -\$260\.00 · 하루 한도 \$500\.00의 52%/);
});

test('week and month limits use their own period keys; custom thresholds',()=>{
 const m=core.buildUS(usData([{date:'2026-10-12',as_of:1,total:'-900',rows:[]},{date:'2026-10-09',as_of:1,total:'-700',rows:[]}]),usJournal());
 const out=core.evaluate([m],ms('2026-10-12T05:00:00Z'),{sent:{}},{...CFG,thresholds:[70]});
 // day 900/500 -> 70 crossed; week 900/1000=90% -> 70; month 1600/2000=80% -> 70
 assert.deepEqual(out.map(o=>o.keys[0]),['US:day:2026-10-12:70','US:week:2026-10-12:70','US:month:2026-10:70']);
 assert.match(out[1].text,/이번 주 손실 -\$900\.00 · 주 한도 \$1,000\.00의 90%/);
 assert.match(out[2].text,/이번 달 손실 -\$1,600\.00 · 월 한도 \$2,000\.00의 80%/);
});

test('limits not set: no limit alert, and a one-line notice text',()=>{
 const m=core.buildUS(usData([{date:'2026-10-12',as_of:1,total:'-5000',rows:[]}]),usJournal([],{settings:{account:50000}}));
 assert.deepEqual(core.evaluate([m],ms('2026-10-12T05:00:00Z'),{sent:{}},{...CFG,streakN:0}),[]);
 assert.equal(core.unsetMessage(m),'ℹ️ 미국주식 손실 한도(하루·주·달) 미설정 → 해당 한도 알림은 건너뜁니다. 앱 설정 → 계좌·위험에서 입력하세요.');
 const noBasis=core.buildUS(usData(),usJournal([],{settings:{limD:2}}));
 assert.match(core.unsetMessage(noBasis),/계좌 기준액, 주 한도·월 한도 미설정/);
});

test('loss streak: N consecutive closed losses, a win or 0 breaks it, repeat per new loss or once per run',()=>{
 const days=[{date:'2026-10-08',as_of:1,total:'5',rows:[{symbol:'WIN',net:'5',t:'23:00:00'}]},
  {date:'2026-10-09',as_of:1,total:'-30',rows:[{symbol:'B',net:'-20',t:'23:30:00'},{symbol:'A',net:'-10',t:'22:00:00'}]}];
 const trades=[manual('m1','2026-10-12',-15,{name:'TSLA'})];
 const m=core.buildUS(usData(days),usJournal(trades));
 const s=core.lossStreak(m.closed);
 assert.equal(s.count,3);
 assert.deepEqual(s.items.map(x=>x.label),['TSLA','B','A']);
 const st={sent:{}};let out=core.evaluate([m],ms('2026-10-12T20:00:00Z'),st,{...CFG,thresholds:[1000]});
 assert.equal(out.length,1);assert.equal(out[0].text,'🔻 미국주식 연속 손실 3회 · 최근 TSLA -$15.00, B -$20.00, A -$10.00');
 for(const k of out[0].keys)st.sent[k]='x';
 assert.deepEqual(core.evaluate([m],ms('2026-10-12T20:00:00Z'),st,{...CFG,thresholds:[1000]}),[]);
 const m4=core.buildUS(usData(days),usJournal([...trades,manual('m2','2026-10-13',-5,{name:'AMD'})]));
 assert.equal(core.evaluate([m4],ms('2026-10-13T20:00:00Z'),st,{...CFG,thresholds:[1000]}).length,1,'4th loss alerts again (repeat on)');
 const once={...CFG,thresholds:[1000],streakRepeat:false},st2={sent:{}};
 out=core.evaluate([m],ms('2026-10-12T20:00:00Z'),st2,once);assert.equal(out.length,1);for(const k of out[0].keys)st2.sent[k]='x';
 assert.equal(core.evaluate([m4],ms('2026-10-13T20:00:00Z'),st2,once).length,0,'once per run when repeat off');
 const broken=core.buildUS(usData(days),usJournal([...trades,manual('m3','2026-10-13',0,{name:'Z'})]));
 assert.equal(core.lossStreak(broken.closed).count,0);
});

test('active hours and daily summary timing (US Eastern, weekdays, once per day)',()=>{
 assert.equal(core.isActive(ms('2026-10-12T13:30:00Z')),true);   // Mon 09:30 ET
 assert.equal(core.isActive(ms('2026-10-13T00:30:00Z')),false);  // Mon 20:30 ET
 assert.equal(core.isActive(ms('2026-10-11T15:00:00Z')),false);  // Sunday
 assert.equal(core.isActive(ms('2026-10-11T15:00:00Z'),{hlAlwaysActive:true,hasHL:true}),true);
 assert.equal(core.summaryDue(ms('2026-10-12T20:10:00Z'),{sent:{}},CFG),null);            // 16:10 ET
 assert.equal(core.summaryDue(ms('2026-10-12T20:16:00Z'),{sent:{}},CFG),'summary:2026-10-12');
 assert.equal(core.summaryDue(ms('2026-10-12T20:16:00Z'),{sent:{'summary:2026-10-12':'x'}},CFG),null);
 assert.equal(core.summaryDue(ms('2026-10-10T20:16:00Z'),{sent:{}},CFG),null);            // Saturday
 assert.equal(core.summaryDue(ms('2026-10-12T20:16:00Z'),{sent:{}},{...CFG,dailySummary:false}),null);
 // winter time (EST, UTC-5): 16:15 ET = 21:15 UTC
 assert.equal(core.summaryDue(ms('2026-12-14T21:10:00Z'),{sent:{}},CFG),null);
 assert.equal(core.summaryDue(ms('2026-12-14T21:15:00Z'),{sent:{}},CFG),'summary:2026-12-14');
 const m=core.buildUS(usData([{date:'2026-10-13',as_of:1,total:'-120',rows:[]}]),usJournal());
 const text=core.summaryMessage([m],ms('2026-10-12T20:16:00Z'),CFG);
 assert.equal(text,'📊 일일 요약 · 미국 10/12 장 마감 후\n미국주식 오늘 -$120.00 (하루 24%) · 이번 주 -$120.00 (주 12%) · 이번 달 -$120.00 (월 6%)');
});

test('state pruning keeps recent keys only',()=>{
 const now=ms('2026-10-12T00:00:00Z');
 const s=core.pruneState({sent:{a:'2026-10-11T00:00:00.000Z',b:'2026-08-01T00:00:00.000Z',c:'bad'},journal:{US:{revision:3}}},now);
 assert.deepEqual(Object.keys(s.sent),['a']);assert.equal(s.journal.US.revision,3);
});
