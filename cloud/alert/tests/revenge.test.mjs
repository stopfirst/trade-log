// alert15(trade-alert 2.11.0) — 복수매매 차단 알림: 설정, 쿨다운 경계(15분), HL UTC·US ET 날짜, 이익 청산 뒤 미경고, 하루 3연패,
// 위험 증가(명목·스탑), US 손절 후 갈아타기 버튼·콜백, 같은 진입 1회·재시작 뒤 재발송 없음, alert15.sql 없을 때, 서비스 통합, --revenge-dry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fromHtml} from '../src/format.mjs';
import {Alerter,readConfig,revengeDry,VERSION} from '../src/alert.mjs';
import * as rv from '../src/revenge.mjs';
import * as Q from '../src/quick.mjs';
import * as src from '../src/sources.mjs';
import {usCalendar,hlCalendar,kstWall,etWall} from '../src/calendar.mjs';

const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),ADDR='0x'+'c'.repeat(40),CHAT='987654321';
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:CHAT,ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',QUICK_REVIEW:'0',REVIEW_REMIND:'0',...x});
const MIN=60000,HOUR=3600000;
const CFG=rv.revengeConfig({});
const utcDay=ms=>new Date(ms).toISOString().slice(0,10);
const USC=usCalendar();
const C=(o)=>({market:'HL',key:'hl:c'+o.time,seg:'HL:'+(o.symbol||'BTC')+':'+(o.time-MIN),symbol:'BTC',dir:'long',pnl:-10,notional:1000,stopRisk:null,tid:'c'+o.time,...o});
const E=(o)=>({market:'HL',key:'hl:e'+o.time,seg:'HL:'+(o.symbol||'ETH')+':'+o.time,symbol:'ETH',dir:'long',notional:500,stopRisk:null,tid:'e'+o.time,...o});
const T0=Date.parse('2026-11-01T03:00:00Z'); // 11/01 12:00 KST · UTC 11/01

test('버전 2.11.0 · 설정 기본값(켜짐·15분·3연패) · 끄기 · 형식 오류는 CONFIG_INCOMPLETE',()=>{
 assert.equal(VERSION,'2.15.0');
 const c=readConfig(env('/tmp')).revenge;assert.deepEqual([c.enabled,c.cooldownMin,c.streakMax,c.usSwitch,c.riskUp,c.minLoss],[true,15,3,true,true,0]);
 assert.equal(readConfig(env('/tmp',{REVENGE_ALERT:'0'})).revenge.enabled,false);
 const d=readConfig(env('/tmp',{REVENGE_COOLDOWN_MIN:'30',DAILY_LOSS_STREAK_MAX:'0',REVENGE_US_SWITCH:'0'})).revenge;assert.deepEqual([d.cooldownMin,d.streakMax,d.usSwitch],[30,0,false]);
 for(const [k,v] of [['REVENGE_COOLDOWN_MIN','abc'],['REVENGE_COOLDOWN_MIN','999'],['DAILY_LOSS_STREAK_MAX','2.5'],['REVENGE_ALERT','maybe'],['REVENGE_MIN_LOSS_USD','-1']])
  assert.throws(()=>readConfig(env('/tmp',{[k]:v})),e=>e.message==='CONFIG_INCOMPLETE'&&e.fields.some(f=>f.startsWith(k)),k+'='+v);
});

test('쿨다운 경계(앱 v99와 같이 포함): 손실 청산 → 15분 정각까지 경고, 15분 1초는 아님 · 0이면 끔',()=>{
 const loss=C({time:T0});
 const j=t=>rv.judge({closes:[loss],entries:[E({time:t})]},CFG,utcDay).alerts;
 assert.deepEqual(j(T0+15*MIN-1000)[0].kinds,['cooldown']);assert.equal(Math.floor(j(T0+15*MIN-1000)[0].minutes),14);
 assert.deepEqual(j(T0+15*MIN)[0].kinds,['cooldown'],'15분 정각 = 쿨다운 안(경계 포함)');
 assert.equal(j(T0+15*MIN+1000).filter(a=>a.kinds.includes('cooldown')).length,0,'15분 1초 = 밖');
 assert.equal(j(T0).length,1,'같은 시각(방향 전환 등)도 쿨다운 안');
 assert.equal(rv.judge({closes:[loss],entries:[E({time:T0+MIN})]},{...CFG,cooldownMin:0},utcDay).alerts.filter(a=>a.kinds.includes('cooldown')).length,0);
 assert.equal(rv.judge({closes:[loss],entries:[E({time:T0-1})]},CFG,utcDay).alerts.length,0,'청산 전 진입은 무관');
});

test('이익 청산 뒤에는 경고 없음 · 기준은 진입 전 마지막 손실 청산(사이에 이익 청산이 있어도 15분 안이면 경고, 앱 v99와 같음) · 손익 0도 손실 아님',()=>{
 const j=closes=>rv.judge({closes,entries:[E({time:T0+5*MIN,notional:99999})]},CFG,utcDay).alerts;
 assert.equal(j([C({time:T0,pnl:25})]).length,0);
 assert.deepEqual(j([C({time:T0-2*MIN,pnl:-50,symbol:'SOL'}),C({time:T0,pnl:3})])[0].kinds,['cooldown','risk_up'],'손실(7분 전) → 이익 → 진입: 기준은 마지막 손실 청산');
 assert.equal(j([C({time:T0-20*HOUR,pnl:3}),C({time:T0,pnl:4})]).length,0,'이익 청산만 있으면 없음');
 assert.equal(j([C({time:T0,pnl:0})]).length,0);
 assert.equal(rv.judge({closes:[C({time:T0,pnl:-0.5})],entries:[E({time:T0+MIN})]},{...CFG,minLoss:1},utcDay).alerts.length,0,'REVENGE_MIN_LOSS_USD=1 → −$0.50은 손실로 안 봄');
});

test('하루 연속 손실 청산 3회(HL UTC 00:00 경계): 오늘은 여기까지 1회 + 그날 이후 진입마다(이익 청산 뒤에도) 위반 · 다음 UTC 날은 리셋',()=>{
 const d0=Date.parse('2026-11-01T00:00:00Z'); // = 11/01 09:00 KST
 const closes=[C({time:d0-20*MIN,symbol:'A'}),C({time:d0-10*MIN,symbol:'B'}),C({time:d0+10*MIN,symbol:'C'})]; // 2개는 10/31 UTC
 assert.equal(rv.judge({closes,entries:[]},CFG,utcDay).stops.length,0,'UTC 날짜가 갈리면 3연패 아님');
 const same=[C({time:d0+MIN,symbol:'A'}),C({time:d0+2*MIN,symbol:'B',pnl:-20}),C({time:d0+3*MIN,symbol:'C',pnl:-30}),C({time:d0+4*HOUR,symbol:'D',pnl:+80})];
 const r=rv.judge({closes:same,entries:[E({time:d0+2.5*MIN}),E({time:d0+3*HOUR}),E({time:d0+5*HOUR}),E({time:d0+24*HOUR+MIN})]},CFG,utcDay);
 assert.equal(r.stops.length,1);assert.equal(r.stops[0].day,'2026-11-01');assert.equal(r.stops[0].losses.length,3);assert.equal(r.stops[0].at,d0+3*MIN);
 const k=r.alerts.map(a=>[a.entry.time,a.kinds.includes('streak')]);
 assert.deepEqual(k.filter(x=>x[1]).map(x=>x[0]),[d0+3*HOUR,d0+5*HOUR],'도달 뒤 진입만(이익 청산 뒤인 5시간째도) · 다음 날은 아님');
 assert.equal(rv.judge({closes:[C({time:d0+MIN}),C({time:d0+2*MIN,pnl:5}),C({time:d0+3*MIN}),C({time:d0+4*MIN})],entries:[]},CFG,utcDay).stops.length,0,'2.15.0 손-이-손-손 = 이익에서 리셋 → 연속 2회 → 없음');
 assert.equal(rv.judge({closes:[C({time:d0+MIN}),C({time:d0+2*MIN,pnl:5}),C({time:d0+3*MIN}),C({time:d0+4*MIN})],entries:[]},{...CFG,streakMode:'count'},utcDay).stops[0].at,d0+4*MIN,'count 모드 = 2.14.0 횟수(중간 이익 있어도 3번째 손실에서)');
 assert.equal(rv.judge({closes:same,entries:[]},{...CFG,streakMax:0},utcDay).stops.length,0,'0이면 끔');
 const txt=rv.stopText(r.stops[0],USC);assert.match(txt,/^🛑 \[오늘은 여기까지\] 🟦 하이퍼리퀴드 · 오늘 연속 손실 3회/);
 assert.match(rv.stopText(rv.judge({closes:same,entries:[]},{...CFG,streakMode:'count'},utcDay).stops[0],USC),/· 오늘 손실 청산 3회/,'count 모드는 2.14.0 문구');assert.match(txt,/UTC 11\/01/);assert.match(txt,/리셋: 11\/02 09:00 KST/);
});

test('US 날짜(ET 장 마감 16:00 경계): 손절한 거래일 안의 다른 종목 매수 = 갈아타기, 16:00 ET 뒤는 다음 거래일',()=>{
 const loss={market:'US',key:'us:k1',seg:'US:TSLA:1',symbol:'TSLA',dir:'long',time:etWall('2026-10-30',15,50),pnl:-85.2,notional:2000,orderKey:'k1'};
 const ent=(sym,t)=>({market:'US',key:'us:'+sym+t,seg:'US:'+sym+':'+t,symbol:sym,dir:'long',time:t,notional:1000,orderKey:sym+t});
 const dayOf=ms=>USC.dayOf(ms);
 let a=rv.judge({closes:[loss],entries:[ent('NVDA',etWall('2026-10-30',15,58))]},CFG,dayOf).alerts[0];
 assert.deepEqual(a.kinds,['cooldown','switch']);assert.equal(a.switchFrom.symbol,'TSLA');assert.equal(a.day,'2026-10-30');
 a=rv.judge({closes:[loss],entries:[ent('NVDA',etWall('2026-10-30',16,3))]},CFG,dayOf).alerts[0];
 assert.deepEqual(a.kinds,['cooldown'],'16:03 ET = 11/02(월) 거래일 → 갈아타기 아님(쿨다운만)');
 assert.equal(rv.judge({closes:[loss],entries:[ent('TSLA',etWall('2026-10-30',15,59))]},CFG,dayOf).alerts[0].kinds.includes('switch'),false,'같은 종목 재진입은 갈아타기 아님');
 assert.equal(rv.judge({closes:[{...loss,time:etWall('2026-10-30',10,0)}],entries:[ent('AMD',etWall('2026-10-30',14,0))]},CFG,dayOf).alerts[0].kinds.join(),'switch','쿨다운 밖이어도 같은 날이면 갈아타기');
});

test('위험 증가: 명목 비교 · 스탑 위험이 둘 다 있으면 스탑 기준 · 같은 날 손실 다음(쿨다운 밖)도 · 다른 날은 아님',()=>{
 const last=C({time:T0,notional:3000,stopRisk:60});
 const one=e=>rv.judge({closes:[last],entries:[e]},CFG,utcDay).alerts[0];
 let a=one(E({time:T0+5*MIN,notional:5000}));assert.deepEqual(a.kinds,['cooldown','risk_up']);assert.equal(a.risk.basis,'notional');assert.equal(a.risk.now,5000);
 a=one(E({time:T0+5*MIN,notional:9000,stopRisk:40}));assert.deepEqual(a.kinds,['cooldown'],'스탑 위험 40 < 60이면 명목이 커도 아님');
 a=one(E({time:T0+5*MIN,notional:1000,stopRisk:90}));assert.equal(a.risk.basis,'stop');assert.equal(a.risk.ratio,1.5);
 a=one(E({time:T0+3*HOUR,notional:5000}));assert.deepEqual(a.kinds,['risk_up'],'같은 UTC 날 손실 다음');
 assert.equal(rv.judge({closes:[last],entries:[E({time:T0+22*HOUR,notional:5000})]},CFG,utcDay).alerts.length,0,'다음 UTC 날은 아님');
 const two=rv.judge({closes:[last],entries:[E({time:T0+2*HOUR,notional:100,symbol:'SOL'}),E({time:T0+3*HOUR,notional:5000})]},CFG,utcDay).alerts;
 assert.equal(two.length,0,'쿨다운 밖에서는 손실 뒤 첫 진입만 비교(앱 v99 next) — 두 번째 진입은 아님');
 assert.equal(one(E({time:T0+5*MIN,notional:3000})).kinds.includes('risk_up'),false,'같으면 아님');
 const txt=rv.entryText(one(E({time:T0+5*MIN,notional:5000,symbol:'ETH'})),CFG,USC);
 assert.match(txt,/^🚨🔥 \[복수매매 의심 · 위험 증가\] 🟦 하이퍼리퀴드 · ETH 롱 진입/);assert.match(txt,/직전 손실: BTC 롱 −\$10\.00 · 청산 11\/01 12:00 KST/);
 assert.match(txt,/경과 5분 \(쿨다운 15분 안\)/);assert.match(txt,/🔥 명목 금액 \$5,000 > 직전 손실 거래 \$3,000 \(×1\.67\)/);assert.match(txt,/지금 크기를 줄이거나 정리하세요/);
 const plain=rv.entryText(one(E({time:T0+5*MIN,notional:100})),CFG,USC);assert.match(plain,/^🚨 \[복수매매 의심\] /);
});

const F=(tid,time,side,sz,start,o={})=>({coin:'BTC',side,sz:String(sz),px:'60000',startPosition:String(start),feeToken:'USDC',tid,time,closedPnl:'0',fee:'0',hash:'0x'+tid,dir:'x',oid:tid,...o});
test('HL 체결 → 구간: 새 진입(0에서·방향 전환), 추가는 진입 아님, 범위 밖 시작 구간은 진입 판단 안 함, 손익 = detectCloses(펀딩 포함)',()=>{
 const t=T0;
 const fills=[F(1,t-9*MIN,'A',1,1,{closedPnl:'-5'}), // 범위 밖에서 시작한 롱 청산
  F(2,t-8*MIN,'B',1,0),F(3,t-7*MIN,'B',1,1),F(4,t-6*MIN,'A',3,2,{closedPnl:'-40',fee:'1'}), // 롱 2 → 방향 전환 숏 1
  F(5,t-5*MIN,'B',1,-1,{closedPnl:'7'}),F(6,t-4*MIN,'B',0.5,0,{coin:'ETH',px:'3000'}),F(7,t-3*MIN,'A',0.5,0,{coin:'@107'})];
 const segs=rv.hlSegments(fills);
 assert.deepEqual(segs.map(s=>[s.symbol,s.dir,s.openTime&&s.openTime-t,s.closed]),[['BTC','long',null,true],['BTC','long',-8*MIN,true],['BTC','short',-6*MIN,true],['ETH','long',-4*MIN,false]]);
 assert.equal(segs[1].maxNotional,120000);assert.equal(segs[1].avgEntry,60000);
 const closes=new Map(Q.detectCloses(fills,[{time:t-7.5*MIN,delta:{coin:'BTC',usdc:'-2'}}]).map(c=>[c.tid,c]));
 const ev=rv.hlEvents(fills,closes,{});
 assert.deepEqual(ev.entries.map(e=>[e.symbol,e.dir,e.key]),[['BTC','long','hl:2'],['BTC','short','hl:4'],['ETH','long','hl:6']]);
 assert.deepEqual(ev.closes.map(c=>[c.key,c.pnl]),[['hl:1',-5],['hl:4',-42.666667],['hl:5',6.666667]],'방향 전환 체결 수수료는 청산·진입 몫으로 나눔(detectCloses와 같음)');
 const stops=rv.hlStopRisks(segs,[{coin:'ETH',side:'A',isTrigger:true,orderType:'Stop Market',triggerPx:'2900'},{coin:'ETH',side:'A',isTrigger:true,orderType:'Take Profit Market',triggerPx:'3300'}]);
 assert.deepEqual(stops,{[`HL:ETH:${t-4*MIN}`]:50},'열린 ETH 롱 0.5 × (3000 − 2900) = $50 (익절 주문 무시)');
 const j=rv.judge(ev,CFG,utcDay);assert.deepEqual(j.alerts.map(a=>[a.entry.key,a.kinds.join()]),[['hl:2','cooldown,risk_up'],['hl:4','cooldown'],['hl:6','cooldown']],'방향 전환 진입 = 같은 체결 손실 청산 기준 0분 · ETH는 사이에 이익 청산(hl:5)이 있어도 마지막 손실(hl:4) 2분 뒤');
});

const O=(key,date,time,side,qty,price,symbol)=>({key,orderDate:date,time,side,qty:String(qty),price:String(price),symbol});
test('US 키움 주문 → 구간 · 손절 판정: 종목별 실현(pl_amt) 우선, 없으면 평균단가 추정, 기간 전 보유분은 실현 없으면 판단 안 함',()=>{
 const d='2026-10-31'; // 한국 조회일(미국 10/30 장)
 const orders=[O('a',d,'22:40:00','매수',10,210,'TSLA'),O('b',d,'23:41:00','매도',10,200,'TSLA'),O('c',d,'23:45:00','매수',5,180,'NVDA'),O('e',d,'23:50:00','매도',3,50,'OLD')];
 const fills=src.usFills(orders);
 let ev=rv.usEvents(fills,[{symbol:'NVDA',quantity:5},{symbol:'OLD',quantity:2}],[{date:d,symbol:'TSLA',quantity:'10',averageBuyPrice:'210',reportedNet:'-101.5',commission:'1.5',tax:'0'}]);
 assert.deepEqual(ev.closes.map(c=>[c.symbol,c.pnl,c.estimated]),[['TSLA',-101.5,false]],'OLD(기간 전 5주 보유 → 3주 매도, 아직 보유)는 청산 아님');
 assert.deepEqual(ev.entries.map(e=>[e.symbol,e.notional]),[['TSLA',2100],['NVDA',900]]);
 const j=rv.judge(ev,CFG,ms=>USC.dayOf(ms));assert.deepEqual(j.alerts.map(a=>[a.entry.symbol,a.kinds.join()]),[['NVDA','cooldown,switch']]);
 ev=rv.usEvents(fills,[{symbol:'NVDA',quantity:5},{symbol:'OLD',quantity:2}],null);
 assert.deepEqual(ev.closes.map(c=>[c.symbol,c.pnl,c.estimated]),[['TSLA',-100,true]],'실현 행 없으면 평균단가 추정(수수료 제외)');
 ev=rv.usEvents(src.usFills([O('x',d,'23:00:00','매도',4,90,'OLD')]),[],null);assert.equal(ev.closes.length,0,'기간 전 보유분 전량 매도 + 실현 없음 → 손익 모름');
 ev=rv.usEvents(src.usFills([O('x',d,'23:00:00','매도',4,90,'OLD')]),[],[{date:d,symbol:'OLD',quantity:'4',averageBuyPrice:'100',reportedNet:'-41',commission:'1',tax:'0'}]);assert.deepEqual(ev.closes.map(c=>c.pnl),[-41],'실현 행이 있으면 기간 전 보유분도 판정');
});

test('갈아타기 메시지: 버튼 2개(callback ≤ 64바이트) · 답한 뒤 버튼 없음 · 강해 보여서 문구',()=>{
 const it={id:rv.shortId('rv:us:2026-10-31:NVDA:0001'),ref:'rv:us:2026-10-31:NVDA:0001',symbol:'NVDA',time:etWall('2026-10-30',15,58),day:'2026-10-30',from:{symbol:'TSLA',pnl:-85.2,time:etWall('2026-10-30',15,50)},why:null};
 let v=rv.switchView(it);assert.match(v.text,/^🔁 \[손절 후 종목 갈아타기\] 🇺🇸 미국주식 · NVDA 매수/);assert.match(v.text,/오늘\(미국 10\/30 거래일\) 손절: TSLA −\$85\.20/);
 assert.deepEqual(v.reply_markup.inline_keyboard[0].map(b=>b.text),['미리 정한 가격','강해 보여서']);for(const b of v.reply_markup.inline_keyboard[0])assert.ok(Buffer.byteLength(b.callback_data)<=64);
 assert.match(v.reply_markup.inline_keyboard[0][1].callback_data,/^rv\|[a-z0-9]{1,16}\|s$/);
 v=rv.switchView({...it,why:'strong',saved:true});assert.equal(v.reply_markup.inline_keyboard.length,0);assert.match(v.text,/기록: 강해 보여서 — 10월에 반복된 패턴/);
});

// ---- 서비스 통합(가짜 Supabase·텔레그램·HL) ----
function world(){
 const w={now:T0,fills:[],orders:[],positions:[],realized:[],rvSql:'ok',rvPush:[],rvFail:false,alerts:[],tg:[],tgCalls:[],updates:[],openOrders:[],dataCalls:0};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:w.orders.length?{date:'2026-10-31',as_of:w.now,summary:null,positions:w.positions}:null,orders:w.orders},acct_us:[],hl_address:ADDR,journal:{HL:{revision:1,unchanged:false,defaultRisk:1,account:3000}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[],acct:[],hl:{address:ADDR,fills:[],funding:[],days:[]}});
  if(url.endsWith('/rpc/risk_push'))return J({ok:true});
  if(url.endsWith('/rpc/revenge_push')||url.endsWith('/rpc/revenge_data')){if(w.rvSql==='missing')return J({code:'PGRST202',message:'Could not find the function in the schema cache'},404);
   if(url.endsWith('/rpc/revenge_data')){w.dataCalls++;return J({ok:true,version:15,orders:w.orders,realized:w.realized,positions:w.positions});}
   if(w.rvFail)return J({message:'x'},503);assert.equal(body.p_token,TOKEN);w.rvPush.push(body.p_payload);return J({ok:true,version:15});}
  if(url.includes('api.telegram.org')){const method=url.split('/').pop();w.tgCalls.push({method,body});
   if(method==='getUpdates'){const u=w.updates.splice(0);return J({ok:true,result:u});}
   if(method==='sendMessage'){if(!body.reply_markup){w.alerts.push(fromHtml(body.text));return J({ok:true,result:{message_id:1}});}w.tg.push(body.text);return J({ok:true,result:{message_id:100+w.tg.length}});}
   return J({ok:true,result:true});}
  if(url==='https://api.hyperliquid.xyz/info'){
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:'20000'},time:Date.now()});case 'perpDexs':return J([null]);
    case 'userFillsByTime':return J(w.fills.filter(f=>f.time>=body.startTime));case 'userFunding':return J([]);case 'frontendOpenOrders':return J(w.openOrders);
    case 'userNonFundingLedgerUpdates':return J([]);case 'portfolio':return J([]);}
  }
  return J({message:'not found'},404);};
 return w;
}
const mk=async(w,x={},logs=[],dir=null)=>{dir=dir||await mkdtemp(path.join(tmpdir(),'ta15-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();return a;};
const rvMsgs=w=>w.alerts.filter(t=>/복수매매|오늘은 여기까지|위험 증가/.test(t));

test('서비스: 설치 뒤 HL 손실 청산 → 6분 뒤 더 큰 진입 = [복수매매 의심 · 위험 증가] 1회 · 같은 진입 다시 안 보냄 · 재시작 뒤에도 · 기록 revenge_push',async()=>{
 const w=world(),logs=[];const a=await mk(w,{},logs);
 w.fills.push(F(1,T0-3*HOUR,'B',1,0),F(2,T0-2.9*HOUR,'A',1,1,{closedPnl:'-80'}),F(3,T0-2.85*HOUR,'B',2,0,{coin:'ETH'})); // 설치 전 → 안 보냄
 await a.check();assert.equal(rvMsgs(w).length,0,'설치 전 체결은 보내지 않음');assert.equal(a.state.rv.since,T0);
 w.now+=10*MIN;w.fills.push(F(4,w.now-9*MIN,'B',0.5,0,{coin:'SOL',px:'200'}),F(5,w.now-8*MIN,'A',0.5,0.5,{coin:'SOL',px:'190',closedPnl:'-5',fee:'0.1'}),F(6,w.now-2*MIN,'B',30,0,{coin:'DOGE',px:'0.2'}),F(7,w.now-1*MIN,'B',5,0,{coin:'AVAX',px:'30'}));
 await a.check();
 const m=rvMsgs(w);assert.equal(m.length,2,'DOGE·AVAX 진입 각 1회');
 assert.match(m[0],/^🚨 \[복수매매 의심\] 🟦 하이퍼리퀴드 · DOGE 롱 진입/);assert.match(m[0],/직전 손실: SOL 롱 −\$5\.10/);assert.match(m[0],/경과 6분 \(쿨다운 15분 안\)/);
 assert.match(m[1],/^🚨🔥 \[복수매매 의심 · 위험 증가\] 🟦 하이퍼리퀴드 · AVAX 롱 진입/,'AVAX 명목 $150 > SOL 최대 $100');
 assert.equal(w.rvPush.length>=1,true);const items=w.rvPush.flatMap(p=>p.items||[]);assert.deepEqual(items.map(i=>[i.ref,i.kinds.join()]),[['rv:hl:6','cooldown'],['rv:hl:7','cooldown,risk_up']]);
 assert.equal(items[0].entry_key,'6');assert.equal(items[0].prev_key,'5');assert.equal(items[0].prev_pnl,-5.1);assert.equal(items[0].minutes,6);
 w.now+=MIN;await a.check();assert.equal(rvMsgs(w).length,2,'다시 안 보냄');
 const saved=JSON.parse(await readFile(path.join(a.cfg.stateDir,'state2.json'),'utf8'));assert.ok(saved.rv.sent['entry:hl:6']);
 const b=await mk(w,{},[],a.cfg.stateDir);w.now+=MIN;await b.check();assert.equal(rvMsgs(w).length,2,'재시작 뒤에도 다시 안 보냄');
 assert.ok(logs.some(l=>/alert15\.sql 확인/.test(l)));
});

test('서비스: 하루 연속 손실 청산 3회 → 오늘은 여기까지 1회 → 그 뒤 진입은 [오늘은 여기까지 위반] · REVENGE_ALERT=0이면 아무것도 안 함',async()=>{
 const w=world();const a=await mk(w);await a.check();
 w.now+=60*MIN;const t=w.now;
 w.fills.push(F(11,t-50*MIN,'B',1,0,{coin:'A'}),F(12,t-49*MIN,'A',1,1,{coin:'A',closedPnl:'-10'}),F(13,t-40*MIN,'B',1,0,{coin:'B'}),F(14,t-39*MIN,'A',1,1,{coin:'B',closedPnl:'-10'}),
  F(15,t-30*MIN,'B',1,0,{coin:'C'}),F(16,t-29*MIN,'A',1,1,{coin:'C',closedPnl:'-10'}),F(17,t-1*MIN,'B',0.1,0,{coin:'D'}));
 await a.check();const m=rvMsgs(w);
 assert.equal(m.filter(x=>/^🛑 \[오늘은 여기까지\]/.test(x)).length,1);
 const last=m.find(x=>/· D 롱 진입/.test(x));assert.match(last,/^⛔ \[오늘은 여기까지 위반\]/);assert.match(last,/연속 손실 3회 뒤 진입 — 오늘은 여기까지 규칙 위반/);
 assert.ok(m.find(x=>/· C 롱 진입/.test(x)),'C 진입(B 손실 뒤 9분)은 쿨다운 경고');
 w.now+=MIN;await a.check();assert.equal(rvMsgs(w).length,m.length,'다시 안 보냄');
 const w2=world();const b=await mk(w2,{REVENGE_ALERT:'0'});assert.equal(b.revenge,null);await b.check();w2.now+=MIN;w2.fills.push(...w.fills.map(f=>({...f,time:w2.now-(t-f.time)})));await b.check();assert.equal(rvMsgs(w2).length,0);assert.equal(w2.rvPush.length,0);
});

test('서비스: US 손절한 날 다른 종목 매수 → 갈아타기 버튼 → [강해 보여서] → revenge_push answers · 메시지 수정 · 다시 누르면 이미 기록 · 다른 대화방 무시',async()=>{
 const w=world();const a=await mk(w);
 const d=new Date(T0+9*HOUR).toISOString().slice(0,10);await a.check();
 w.now+=30*MIN;const kt=ms=>new Date(ms+9*HOUR).toISOString().slice(11,19);
 w.orders=[O(d+':TSLA:1',d,kt(w.now-20*MIN),'매수',10,210,'TSLA'),O(d+':TSLA:2',d,kt(w.now-10*MIN),'매도',10,200,'TSLA'),O(d+':NVDA:3',d,kt(w.now-2*MIN),'매수',5,180,'NVDA')];
 w.positions=[{symbol:'NVDA',quantity:'5'}];w.realized=[{date:d,symbol:'TSLA',quantity:'10',averageBuyPrice:'210',reportedNet:'-101.5',commission:'1.5',tax:'0'}];
 await a.check();
 assert.equal(w.tg.length,1);assert.match(w.tg[0],/^🔁 \[손절 후 종목 갈아타기\] 🇺🇸 미국주식 · NVDA 매수/);assert.match(w.tg[0],/손절: TSLA −\$101\.50/);
 const main=rvMsgs(w);assert.equal(main.length,1);assert.match(main[0],/^🚨 \[복수매매 의심\] 🇺🇸 미국주식 · NVDA 매수/);assert.match(main[0],/직전 손실: TSLA 매도 −\$101\.50/);
 const send=w.tgCalls.find(c=>c.method==='sendMessage'&&c.body.reply_markup);const [bp,bs]=send.body.reply_markup.inline_keyboard[0];
 assert.ok(w.dataCalls>=1,'revenge_data로 종목별 실현');
 // 받기 루프(QUICK_REVIEW=0이어도 복수매매 켜져 있으면 run()이 poller를 만듦) — 여기선 직접 구성
 const poller=new Q.QuickReview({tg:a.tg,rpc:a.rpc,token:TOKEN,chat:CHAT,log:()=>{},now:()=>w.now,state:()=>a.state,save:()=>a.persist()});poller.onCallback=cq=>a.revenge.handle(cq);
 const cq=(data,{chat=CHAT,id='q1',msg=101}={})=>({update_id:0,callback_query:{id,data,from:{id:1},message:{message_id:msg,chat:{id:Number(chat)}}}});
 w.updates.push({...cq(bs.callback_data,{chat:'111'}),update_id:10});await poller.pollOnce(0);
 assert.match(w.tgCalls.filter(c=>c.method==='answerCallbackQuery').at(-1).body.text,/사용할 수 없습니다/);
 w.updates.push({...cq(bs.callback_data),update_id:11});await poller.pollOnce(0);
 const ans=w.rvPush.flatMap(p=>p.answers||[]);assert.deepEqual(ans.map(x=>[x.ref,x.why,x.why_label]),[[`rv:us:${d}:NVDA:3`,'strong','강해 보여서']]);
 const ed=w.tgCalls.filter(c=>c.method==='editMessageText').at(-1);assert.equal(ed.body.message_id,101);assert.match(ed.body.text,/기록: 강해 보여서/);assert.equal(ed.body.reply_markup.inline_keyboard.length,0);
 w.updates.push({...cq(bp.callback_data),update_id:12});await poller.pollOnce(0);assert.match(w.tgCalls.filter(c=>c.method==='answerCallbackQuery').at(-1).body.text,/이미 기록/);
 w.updates.push({...cq('rv|zzzz|p'),update_id:13},{...cq('qr|5|c'),update_id:14});await poller.pollOnce(0);
 const toasts=w.tgCalls.filter(c=>c.method==='answerCallbackQuery').slice(-2).map(c=>c.body.text);assert.match(toasts[0],/지난 질문입니다$/);assert.match(toasts[1],/앱에서 복기/,'qr| 버튼은 즉시 복기 처리기로');
 const items=w.rvPush.flatMap(p=>p.items||[]);assert.deepEqual(items.map(i=>[i.ref,i.kinds.join(),i.entry_key,i.entry_date]),[[`rv:us:${d}:NVDA:3`,'cooldown,switch',`${d}:NVDA:3`,d]]);
});

test('서비스: alert15.sql 없음 → 텔레그램은 그대로·로그 1회·기록은 대기열(서버) → 설치되면 밀린 기록 올림 · 버튼 답도 서버에 보관',async()=>{
 const w=world(),logs=[];w.rvSql='missing';const a=await mk(w,{},logs);await a.check();
 w.now+=10*MIN;w.fills.push(F(21,w.now-9*MIN,'B',1,0),F(22,w.now-8*MIN,'A',1,1,{closedPnl:'-3'}),F(23,w.now-MIN,'B',1,0,{coin:'ETH'}));
 await a.check();assert.equal(rvMsgs(w).length,1);assert.equal(logs.filter(l=>/alert15\.sql이 아직 없습니다/.test(l)).length,1);
 assert.equal(a.state.rv.pending.length,1);assert.equal(w.rvPush.length,0);
 w.now+=2*HOUR;w.rvSql='ok';a.revenge.sqlAt=0;await a.check();
 assert.equal(a.state.rv.pending.length,0);assert.deepEqual(w.rvPush.flatMap(p=>p.items||[]).map(i=>i.ref),['rv:hl:23']);
});

test('텔레그램 전송 실패 → 다음 확인 때 다시(2시간 안) · 보낸 표시는 먼저 저장(재시작해도 중복 없음)',async()=>{
 const w=world();const a=await mk(w);await a.check();
 const real=w.fetcher;let fail=true;w.fetcher=async(u,o)=>{if(fail&&u.endsWith('/sendMessage'))return new Response(JSON.stringify({ok:false,description:'Bad Gateway'}),{status:502});return real(u,o);};a.tg.fetcher=w.fetcher;a.tg.sleep=async()=>{};
 w.now+=10*MIN;w.fills.push(F(31,w.now-9*MIN,'B',1,0),F(32,w.now-8*MIN,'A',1,1,{closedPnl:'-3'}),F(33,w.now-MIN,'B',1,0,{coin:'ETH'}));
 await a.check();assert.equal(rvMsgs(w).length,0);assert.equal(a.state.rv.outbox.length,1);assert.ok(a.state.rv.sent['entry:hl:33']);
 fail=false;w.now+=MIN;await a.check();assert.equal(rvMsgs(w).length,1);assert.equal(a.state.rv.outbox.length,0);
});

test('--revenge-dry: 지난 체결로 몇 건인지 출력 · 텔레그램·저장 없음 · since 무시',async()=>{
 const w=world();const lines=[];const now=Date.parse('2026-11-01T13:00:00Z');
 const t=Date.parse('2026-10-20T03:00:00Z');
 w.fills.push(F(41,t,'B',1,0),F(42,t+MIN,'A',1,1,{closedPnl:'-50'}),F(43,t+5*MIN,'B',2,0,{coin:'ETH'}),F(44,Date.parse('2026-09-20T03:00:00Z'),'B',1,0,{coin:'XRP'}));
 const code=await revengeDry(['--revenge-dry','--from','2026-10-01','--to','2026-10-31'],env('/tmp/none'),()=>{},{fetcher:w.fetcher,out:l=>lines.push(l),now:()=>now});
 assert.equal(code,0);const out=lines.join('\n');
 assert.match(out,/복수매매 드라이런 \(보내지 않음 · 저장 안 함\) · 2026-10-01 ~ 2026-10-31 · 쿨다운 15분 · 오늘은 여기까지 연속 손실 3회/);
 assert.match(out,/10\/20 12:05 KST ETH 롱 진입 ← \[쿨다운·위험 증가\] 직전 BTC −\$50\.00 4분 전 · 명목 \$120,000 vs \$60,000/);
 assert.match(out,/보냈을 텔레그램 메시지: 1건 \(HL 1 · US 0\)/);assert.doesNotMatch(out,/XRP/,'기간 밖 제외');
 assert.equal(w.tgCalls.length,0);assert.equal(w.rvPush.length,0);
 assert.equal(await revengeDry(['--revenge-dry','--from','2026-13-01'],env('/tmp/none'),()=>{},{fetcher:w.fetcher,out:l=>lines.push(l),now:()=>now}),2);
});
