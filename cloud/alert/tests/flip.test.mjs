// alert17(trade-alert 2.13.0) — HL 방향 전환 감지: 설정, 한 체결 반전, 한 주문(0을 지나며) 반전, 청산 뒤 4분/5분/6분 반대 진입,
// 같은 방향 재진입·다른 코인은 아님, 같은 주문 여러 체결 1회, HIP-3 dex 코인, 실제 kPEPE 11-03 체결, 서비스(1회·재시작·기록·SQL 없음·끄기), --flip-dry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fromHtml} from '../src/format.mjs';
import {Alerter,readConfig,flipDry,VERSION} from '../src/alert.mjs';
import * as fl from '../src/flip.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),ADDR='0x'+'c'.repeat(40),CHAT='987654321';
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:CHAT,ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',QUICK_REVIEW:'0',REVIEW_REMIND:'0',REVENGE_ALERT:'0',...x});
const MIN=60000,HOUR=3600000;
const T0=Date.parse('2026-11-03T12:00:00+09:00');
// F(tid, time, side, sz, startPosition, extra) — oid 기본 = tid(체결마다 다른 주문)
const F=(tid,time,side,sz,start,o={})=>({coin:'BTC',side,sz:String(sz),px:'60000',startPosition:String(start),feeToken:'USDC',tid,time,closedPnl:'0',fee:'0',hash:'0x'+tid,dir:'x',oid:tid,...o});

test('버전 2.13.0 · 설정 기본값(켜짐·5분) · 끄기 · 0 = 창 규칙 끔 · 형식 오류는 CONFIG_INCOMPLETE',()=>{
 assert.equal(VERSION,'2.17.0');
 const c=readConfig(env('/tmp')).flip;assert.deepEqual([c.enabled,c.windowMin],[true,5]);
 assert.equal(readConfig(env('/tmp',{FLIP_ALERT:'0'})).flip.enabled,false);
 assert.equal(readConfig(env('/tmp',{FLIP_WINDOW_MIN:'0'})).flip.windowMin,0);
 for(const [k,v] of [['FLIP_ALERT','maybe'],['FLIP_WINDOW_MIN','61'],['FLIP_WINDOW_MIN','2.5'],['FLIP_WINDOW_MIN','x']])
  assert.throws(()=>readConfig(env('/tmp',{[k]:v})),e=>e.message==='CONFIG_INCOMPLETE'&&e.fields.some(f=>f.startsWith(k)),k+'='+v);
});

test("한 체결 반전(HL dir 'Long > Short'): 롱 1 → 숏 2 · 이전/현재 수량·체결가·oid",()=>{
 const ev=fl.detectFlips([F(1,T0-HOUR,'B',1,0),F(2,T0,'A',3,1,{dir:'Long > Short',px:'61000',oid:77})]);
 assert.equal(ev.length,1);const e=ev[0];
 assert.deepEqual([e.kind,e.coin,e.prevDir,e.prevSize,e.newDir,e.newSize,e.px,e.time,e.oid,e.hlDir,e.key],['order','BTC','long',1,'short',2,61000,T0,'77','Long > Short','flip:hl:BTC:77']);
 const t=fl.flipText(e,{order:{orderType:'Limit',tif:'Gtc',origSz:'3.0',reduceOnly:false}});
 assert.match(t,/^🔄 \[방향 전환 의심\] 🟦 하이퍼리퀴드 · BTC 롱 → 숏/);assert.match(t,/이전: 롱 1\n현재: 숏 2 \(감지 시점\)\n체결가: 61,000/);
 assert.match(t,/시각: 11\/03 12:00:00 KST/);assert.match(t,/주문: oid 77 · Limit GTC · 주문 수량 3 · reduce-only 아님 ❌/);assert.match(t,/Positions 탭의 Close로만/);
 assert.match(fl.flipText(e),/주문: oid 77 · reduce-only 아님\(체결로 판단: 반대 포지션이 열림\)/,'주문 조회 실패 → 체결로 판단');
 assert.deepEqual(fl.detectFlips([F(1,T0,'B',2,-1,{dir:'Short > Long'})]).map(x=>[x.prevDir,x.newDir,x.newSize]),[['short','long',1]],'숏 → 롱(범위 밖에서 시작한 포지션도)');
});

test('한 주문이 0으로 닫고(체결 1) 같은 주문 다음 체결로 반대 진입 = 한 주문 반전 1건(창 규칙과 중복 없음) · 같은 주문 체결 여러 개도 1건',()=>{
 const fills=[F(1,T0-HOUR,'B',5,0,{oid:9}),F(2,T0,'A',2,5,{oid:10,dir:'Close Long'}),F(3,T0,'A',3,3,{oid:10,dir:'Close Long'}),F(4,T0,'A',4,0,{oid:10,dir:'Open Short'}),F(5,T0+1000,'A',1,-4,{oid:10,dir:'Open Short'})];
 const ev=fl.detectFlips(fills);assert.equal(ev.length,1);
 assert.deepEqual([ev[0].kind,ev[0].prevSize,ev[0].newSize,ev[0].oid,ev[0].tid,ev[0].fills],['order',5,5,'10','4',4]);
 assert.equal(ev[0].time,T0,'시각 = 반대 포지션이 처음 열린 체결');
});

test('청산 뒤 반대 진입: 4분 = 경고, 5분 정각 = 경고(포함), 6분 = 아님 · FLIP_WINDOW_MIN=0이면 끔 · 같은 방향 재진입·다른 코인은 아님',()=>{
 const base=[F(1,T0-HOUR,'B',2,0,{oid:1}),F(2,T0,'A',2,2,{oid:2,dir:'Close Long'})];
 const at=(ms,o={})=>fl.detectFlips([...base,F(3,T0+ms,'A',1,0,{oid:3,dir:'Open Short',...o})],{windowMin:5});
 let ev=at(4*MIN);assert.equal(ev.length,1);
 assert.deepEqual([ev[0].kind,ev[0].prevDir,ev[0].prevSize,ev[0].newDir,ev[0].newSize,ev[0].closeOid,ev[0].gapMs,ev[0].oid],['window','long',2,'short',1,'2',4*MIN,'3']);
 const t=fl.flipText(ev[0],{closeOrder:{reduceOnly:true},windowMin:5});assert.match(t,/청산 4분 뒤 반대 방향 진입 \(기준 5분\)/);assert.match(t,/청산: 11\/03 12:00:00 KST · oid 2 · reduce-only/);
 assert.equal(at(5*MIN).length,1,'5분 정각 = 창 안');
 assert.equal(at(6*MIN).length,0,'6분 = 창 밖');
 assert.equal(fl.detectFlips([...base,F(3,T0+MIN,'A',1,0,{oid:3})],{windowMin:0}).length,0,'0 = 창 규칙 끔');
 assert.equal(fl.detectFlips([...base,F(3,T0+MIN,'B',1,0,{oid:3})],{windowMin:5}).length,0,'같은 방향(롱) 재진입은 아님');
 assert.equal(at(MIN,{coin:'ETH'}).length,0,'다른 코인 반대 진입은 아님');
});

test('직전 청산이 다른 방향이었던 경우만: 롱 청산 → 롱 재진입(2분) → 롱 청산 → 숏 진입(1분) = 1건(마지막 청산 기준)',()=>{
 const fills=[F(1,T0-HOUR,'B',2,0),F(2,T0,'A',2,2),F(3,T0+2*MIN,'B',1,0),F(4,T0+3*MIN,'A',1,1),F(5,T0+4*MIN,'A',3,0)];
 const ev=fl.detectFlips(fills,{windowMin:5});assert.equal(ev.length,1);assert.deepEqual([ev[0].prevSize,ev[0].newSize,ev[0].gapMs,ev[0].closeOid],[1,3,MIN,'4']);
});

test('HIP-3 dex 코인(xyz:TSLA)도 감지 · dex 표시 · 현물(@107·PURR/USDC)은 무시',()=>{
 const ev=fl.detectFlips([F(1,T0-HOUR,'B',10,0,{coin:'xyz:TSLA',px:'420'}),F(2,T0,'A',15,10,{coin:'xyz:TSLA',px:'421',dir:'Long > Short'}),
  F(3,T0-HOUR,'B',10,0,{coin:'@107'}),F(4,T0,'A',15,10,{coin:'@107'}),F(5,T0,'A',15,10,{coin:'PURR/USDC'})]);
 assert.equal(ev.length,1);assert.deepEqual([ev[0].coin,ev[0].dex,ev[0].key,ev[0].newSize],['xyz:TSLA','xyz','flip:hl:xyz:TSLA:2',5]);
 assert.match(fl.flipText(ev[0]),/xyz:TSLA \(HIP-3 xyz\) 롱 → 숏/);
 const it=fl.flipItem(ev[0],{now:T0});assert.equal(it.ref,'fl:hl:xyz:TSLA:2');assert.equal(it.dex,'xyz');assert.equal(it.reduce_only,false);assert.equal(it.reduce_only_source,'fills');
});

test('실제 HL 체결(11-03 kPEPE): 22:05:13 KST oid 593328614662 롱 4,456,063 → 숏 10,020,607 1건 · 22:05:52 숏 청산은 아님',()=>{
 const fills=JSON.parse(readFileSync(new URL('./fixtures/hl-kpepe-20261103.json',import.meta.url),'utf8'));
 const ev=fl.detectFlips(fills,{windowMin:5});assert.equal(ev.length,1);const e=ev[0];
 assert.deepEqual([e.kind,e.coin,e.oid,e.prevDir,e.prevSize,e.newDir,e.newSize,e.px,e.hlDir],['order','kPEPE','593328614662','long',4456063,'short',10020607,0.004874,'Long > Short']);
 assert.equal(new Date(e.time+9*HOUR).toISOString().slice(0,19),'2026-11-03T22:05:13');
});

// ---- 서비스 통합(가짜 Supabase·텔레그램·HL) ----
function world(){
 const w={now:T0,fills:[],sql:'ok',push:[],alerts:[],tgCalls:[],orders:{},orderCalls:0};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:null,orders:[]},acct_us:[],hl_address:ADDR,journal:{HL:{revision:1,unchanged:false,defaultRisk:1,account:3000}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[],acct:[],hl:{address:ADDR,fills:[],funding:[],days:[]}});
  if(url.endsWith('/rpc/risk_push'))return J({ok:true});
  if(url.endsWith('/rpc/flip_push')){if(w.sql==='missing')return J({code:'PGRST202',message:'Could not find the function public.flip_push in the schema cache'},404);
   assert.equal(body.p_token,TOKEN);w.push.push(body.p_payload);return J({ok:true,version:17,stored:(body.p_payload.items||[]).length});}
  if(url.includes('api.telegram.org')){const method=url.split('/').pop();w.tgCalls.push({method,body});
   if(method==='sendMessage'){w.alerts.push(fromHtml(body.text));return J({ok:true,result:{message_id:1}});}return J({ok:true,result:[]});}
  if(url==='https://api.hyperliquid.xyz/info'){
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:'20000'},time:Date.now()});case 'perpDexs':return J([null]);
    case 'userFillsByTime':return J(w.fills.filter(f=>f.time>=body.startTime));case 'userFunding':return J([]);case 'frontendOpenOrders':return J([]);
    case 'orderStatus':{w.orderCalls++;const o=w.orders[String(body.oid)];return J(o?{status:'order',order:{order:o,status:'filled'}}:{status:'unknownOid'});}
    case 'userNonFundingLedgerUpdates':return J([]);case 'portfolio':return J([]);}
  }
  return J({message:'not found'},404);};
 return w;
}
const mk=async(w,x={},logs=[],dir=null)=>{dir=dir||await mkdtemp(path.join(tmpdir(),'ta17-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();return a;};
const flips=w=>w.alerts.filter(t=>/방향 전환 의심/.test(t));

test('서비스: 설치 전 체결은 안 보냄 → 새 반전 주문 1회(주문 조회 reduce-only 아님) · 같은 주문 체결이 더 붙어도 메시지 1회·기록만 갱신 · 재시작 뒤에도 1회 · flip_push',async()=>{
 const w=world(),logs=[];const a=await mk(w,{},logs);
 w.fills.push(F(1,T0-3*HOUR,'B',1,0,{coin:'kPEPE',px:'0.0048'}),F(2,T0-2*HOUR,'A',2,1,{coin:'kPEPE',px:'0.0049',dir:'Long > Short'}),F(7,T0-1.9*HOUR,'B',1,-1,{coin:'kPEPE'}));
 await a.check();assert.equal(flips(w).length,0,'설치 전 반전은 보내지 않음');assert.equal(a.state.flip.since,T0);
 w.now+=10*MIN;w.orders['500']={coin:'kPEPE',side:'A',orderType:'Limit',tif:'Gtc',origSz:'14476670.0',reduceOnly:false};
 w.fills.push(F(3,w.now-9*MIN,'B',4456063,0,{coin:'kPEPE',px:'0.00483'}),F(4,w.now-2*MIN,'A',4456063,4456063,{coin:'kPEPE',oid:500,px:'0.004874',dir:'Close Long'}),F(5,w.now-2*MIN,'A',213458,0,{coin:'kPEPE',oid:500,px:'0.004874',dir:'Open Short'}));
 await a.check();
 let m=flips(w);assert.equal(m.length,1);assert.match(m[0],/kPEPE 롱 → 숏/);assert.match(m[0],/이전: 롱 4,456,063/);assert.match(m[0],/현재: 숏 213,458/);
 assert.match(m[0],/주문: oid 500 · Limit GTC · 주문 수량 14,476,670 · reduce-only 아님 ❌/);
 let items=w.push.flatMap(p=>p.items||[]);assert.deepEqual(items.map(i=>[i.ref,i.kind,i.new_size,i.reduce_only,i.reduce_only_source,i.order_type]),[['fl:hl:kPEPE:500','order',213458,false,'order','Limit']]);
 assert.ok(logs.some(l=>/alert17\.sql 확인/.test(l)));
 // 같은 주문 체결이 더 들어옴 → 메시지 없음, 기록 크기만 갱신
 w.now+=MIN;w.fills.push(F(6,w.now-30000,'A',9807149,-213458,{coin:'kPEPE',oid:500,px:'0.004874',dir:'Open Short'}));
 await a.check();assert.equal(flips(w).length,1,'같은 주문은 메시지 1회');
 items=w.push.flatMap(p=>p.items||[]);assert.deepEqual(items.at(-1).ref,'fl:hl:kPEPE:500');assert.equal(items.at(-1).new_size,10020607);assert.equal(items.at(-1).reduce_only,undefined,'크기 갱신은 주문 정보 안 덮음');
 const saved=JSON.parse(await readFile(path.join(a.cfg.stateDir,'state2.json'),'utf8'));assert.ok(saved.flip.sent['flip:hl:kPEPE:500']);
 const b=await mk(w,{},[],a.cfg.stateDir);w.now+=MIN;await b.check();assert.equal(flips(w).length,1,'재시작 뒤에도 다시 안 보냄');
 assert.equal(w.orderCalls,1,'주문 조회는 처음 1번만');
});

test('서비스: 청산 4분 뒤 반대 진입 = 경고 · 6분 뒤 = 없음 · 6시간 넘은 체결은 안 보냄',async()=>{
 const w=world();const a=await mk(w);await a.check();
 w.now+=30*MIN;const t=w.now;
 w.fills.push(F(11,t-29*MIN,'B',1,0,{coin:'ETH',px:'3000'}),F(12,t-20*MIN,'A',1,1,{coin:'ETH',px:'3010'}),F(13,t-16*MIN,'A',2,0,{coin:'ETH',px:'3005'}),
  F(21,t-29*MIN,'B',1,0,{coin:'SOL',px:'200'}),F(22,t-20*MIN,'A',1,1,{coin:'SOL'}),F(23,t-14*MIN,'A',2,0,{coin:'SOL'}));
 await a.check();const m=flips(w);assert.equal(m.length,1);assert.match(m[0],/ETH 롱 → 숏/);assert.match(m[0],/청산 4분 뒤 반대 방향 진입 \(기준 5분\)/);assert.doesNotMatch(m.join('\n'),/SOL/);
 assert.deepEqual(w.push.flatMap(p=>p.items||[]).map(i=>[i.ref,i.kind,i.gap_sec,i.close_oid]),[['fl:hl:ETH:13','window',240,'12']]);
});

test('서비스: alert17.sql 없음 → 텔레그램은 그대로·로그 1회·기록은 서버 대기열 → 설치되면 올림 · FLIP_ALERT=0이면 아무것도 안 함',async()=>{
 const w=world(),logs=[];w.sql='missing';const a=await mk(w,{},logs);await a.check();
 w.now+=10*MIN;w.fills.push(F(31,w.now-9*MIN,'B',1,0),F(32,w.now-MIN,'A',2,1,{dir:'Long > Short'}));
 await a.check();assert.equal(flips(w).length,1);assert.equal(logs.filter(l=>/alert17\.sql이 아직 없습니다/.test(l)).length,1);
 assert.equal(a.state.flip.pending.length,1);assert.equal(w.push.length,0);
 w.now+=2*HOUR;w.sql='ok';a.flip.sqlAt=0;await a.check();assert.equal(a.state.flip.pending.length,0);assert.deepEqual(w.push.flatMap(p=>p.items||[]).map(i=>i.ref),['fl:hl:BTC:32']);
 const w2=world();const b=await mk(w2,{FLIP_ALERT:'0'});assert.equal(b.flip,null);await b.check();w2.now+=MIN;w2.fills.push(F(31,w2.now-30000,'B',1,0),F(32,w2.now-20000,'A',2,1));await b.check();assert.equal(flips(w2).length,0);
});

test('텔레그램 전송 실패 → 다음 확인 때 다시(2시간 안) · 보낸 표시는 먼저 저장',async()=>{
 const w=world();const a=await mk(w);await a.check();
 const real=w.fetcher;let fail=true;w.fetcher=async(u,o)=>{if(fail&&u.endsWith('/sendMessage'))return new Response(JSON.stringify({ok:false,description:'Bad Gateway'}),{status:502});return real(u,o);};a.tg.fetcher=w.fetcher;a.tg.sleep=async()=>{};
 w.now+=10*MIN;w.fills.push(F(41,w.now-9*MIN,'B',1,0),F(42,w.now-MIN,'A',2,1));
 await a.check();assert.equal(flips(w).length,0);assert.equal(a.state.flip.outbox.length,1);assert.ok(a.state.flip.sent['flip:hl:BTC:42']);
 fail=false;w.now+=MIN;await a.check();assert.equal(flips(w).length,1);assert.equal(a.state.flip.outbox.length,0);
});

test('--flip-dry: 기간 안 반전만 출력 · 주문 정보 · 텔레그램·저장 없음 · --address로 Supabase 없이',async()=>{
 const w=world();const lines=[];const now=Date.parse('2026-11-03T23:00:00+09:00');
 const t=Date.parse('2026-10-20T12:00:00+09:00');w.orders['43']={orderType:'Market',tif:'FrontendMarket',origSz:'3',reduceOnly:false};
 w.fills.push(F(41,t,'B',1,0),F(43,t+MIN,'A',3,1,{dir:'Long > Short'}),F(44,t+2*MIN,'B',2,-2,{oid:45}),F(46,t+5*MIN,'B',1,0,{oid:46}),F(47,Date.parse('2026-09-20T12:00:00+09:00'),'A',2,1,{coin:'XRP'}));
 const code=await flipDry(['--flip-dry','--from','2026-10-01','--to','2026-10-31','--address',ADDR],{},()=>{},{fetcher:w.fetcher,out:l=>lines.push(l),now:()=>now});
 assert.equal(code,0);const out=lines.join('\n');
 assert.match(out,/방향 전환 드라이런 \(보내지 않음 · 저장 안 함\) · 2026-10-01 ~ 2026-10-31 \(KST\) · 청산 뒤 반대 진입 기준 5분/);
 assert.match(out,/10\/20 12:01:00 KST BTC 롱 1 → 숏 2 · 한 주문 반전/);assert.match(out,/주문: oid 43 · Market · 주문 수량 3 · reduce-only 아님 ❌ · HL dir 'Long > Short'/);
 assert.match(out,/10\/20 12:05:00 KST BTC 숏 2 → 롱 1 · 청산 3\.0분 뒤 반대 진입/);
 assert.match(out,/합계 2건 \(한 주문 반전 1 · 청산 뒤 반대 진입 1\)/);assert.doesNotMatch(out,/XRP/);
 assert.equal(w.tgCalls.length,0);assert.equal(w.push.length,0);
 assert.equal(await flipDry(['--flip-dry','--from','2026-13-01','--address',ADDR],{},()=>{},{fetcher:w.fetcher,out:l=>lines.push(l),now:()=>now}),2);
 assert.equal(await flipDry(['--flip-dry','--address','0x12'],{},()=>{},{fetcher:w.fetcher,out:l=>lines.push(l),now:()=>now}),2);
});
