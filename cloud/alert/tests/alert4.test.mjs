// alert4(trade-alert 2.2.0) 서비스 통합 테스트 — RISK_START_DATE(한도 기준일). 네트워크 없음.
import test from 'node:test';
import {fromHtml} from '../src/format.mjs'; // 2.5.1: 텔레그램 HTML(제목 <b>) → plain으로 비교
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Alerter,readConfig,VERSION} from '../src/alert.mjs';
import {kstWall,etWall} from '../src/calendar.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),ADDR='0x'+'c'.repeat(40);
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',...x});
const NOW0=kstWall('2026-10-20',10); // 화 10:00 KST = UTC 10/20 01:00 · 미국 10/19 21:00 ET → US 거래일 10/20

function world(){
 const w={now:NOW0,hlEq:'2000',fills:[],funding:[],ledger:[],usCash:'765.44',usSec:'1234.56',usAsOf:NOW0-60000,orders:[],pushes:[],tg:[],dbEvents:[],dbFlows:[],dbState:[],
  day:{kw_days:[],acct:[{market:'hl',day:'2026-10-19',value:'2000',source:'close',captured_at:Date.parse('2026-10-20T00:05:00Z')},{market:'us',day:'2026-10-20',value:'2000',source:'close',etDate:'2026-10-19',captured_at:etWall('2026-10-19',16,15)}],hl:{address:ADDR,fills:[],funding:[]}},dayMode:'ok',dayCalls:0};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,
   kw:{latest:{date:'2026-10-20',as_of:w.usAsOf,summary:{currency:'USD',reportedSecuritiesValue:w.usSec,cash:{apiId:'ust21160',currency:'USD',usd:w.usCash,krwIncluded:false}},positions:[]},orders:w.orders},
   acct_us:[],hl_address:ADDR,journal:{US:{revision:1,unchanged:body.p_us_revision===1,defaultRisk:1,account:4000},HL:{revision:1,unchanged:body.p_hl_revision===1,defaultRisk:2,account:3000}},
   risk:{state:w.dbState,events:w.dbEvents,flows:w.dbFlows}});
  if(url.endsWith('/rpc/risk_day_data')){w.dayCalls++;if(w.dayMode==='missing')return J({code:'PGRST202',message:'Could not find the function public.risk_day_data(p_token) in the schema cache'},404);
   if(w.dayMode==='down')return J({message:'x'},503);return J({ok:true,version:3,...w.day});}
  if(url.endsWith('/rpc/risk_push')){const p=body.p_payload;w.pushes.push(p);for(const e of p.events||[])w.dbEvents.push({market:e.market,ref:e.ref,kind:e.kind});return J({ok:true});}
  if(url.includes('api.telegram.org')){w.tg.push(fromHtml(body.text));return J({ok:true,result:{}});}
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
const mk=async(w,x={})=>{const dir=await mkdtemp(path.join(tmpdir(),'ta3-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await a.init();return a;};

test('check(): RISK_START_DATE=2026-10-20 → HL 기준 자산 = HL 마감 10/19 UTC(acct), 이전 서버 중단 해제·clear 기록, 상태에 기준일',async()=>{
 const w=world();const t0=kstWall('2026-10-19',22);w.now=t0;w.hlEq='2000';
 const a=await mk(w,{ALERT_MARKETS:'HL'});
 await a.check();w.now=kstWall('2026-10-20',0,10);w.hlEq='1990';await a.check();
 w.now=kstWall('2026-10-20',8);w.hlEq='1880';let r=await a.check();                 // 주 −6% 장중(2000 → 1880) → 중단
 assert.ok(r.statuses[0].stops.some(s=>s.rule==='week-intraday'),'2.1.0 동작(기준일 없음)');
 // .env에 RISK_START_DATE 추가 후 재시작(같은 상태 디렉터리)
 const b=new Alerter(env(a.cfg.stateDir,{ALERT_MARKETS:'HL',RISK_START_DATE:'2026-10-20'}),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await b.init();
 w.day.acct.push({market:'hl',day:'2026-10-19',value:'1900',source:'close',captured_at:kstWall('2026-10-20',9,5)});w.day.acct=w.day.acct.filter(x=>!(x.market==='hl'&&x.value==='2000'));
 w.now=kstWall('2026-10-20',12);w.hlEq='1850';r=await b.check();const s=r.statuses[0];
 assert.equal(s.stopped,false,'기준일 이전 손실로 걸린 주 중단 해제');assert.equal(s.riskStart.base.equity,1900);assert.equal(s.riskStart.base.source,'HL 마감 10/19 UTC');
 assert.equal(s.periods.week.startEquity,1900);assert.equal(s.periods.week.pct,-2.6316);
 const p=w.pushes.at(-1);assert.ok(p.events.some(e=>e.kind==='clear'&&e.rule==='risk-start'&&e.detail.stopId==='HL:week-intraday:2026-10-20'));
 assert.equal(p.states[0].status.riskStart.date,'2026-10-20');assert.equal(p.states[0].status.riskStart.atText,'10/20(화) 09:00 KST');
 assert.ok(w.tg.some(x=>/^🔄 하이퍼리퀴드 · 손실 한도 10\/20부터 새로 셈\n\n한도 적용: 10\/20\(화\) 09:00 KST부터/.test(x)&&/중단 해제: 주간 −6% 장중 도달/.test(x)));
 assert.equal(r.statuses.find(s=>s.market==='HL').riskStart.base.equity,1900);assert.match(r.statuses.find(s=>s.market==='HL').riskStart.base.source,/HL 마감 10\/19 UTC/);
 assert.doesNotMatch(b.summaryText(r.statuses,w.now),/한도 (기준일|적용)/,'기준일 지난 뒤 장마감 요약엔 기준일 줄 없음(2.5.1)');
});

test('check(): US RISK_START_DATE → 기준 자산 = 키움 마감 잔액(직전 거래일 etDate), 하루 실현 키 10/20부터',async()=>{
 const w=world();w.day.kw_days=[{date:'2026-10-20',as_of:NOW0-5000,total:'-20',count:1}];
 const a=await mk(w,{ALERT_MARKETS:'US',RISK_START_DATE:'2026-10-20'});const r=await a.check();const s=r.statuses[0];
 assert.equal(s.riskStart.day,'2026-10-20');assert.equal(s.riskStart.at,etWall('2026-10-19',16));
 assert.equal(s.riskStart.base.equity,2000);assert.equal(s.riskStart.base.source,'키움 마감 잔액 2026-10-19');
 assert.equal(s.periods.day.pnl,-20);assert.equal(s.periods.day.missing,null);
});
