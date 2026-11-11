// alert21(trade-alert 2.17.0) — 앱 v126 '새 출발': fresh_status로 읽은 기준 시각 이전 체결·펀딩 빼고 판정, 그 기간 분모 = 앱 기준 계좌 가치,
// 새 출발 전 손실로 걸린 중단 해제·🔄 1회, 이후 손실은 새로 셈(새 중단 id), 복수매매(쿨다운)도 새 출발 전 청산 무시, alert21.sql 없음 = 2.16.0, FRESH_START=0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fromHtml} from '../src/format.mjs';
import {Alerter,readConfig,VERSION} from '../src/alert.mjs';
import * as fr from '../src/fresh.mjs';
import {hlCalendar,usCalendar} from '../src/calendar.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),CHAT='987654321';
const MAIN='0x'+'c'.repeat(40);
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:CHAT,ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',QUICK_REVIEW:'0',REVIEW_REMIND:'0',MAG:'0',ALERT_MARKETS:'HL',...x});
const MIN=60000;
const D0=Date.parse('2026-11-06T00:00:00Z'); // HL 하루 11/06 = 09:00 KST 시작
const CUT=D0+60*MIN,EP='emvfresh01';

test('설정·파싱: 기본 켜짐 · FRESH_START=0 끔 · 켜진(on) 일지만 · 형식 검사 · 2.17.0',()=>{
 assert.equal(VERSION,'2.17.0');
 const E={TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:'1'};
 assert.equal(readConfig(E,{needSupabase:false}).fresh.enabled,true);assert.equal(readConfig({...E,FRESH_START:'0'},{needSupabase:false}).fresh.enabled,false);
 const p=fr.parseFresh({ok:true,version:1,journal:{HL:{v126:{on:true,epoch:EP,cutoff:CUT,eq:9600.123,day:'2026-11-06',carry:['a','b']}},US:{v126:{on:false,undone:'x',epoch:'u1',cutoff:CUT}}}});
 assert.deepEqual(p,{HL:{epoch:EP,cutoff:CUT,eq:9600.12,carry:2,appDay:'2026-11-06'}});
 for(const bad of [{on:true,epoch:EP,cutoff:'1'},{on:true,epoch:'bad epoch!',cutoff:CUT},{on:true,epoch:EP,cutoff:1e9},{on:'true',epoch:EP,cutoff:CUT},null])
  assert.deepEqual(fr.parseFresh({journal:{HL:{v126:bad}}}),{},JSON.stringify(bad));
 assert.deepEqual(fr.parseFresh(null),{});assert.equal(fr.parseFresh({journal:{HL:{v126:{on:true,epoch:EP,cutoff:CUT,eq:-5}}}}).HL.eq,null,'음수 분모 = 없음');
});

test('기준 시각(riskStart): HL = UTC 날짜·at = cutoff·기준 자산 = 앱 eq · .env 기준일과 더 늦은 쪽 · 기간 분모 감싸기 · DB 날짜 합계 자르기',()=>{
 const HL=hlCalendar(),US=usCalendar();const F={epoch:EP,cutoff:CUT,eq:9600};
 const rs=fr.riskStartOf(F,'HL',HL);assert.deepEqual(rs,{date:'2026-11-06',day:'2026-11-06',realKey:'2026-11-06',at:CUT,fresh:true,ep:EP,sidKey:'2026-11-06.'+EP,base0:{equity:9600,at:CUT,source:'앱 새 출발 시점'}});
 assert.equal(fr.riskStartOf(F,'US',US).day,US.dayOf(CUT));
 const envRs={date:'2026-10-26',day:'2026-10-26',at:Date.parse('2026-10-26T00:00:00Z')};assert.equal(fr.pickStart(envRs,rs),rs);
 const later={date:'2026-12-01',day:'2026-12-01',at:Date.parse('2026-12-01T00:00:00Z')};assert.equal(fr.pickStart(later,rs),later,'.env가 더 늦으면 .env');
 assert.equal(fr.pickStart(null,null),null);
 const dn=fr.wrapDenomAt(k=>({value:10000,mode:'close',key:'2026-11-05'}),F,rs);assert.equal(dn('2026-11-06').value,9600);assert.equal(dn('2026-11-06').fresh,true);assert.equal(dn('2026-11-02').value,10000);
 assert.deepEqual(fr.cutDbDays([{day:'2026-11-05'},{day:'2026-11-06'},{day:'2026-11-07'}],rs),[{day:'2026-11-07'}]);
 assert.deepEqual(fr.cutRaw([{time:CUT-1},{time:CUT},{time:CUT+1}],CUT).map(f=>f.time),[CUT,CUT+1]);
});

test('US 일별 실현(키움 하루 합계): 새 출발 날은 처음 본 합계를 빼서 셈 · 세대가 바뀌면 다시',()=>{
 const US=usCalendar(),F={epoch:EP,cutoff:CUT,eq:50000},rs=fr.riskStartOf(F,'US',US);const S={};
 const days=[{date:rs.day,as_of:CUT-5*MIN,total:'-800',count:3},{date:'2026-11-01',as_of:1,total:'-50',count:1}];
 const b=fr.usBaseFor(S,F,rs,days);assert.equal(b.base,-800);assert.equal(S.fresh.US.epoch,EP);
 assert.equal(fr.usBaseFor(S,F,rs,[{date:rs.day,as_of:CUT+9*MIN,total:'-1000'}]).base,-800,'같은 세대 = 처음 값 유지');
 const cut=fr.cutKwDays([{date:rs.day,as_of:CUT+9*MIN,total:'-1000',count:5},{date:'2026-11-01',total:'-50'}],b);assert.equal(cut[0].total,'-200');assert.equal(cut[1].total,'-50');
 assert.equal(fr.usBaseFor(S,{...F,epoch:'emvother'},rs,[{date:rs.day,as_of:CUT+20*MIN,total:'-1000'}]).base,-1000,'새 세대 = 다시 잼');
 assert.equal(fr.usBaseFor({},F,rs,[]).base,0,'그날 행 없음 = 0');
});

// ---- 서비스 통합(가짜 Supabase·텔레그램·HL) ----
const F_=(tid,at,coin,side,sz,start,o={})=>({coin,side,sz:String(sz),px:'100',startPosition:String(start),feeToken:'USDC',tid,time:at,closedPnl:'0',fee:'0',hash:'0x'+tid,dir:side==='B'?'Open Long':'Close Long',oid:tid,crossed:true,...o});
function world(){
 const w={now:D0+40*MIN,bal:9600,fills:[],pushes:[],alerts:[],freshCalls:0,fresh:null,freshSql:'ok'};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:null,orders:[]},acct_us:[],hl_address:MAIN,journal:{HL:{revision:1,unchanged:false,defaultRisk:1,account:3000}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[],acct:[{market:'hl',day:'2026-11-05',value:10000,source:'close',captured_at:D0}],hl:{address:MAIN,fills:w.fills,funding:[],days:[{day:'2026-11-06',fills:9,trades:-999,funding:0,funding_count:0}]}});
  if(url.endsWith('/rpc/risk_push')){w.pushes.push(body.p_payload);return J({ok:true});}
  if(url.endsWith('/rpc/fresh_status')){w.freshCalls++;if(w.freshSql==='missing')return J({code:'PGRST202',message:'Could not find the function public.fresh_status(p_token) in the schema cache'},404);
   return J({ok:true,version:1,journal:{HL:{v126:w.fresh},US:{v126:null}}});}
  if(/\/rpc\/(revenge_push|flip_push|revenge_data|mag_status)$/.test(url))return J({ok:true,version:15,orders:[],realized:[],positions:[]});
  if(url.includes('api.telegram.org')){const method=url.split('/').pop();if(method==='sendMessage')w.alerts.push(fromHtml(body.text));return J({ok:true,result:{message_id:1}});}
  if(url==='https://api.hyperliquid.xyz/info'){
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:String(w.bal)},time:Date.now()});case 'perpDexs':return J([null]);
    case 'userFillsByTime':return J(w.fills.filter(f=>f.time>=body.startTime));case 'userFunding':return J([]);case 'frontendOpenOrders':return J([]);
    case 'userNonFundingLedgerUpdates':return J([]);case 'portfolio':return J([]);case 'orderStatus':return J({status:'unknownOid'});case 'subAccounts':return J([]);}
  }
  return J({message:'not found'},404);};
 return w;
}
const mk=async(w,x={},logs=[])=>{const dir=await mkdtemp(path.join(tmpdir(),'ta21-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();return a;};
const hlOf=r=>r.statuses.find(s=>s.market==='HL');
const seedLoss=w=>{w.fills.push(F_(101,D0+30*MIN,'BTC','B',1,0),F_(102,D0+55*MIN,'BTC','A',1,1,{closedPnl:'-400',px:'60'}));};

test('서비스: 새 출발 전 손실(−4%)로 하루 중단 → 앱 새 출발(alert21) → 그 손실 빠짐·분모 = 새 출발 시점 9,600·중단 해제·🔄 1회 → 이후 손실 −3.13%는 새 중단 · 복수매매 쿨다운도 새 출발 전 청산 무시',async()=>{
 const w=world(),logs=[];seedLoss(w);const a=await mk(w,{},logs);
 w.now=D0+56*MIN;let r=await a.check();let hl=hlOf(r);
 assert.equal(hl.periods.day.pnl,-400);assert.equal(hl.periods.day.startEquity,10000);assert.ok(hl.stops.some(s=>s.rule==='day'&&!s.cleared),'새 출발 전: 하루 −4% 중단');
 assert.equal(w.freshCalls,1,'새 출발 설정 조회(앱 새 출발 없음)');assert.ok(logs.some(l=>/앱 새 출발 없음/.test(l)));
 // 앱에서 새 출발(09:58 KST 손실 뒤 10:00 KST) — 서버는 5분마다 읽음
 w.fresh={on:true,epoch:EP,cutoff:CUT,eq:9600,day:'2026-11-06',carry:[]};
 w.fills.push(F_(103,CUT+2*MIN,'ETH','B',1,0)); // 새 출발 2분 뒤(BTC 손실 청산 7분 뒤) 진입 → 새 출발 전 청산이라 쿨다운 경고 없음
 w.now=CUT+3*MIN;r=await a.check();hl=hlOf(r);
 assert.equal(w.freshCalls,2);assert.ok(logs.some(l=>/앱 새 출발: HL 새 출발 11\/06 10:00 KST부터 · 기준 9600 → 그 이전 체결·펀딩은 판정에서 뺌/.test(l)),logs.join('\n'));
 assert.equal(hl.periods.day.pnl,0,'새 출발 전 손실 빠짐(DB 날짜 합계 −999도 새 출발 날은 안 씀)');assert.equal(hl.periods.day.startEquity,9600);assert.equal(hl.periods.day.startSource,'새 출발 시점 9,600.00 USDC');
 assert.equal(hl.periods.week.startEquity,9600);assert.equal(hl.periods.week.startSource,'새 출발 시점 9,600.00 USDC');assert.equal(hl.periods.week.pnl,0);assert.equal(hl.periods.month.startEquity,9600);
 assert.equal(hl.stopped,false,'새 출발 전 손실 중단 해제');assert.equal(hl.riskStart.fresh,true);assert.equal(hl.riskStart.ep,EP);assert.equal(hl.riskStart.base.equity,9600);assert.deepEqual(hl.fresh,{epoch:EP,cutoff:CUT,eq:9600});
 const fm=w.alerts.filter(t=>/새 출발/.test(t.split('\n')[0]));assert.equal(fm.length,1);assert.match(fm[0],/^🔄 하이퍼리퀴드 · 새 출발 — 손실 한도 새로 셈/);assert.match(fm[0],/중단 해제: /);assert.match(fm[0],/분모: 새 출발 시점 9,600\.00 USDC/);
 assert.ok(!w.alerts.some(t=>/복수매매 의심/.test(t)),'새 출발 전 손실 청산 뒤 진입 = 쿨다운 경고 아님');
 assert.ok(w.pushes.some(p=>(p.events||[]).some(e=>e.kind==='clear'&&e.rule==='risk-start')),'중단 해제 기록');
 // 이후 손실: ETH −300 = −3.125% (÷ 9,600) → 하루 3% 넘어 새 중단
 w.fills.push(F_(104,CUT+10*MIN,'ETH','A',1,1,{closedPnl:'-300',px:'70'}));w.now=CUT+11*MIN;r=await a.check();hl=hlOf(r);
 assert.equal(hl.periods.day.pnl,-300);assert.equal(Math.round(hl.periods.day.pct*1000)/1000,-3.125);
 const st=hl.stops.filter(s=>s.rule==='day'&&!s.cleared);assert.equal(st.length,1);assert.match(st[0].id,new RegExp('@2026-11-06\\.'+EP+'$'),'새 출발 세대 중단 id');
 assert.equal(w.alerts.filter(t=>/새 출발/.test(t.split('\n')[0])).length,1,'🔄은 1회');
 // 앱에서 새 출발 취소(on:false) → 5분 뒤 다시 전체 체결(−700)
 w.fresh={on:false,undone:EP,epoch:'u'+EP,cutoff:CUT};w.now=CUT+17*MIN;r=await a.check();hl=hlOf(r);
 assert.equal(hl.periods.day.pnl,-700,'취소 → 새 출발 전 손실도 다시 셈');assert.equal(hl.riskStart,null);
});

test('서비스: alert21.sql 없음 = 2.16.0처럼 전체 체결(경고 1회) · FRESH_START=0 = 조회 안 함',async()=>{
 const w=world(),logs=[];seedLoss(w);w.freshSql='missing';w.fresh={on:true,epoch:EP,cutoff:CUT,eq:9600};const a=await mk(w,{},logs);
 w.now=CUT+3*MIN;let r=await a.check();assert.equal(hlOf(r).periods.day.pnl,-400);assert.ok(hlOf(r).stopped);
 w.now=CUT+9*MIN;await a.check();assert.equal(logs.filter(l=>/alert21\.sql이 아직 없습니다/.test(l)).length,1);
 const w2=world(),l2=[];seedLoss(w2);w2.fresh={on:true,epoch:EP,cutoff:CUT,eq:9600};const b=await mk(w2,{FRESH_START:'0'},l2);w2.now=CUT+3*MIN;r=await b.check();
 assert.equal(w2.freshCalls,0);assert.equal(hlOf(r).periods.day.pnl,-400);
});
