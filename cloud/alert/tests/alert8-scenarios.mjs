// alert8(trade-alert 2.5.1) — 메시지 종류별 시나리오(실제 판정 엔진 risk.step으로 만든 메시지·상태). alert8.test.mjs와 samples-2.5.1.txt 생성에 같이 씀.
import {usCalendar,hlCalendar,etWall,kstWall} from '../src/calendar.mjs';
import * as risk from '../src/risk.mjs';
import * as day from '../src/day.mjs';
import {Alerter,riskStartFor,statusMeta} from '../src/alert.mjs';

export const US=usCalendar(),HL=hlCalendar(),UTC=day.utcCalendar();
export const H=(d,h,m=0)=>kstWall(d,h,m);
export const CFG={limits:{day:3,week:6,month:10},warn:[50,80],streakLossPct:0.5,streakDays:3,streakStopDays:1,restartFactor:0.5,checkSec:60,defaultRisk:1,anchorMaxGapMs:20*60000,dayMode:'realized'};
export function PR(market,now,rows,basis,acct=[]){
 const cal=market==='HL'?UTC:US,key=market==='HL'?day.utcDate(now):US.dayOf(now),from=day.periodFrom(cal,key);
 const B={value:basis,mode:'basis',key:null,source:'x'};const dn=day.dayDenomFor(acct,market,B);
 const days=[];for(let k=cal.isTradingDay(from)?from:cal.next(from);k<=key;k=cal.next(k)){const p=rows[k]??0;days.push({key:k,pnl:p,trades:p?1:0,denom:dn(k)});}
 return {key,cal,rows:Object.entries(rows).map(([label,pnl])=>({label,pnl})),days,basis:B,denomAt:dn};
}
export const DR=(market,now,pnl,base,parts=null)=>{const k=market==='HL'?day.utcDate(now):US.dayOf(now);return {key:k,pnl,until:market==='HL'?day.utcStart(k)+86400000:US.dayEnd(k),denom:{value:base,mode:'close',key:'x',expected:true,closeAt:now-3600000},parts:parts||(market==='HL'?{trades:pnl,funding:0}:null)};};
export function runner(cal,cfg=CFG){let state=null;const refs=new Set();const all={messages:[],events:[]};
 return {all,get state(){return state;},set state(v){state=v;},
  step(now,equity,{pr=null,dr=null,fills=[],source='test',c=cfg}={}){const r=risk.step(state,{now,cal,cfg:c,equity:{value:equity,t:now,source},flows:[],fills,eventRefs:refs,dayMode:'realized',dayRealized:dr,periodMode:pr?'realized':undefined,periodRealized:pr});
   state=r.state;for(const e of r.events)refs.add(e.ref);all.messages.push(...r.messages);all.events.push(...r.events);Object.assign(r.status,statusMeta(r.status));return r;}};}
export function alerter(){return new Alerter({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:'sb_publishable_'+'k'.repeat(24),KW_COLLECTOR_TOKEN:'kwc_'+'A'.repeat(43),TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32),TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:'/tmp/ta8-none'},{fetcher:async()=>{throw Error('no network');},log:()=>{}});}
export const cfgRS=(date,market)=>({...CFG,riskStart:riskStartFor(date,market,market==='HL'?HL:US)});

/** 지금 상황(10/23 금, 기준일 10/26 전): 🔄 두 시장 + 상태 */
export function beforeStart(){
 const tU=etWall('2026-10-23',15,30),tH=H('2026-10-23',14,30);
 const u=runner(US,cfgRS('2026-10-26','US')),h=runner(HL,cfgRS('2026-10-26','HL'));
 // 기준일 전에 걸려 있던 중단(10/20 기준) → 10/26 기준으로 바뀌며 해제
 const hOld=runner(HL,cfgRS('2026-10-20','HL'));hOld.step(H('2026-10-23',10),60000,{pr:PR('HL',H('2026-10-23',10),{'2026-10-20':-6500},65000),dr:DR('HL',H('2026-10-23',10),-100,65000)});
 h.state=hOld.state;
 const ru=u.step(tU,14607.88,{pr:PR('US',tU,{'2026-10-23':-120},14607.88),dr:DR('US',tU,-120,14700),source:'키움 스냅샷'});
 const rh=h.step(tH,60275.07,{pr:PR('HL',tH,{'2026-10-23':-300},60275.07),dr:DR('HL',tH,-300,60500,{trades:-280,funding:-20}),source:'HL BALANCE · 통합 USDC 거래잔고'});
 return {u:ru,h:rh,tSummary:etWall('2026-10-23',16,15)};
}
/** 기준일 지난 뒤(10/27 화): 손실 진행 중인 장마감 요약용 상태 */
export function afterStart(){
 const tU=etWall('2026-10-27',15,50),tH=H('2026-10-28',5,50);
 const u=runner(US,cfgRS('2026-10-26','US')),h=runner(HL,cfgRS('2026-10-26','HL'));
 const acctH=[{market:'hl',day:'2026-10-25',value:'60000',source:'close'}],acctU=[{market:'us',day:'2026-10-26',value:'15000',source:'close',etDate:'2026-10-23'}];
 u.step(etWall('2026-10-27',10),14800,{pr:PR('US',etWall('2026-10-27',10),{'2026-10-26':-150,'2026-10-27':-100},15000,acctU),dr:DR('US',etWall('2026-10-27',10),-100,14850),source:'키움 스냅샷'});
 const ru=u.step(tU,14600,{pr:PR('US',tU,{'2026-10-26':-150,'2026-10-27':-178.2},15000,acctU),dr:DR('US',tU,-178.2,14850),source:'키움 스냅샷'});
 h.step(H('2026-10-27',10),59500,{pr:PR('HL',H('2026-10-27',10),{'2026-10-26':-400,'2026-10-27':-200},60000,acctH),dr:DR('HL',H('2026-10-27',10),-200,59600,{trades:-190,funding:-10}),source:'HL BALANCE · 통합 USDC 거래잔고'});
 const rh=h.step(tH,58100,{pr:PR('HL',tH,{'2026-10-26':-400,'2026-10-27':-1850},60000,acctH),dr:DR('HL',tH,-1850,59600,{trades:-1820,funding:-30}),source:'HL BALANCE · 통합 USDC 거래잔고'});
 return {u:ru,h:rh,tSummary:etWall('2026-10-27',16,15),all:{u:u.all,h:h.all}};
}
/** 경고 50/80%, 하루 중단, 위반 묶음, 해제(재시작) — HL 하루 실현 */
export function hlDayFlow(){
 const R=runner(HL),base=2000,t0=H('2026-10-20',9,30);const out={};
 R.step(t0,2000,{dr:DR('HL',t0,-10,base)});
 out.warn50=R.step(t0+60000,1965,{dr:DR('HL',t0+60000,-31,base,{trades:-28,funding:-3})}).messages;
 out.warn80=R.step(t0+120000,1950,{dr:DR('HL',t0+120000,-49,base,{trades:-45,funding:-4})}).messages;
 out.stop=R.step(t0+180000,1920,{dr:DR('HL',t0+180000,-60,base,{trades:-55,funding:-5})}).messages;
 const ft=H('2026-10-20',13,23);
 const fills=[156,156,198].map((q,i)=>({key:'hl:'+(900+i),tid:900+i,t:ft+i*400,symbol:'AERO',entry:true,side:'buy',qty:q,price:0.79269,desc:`Open Long ${q} @ 0.79269`}));
 fills.push({key:'hl:950',tid:950,t:ft+5000,symbol:'xyz:<TEST>&Co',entry:true,side:'sell',qty:3,price:12.5,desc:'Open Short 3 @ 12.5'});
 const rv=R.step(ft+60000,1920,{fills,dr:DR('HL',ft+60000,-60,base)});out.viol=rv.messages;out.violEvents=rv.events.filter(e=>e.kind==='violation');
 const tn=H('2026-10-21',9,30);out.restart=R.step(tn,1920,{fills,dr:DR('HL',tn,0,1920)}).messages;
 return out;
}
/** US 주간 실현: 50% 경고 → 장중 중단 · 연속 손실(HL) */
export function periodFlow(){
 const out={};const R=runner(US),t=etWall('2026-10-28',11);
 R.step(t-3600000,16000,{pr:PR('US',t-3600000,{'2026-10-26':-200},16000),dr:DR('US',t-3600000,0,16000)});
 out.warnWeek=R.step(t,16000,{pr:PR('US',t,{'2026-10-26':-200,'2026-10-28':-300},16000),dr:DR('US',t,-300,16000)}).messages;
 out.stopWeek=R.step(t+60000,16000,{pr:PR('US',t+60000,{'2026-10-26':-200,'2026-10-28':-800},16000),dr:DR('US',t+60000,-80,16000)}).messages;
 const S=runner(HL);const P=(now,rows)=>PR('HL',now,rows,10000);
 S.step(H('2026-11-03',10),10000,{pr:P(H('2026-11-03',10),{})});
 const rows={'2026-11-03':-60,'2026-11-04':-80,'2026-11-05':-55};let k='2026-11-03';
 for(const d of ['2026-11-04','2026-11-05','2026-11-06']){const now=H(d,10);S.step(now,10000,{pr:P(now,Object.fromEntries(Object.entries(rows).filter(([x])=>x<d)))});}
 out.streak=S.all.messages.filter(m=>m.text.startsWith('⛔'));
 return out;
}
