/* v127 QA — 새 출발(v126) 뒤 옛 거래 중단 표시 숨김. PC(1440)·모바일(390), 모의 클라우드(t126과 같은 node 메모리 모의, 가짜 주소 0x1111…), 서버 판정(risk_state·risk_events)은 v21Data에 직접 넣음(서버 2.16 = 새 출발 모름).
   시드: BTC −300(10-29)·ETH −200(10-30) → 새 출발 10-30 23:00 UTC → DOGE −20(10-31 02:30) → XRP −60(02:40).
   (pre) 새 출발 전엔 옛 중단 그대로 보임
   (A) 옛 서버 중단(월간·주간 = 시작이 새 출발 전, 연속 손실 = 섞인 기간·앱 판정 없음)·옛 위반(새 출발 전 진입 + 옛 중단 중 새 진입)·옛 재시작 절반 → 배너·위젯 배지·진입 경고·태그·규칙 위반 어디에도 없음, 앱 한도 합계 = 새 출발 뒤만
   (B) 새 출발 뒤 깨끗한 하루 중단 → 보임 · 그 중단 위반 진입 1건·DOGE 태그
   (C) 섞인 주간 장중 중단: 앱(새 출발 뒤 −20, 분모 새 출발 시점) 미달 → 숨김 · XRP −60 뒤 앱 주간 한도 도달 → 보임(사유 = 앱 숫자)
   (D) 미국주식 줄: US 새 출발 안 함 → 유지 + 안내 · 이 기기 표시로 US 새 출발 → 숨김 · 서버가 US 새 출발 알림 → 숨김
   (E) 서버가 같은 새 출발을 앎(2.17.0) → 섞인 기간 중단도 보임, 시작이 새 출발 전인 중단은 숨김
   (F) ?v127=0 → 예전처럼 전부 보임 · 모바일 배너 넘침 없음 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
/* ---- 모의 클라우드 ---- */
const C={rev:0,payload:null,updated:null,hist:[],cas:[],fills:[],nextId:1};
function cloud(req){const u=new URL(req.url),p=u.pathname,q=u.search;
 if(p==='/rest/v1/journal_cloud'){if(q.includes('payload'))return C.rev?[{revision:C.rev,payload:C.payload,updated_at:C.updated}]:[];return C.rev?[{revision:C.rev,updated_at:C.updated}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};const ok=b.p_payload&&b.p_payload.format==='trade-journal-hyperliquid'&&Array.isArray(b.p_payload.trades);C.cas.push({dev:req.dev,exp:b.p_expected_revision,cur:C.rev,ok,n:ok?b.p_payload.trades.length:-1});if(!ok)return {__status:400,message:'bad payload'};
  if(b.p_expected_revision===0){if(C.rev)return null;}else if(b.p_expected_revision!==C.rev)return null;
  if(C.rev)C.hist.push({revision:C.rev,payload:C.payload});C.hist=C.hist.slice(-5);C.rev++;C.payload=b.p_payload;C.updated=new Date().toISOString();return C.rev;}
 if(p==='/rest/v1/rpc/hl_status'){const mx=C.fills.reduce((m,f)=>Math.max(m,f.id),0);return {address:A,max_fill_id:mx,max_funding_id:0,fills_count:C.fills.length,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()};}
 if(p==='/rest/v1/hl_fills'){const gt=Number((u.searchParams.get('id')||'gt.0').slice(3));return C.fills.filter(f=>f.id>gt).sort((a,b)=>a.id-b.id).slice(0,1000).map(f=>({id:f.id,raw:f.raw}));}
 return [];}
const init=([A])=>{
 const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'}]};break;
    case 'perpDexs':out=[null];break;
    case 'meta':out={universe:['BTC','ETH','SOL','DOGE','XRP'].map(n=>({name:n,szDecimals:2,maxLeverage:20}))};break;
    case 'metaAndAssetCtxs':out=[{universe:['BTC','ETH','SOL','DOGE','XRP'].map(n=>({name:n,szDecimals:2,maxLeverage:20}))},[1,2,3,4,5].map(()=>({markPx:'100'}))];break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];break;
    case 'frontendOpenOrders':case 'userFillsByTime':case 'userFills':case 'userFunding':case 'historicalOrders':case 'userNonFundingLedgerUpdates':case 'subAccounts':out=[];break;
    case 'candleSnapshot':{const iv=IV[b.req.interval]||6e4;out=[];let p=100;for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<3000;t+=iv,i++){const c=p+Math.sin(i/3)*0.3;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.1),l:String(Math.min(p,c)-0.1),v:'10',n:5});p=c;}break;}
    default:out={};}
   return J(out);}
  if(u.includes('.supabase.co/')){let body;try{body=o.body?JSON.parse(o.body):undefined;}catch{}const r=await window.__cloud({url:u,method:o.method||'GET',body});
   if(r&&r.__status)return J({message:r.message},r.__status);return J(r===undefined?null:r);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}
  send(d){const m=JSON.parse(d);if(m.method==='subscribe')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'userFills',data:{isSnapshot:true,user:m.subscription.user,fills:[]}})}),25);if(m.method==='ping')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'pong'})}),5);}
  close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;
};
/* raw HL 체결 */
let TID=9100000;
const fill=(coin,ms,side,sz,px,start,dir,pnl)=>({coin,px:String(px),sz:String(sz),side,time:ms,startPosition:String(start),dir,closedPnl:String(pnl),hash:'0x'+(TID).toString(16).padStart(64,'0'),oid:880000+TID%1000,crossed:true,fee:'0.0',tid:TID++,feeToken:'USDC',twapId:null});
const T=s=>Date.parse(s);

/* 시드: 새 출발(10-30 23:00 UTC = 10-31 08:00 KST) 전 큰 손실 2건 */
const CUT=T('2026-10-30T23:00:00Z');
const SEED=[fill('BTC',T('2026-10-29T10:00:00Z'),'B',10,100,0,'Open Long',0),fill('BTC',T('2026-10-29T12:00:00Z'),'A',10,70,10,'Close Long',-300),
 fill('ETH',T('2026-10-30T10:00:00Z'),'B',10,100,0,'Open Long',0),fill('ETH',T('2026-10-30T12:00:00Z'),'A',10,80,10,'Close Long',-200)];
const ETH_TID=SEED[2].tid;
const DOGE=[fill('DOGE',T('2026-10-31T02:30:00Z'),'B',1,100,0,'Open Long',0),fill('DOGE',T('2026-10-31T02:35:00Z'),'A',1,80,1,'Close Long',-20)];
const DOGE_TID=DOGE[0].tid;
const XRP=[fill('XRP',T('2026-10-31T02:40:00Z'),'B',1,100,0,'Open Long',0),fill('XRP',T('2026-10-31T02:45:00Z'),'A',1,40,1,'Close Long',-60)];
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const base='http://127.0.0.1:'+srv.address().port+'/';const URL0=base+'?journal=hyperliquid';
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',acceptDownloads:true,...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name,url)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>{R.errors.push(name+' 대화상자 '+d.type());d.accept();});
  await p.goto(url||URL0);await p.waitForFunction(()=>window.journalReady===true&&window.V126&&V126.ready,null,{timeout:30000});await p.waitForTimeout(500);return p;};
 const login=p=>p.evaluate(P=>{cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};V110.auto=false;v110Paint();},PRJ);
 const hl=p=>p.evaluate(async()=>{for(let i=0;i<100&&(hlcBusy||hlcBlocked());i++)await new Promise(r=>setTimeout(r,100));await hlcSync(true);for(let i=0;i<100&&publicBusy>0;i++)await new Promise(r=>setTimeout(r,100));return state.trades.map(t=>t.name).sort();});
 const push=list=>{for(const f of list)C.fills.push({id:C.nextId++,raw:f});};
 const over=sel=>{const W=document.documentElement.clientWidth,bad=[];for(const root of document.querySelectorAll(sel)){if(!root.getClientRects().length)continue;for(const x of [root,...root.querySelectorAll('*')]){const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className||x.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}}return bad;};
 /* 모의 서버 판정(risk_state·risk_events) — 서버는 새 출발을 모름(2.16) */
 const D=s=>Date.parse(s);
 const OLD=[{id:'HL:monthr:2026-10',rule:'month',label:'월간 실현 −10% (마감 판정)',from:D('2026-10-06T00:00:00Z'),until:D('2026-11-01T00:00:00Z'),untilText:'11/01(일) 09:00 KST',fromText:'10/06(화) 09:00 KST',reason:'월간 실현 −81.17% (마감 10/05 UTC · 기준 09/30 마감 18,078.08)'},
  {id:'HL:weekr:2026-10-26',rule:'week',label:'주간 −6%',from:D('2026-10-29T00:00:00Z'),until:D('2026-11-02T00:00:00Z'),untilText:'11/02(월) 09:00 KST',fromText:'10/29(목) 09:00 KST',reason:'주간 −16.42% (마감 10/28)'},
  {id:'HL:streakr:2026-10-30',rule:'streak',label:'3일 연속 실현 손실일',from:D('2026-10-31T00:00:00Z'),until:D('2026-11-01T00:00:00Z'),untilText:'11/01(일) 09:00 KST',fromText:'10/31(토) 09:00 KST',reason:'3일 연속 실현 손실일 · 마지막 10/30 UTC'}];
 const NEWDAY={id:'HL:dayr:2026-10-31',rule:'day',label:'하루 실현 −2.5%',from:D('2026-10-31T02:00:00Z'),until:D('2026-11-01T00:00:00Z'),untilText:'11/01(일) 09:00 KST',fromText:'10/31(토) 11:00 KST',reason:'하루 실현 −3.10% (10/31 UTC)'};
 const WKI={id:'HL:weekr-intraday:2026-10-31',rule:'week-intraday',label:'주간 실현 −6% 장중',from:D('2026-10-31T02:50:00Z'),until:D('2026-11-01T00:00:00Z'),untilText:'11/01(일) 09:00 KST',fromText:'10/31(토) 11:50 KST',reason:'주간 실현 −52.00% 장중 도달 (서버, 새 출발 전 손실 포함)'};
 const US={market:'US',_updated:0,rules:'손실한도 판정 v1.6',stops:[{id:'US:monthr:2026-10',rule:'month',label:'월간 실현 −10% (마감 판정)',from:D('2026-10-06T20:00:00Z'),until:D('2026-11-30T21:00:00Z'),untilText:'12/01(화) 06:00 KST',fromText:'10/07(수) 05:00 KST',reason:'월간 실현 −12%'}],halfRisk:{active:false,factor:0.5}};
 const VIOL=[{market:'hl',kind:'violation',rule:'month',at:'2026-10-30T10:00:00Z',detail:{symbol:'ETH',t:D('2026-10-30T10:00:00Z'),tid:ETH_TID,stopId:'HL:monthr:2026-10',until:D('2026-11-01T00:00:00Z')}},
  {market:'hl',kind:'violation',rule:'month',at:'2026-10-31T02:30:00Z',detail:{symbol:'DOGE',t:D('2026-10-31T02:30:00Z'),tid:DOGE_TID,stopId:'HL:monthr:2026-10',until:D('2026-11-01T00:00:00Z')}}];
 const VNEW={market:'hl',kind:'violation',rule:'day',at:'2026-10-31T02:30:00Z',detail:{symbol:'DOGE',t:D('2026-10-31T02:30:00Z'),tid:DOGE_TID,stopId:'HL:dayr:2026-10-31',until:D('2026-11-01T00:00:00Z')}};
 const setSrv=(p,o)=>p.evaluate(async o=>{/* 앱 자체 risk_state 읽기(로그인 직후·60초마다)가 모의 값을 덮지 않게: 멈추고 도는 중이면 끝날 때까지 */v21Load=async()=>{};for(let i=0;i<100&&v21Data&&v21Data.loading;i++)await new Promise(r=>setTimeout(r,50));const now=Date.now();const hl={market:'HL',_updated:now,rules:'손실한도 판정 v1.6',version:'2.16.0',config:{limits:{day:2.5,week:6,month:10},streakDays:3,streakLossPct:0.5,streakStopDays:1,restartFactor:0.5},stops:o.hl,halfRisk:o.half||{active:false,factor:0.5},...(o.rs?{riskStart:o.rs}:{})};
  const st={hl};if(o.us)st.us={...o.us,_updated:now};v21Data={state:st,viol:o.viol||[],at:now,err:null,loading:false};v21Idx=null;try{V127.memo.clear();}catch{}v21Paint();},o);
 const look=p=>p.evaluate(()=>{const b=document.getElementById('v21Banner');const s=v21St(),now=Date.now();const doge=state.trades.find(t=>t.name==='DOGE');let badge=null;try{badge=v36Data().badge;}catch{}
  return {vis:!!(b&&!b.hidden&&b.getClientRects().length),stop:!!(b&&b.querySelector('.v21-row.stop')),stopTxt:((b&&b.querySelector('.v21-row.stop'))||{}).textContent||'',other:!!(b&&b.querySelector('.v21-row.other')),hint:!!(b&&b.querySelector('.v127-hint')),otherTxt:((b&&b.querySelector('.v21-row.other'))||{}).textContent||'',
   act:s?v21Active(s,now).map(x=>x.id):[],up:s?v21Upcoming(s,now).map(x=>x.id):[],viol:v21Index().list.length,dogeViol:doge?v21Viol(doge):null,dogeProc:doge?processOf(doge):null,badge:badge?badge.cls:null,half:!!v21Half()};});
 const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'PC');await login(P);
 push(SEED);R.seed=await hl(P);
 await P.evaluate(async()=>{Object.assign(state.settings,{limD:2.5,limW:6,limM:10});await persist();});
 /* 새 출발 전: 서버 옛 중단이 그대로 보임(기존 동작) */
 await setSrv(P,{hl:OLD,viol:VIOL});R.pre=await look(P);
 /* 새 출발(CUT) */
 R.fresh=await P.evaluate(async c=>{const ok=await v126Start(c);const g=state.settings.v126;return {ok,day:g&&g.day,eq:g&&g.eq,mark:!!(JSON.parse(localStorage.getItem('tj:v127-fresh')||'{}').hl)};},CUT);
 R.fresh.mark=await P.evaluate(()=>{v21Paint();return JSON.parse(localStorage.getItem('tj:v127-fresh')||'{}').hl?.ep===state.settings.v126.epoch;});
 push(DOGE);R.after=await hl(P);
 /* (A) 옛 중단·옛 위반 숨김 */
 await setSrv(P,{hl:OLD,viol:VIOL,half:{active:true,factor:0.5,day:'2026-10-31',afterStop:'HL:streakr:2026-10-29',reason:'연속 손실 중단이 끝난 뒤 첫 거래일'}});
 R.A=await look(P);R.A.lim=await P.evaluate(()=>limitStatus().map(l=>Math.round(l.sum)));
 R.A.dbg=await P.evaluate(()=>{const d=v127Debug();return {on:d.on,hl:d.hl.stops.map(s=>s.id+':'+s.why),fresh:!!d.hl.fresh,aware:d.hl.serverAware,violHidden:d.violHidden};});
 await P.screenshot({path:path.join(outDir,'pc-old-hidden.png')}).catch(e=>R.shotErr=e.message);
 /* 설정 서버 판정 카드 한 줄 */
 R.note=await P.evaluate(async()=>{setPage('settings');try{v12SelectTab('account');}catch{}renderAll();await new Promise(r=>setTimeout(r,200));v21PaintCard();const p=document.getElementById('v127Note');return p&&!p.hidden?p.textContent:'';});
 await P.evaluate(()=>{setPage('dashboard');renderAll();});
 /* (B) 새 출발 뒤 새 위반(깨끗한 하루 중단) → 보임 · 그 중단 위반 진입 1건 */
 await setSrv(P,{hl:[...OLD,NEWDAY],viol:[...VIOL,VNEW]});R.B=await look(P);
 await P.screenshot({path:path.join(outDir,'pc-new-stop.png')}).catch(e=>R.shotErr=e.message);
 R.Bbad=await P.evaluate(over,'#v21Banner');
 /* (C) 섞인 기간(주간 장중, 서버는 새 출발 전 손실 포함) → 앱 판정 미달이면 숨김 → 새 손실로 앱 주간 한도 도달하면 보임(앱 숫자) */
 await setSrv(P,{hl:[...OLD,WKI],viol:VIOL});R.C1=await look(P);
 push(XRP);R.afterX=await hl(P);
 await setSrv(P,{hl:[...OLD,WKI],viol:VIOL});R.C2=await look(P);R.C2.lim=await P.evaluate(()=>{const w=limitStatus().find(l=>l.mode==='week');return {sum:Math.round(w.sum),acct:Math.round(w.account),hit:w.hit,v126:!!(w.basis&&w.basis.v126)};});
 /* (D) 미국 주식 줄: US 새 출발 안 함 → 줄 유지 + 짧은 안내 · US 새 출발(이 기기 표시) → 숨김 · 서버가 US 새 출발 알림 → 숨김 */
 await setSrv(P,{hl:OLD,viol:VIOL,us:US});R.D1=await look(P);
 await P.evaluate(c=>{const M=JSON.parse(localStorage.getItem('tj:v127-fresh')||'{}');M.us={cut:c,ep:'eUS',at:Date.now()};localStorage.setItem('tj:v127-fresh',JSON.stringify(M));},D('2026-10-30T23:30:00Z'));
 await setSrv(P,{hl:OLD,viol:VIOL,us:US});R.D2=await look(P);
 await P.evaluate(()=>{const M=JSON.parse(localStorage.getItem('tj:v127-fresh')||'{}');delete M.us;localStorage.setItem('tj:v127-fresh',JSON.stringify(M));});
 await setSrv(P,{hl:OLD,viol:VIOL,us:{...US,riskStart:{fresh:true,ep:'eUS2',at:D('2026-10-30T23:30:00Z'),date:'2026-10-30',day:'2026-10-30'}}});R.D3=await look(P);
 /* (E) 서버 2.17.0이 같은 새 출발을 앎 → 섞인 기간 중단도 서버 판정 그대로(보임) · 옛 중단은 숨김 */
 const ep=await P.evaluate(()=>state.settings.v126.epoch);
 await setSrv(P,{hl:[OLD[0],{...OLD[2],id:'HL:streakr:2026-10-30@'+ep}],viol:VIOL,rs:{fresh:true,ep,at:CUT,date:'2026-10-30',day:'2026-10-30'}});R.E=await look(P);
 /* (F) ?v127=0 → 예전처럼 서버 중단 전부 */
 const P0=await open(ctx,'PC0',URL0+'&v127=0');
 await setSrv(P0,{hl:OLD,viol:VIOL});R.F=await look(P0);R.F.on=await P0.evaluate(()=>V127.on);
 /* 모바일 폭: 새 중단 + 미국 줄 안내 넘침 없음 */
 const ctxM=await mkCtx(390,'mob');const M=await open(ctxM,'MOB');
 await M.evaluate(c=>{state.settings.v126={on:true,v:1,epoch:'eM',cutoff:c,day:'2026-10-30',eq:1100,carry:[]};},CUT);
 await setSrv(M,{hl:[...OLD,NEWDAY],viol:[],us:US});R.M=await look(M);R.Mbad=await M.evaluate(over,'#v21Banner');
 await M.screenshot({path:path.join(outDir,'mob-banner.png')}).catch(e=>R.shotErr=e.message);
 R.over=await P.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 R.overM=await M.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
