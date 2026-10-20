// alert5(trade-alert 2.3.0 → alert6 2.4.0에서 버전·v1.6 분모 기대값 갱신) 서비스 통합 테스트 — 주·월·연속 손실 실현 기준(risk_day_data v5 = alert5.sql). 네트워크 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Alerter,VERSION,RULES,statusMeta} from '../src/alert.mjs';
import {kstWall,etWall} from '../src/calendar.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),ADDR='0x'+'c'.repeat(40);
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',...x});

function world(){
 const w={now:kstWall('2026-10-20',12,30),hlEq:'2000',fills:[],funding:[],ledger:[],usCash:'16236.08',usSec:'0',usAsOf:kstWall('2026-10-20',12,29),orders:[],pushes:[],tg:[],dbEvents:[],dbFlows:[],dbState:[],
  dayVersion:3,day:{kw_days:[],acct:[{market:'us',day:'2026-10-20',value:'63592.79',source:'close',etDate:'2026-10-19',captured_at:etWall('2026-10-19',16,10)}],hl:{address:ADDR,fills:[],funding:[],days:[]}},dayMode:'ok',dayCalls:0,pushFail:false};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,
   kw:{latest:{date:'2026-10-20',as_of:w.usAsOf,summary:{currency:'USD',reportedSecuritiesValue:w.usSec,cash:{apiId:'ust21160',currency:'USD',usd:w.usCash,krwIncluded:false}},positions:[]},orders:w.orders},
   acct_us:w.acctUs||[],hl_address:ADDR,journal:{US:{revision:1,unchanged:body.p_us_revision===1,defaultRisk:1,account:60000},HL:{revision:1,unchanged:body.p_hl_revision===1,defaultRisk:2,account:3000}},
   risk:{state:w.dbState,events:w.dbEvents,flows:w.dbFlows}});
  if(url.endsWith('/rpc/risk_day_data')){w.dayCalls++;if(w.dayMode==='down')return J({message:'x'},503);return J({ok:true,version:w.dayVersion,...w.day});}
  if(url.endsWith('/rpc/risk_push')){if(w.pushFail)return J({message:'x'},503);const p=body.p_payload;w.pushes.push(p);for(const e of p.events||[])w.dbEvents.push({market:e.market,ref:e.ref,kind:e.kind});for(const f of p.flows||[])w.dbFlows.push(f);return J({ok:true});}
  if(url.includes('api.telegram.org')){w.tg.push(body.text);return J({ok:true,result:{}});}
  if(url==='https://api.hyperliquid.xyz/info'){
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[{token:0,coin:'USDC',total:'0',hold:'0'}]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:w.hlEq},time:Date.now()});case 'perpDexs':return J([null]);
    case 'userFillsByTime':return J(w.fills.filter(f=>f.time>=body.startTime));case 'userFunding':return J(w.funding.filter(f=>f.time>=body.startTime));
    case 'userNonFundingLedgerUpdates':return J(w.ledger);case 'portfolio':return J([]);}
  }
  return J({message:'not found'},404);};
 return w;
}
const F=(tid,time,closedPnl,fee,o={})=>({coin:'BTC',dir:'Close Long',side:'A',sz:'0.01',px:'60000',startPosition:'0.01',feeToken:'USDC',tid,time,closedPnl:String(closedPnl),fee:String(fee),hash:'0x'+tid,...o});
const mk=async(w,x={},logs=[])=>{const dir=await mkdtemp(path.join(tmpdir(),'ta5-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();return a;};

test('버전 2.4.0 · 판정 v1.6 · status에 version·rules·basis(앱 v30 표시용)',()=>{
 assert.equal(VERSION,'2.4.0');assert.equal(RULES,'손실한도 판정 v1.6');
 const m=statusMeta({dayBasis:'realized',periodBasis:'realized'});assert.equal(m.version,'2.4.0');assert.equal(m.rules,'손실한도 판정 v1.6');assert.equal(m.basis.period,'realized');assert.match(m.basis.label,/^손익 = 실현손익/);
 assert.match(statusMeta({dayBasis:'realized',periodBasis:'equity'}).basis.label,/alert5\.sql 미설치/);assert.match(statusMeta({dayBasis:'equity',periodBasis:'equity'}).basis.label,/^손익 = 계좌 순자산 변화/);
});

test('실데이터 재현(US 출금): alert5.sql 없으면 v1.4 폴백(주·월 −74.47% 중단 + 로그 안내) → alert5.sql 실행 후 첫 판정에서 해제·clear·🔄 1회, 실현 +$392.23 기준',async()=>{
 const w=world(),logs=[];const a=await mk(w,{ALERT_MARKETS:'US',RISK_START_DATE:'2026-10-20'},logs);
 w.day.kw_days=[{date:'2026-10-20',as_of:w.now-60000,total:'392.23',count:3}];
 let r=await a.check();let s=r.statuses[0];
 assert.equal(s.periodBasis,'equity');assert.deepEqual(s.stops.map(x=>x.rule).sort(),['month-intraday','week-intraday'],'v1.4 동작: 출금이 손실로 잡힘');
 assert.equal(s.periods.week.pct,-74.4687);assert.equal(s.version,'2.4.0');assert.match(s.basis.label,/alert5\.sql 미설치/);
 assert.ok(logs.some(l=>/^WARN alert5\.sql이 아직 없습니다 → 주·월 한도·연속 손실일은 v1\.4/.test(l)),logs.join('\n'));
 assert.equal(logs.filter(l=>/alert5\.sql이 아직/.test(l)).length,1);
 // 사용자가 Supabase에서 alert5.sql 실행 → 같은 서비스의 다음 확인
 w.dayVersion=5;w.now+=60000;const tg0=w.tg.length;
 r=await a.check();s=r.statuses[0];
 assert.equal(s.periodBasis,'realized');assert.equal(s.stopped,false);assert.equal(s.stops.length,0);assert.equal(s.halfRisk.active,false);
 assert.equal(s.periods.week.pnl,392.23);assert.equal(s.periods.week.pct,0.6168,'v1.6: ÷ 기준일(10/20) 직전 마감 10/19 $63,592.79');assert.equal(s.periods.week.startSource,'10/19 마감 $63,592.79');assert.equal(s.periodDenom,'start-close');assert.equal(s.periods.weekEquity.pct,-74.4687);
 assert.equal(s.basis.period,'realized');assert.equal(s.rules,'손실한도 판정 v1.6');assert.match(s.basis.label,/주·월 ÷ 기간 시작 직전 마감/);
 const p=w.pushes.at(-1);assert.equal(p.events.filter(e=>e.kind==='clear'&&e.rule==='basis-realized').length,2);assert.equal(p.states[0].status.version,'2.4.0');assert.equal(p.states[0].status.basis.period,'realized');
 const sent=w.tg.slice(tg0);assert.equal(sent.filter(x=>x.startsWith('🔄')).length,1);assert.match(sent.find(x=>x.startsWith('🔄')),/새 기준으로 성립하지 않는 중단 해제: 주간 −6% 장중 도달 \(~ 10\/21\(수\) 05:00 KST/);
 assert.ok(logs.some(l=>/^INFO alert5\.sql 확인 → 주·월 한도·연속 손실일을 실현손익 기준/.test(l)));
 const d=a.describe(r.statuses);assert.match(d,/이번 주\(실현\) \+0\.62% \(\+\$392\.23\) · 기준 10\/19 마감 \$63,592\.79 · 기준일부터 · 한도 −6% = −\$3,815\.57\n   참고: 미실현 포함 자산 변화 −74\.47% \(−\$47,356\.71\)/);
 assert.match(d,/기준: 손익 = 실현손익/);
 assert.match(a.summaryText(r.statuses,w.now),/주 실현 \+0\.62%\/−6% · 달 실현 \+0\.62%\/−10%/);
 w.now+=60000;r=await a.check();assert.equal(w.tg.slice(tg0).filter(x=>x.startsWith('🔄')).length,1,'🔄 반복 없음');
 // 재시작해도(같은 상태) 다시 해제·안내하지 않음
 const b=new Alerter(env(a.cfg.stateDir,{ALERT_MARKETS:'US',RISK_START_DATE:'2026-10-20'}),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await b.init();w.now+=60000;r=await b.check();
 assert.equal(r.statuses[0].stopped,false);assert.equal(w.tg.slice(tg0).filter(x=>x.startsWith('🔄')).length,1);
});

test('실현 손실이면 v1.5에서도 중단: US 주 실현 −$1,000 ÷ $16,236.08 = −6.16% → 주간 실현 장중 중단 ~ 10/21 05:00 KST',async()=>{
 const w=world();w.dayVersion=5;w.day.kw_days=[{date:'2026-10-19',as_of:1,total:'-600',count:2},{date:'2026-10-20',as_of:2,total:'-400',count:1}];
 const a=await mk(w,{ALERT_MARKETS:'US'});const r=await a.check();const s=r.statuses[0];
 assert.equal(s.periods.week.pnl,-1000);assert.equal(s.periods.week.pct,-6.1591);assert.equal(s.stopped,true);
 assert.deepEqual(s.stops.map(x=>[x.id,x.label,x.until]),[['US:weekr-intraday:2026-10-20','주간 실현 −6% 장중 도달',etWall('2026-10-20',16)]]);
 assert.ok(w.tg.some(x=>/^⛔ 미국주식 주간 실현손익 −6\.16% \(−\$1,000\.00\) · 주간 한도 −6% \(−\$974\.16\) 장중 도달/.test(x)));
 assert.equal(s.periods.day.pnl,-400,'하루 실현(v1.3) 그대로');
});

test('DAY_LIMIT_BASIS=equity → risk_day_data 안 부르고 주·월도 v1.4(자산 변화) · alert5.sql이 있어도',async()=>{
 const w=world();w.dayVersion=5;w.acctUs=[{day:'2026-10-20',value:'63592.79',source:'close',etDate:'2026-10-19',captured_at:etWall('2026-10-19',16,10)}];
 const a=await mk(w,{ALERT_MARKETS:'US',DAY_LIMIT_BASIS:'equity'});const r=await a.check();const s=r.statuses[0];
 assert.equal(w.dayCalls,0);assert.equal(s.periodBasis,'equity');assert.equal(s.dayBasis,'equity');assert.equal(s.basis.period,'equity');assert.match(s.basis.label,/^손익 = 계좌 순자산 변화/);
 assert.ok(s.stops.some(x=>x.rule==='week-intraday'),'자산 변화 기준(출금 미탐지 시 기존 한계 그대로)');
});

test('alert5.sql 확인 뒤 risk_day_data 일시 장애(10분 넘음) → 주·월 판정 건너뜀(자산 변화로 되돌아가지 않음)',async()=>{
 const w=world();w.dayVersion=5;w.usCash='63592.79';const a=await mk(w,{ALERT_MARKETS:'US'});let r=await a.check();assert.equal(r.statuses[0].periodBasis,'realized');
 w.dayMode='down';w.now+=11*60000;w.usAsOf=w.now-30000;w.usCash='16236.08';r=await a.check();const s=r.statuses[0];
 assert.equal(s.periodBasis,'realized');assert.equal(s.periods.week.missing,'data');assert.equal(s.stopped,false);
});

test('US 입출금 추정은 감지한 회차에 보관 → 저장 실패해도 다음 회차에 저장(2.2.0은 그 회차가 중간에 실패하면 잃을 수 있었음)',async()=>{
 const w=world();w.dayVersion=5;w.usCash='63592.79';const a=await mk(w,{ALERT_MARKETS:'US'});await a.check();
 w.now+=60000;w.usAsOf=w.now-1000;w.usCash='16236.08';w.pushFail=true;await a.check();
 assert.ok(a.state.pending.flows.some(f=>f.source==='us-implied'&&f.amount===-47356.71&&f.market==='us'),'보관');
 w.pushFail=false;w.now+=60000;const r=await a.check();
 assert.ok(w.dbFlows.some(f=>f.source==='us-implied'&&f.amount===-47356.71),'다음 회차 저장');assert.equal(a.state.pending.flows.length,0);
 assert.equal(r.statuses[0].periods.weekEquity.flows,-47356.71,'참고(자산 변화)도 출금 제외');
});

test('HL: 이번 달 실현 = API 체결(어제 이전 포함) + 펀딩 + Supabase 날짜별 합계(건수 많은 쪽), ÷ BALANCE',async()=>{
 const w=world();w.dayVersion=5;w.now=kstWall('2026-10-20',12);w.hlEq='10000';
 const T=d=>Date.parse(d+'T05:00:00Z');
 w.fills.push(F(1,T('2026-10-05'),-100,1),F(2,T('2026-10-19'),-50,1),F(3,T('2026-10-20'),-20,0.5),F(4,T('2026-09-30'),-999,1));
 w.funding.push({time:T('2026-10-19'),hash:'0xf',delta:{type:'funding',coin:'BTC',usdc:'-4',szi:'0.01'}});
 w.day.hl.days=[{day:'2026-10-12',fills:2,trades:-200,fees:2,funding:0,funding_count:0}]; // API에 없는 날(Supabase 수집분만)
 const a=await mk(w,{ALERT_MARKETS:'HL'});const r=await a.check();const s=r.statuses[0];
 assert.equal(s.periods.month.pnl,-376.5,'10/5 −101 + 10/12 −200 + 10/19 −51−4 + 10/20 −20.5 (9/30 제외)');
 assert.equal(s.periods.week.pnl,-75.5,'주(10/19 월 UTC~) = 10/19 −55 + 10/20 −20.5');
 assert.equal(s.periods.month.startSource,'현재 기준액 10,000.00 USDC');assert.equal(s.periods.month.pct,-3.765);
 assert.equal(s.config.boundary,'하루·주·월·연속 손실 UTC 00:00(KST 09:00, 주 = 월요일 09:00 KST 시작)');
});
