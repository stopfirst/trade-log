// alert20(trade-alert 2.16.0) — HL 하위계정 '탄창': 설정·목록(앱 우선 → .env, Scalping 제외), 잔고(앱 v123Bal), 마감값, 내부 이체,
// 합산 분모·실현손익(서비스 통합), 새 알림 4종(소진·장중 재충전·금고에서 거래·09:00 점검) 1회·끄기, 복수매매·방향 전환에 탄창 체결, --mag-dry, MAG=0 = 2.15.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fromHtml} from '../src/format.mjs';
import {Alerter,readConfig,magDry} from '../src/alert.mjs';
import * as mg from '../src/mag.mjs';
import * as rm from '../src/remind.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),CHAT='987654321';
const MAIN='0x'+'c'.repeat(40),SUB='0x'+'1'.repeat(40),SUB2='0x'+'2'.repeat(40),OTHER='0x'+'7'.repeat(40),SCALP=mg.SCALP;
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:CHAT,ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',QUICK_REVIEW:'0',REVIEW_REMIND:'0',...x});
const MIN=60000,HOUR=3600000;
const D0=Date.parse('2026-11-06T00:00:00Z'); // HL 하루 11/06 = 09:00 KST 시작
const CFG=mg.magConfig({});

test('설정: 기본 켜짐·알림 4종 켜짐·2%·10%·09:10 · HL_SUBS 형식 · 0/1 형식 오류',()=>{
 assert.deepEqual([CFG.enabled,CFG.alerts,CFG.pct,CFG.emptyPct,CFG.openTolPct,CFG.openMin,CFG.envSubs],[true,{empty:true,refill:true,vault:true,open:true},2,10,10,10,[]]);
 const c=mg.magConfig({HL_SUBS:` ${SUB.toUpperCase().replace('0X','0x')}, ${SUB2} `,MAG_REFILL_ALERT:'0',MAG_PCT:'1.5'});assert.deepEqual(c.envSubs,[SUB,SUB2]);assert.equal(c.alerts.refill,false);assert.equal(c.pct,1.5);assert.deepEqual(c.errors,[]);
 assert.match(mg.magConfig({HL_SUBS:'0x12'}).errors[0],/^HL_SUBS/);assert.match(mg.magConfig({MAG_VAULT_ALERT:'maybe'}).errors[0],/^MAG_VAULT_ALERT/);assert.match(mg.magConfig({MAG_PCT:'0'}).errors[0],/^MAG_PCT/);
 assert.throws(()=>readConfig(env('/tmp',{HL_SUBS:'nope'})),e=>e.message==='CONFIG_INCOMPLETE'&&/HL_SUBS/.test(e.fields.join()));
 assert.equal(readConfig(env('/tmp',{MAG:'0'})).mag.enabled,false);
});

test('목록: 앱 v123Subs 우선 → 없으면 .env · 주계정·Scalping 항상 제외 · v123Ex · 이름 Scalping · 최대 5 · 목표 % 앱 → .env',()=>{
 const cfg=mg.magConfig({HL_SUBS:`${SUB2},${SCALP}`});
 let r=mg.resolveSubs({settings:{subs:`${SUB},${MAIN},${SCALP}`,pct:3,since:1793700000000},cfg,main:MAIN});assert.deepEqual([r.subs,r.source,r.pct,r.since],[[SUB],'app',3,1793700000000]);
 r=mg.resolveSubs({settings:{subs:null,pct:null},cfg,main:MAIN});assert.deepEqual([r.subs,r.source,r.pct,r.since],[[SUB2],'env',2,null]);
 r=mg.resolveSubs({settings:null,cfg,main:MAIN});assert.deepEqual(r.subs,[SUB2],'alert20.sql 없음(settings null) → .env');
 r=mg.resolveSubs({settings:{subs:'',ex:SUB2},cfg,main:MAIN});assert.deepEqual([r.subs,r.source],[[],null],'앱 제외 목록 v123Ex는 .env 주소에도');
 r=mg.resolveSubs({settings:{subs:SUB2},cfg:mg.magConfig({}),main:MAIN,list:[{addr:SUB2,name:'scalping'}]});assert.deepEqual(r.subs,[],'v123Ex 없으면 이름 Scalping도 제외(앱과 같음)');
 r=mg.resolveSubs({settings:{subs:SUB2,ex:''},cfg:mg.magConfig({}),main:MAIN,list:[{addr:SUB2,name:'scalping'}]});assert.deepEqual(r.subs,[SUB2],'v123Ex를 앱에서 비우면 이름 규칙 없음');
 const many=Array.from({length:7},(_,i)=>'0x'+String(i+3).repeat(40));r=mg.resolveSubs({settings:{subs:many.join(' ')},cfg,main:MAIN});assert.equal(r.subs.length,5);
});

test('잔고 = 앱 v123Bal: 통합 계좌면 현물 USDC, 아니면 무기한 + 현물 USDC · 하위계정 목록 파싱',()=>{
 assert.equal(mg.subBalance({ch:{marginSummary:{accountValue:'180'}},spot:{balances:[{coin:'USDC',token:0,total:'200',hold:'180'}]}}).value,200);
 assert.equal(mg.subBalance({ch:{marginSummary:{accountValue:'50'}},spot:{balances:[{coin:'USDC',token:0,total:'25',hold:'0'}]}}).value,75);
 assert.equal(mg.subBalance({ch:null,spot:null}).value,0);
 assert.deepEqual(mg.parseSubAccounts([{name:'1R-1',subAccountUser:SUB.toUpperCase().replace('0X','0x')},{name:'x',subAccountUser:'bad'}]).map(x=>[x.name,x.addr]),[['1R-1',SUB]]);
 assert.deepEqual(mg.parseSubAccounts(null),[]);assert.throws(()=>mg.parseSubAccounts({}));
});

test('내부 이체: 주↔탄창·탄창끼리 send/subAccountTransfer = 계좌 안 이동, 외부 입금·다른 주소·USDC 아닌 토큰은 아님 · 주→탄창 목록',()=>{
 const L=[{time:1,hash:'0xa',delta:{type:'subAccountTransfer',usdc:'200',user:MAIN,destination:SUB}},{time:2,hash:'0xb',delta:{type:'send',user:SUB,destination:MAIN,token:'USDC',amount:'5',usdcValue:'5'}},
  {time:3,hash:'0xc',delta:{type:'deposit',usdc:'500'}},{time:4,hash:'0xd',delta:{type:'send',user:MAIN,destination:OTHER,token:'USDC',amount:'9',usdcValue:'9'}},{time:5,hash:'0xe',delta:{type:'send',user:MAIN,destination:SUB,token:'HYPE',amount:'1',usdcValue:'40'}},
  {time:6,hash:'0xf',delta:{type:'subAccountTransfer',usdc:'7',user:SUB,destination:SUB2}}];
 assert.deepEqual(L.map(u=>mg.isInternal(u,MAIN,[SUB,SUB2])),[true,true,false,false,false,true]);
 assert.deepEqual([...mg.internalRefs(L,MAIN,[SUB])],['hl-ledger:0xa:1:subAccountTransfer','hl-ledger:0xb:2:send']);
 assert.deepEqual(mg.mainToSub(L,MAIN,[SUB]).map(x=>[x.t,x.usd,x.to]),[[1,200,SUB]]);
});

test('마감값: portfolio 마감 직전 점 우선(4시간 안, 없으면 직후) · 기록 없음 = 0(빈 하위계정) · 조회 실패 = 모름 → 그 날 행은 주계정만',()=>{
 const P=[['day',{accountValueHistory:[[D0-30*MIN,'50.5'],[D0+2*HOUR,'250']]}]];
 assert.equal(mg.closeAt(P,D0),50.5);assert.equal(mg.closeAt(P,D0-6*HOUR),undefined);assert.equal(mg.closeAt(P,D0+7*HOUR),undefined);assert.equal(mg.closeAt([],D0),0);assert.equal(mg.closeAt(null,D0),undefined);
 // 실측 모양(빈 하위계정 1R-1, 11/05): 기록점이 드묾 — 11/04 08:26 0.0 · 11/05 06:21 0.0 → 11/05 00:00 마감 = 0 (앞뒤 같음)
 const idle=[['day',{accountValueHistory:[[Date.parse('2026-11-04T08:26:18Z'),'0.0'],[Date.parse('2026-11-05T06:21:50Z'),'0.0']]}]];assert.equal(mg.closeAt(idle,Date.parse('2026-11-05T00:00:00Z')),0);
 assert.equal(mg.closeAt([['day',{accountValueHistory:[[D0-10*HOUR,'10'],[D0+10*HOUR,'30']]}]],D0),undefined,'앞뒤 값이 다르고 멀면 모름');
 assert.equal(mg.closeAt([['day',{accountValueHistory:[[D0+10*HOUR,'0.0']]}]],D0),0,'첫 기록이 마감 뒤 0 = 그때 빈 계정');
 const acct=[{market:'hl',day:'2026-11-05',value:10000,source:'close'},{market:'hl',day:'2026-11-03',value:9000,source:'close'},{market:'us',day:'2026-11-05',value:1}];
 const w=mg.withSubCloses(acct,[{portfolio:P}]);assert.equal(w.rows[0].value,10050.5);assert.equal(w.rows[1].value,9000);assert.ok(w.missing.has('2026-11-03'));assert.equal(w.rows[2].value,1);
});

// ---- 모델 + 알림 처리기 ----
const mkModel=(o={})=>mg.model({t:D0+45*MIN,cfg:CFG,main:MAIN,subs:[{addr:SUB,name:'1R-1',bal:15,rawFills:[{coin:'BTC',time:D0+15*MIN,tid:11}]}],balSum:15,source:'app',pct:2,since:D0-DAY_(1),denom:10050,
 pnl:-20,mainRawFills:[],ledger:[{time:D0+MIN,hash:'0x1',delta:{type:'subAccountTransfer',usdc:'200',user:MAIN,destination:SUB}},{time:D0+30*MIN,hash:'0x2',delta:{type:'subAccountTransfer',usdc:'100',user:MAIN,destination:SUB}}],...o});
function DAY_(n){return n*86400000;}
const fakeTg=()=>{const sent=[];return {sent,send:async t=>{sent.push(t);}};};
const mkMag=(cfg=CFG,since=D0)=>{const S={},tg=fakeTg();return {tg,S,m:new mg.Mag({cfg,tg,log:()=>{},now:()=>since,state:()=>S,save:async()=>{}})};};

test('모델: 목표 = 직전 마감(합산) × 2% · 소진(< 10%) · 첫 탄창 체결 전 이체 = 아침 충전, 뒤 = 장중 재충전 · 금고 진입',()=>{
 const m=mkModel({mainRawFills:[{coin:'ETH',side:'B',sz:'1',px:'3000',startPosition:'0',time:D0+28*MIN,tid:21,oid:9001,dir:'Open Long'},{coin:'ETH',side:'A',sz:'1',px:'3001',startPosition:'1',time:D0+29*MIN,tid:22,oid:9002,dir:'Close Long'}]});
 assert.equal(m.target,201);assert.equal(m.state,'empty');assert.equal(m.first,D0+15*MIN);assert.deepEqual(m.charges.map(c=>c.usd),[200]);assert.deepEqual(m.refills.map(c=>c.usd),[100]);
 assert.deepEqual(m.vault.map(v=>[v.symbol,v.oid]),[['ETH',9001]],'청산 체결은 금고 진입 아님');
 assert.equal(mkModel({balSum:21}).state,'use');assert.equal(mkModel({balSum:200}).state,'full');assert.equal(mkModel({denom:null}).target,null);
 assert.equal(mkModel({since:D0+40*MIN,mainRawFills:[{coin:'ETH',side:'B',sz:'1',px:'3000',startPosition:'0',time:D0+28*MIN,tid:21,oid:9001}]}).vault.length,0,'앱 v123Since 전 주계정 체결은 금고 아님');
});

test('소진 알림: 🧯 탄창 소진 · 오늘 매매 끝 · 같은 날 1회 · 탄창 체결 없으면 안 보냄 · MAG_EMPTY_ALERT=0',async()=>{
 const {tg,m}=mkMag(mg.magConfig({MAG_REFILL_ALERT:'0',MAG_OPEN_ALERT:'0'}));
 const mm=mkModel();await m.afterCheck(mm,D0+45*MIN);
 assert.equal(tg.sent.length,1);assert.match(tg.sent[0],/^🧯 탄창 소진 · 오늘 매매 끝\n\n탄창: 1R-1 15\.00 USDC \/ 목표 201\.00 USDC \(2%\)\n오늘 탄창 실현: −20\.00 USDC\n다음 충전: 내일 09:00 KST/);
 await m.afterCheck(mkModel({balSum:3}),D0+50*MIN);assert.equal(tg.sent.length,1,'같은 날 다시 안 보냄');
 const b=mkMag(mg.magConfig({MAG_REFILL_ALERT:'0',MAG_OPEN_ALERT:'0'}));await b.m.afterCheck(mkModel({subs:[{addr:SUB,name:'1R-1',bal:0,rawFills:[]}]}),D0+45*MIN);assert.equal(b.tg.sent.length,0,'오늘 탄창 체결이 없으면(안 채운 것) 소진 아님');
 const c=mkMag(mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_REFILL_ALERT:'0',MAG_OPEN_ALERT:'0'}));await c.m.afterCheck(mkModel(),D0+45*MIN);assert.equal(c.tg.sent.length,0,'끔');
});

test('장중 재충전: 첫 탄창 체결 뒤 주→탄창 이체만 · 이체마다 1회 · 서비스 시작 전 사건은 안 보냄 · 끄기',async()=>{
 const {tg,m}=mkMag(mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_OPEN_ALERT:'0'}));
 await m.afterCheck(mkModel(),D0+45*MIN);await m.afterCheck(mkModel(),D0+46*MIN);
 assert.equal(tg.sent.length,1);assert.match(tg.sent[0],/^⚠️ \[장중 재충전\] 주계정 → 탄창 이체\n\n이체: 100\.00 USDC → 1R-1 · 09:30 KST\n오늘 첫 탄창 체결: 09:15 KST/);
 const late=mkMag(mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_OPEN_ALERT:'0'}),D0+40*MIN);await late.m.afterCheck(mkModel(),D0+45*MIN);assert.equal(late.tg.sent.length,0,'설치(09:40) 전 이체는 안 보냄');
 const off=mkMag(mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_OPEN_ALERT:'0',MAG_REFILL_ALERT:'0'}));await off.m.afterCheck(mkModel(),D0+45*MIN);assert.equal(off.tg.sent.length,0);
});

test('금고에서 거래: 주계정 새 진입 주문마다 1회(같은 주문 체결 여러 개 = 1회) · 끄기',async()=>{
 const f=(tid,oid,min,coin='ETH')=>({coin,side:'B',sz:'1',px:'3000',startPosition:String(tid===31?0:tid-31),time:D0+min*MIN,tid,oid,dir:'Open Long'});
 const mm=mkModel({mainRawFills:[f(31,7001,40),f(32,7001,40.1),f(33,7002,42,'BTC')]});
 const {tg,m}=mkMag(mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_OPEN_ALERT:'0',MAG_REFILL_ALERT:'0'}));
 await m.afterCheck(mm,D0+45*MIN);await m.afterCheck(mm,D0+46*MIN);
 assert.equal(tg.sent.length,2);assert.match(tg.sent[0],/^⚠️ \[금고에서 거래\] 주계정에서 진입\n\n체결: ETH 롱 진입 1 @ 3000 외 1건 · 09:40 KST\n탄창: 1R-1/);assert.match(tg.sent[1],/BTC 롱/);
 const off=mkMag(mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_OPEN_ALERT:'0',MAG_REFILL_ALERT:'0',MAG_VAULT_ALERT:'0'}));await off.m.afterCheck(mm,D0+45*MIN);assert.equal(off.tg.sent.length,0);
});

test('09:00 점검: 09:10 KST 뒤 첫 확인에 목표 ±10% 밖이면 1회 · 안이면 조용히 기록(나중에 잔고 줄어도 안 보냄) · 마감값 확인 중이면 보류 · 12:00 KST 뒤 안 함',async()=>{
 const cfg=mg.magConfig({MAG_EMPTY_ALERT:'0',MAG_REFILL_ALERT:'0',MAG_VAULT_ALERT:'0'});
 let x=mkMag(cfg);await x.m.afterCheck(mkModel({t:D0+5*MIN,balSum:0}),D0+5*MIN);assert.equal(x.tg.sent.length,0,'09:05 = 아직');
 await x.m.afterCheck(mkModel({t:D0+11*MIN,balSum:150}),D0+11*MIN);assert.equal(x.tg.sent.length,1);
 assert.match(x.tg.sent[0],/^🔔 탄창 09:00 점검 · 목표와 다름\n\n탄창 잔고: 150\.00 USDC\n목표: 201\.00 USDC = 직전 마감 10,050\.00 USDC × 2%\n차이: −51\.00 USDC \(−25\.4%\)|차이: −51\.00 USDC \(-25\.4%\)/);
 assert.match(x.tg.sent[0],/HL에서 주계정 → 탄창으로 51\.00 USDC 이체/);
 await x.m.afterCheck(mkModel({t:D0+20*MIN,balSum:120}),D0+20*MIN);assert.equal(x.tg.sent.length,1,'하루 1회');
 x=mkMag(cfg);await x.m.afterCheck(mkModel({t:D0+11*MIN,balSum:210}),D0+11*MIN);await x.m.afterCheck(mkModel({t:D0+30*MIN,balSum:50}),D0+30*MIN);assert.equal(x.tg.sent.length,0,'±10% 안(+4.5%) → 안내 없음 · 그날 다시 안 봄');
 x=mkMag(cfg);await x.m.afterCheck(mkModel({t:D0+11*MIN,balSum:300}),D0+11*MIN);assert.match(x.tg.sent[0],/초과분은 주계정으로/);
 x=mkMag(cfg);await x.m.afterCheck(mkModel({t:D0+11*MIN,balSum:0,denomPending:true}),D0+11*MIN);assert.equal(x.tg.sent.length,0,'탄창 마감값 확인 중 → 보류');
 await x.m.afterCheck(mkModel({t:D0+12*MIN,balSum:0}),D0+12*MIN);assert.equal(x.tg.sent.length,1,'확인되면 그때 1회');
 x=mkMag(cfg);await x.m.afterCheck(mkModel({t:D0+3*HOUR+MIN,balSum:0}),D0+3*HOUR+MIN);assert.equal(x.tg.sent.length,0,'12:00 KST 뒤 = 안 함');
});

test('복기 알림(remind): 일지 기반이라 앱이 넣은 탄창 거래(sync.v123Sub)도 대상',()=>{
 const ev=(date,price,shares)=>({date,time:'10:00:00',price,shares});
 const J={HL:{from:'2026-11-01',trades:[{id:'hyperliquid:abc:sub11111111:42',name:'BTC',direction:'long',src:'hyperliquid',entries:[ev('2026-11-05',100,1)],fills:[],stop0:95,target:112,entryNote:false,stopNote:true,react:true,tfIn:'ltf',tfOut:'ltf'}]}};
 const r=rm.pick(J,'2026-11-05');assert.equal(r.length,1);assert.deepEqual(r[0].gaps.map(g=>g.k),['entry']);
});

// ---- 서비스 통합(가짜 Supabase·텔레그램·HL) ----
const F=(tid,min,side,sz,start,o={})=>({coin:'BTC',side,sz:String(sz),px:'100',startPosition:String(start),feeToken:'USDC',tid,time:D0+min*MIN,closedPnl:'0',fee:'0',hash:'0x'+tid,dir:side==='B'?'Open Long':'Close Long',oid:tid,crossed:true,...o});
function world(){
 const w={now:D0+2*MIN,mainBal:9800,subBal:250,fills:{[MAIN]:[],[SUB]:[]},ledger:[],pushes:[],alerts:[],calls:[],magSql:'ok',settings:{subs:SUB,ex:null,pct:2,since:D0-DAY_(1)},magCalls:[],
  subPort:[['day',{accountValueHistory:[[D0-20*MIN,'50'],[D0+MIN,'250']]}]]};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:null,orders:[]},acct_us:[],hl_address:MAIN,journal:{HL:{revision:1,unchanged:false,defaultRisk:1,account:3000}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[],acct:[{market:'hl',day:'2026-11-05',value:10000,source:'close',captured_at:D0}],hl:{address:MAIN,fills:[],funding:[],days:[]}});
  if(url.endsWith('/rpc/risk_push')){w.pushes.push(body.p_payload);return J({ok:true});}
  if(url.endsWith('/rpc/mag_status')){w.magCalls.push(body);if(w.magSql==='missing')return J({code:'PGRST202',message:'Could not find the function public.mag_status in the schema cache'},404);
   return J({ok:true,version:20,main:MAIN,settings:w.settings,env:null,watch:[{address:SUB,active:true,source:'app'}],fills:[],funding:[]});}
  if(/\/rpc\/(revenge_push|flip_push|revenge_data)$/.test(url))return J({ok:true,version:15,orders:[],realized:[],positions:[]});
  if(url.includes('api.telegram.org')){const method=url.split('/').pop();if(method==='sendMessage')w.alerts.push(fromHtml(body.text));return J({ok:true,result:{message_id:1}});}
  if(url==='https://api.hyperliquid.xyz/info'){w.calls.push(body);const u=body.user;
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:String(w.mainBal)},time:Date.now()});case 'perpDexs':return J([null]);
    case 'subAccounts':return J([{name:'Scalping',subAccountUser:SCALP,clearinghouseState:{marginSummary:{accountValue:'999'}},spotState:{balances:[]}},
      {name:'1R-1',subAccountUser:SUB,clearinghouseState:{marginSummary:{accountValue:String(w.subBal)}},spotState:{balances:[]}},{name:'1R-2',subAccountUser:SUB2,clearinghouseState:{marginSummary:{accountValue:'0'}},spotState:{balances:[]}}]);
    case 'userFillsByTime':return J((w.fills[u]||[]).filter(f=>f.time>=body.startTime));case 'userFunding':return J([]);case 'frontendOpenOrders':return J([]);
    case 'userNonFundingLedgerUpdates':return J(u===MAIN?w.ledger.filter(x=>x.time>=body.startTime):[]);case 'portfolio':return J(u===SUB?w.subPort:[]);case 'orderStatus':return J({status:'unknownOid'});}
  }
  return J({message:'not found'},404);};
 return w;
}
const mk=async(w,x={},logs=[])=>{const dir=await mkdtemp(path.join(tmpdir(),'ta20-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();return a;};
const magMsgs=w=>w.alerts.filter(t=>/탄창|금고/.test(t.split('\n')[0]));

test('서비스: 합산 분모(주계정 마감 10,000 + 탄창 마감 50) · 실현손익 주계정+탄창 · 주↔탄창 이체는 입출금 아님(외부 입금만 기록) · 새 알림 4종 각 1회 · 복수매매·방향 전환에 탄창 체결',async()=>{
 const w=world(),logs=[];
 w.ledger.push({time:D0+MIN,hash:'0xa1',delta:{type:'subAccountTransfer',usdc:'200',user:MAIN,destination:SUB}},{time:D0+90*1000,hash:'0xd1',delta:{type:'deposit',usdc:'500'}});
 const a=await mk(w,{},logs);
 let r=await a.check();
 let hl=r.statuses.find(s=>s.market==='HL');
 assert.equal(hl.periods.day.startEquity,10050,'하루 분모 = 주계정 마감 + 탄창 마감');assert.equal(hl.equity.value,10050,'현재 = 주계정 9,800 + 탄창 250');
 assert.deepEqual(hl.mag.subs.map(s=>[s.name,s.bal]),[['1R-1',250]]);assert.equal(hl.mag.target,201);
 const flows=w.pushes.flatMap(p=>p.flows||[]);assert.deepEqual(flows.map(f=>f.kind),['deposit'],'subAccountTransfer는 risk_flows에 안 올림');
 assert.ok(!w.calls.some(c=>c.user===SCALP),'Scalping 주소로는 조회 안 함');assert.equal(w.magCalls[0].p_env,'','.env HL_SUBS 없음 = 빈 목록 전달');
 assert.equal(magMsgs(w).length,0,'09:02 = 아직 점검 전');
 // 09:12 KST: 점검 — 잔고 250 vs 목표 201 → +24% 안내
 w.now=D0+12*MIN;await a.check();assert.equal(magMsgs(w).length,1);assert.match(magMsgs(w)[0],/^🔔 탄창 09:00 점검/);assert.match(magMsgs(w)[0],/초과분은 주계정으로/);
 // 탄창 매매: BTC 롱 −20(수수료 포함) · ETH 한 주문 반전(방향 전환)
 w.fills[SUB].push(F(101,15,'B',1,0,{fee:'0.5'}),F(102,20,'A',1,1,{closedPnl:'-19',fee:'0.5',px:'81'}),
  F(103,16,'B',0.01,0,{coin:'ETH',px:'3000'}),F(104,17,'A',0.02,0.01,{coin:'ETH',px:'3000',dir:'Long > Short',oid:104}));
 w.subBal=230;w.now=D0+21*MIN;r=await a.check();hl=r.statuses.find(s=>s.market==='HL');
 assert.equal(hl.periods.day.pnl,-20,'실현 = 탄창 −20 (주계정 0)');assert.equal(Math.round(hl.periods.day.pct*1e4)/1e4,Math.round(-20/10050*100*1e4)/1e4);
 assert.ok(w.alerts.some(t=>/^🔀|방향 전환 의심/.test(t)&&/ETH/.test(t)),'탄창 체결의 방향 전환도 감지');
 // 장중 재충전 + 금고에서 진입(탄창 손실 청산 8분 뒤 = 복수매매 쿨다운도) + 소진
 w.ledger.push({time:D0+25*MIN,hash:'0xa2',delta:{type:'subAccountTransfer',usdc:'100',user:MAIN,destination:SUB}});
 w.fills[MAIN].push(F(201,28,'B',1,0,{coin:'SOL',px:'150'}));
 w.subBal=12;w.mainBal=9700;w.now=D0+30*MIN;r=await a.check();
 const mm=magMsgs(w);assert.deepEqual(mm.map(t=>t.split('\n')[0]),['🔔 탄창 09:00 점검 · 목표와 다름','🧯 탄창 소진 · 오늘 매매 끝','⚠️ [장중 재충전] 주계정 → 탄창 이체','⚠️ [금고에서 거래] 주계정에서 진입']);
 assert.match(mm[2],/100\.00 USDC → 1R-1 · 09:25 KST/);assert.match(mm[3],/SOL 롱/);
 assert.ok(w.alerts.some(t=>/복수매매 의심/.test(t)&&/SOL/.test(t)&&/BTC/.test(t)),'탄창 BTC 손실 청산 → 8분 뒤 주계정 SOL 진입 = 쿨다운 경고(두 계정 함께)');
 assert.deepEqual([...new Set(w.pushes.flatMap(p=>p.flows||[]).map(f=>f.kind))],['deposit'],'장중 재충전도 입출금 아님(가짜 DB가 저장을 안 돌려줘 같은 입금이 반복 전송됨 — 종류만 비교)');
 const n=w.alerts.length;w.now=D0+31*MIN;await a.check();assert.equal(w.alerts.length,n,'다음 확인에서 같은 사건 다시 안 보냄');
 assert.ok(logs.some(l=>/탄창\(하위계정\) 켜짐/.test(l))===false,'시작 로그는 run()에서만');
});

test('서비스: 탄창 마감값 모르면(portfolio 실패) 분모 = 주계정만 + 표시 · 잔고(subAccounts) 모르면 이번 회차 HL 판정 건너뜀',async()=>{
 const w=world(),logs=[];const real=w.fetcher;
 w.fetcher=async(u,o)=>{const b=o?.body?JSON.parse(o.body):null;if(b?.type==='portfolio')return new Response('{}',{status:500});return real(u,o);};
 const a=await mk(w,{},logs);let r=await a.check();let hl=r.statuses.find(s=>s.market==='HL');
 assert.equal(hl.periods.day.startEquity,10000);assert.equal(hl.mag.denomPending,true);assert.match(a.describe(r.statuses),/탄창 마감값 확인 중\(분모 주계정만\)/);
 const w2=world(),l2=[];const r2=w2.fetcher;w2.fetcher=async(u,o)=>{const b=o?.body?JSON.parse(o.body):null;if(b?.type==='subAccounts')return new Response('{}',{status:500});return r2(u,o);};
 const b=await mk(w2,{},l2);r=await b.check();hl=r.statuses.find(s=>s.market==='HL');
 assert.ok(l2.some(l=>/탄창 잔고를 몰라 이번 회차 HL 판정을 건너뜁니다/.test(l)));assert.ok(!hl||hl.equity===null||hl.equity===undefined||hl.periods);
});

test('서비스: alert20.sql 없음 → .env HL_SUBS 폴백(경고 1회) · 주계정 하위계정이 아닌 주소는 뺌 · MAG=0 = 2.15.0(분모 주계정만·이체 = 출금·subAccounts 조회 없음)',async()=>{
 const w=world(),logs=[];w.magSql='missing';
 const a=await mk(w,{HL_SUBS:`${SUB},${OTHER}`},logs);let r=await a.check();let hl=r.statuses.find(s=>s.market==='HL');
 assert.equal(hl.periods.day.startEquity,10050);assert.equal(hl.mag.source,'env');
 assert.equal(logs.filter(l=>/alert20\.sql이 아직 없습니다/.test(l)).length,1);assert.ok(logs.some(l=>/하위계정 목록에 없어 뺍니다/.test(l)));
 const w2=world();w2.ledger.push({time:D0+MIN,hash:'0xa1',delta:{type:'subAccountTransfer',usdc:'200',user:MAIN,destination:SUB}});
 const b=await mk(w2,{MAG:'0'});r=await b.check();hl=r.statuses.find(s=>s.market==='HL');
 assert.equal(hl.periods.day.startEquity,10000);assert.equal(hl.mag,undefined);assert.deepEqual(w2.pushes.flatMap(p=>p.flows||[]).map(f=>f.kind),['subAccountTransfer']);
 assert.ok(!w2.calls.some(c=>c.type==='subAccounts'));assert.equal(w2.magCalls.length,0);
});

test('--mag-dry(= --dry): 오늘 탄창 상태·목표·보낼 알림 미리 보기 · 보내지 않음',async()=>{
 const w=world();w.now=D0+12*MIN;const lines=[];const dir=await mkdtemp(path.join(tmpdir(),'ta20d-'));
 const code=await magDry(['--dry'],env(dir),()=>{},{fetcher:w.fetcher,now:()=>w.now,out:l=>lines.push(l)});
 assert.equal(code,0);const t=lines.join('\n');
 assert.match(t,/^탄창 드라이런 \(보내지 않음 · 저장 안 함\) · HL 하루 2026-11-06/);assert.match(t,/목록: 1R-1 0x1111…1111 · 출처 앱 설정\(v123Subs\)/);
 assert.match(t,/1R-1 0x1111…1111 잔고 250\.00 USDC/);assert.match(t,/목표 201\.00 USDC = 직전 마감\(주계정\+탄창\) 10,050\.00 USDC × 2%/);
 assert.match(t,/지금 조건이면 보낼 알림 1건/);assert.match(t,/🔔 탄창 09:00 점검/);assert.match(t,/HL 오늘 한도: .* 분모 10050\.00 USDC \(주계정 \+ 탄창\)/);assert.match(t,/보내지 않았습니다/);
 assert.equal(w.alerts.length,0,'텔레그램 안 보냄');assert.equal(w.pushes.length,0,'저장 안 함');assert.ok(w.magCalls.length>0&&w.magCalls.every(c=>c.p_env===null),'드라이런은 .env 목록도 Supabase에 안 씀');
 const off=[];assert.equal(await magDry(['--mag-dry'],env(dir,{MAG:'0'}),()=>{},{fetcher:w.fetcher,now:()=>w.now,out:l=>off.push(l)}),0);assert.match(off.join(),/MAG=0/);
});
