/* v123 하위계정 탄창 (모의 데이터, 가짜 주소: 주계정 0x1111…, 탄창 '1R-1' 0x4444…, 'Scalping' 0x2b4f…eea9(기본 제외), '1R-2' 0x5555…).
   시계 2026-10-31 12:00 KST = 03:00 UTC → HL 오늘 10-31, 직전 마감 10-30(경계 10-31 00:00 UTC).
   모의 HL: subAccounts(3개, 1R-1 = 무기한 120 + 현물 USDC 50(hold 0 → 통합 아님) + xyz dex 10 = 180), portfolio(1R-1 week: 경계 1시간 전 180, 1시간 뒤 900 → 마감 180),
   탄창 체결(userFillsByTime): xyz:SPCX 01:00 롱 10@100(수수료 0.5) → 01:20 10@98(0.5) = −21, BTC 01:30 롱 0.01@60000 진행 중(tid 777 = 주계정 체결과 같은 tid),
   탄창 펀딩 BTC 02:00 −0.1(주계정 펀딩과 같은 hash·시각·종목).
   주계정 체결: 10-30 ETH 왕복(탄창 정하기 전), 10-31 BTC 01:40 롱 0.02(tid 777) → 02:30 청산(탄창 정한 뒤 = 금고에서 거래), 주계정 펀딩 BTC 02:00 −0.2.
   주계정 원장: 00:30 subAccountTransfer → 1R-1 100(아침 충전), 00:40 deposit 1000, 02:00 subAccountTransfer → 1R-1 50(첫 탄창 체결 01:00 뒤 = 장중 재충전).
   주계정 BALANCE = 무기한 9000 + 현물 USDC 1000 = 10,000('default' 모드), 직전 마감 10,000.
   기대: 분모 10,000 + 탄창 마감 180 = 10,180, 현재 기준액 10,180, 목표 203.60(2%), 사용률 11.6%, 사용 중, 오늘 실현(탄창) −21.10(SPCX −21 + BTC 펀딩 −0.1),
         장중 재충전 1건·금고에서 거래 1건, 대시보드 전체 변동 = (10,180 − 10,180) − 입금 1,000 = −1,000(탄창 이체는 내부 이동), 끄면 주계정만(−850·분모 10,000),
         같은 tid·같은 펀딩도 키 충돌 없음, 주계정 거래 ID 그대로, 배지, 1R(250) > 탄창 잔고(180) 칩, 설정(탄창/안 씀/제외·%)·안내 카드, 웹소켓 추가 구독·체결. PC 1440 · 모바일 390 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const ME='0x1111111111111111111111111111111111111111',SUB='0x4444444444444444444444444444444444444444',SCALP='0x2b4f2042354fadf45922a6e7593b79adf0beeea9',OTH='0x5555555555555555555555555555555555555555';
const T=s=>Date.parse(/^\d{4}-/.test(s)?s:'2026-10-31T'+s+'Z');
let oid=5000000;const F=(coin,time,side,sz,px,start,dir,fee,tid)=>({coin,px:String(px),sz:String(sz),side,time,startPosition:String(start),dir,closedPnl:'0',hash:'0x'+'0'.repeat(64),oid:++oid,crossed:true,fee:String(fee||0),tid,feeToken:'USDC'});
const SUBFILLS=[F('xyz:SPCX',T('01:00:00.000'),'B',10,100,0,'Open Long',0.5,880001),F('xyz:SPCX',T('01:20:00.000'),'A',10,98,10,'Close Long',0.5,880002),F('BTC',T('01:30:00.000'),'B',0.01,60000,0,'Open Long',0,777)];
const SUBFUND=[{time:T('02:00:00.000'),hash:'0x'+'0'.repeat(64),delta:{type:'funding',coin:'BTC',usdc:'-0.1',szi:'0.01',fundingRate:'0.0001',nSamples:null}}];
const MAINFILLS=[F('ETH',T('2026-10-30T05:00:00.000Z'),'B',1,3000,0,'Open Long',0,770001),F('ETH',T('2026-10-30T06:00:00.000Z'),'A',1,3010,1,'Close Long',0,770002),
 F('BTC',T('01:40:00.000'),'B',0.02,60000,0,'Open Long',0,777),F('BTC',T('02:30:00.000'),'A',0.02,60100,0.02,'Close Long',0,770003)];
const MAINFUND=[{time:T('02:00:00.000'),hash:'0x'+'0'.repeat(64),delta:{type:'funding',coin:'BTC',usdc:'-0.2',szi:'0.02',fundingRate:'0.0001',nSamples:null}}];
const LEDGER=[{time:T('00:30:00.000'),hash:'0x'+'a1'.repeat(32),delta:{type:'subAccountTransfer',usdc:'100.0',user:ME,destination:SUB}},
 {time:T('00:40:00.000'),hash:'0x'+'a2'.repeat(32),delta:{type:'deposit',usdc:'1000.0'}},
 {time:T('02:00:00.000'),hash:'0x'+'a3'.repeat(32),delta:{type:'subAccountTransfer',usdc:'50.0',user:ME,destination:SUB}}];
const NEWFILL=F('xyz:SPCX',T('02:50:00.000'),'B',1,99,0,'Open Long',0,880010);
const init=(D)=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const ch=v=>({assetPositions:[],marginSummary:{accountValue:String(v),totalNtlPos:'0',totalRawUsd:String(v),totalMarginUsed:'0'},crossMarginSummary:{accountValue:String(v),totalNtlPos:'0',totalRawUsd:String(v),totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:String(v),time:Date.now()});
 window.__q123=[];
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}const usr=String(b.user||'').toLowerCase();window.__q123.push(b.type+':'+usr.slice(0,6));let out=[];
   switch(b.type){
    case 'clearinghouseState':out=usr===D.SUB?ch(b.dex==='xyz'?10:120):ch(9000);break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'1000',hold:'0',entryNtl:'0'}]};break;
    case 'perpDexs':out=[null];break;
    case 'subAccounts':out=usr===D.ME?[{name:'Scalping',subAccountUser:D.SCALP,master:D.ME,clearinghouseState:ch(198.2344),spotState:{balances:[{coin:'USDC',token:0,total:'0.014372',hold:'0.0',entryNtl:'0.0'}]}},
      {name:'1R-1',subAccountUser:D.SUB,master:D.ME,clearinghouseState:ch(120),spotState:{balances:[{coin:'USDC',token:0,total:'50',hold:'0.0',entryNtl:'0.0'}]}},
      {name:'1R-2',subAccountUser:D.OTH,master:D.ME,clearinghouseState:ch(0),spotState:{balances:[]}}]:[];break;
    case 'portfolio':{const bd=Date.parse('2026-10-31T00:00:00Z');out=usr===D.SUB?[['day',{accountValueHistory:[[bd+3600e3,'900.0'],[Date.now(),'180']],pnlHistory:[],vlm:'0'}],['week',{accountValueHistory:[[bd-5*3600e3,'200.0'],[bd-3600e3,'180.0'],[bd+3600e3,'900.0']],pnlHistory:[],vlm:'0'}],['month',{accountValueHistory:[[bd-864e5,'200']],pnlHistory:[],vlm:'0'}],['allTime',{accountValueHistory:[[bd-5*864e5,'0'],[bd-864e5,'200']],pnlHistory:[],vlm:'0'}]]:[];break;}
    case 'userFillsByTime':out=usr===D.SUB?D.SUBFILLS.filter(f=>f.time>=(b.startTime||0)):[];break;
    case 'userFunding':out=usr===D.SUB?D.SUBFUND.filter(f=>f.time>=(b.startTime||0)):[];break;
    case 'userNonFundingLedgerUpdates':out=usr===D.ME?D.LEDGER.filter(x=>x.time>=(b.startTime||0)):[];break;
    default:out=[];}
   return J(out);}
  return J({message:'not found'},404);};
 window.__wsSent=[];window.__wsList=[];
 class FakeWS{constructor(url){this.url=url;this.readyState=0;window.__wsList.push(this);setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}send(m){window.__wsSent.push(String(m));}close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;};
const seed=async(D)=>{
 hlcStatus={address:D.ME};V57.spot=null;
 state.settings.v123Subs=D.SUB;state.settings.v123Since=Date.parse('2026-10-31T00:10:00Z');delete state.settings.v123Ex;delete state.settings.v123Pct;
 const today=v17Today(),y=v17AddDays(today,-1);v17Cache[calendarMonth]={rows:{[y]:{day:y,value:10000,source:'close',detail:{}}},at:Date.now()};
 const listed=await v123LoadList(true);const pulled=await v123Pull('qa',true);
 for(let i=0;i<30&&v123BalSum()!==180;i++)await new Promise(r=>setTimeout(r,100));
 const account=await HLCloud.accountId(D.ME);
 V123.on=false;const plain=HLCloud.buildSnapshot(JournalSync,{account,fills:D.MAINFILLS,funding:D.MAINFUND,previous:null});V123.on=true;
 const snap=HLCloud.buildSnapshot(JournalSync,{account,fills:D.MAINFILLS,funding:D.MAINFUND,previous:null});
 const res=JournalSync.applySnapshot(state,snap);const next=res.state;next.trades=next.trades.map(normaliseTrade);Object.assign(state,next);
 const btcSub=state.trades.find(t=>t.sync&&t.sync.v123Sub===D.SUB&&t.name==='BTC');if(btcSub)btcSub.initialRisk=250;
 await persist();
 await hlbRefresh(true);
 for(let i=0;i<40&&V118.busy;i++)await new Promise(r=>setTimeout(r,100));V118.addr='';V118.at=0;V118.tryAt=0;V118.subsAt=Date.now();await v118Load('qa');
 v123CloseSum(y);for(let i=0;i<40&&!(typeof v123CloseSum(y)==='number');i++)await new Promise(r=>setTimeout(r,100));
 renderAll();
 const mainIds=t=>t.sync&&!t.sync.v123Sub;
 return {listed,pulled,list:V123.list.map(x=>x.name),
  plainIds:plain.trades.map(t=>t.id).sort(),mainIds:snap.trades.filter(mainIds).map(t=>t.id).sort(),
  subTrades:snap.trades.filter(t=>t.sync.v123Sub).map(t=>t.name+':'+(t.sync.positionStatus||'')).sort(),
  keys:snap.executionKeys.filter(k=>/:777$/.test(k)).map(k=>k.split(':').slice(2).join(':').replace(/^[0-9a-f]{16}:?/,'')).sort(),
  fundKeys:snap.fundingKeys.length,assigned:snap.trades.reduce((s,t)=>s+t.funding.length,0),q:snap.quarantine.length,unassigned:snap.accountFunding.unassignedCount,
  n:state.trades.length,closeKey:y,close:v123CloseSum(y),bal:v123BalSum()};};
const chk=(sel)=>{const W=document.documentElement.clientWidth,bad=[];
 document.querySelectorAll(sel).forEach(el=>{const r=el.getBoundingClientRect();if(!r.width||el.closest('[hidden]'))return;const host=el.closest('.card')||document.body,hb=host.getBoundingClientRect();if(r.right>Math.min(W,hb.right)+0.5||r.left<Math.max(0,hb.left)-0.5)bad.push(String(el.className||el.id||el.tagName).slice(0,40)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+Math.round(hb.right));});
 return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
const D={ME,SUB,SCALP,OTH,SUBFILLS,SUBFUND,MAINFILLS,MAINFUND,LEDGER};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[]};
 const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){const w='w'+W,r={};out[w]=r;
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});await ctx.addInitScript(init,D);
  const A=await ctx.newPage();A.on('pageerror',e=>out.errors.push(w+' '+e.message));A.on('dialog',d=>{out.errors.push(w+' dialog '+d.message());d.dismiss();});
  await A.goto(URL0);await A.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await A.waitForTimeout(800);
  r.seed=await A.evaluate(seed,D);await A.waitForTimeout(300);
  /* 분모·기준액 */
  r.denom=await A.evaluate(()=>{const d=v28Denom(),L=limitStatus().find(l=>l.mode==='day');return {value:+d.value.toFixed(2),mode:d.mode,v123:d.v123,text:v28BasisText(d),tip:v28BasisTip(d),basis:+acctBasis().toFixed(2),limAcct:+L.account.toFixed(2)};});
  r.dash=await A.evaluate(()=>{const led=ledgerOf(),today=v12Today(),dp=v15Sum(v15Rows(led,today,today));const m=v27Model(dp);
   return {denom:+m.denom.toFixed(2),from:m.total&&+m.total.from.toFixed(2),change:m.total&&+m.total.change.toFixed(2),pct:m.total&&+m.total.pct.toFixed(4),v123:!!m.v123};});
  r.flow=await A.evaluate(()=>{const b=v67Bound(v17AddDays(v17Today(),-1)),f=v118Flow(b,null);V123.comb=true;const g=v118Flow(b,null);V123.comb=false;
   const ev=v118Events()||[],k=ev.filter(e=>e.ty==='subAccountTransfer').map(e=>v118Kind(e));return {out:{net:+f.net.toFixed(2),n:f.n},comb:{net:+g.net.toFixed(2),n:g.n},kinds:k};});
  /* 대시보드 카드 */
  await A.evaluate(()=>{setPage('dashboard');renderAll();});await A.waitForTimeout(400);
  const card=()=>A.evaluate(()=>{const c=$('v123Card');if(!c)return {has:false};const q=k=>{const e=c.querySelector('[data-v123-k="'+k+'"]');return e?e.textContent.replace(/\s+/g,' ').trim():null;};
   const host=$('riskLimits')&&$('riskLimits').closest('.card');return {has:true,beforeLimits:c.nextElementSibling===host,bal:q('bal'),target:q('target'),used:q('used'),state:q('state'),pnl:q('pnl'),refill:q('refill'),vault:q('vault'),setup:!!c.querySelector('[data-v123-k="setup"]'),
    head:(c.querySelector('.card-head .meta')||{}).textContent||'',bar:(c.querySelector('.v123-bar')||{getAttribute(){return null}}).getAttribute('aria-valuenow')};});
  r.card=await card();
  r.dbg=await A.evaluate(()=>{const d=v123Debug();return {on:d.on,sel:d.sel,ex:d.ex,pct:d.pct,trades:d.trades,balSum:d.balSum,cardState:d.card.state,refill:d.card.refill,vault:d.card.vault,first:d.card.first,caches:d.caches,ver:d.ver};});
  r.cardChk=await A.evaluate(chk,'#v123Card,#v123Card *');
  await A.evaluate(()=>{$('v123Card').scrollIntoView({block:'center'});});await A.waitForTimeout(150);
  await A.screenshot({path:path.join(outDir,'t123-'+w+'-dash.png')}).catch(e=>{r.shotErr=String(e);});
  /* 배지 */
  r.badge=await A.evaluate((D)=>{const lab=t=>{const h=tickerHTML(t),m=/<span class="v123-b[^"]*"[^>]*>([^<]*)<\/span>/.exec(h);return m?m[1]:'';};const o={};for(const t of state.trades){if(!t.sync)continue;o[t.name+'@'+(t.sync.v123Sub?'sub':'main')+'@'+t.date]=lab(t);}return o;},D);
  /* 진입 점검: 1R 250 > 탄창 180 */
  r.detect=await A.evaluate((D)=>{const t=state.trades.find(x=>x.sync&&x.sync.v123Sub===D.SUB&&x.name==='BTC');const a=v37Detect(t).map(x=>x.code);const before=t.initialRisk;t.initialRisk=100;const b=v37Detect(t).map(x=>x.code);t.initialRisk=before;
   const lbl=v37Detect(t).find(x=>x.code==='v123mag');return {codes:a,small:b,label:lbl&&lbl.label,detail:lbl&&lbl.detail};},D);
  /* 설정 */
  r.set=await A.evaluate(async()=>{setPage('settings');renderAll();if(typeof v12SelectTab==='function')v12SelectTab('account');await new Promise(r=>setTimeout(r,300));const c=$('v123Set');
   const rows=c?[...c.querySelectorAll('[data-v123-row]')].map(li=>[li.querySelector('b').textContent,(li.querySelector('button.active')||{}).dataset?.v123Set||'']):[];
   return {has:!!c,inAccount:!!(c&&$('v12Set-account')&&$('v12Set-account').contains(c)),rows,help:/주계정 \+ 탄창/.test(($('v123SetHelp')||{}).textContent||'')};});
  r.setChk=await A.evaluate(chk,'#v123Set,#v123Set *');
  await A.evaluate(()=>{$('v123Set').scrollIntoView({block:'center'});});await A.waitForTimeout(150);
  await A.screenshot({path:path.join(outDir,'t123-'+w+'-set.png')}).catch(e=>{r.shotErr=String(e);});
  r.modes=await A.evaluate(async(D)=>{const click=async(a,k)=>{document.querySelector('button[data-v123-set="'+k+'"][data-v123-addr="'+a+'"]').click();await new Promise(r=>setTimeout(r,250));return {subs:state.settings.v123Subs||'',ex:state.settings.v123Ex||''};};
   const o={};o.ex=await click(D.OTH,'ex');o.use=await click(D.OTH,'use');o.none=await click(D.OTH,'none');o.scalpNone=await click(D.SCALP,'none');o.scalpEx=await click(D.SCALP,'ex');
   const i=$('v123Pct');i.value='1.5';i.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,250));o.pct=state.settings.v123Pct;const m=v123Model();o.pctModel={target:+m.target.toFixed(2),state:m.state,over:+m.over.toFixed(2)};
   const j=$('v123Pct');j.value='';j.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,250));o.pctCleared='v123Pct' in state.settings;o.pctBack=v123Pct();
   const k=$('v123Pct');k.value='0';k.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,250));o.pctBad='v123Pct' in state.settings;return o;},D);
  /* 미설정 안내 */
  r.unset=await A.evaluate(async()=>{const keep=state.settings.v123Subs;delete state.settings.v123Subs;setPage('dashboard');renderAll();await new Promise(r=>setTimeout(r,200));const c=$('v123Card');
   const o={setup:!!(c&&c.querySelector('[data-v123-k="setup"]')),text:c?c.textContent.replace(/\s+/g,' ').trim():'',denom:+v28Denom().value.toFixed(2),basis:+acctBasis().toFixed(2)};state.settings.v123Subs=keep;renderAll();return o;});
  /* 끄기(?v123=0과 같은 V123.on=false) */
  r.off=await A.evaluate(()=>{V123.on=false;const led=ledgerOf(),today=v12Today(),m=v27Model(v15Sum(v15Rows(led,today,today)));const o={denom:+v28Denom().value.toFixed(2),basis:+acctBasis().toFixed(2),change:m.total&&+m.total.change.toFixed(2),badge:/v123-b/.test(state.trades.filter(t=>t.sync).map(t=>tickerHTML(t)).join(''))};
   renderAll();o.card=!!$('v123Card');V123.on=true;renderAll();return o;});
  /* 웹소켓: 같은 연결에 탄창 추가 구독 + 탄창 체결 받기 */
  if(W===1440){r.ws=await A.evaluate(async(D)=>{V93.off=false;v93Ensure();for(let i=0;i<40&&!(V93.ws&&V93.ws.readyState===1);i++)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,100));
    const live=new Set();for(const s of window.__wsSent){let m=null;try{m=JSON.parse(s);}catch{}if(!m||!m.subscription||m.subscription.type!=='userFills')continue;if(m.method==='subscribe')live.add(m.subscription.user);else if(m.method==='unsubscribe')live.delete(m.subscription.user);}const subs=[...live].sort();
    const before=(V123.c[D.SUB]||{fills:[]}).fills.length;const ws=V93.ws;
    ws.onmessage({data:JSON.stringify({channel:'userFills',data:{user:D.SUB,isSnapshot:false,fills:[D.NEWFILL]}})});await new Promise(r=>setTimeout(r,200));
    ws.onmessage({data:JSON.stringify({channel:'userFills',data:{user:D.SUB,isSnapshot:false,fills:[D.NEWFILL]}})});await new Promise(r=>setTimeout(r,200));
    const after=V123.c[D.SUB].fills.length;return {subs,ws:[...V123.ws],added:after-before,dup:V123.n.wsDup>=1,mainMem:V93.mem.has('t:'+D.NEWFILL.tid)};},{...D,NEWFILL});}
  await ctx.close();}
 out.done=true;console.log(JSON.stringify(out));await browser.close();srv.close();
})().catch(e=>{console.log(JSON.stringify({fatal:String(e&&e.stack||e)}));process.exit(1);});
