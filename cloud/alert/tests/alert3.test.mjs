// alert3(trade-alert 2.1.0) 서비스 통합 테스트 — risk_day_data(alert3.sql)·HL userFunding 가짜 응답, 네트워크 없음.
import test from 'node:test';
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
const mk=async(w,x={})=>{const dir=await mkdtemp(path.join(tmpdir(),'ta3-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:()=>{},sleep:async()=>{}});await a.init();return a;};

test('버전 2.4.0 · DAY_LIMIT_BASIS 기본 realized, equity 허용, 그 밖은 오류',()=>{
 assert.equal(VERSION,'2.4.0');assert.equal(readConfig(env('/tmp')).dayBasis,'realized');assert.equal(readConfig(env('/tmp',{DAY_LIMIT_BASIS:'equity'})).dayBasis,'equity');
 assert.throws(()=>readConfig(env('/tmp',{DAY_LIMIT_BASIS:'x'})),/CONFIG_INCOMPLETE/);
});

test('check(): HL 실현(API 체결 + Supabase 수집 체결·펀딩, 중복 제외) ÷ 전일 마감 → −3% 중단 ~ KST 09:00, 상태에 기준·참고 저장',async()=>{
 const w=world();const a=await mk(w);
 const t=Date.parse('2026-10-20T00:30:00Z');
 w.fills.push(F(1,t,-40,1));                                                // API에만
 w.day.hl.fills.push({tid:1,time:t,coin:'BTC',dir:'Close Long',closedPnl:'-40',fee:'1',feeToken:'USDC'}); // 같은 체결(중복)
 w.day.hl.fills.push({tid:2,time:t+1000,coin:'ETH',dir:'Close Short',closedPnl:'-15',fee:'0.5',feeToken:'USDC'}); // Supabase에만
 w.day.hl.fills.push({tid:3,time:Date.parse('2026-10-19T23:00:00Z'),coin:'ETH',dir:'Close Short',closedPnl:'-500',fee:'1',feeToken:'USDC'}); // 어제 UTC
 w.funding.push({time:Date.parse('2026-10-20T00:00:00Z'),hash:'0xf',delta:{type:'funding',coin:'BTC',usdc:'-2',szi:'0.01'}});
 w.day.hl.funding.push({time:Date.parse('2026-10-20T00:00:00Z'),coin:'BTC',usdc:'-2'});
 let r=await a.check();
 const hl=r.statuses.find(s=>s.market==='HL');const d=hl.periods.day;
 assert.equal(d.basis,'realized');assert.equal(d.pnl,-58.5,'(−41) + (−15.5) + 펀딩 −2');assert.equal(d.startEquity,2000);assert.equal(d.startSource,'전일 마감 2,000.00 USDC');assert.equal(d.budget,60);
 assert.equal(hl.stopped,false);assert.ok(w.tg.some(x=>/⚠️ 하이퍼리퀴드 하루 실현손익 −2\.92%/.test(x)),w.tg.join('\n'));
 assert.equal(hl.config.boundary,'하루 한도 UTC 00:00(KST 09:00) · 주·월·연속 손실 한국시간 24:00');assert.equal(hl.dayBasis,'realized');
 // 펀딩 −2 추가 → −60.5 → 중단
 w.now+=60000;w.funding.push({time:Date.parse('2026-10-20T01:00:00Z'),hash:'0xg',delta:{type:'funding',coin:'BTC',usdc:'-2',szi:'0.01'}});
 r=await a.check();const hl2=r.statuses.find(s=>s.market==='HL');
 assert.equal(hl2.stopped,true);assert.equal(hl2.stops[0].until,kstWall('2026-10-21',9));
 const p=w.pushes.at(-1);assert.ok(p.events.some(e=>e.ref==='HL:dayr:2026-10-20'&&e.kind==='stop'));
 const st=p.states.find(s=>s.market==='hl').status;assert.equal(st.periods.day.basis,'realized');assert.ok(st.periods.dayEquity,'자산 변화(참고) 함께 저장');
 assert.ok(w.tg.some(x=>/^⛔ 하이퍼리퀴드 오늘 실현손익 −3\.02% \(−60\.50 USDC\)/.test(x)&&/기준: 전일 마감 2,000\.00 USDC · 체결 −56\.50 USDC \+ 펀딩 −4\.00 USDC/.test(x)&&/참고: 미실현 포함/.test(x)));
 assert.match(a.describe(r.statuses),/오늘\(실현\) −3\.02% .*기준 전일 마감 2,000\.00 USDC · 한도 −3% = −60\.00 USDC/);
});

test('check(): US 키움 일별 실현손익 ÷ 전일 마감 → 중단, 마감 없으면 현재 기준액(키움 총액) 표기',async()=>{
 const w=world();w.day.kw_days=[{date:'2026-10-20',as_of:NOW0-5000,total:'-45.00',count:1}];const a=await mk(w,{ALERT_MARKETS:'US'});
 let r=await a.check();let us=r.statuses[0];
 assert.equal(us.periods.day.pnl,-45);assert.equal(us.periods.day.startSource,'전일 마감 $2,000.00');assert.equal(us.stopped,false);assert.ok(w.tg.some(x=>/🔔 미국주식 하루 실현손익 −2\.25%/.test(x))||w.tg.some(x=>/⚠️ 미국주식 하루 실현손익 −2\.25%/.test(x)));
 w.now+=60000;w.day.kw_days=[{date:'2026-10-20',as_of:w.now-1000,total:'-61',count:2}];r=await a.check();us=r.statuses[0];
 assert.equal(us.stopped,true);assert.equal(us.stops[0].until,etWall('2026-10-20',16));assert.ok(w.pushes.at(-1).events.some(e=>e.ref==='US:dayr:2026-10-20'));
 // 다른 서버: 마감 기록 없음 → 키움 총액 2000(1234.56 + 765.44)
 const w2=world();w2.day.acct=[];w2.day.kw_days=[{date:'2026-10-20',as_of:NOW0,total:'-10',count:1}];const b=await mk(w2,{ALERT_MARKETS:'US'});
 r=await b.check();assert.equal(r.statuses[0].periods.day.startSource,'현재 기준액 $2,000.00');assert.equal(r.statuses[0].periods.day.denomMode,'basis');
});

test('alert3.sql 미설치 → v1.2 하루 판정(자산 변화)로 동작, 일시 장애 → 10분 안 직전 값 사용 후 하루 판정 건너뜀',async()=>{
 const w=world();w.dayMode='missing';const a=await mk(w);
 let r=await a.check();assert.equal(r.statuses.find(s=>s.market==='HL').dayBasis,'equity');
 w.now+=60000;w.hlEq='1930';r=await a.check();const hl=r.statuses.find(s=>s.market==='HL');assert.equal(hl.stopped,true);assert.equal(hl.stops[0].id,'HL:day:2026-10-20','v1.2 KST 하루 판정');
 // 설치 후 정상 → 일시 장애
 const w2=world();const b=await mk(w2,{ALERT_MARKETS:'US'});w2.day.kw_days=[{date:'2026-10-20',as_of:NOW0,total:'-10',count:1}];
 await b.check();w2.dayMode='down';w2.now+=5*60000;r=await b.check();assert.equal(r.statuses[0].periods.day.pnl,-10,'직전 값');
 w2.now+=10*60000;r=await b.check();assert.equal(r.statuses[0].periods.day.pct,null);assert.match(r.statuses[0].note,/실현손익 데이터를 읽지 못해/);
});

test('DAY_LIMIT_BASIS=equity → risk_day_data 호출 없이 v1.2 하루 판정',async()=>{
 const w=world();const a=await mk(w,{DAY_LIMIT_BASIS:'equity'});const r=await a.check();
 assert.equal(w.dayCalls,0);assert.ok(r.statuses.every(s=>s.dayBasis==='equity'));
});
