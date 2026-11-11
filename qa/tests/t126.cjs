/* v126 QA — '새 출발'(지난 기록 보관 + 일지 초기화). PC(1440)·모바일(390, isMobile·hasTouch) + 새 기기(390) 세 컨텍스트, 모의 클라우드(t119와 같은 node 메모리 모의, 가짜 주소 0x1111…).
   체결은 Supabase hl_fills 모의(raw HL 체결)로 넣어 실제 수집 경로(hlcSync → buildSnapshot → applySnapshot)를 탐.
   시드(10-29~30, 모두 새 출발 전): BTC 롱 종료(손실) · ETH 롱 종료(복기 글) · SOL 롱 보유(최초 손절 45·1R 100·진입 근거) + 일간 복기·단타 메모.
   (0) 보관 실패(IndexedDB 열기 실패 흉내) → 아무것도 안 바뀜(거래 3·설정 없음·안내 문구)
   (1) PC 설정 > 계좌·위험 '새 출발…' → 펼친 확인(보관·그대로·이월 목록 SOL) → [시작] → JSON 파일 내려받음·이 기기 보관 1·활성 = SOL(이월 배지)·보관함 3·무덤 2·일간 복기 비움·
       설정(규칙·한도) 그대로·한도 분모 = 새 출발 시점·원장 cutoff 이전 0 → 클라우드 올림(줄어듦 차단 없이)
   (2) 옛 세대 기기(모바일: 새 출발 전 기준 + ETH 복기 고침, 아직 안 올림) 병합 → 활성 SOL만(옛 거래 안 살아남)·고친 ETH 글은 보관함으로(최신)·옛 사본은 충돌 사본 → 올림 → PC도 같음
       새 기기(빈 상태) 첫 병합 → 활성 SOL만 · 예전 앱이 옛 거래를 되살려 올린 저장본 흉내 → PC 병합 뒤 활성 그대로·보관함 그대로
   (3) 새 출발 뒤 체결: SOL 청산·DOGE 새 왕복(이후) + XRP 옛 왕복(이전, 처음 보는 체결) → 수집 뒤 활성 = SOL(이월·청산됨)·DOGE, XRP·BTC·ETH 안 들어옴
   (4) 지난 기록 보관함: 목록 = 보관 거래(이월됨 배지)·막대·동기화 쉼 → ETH 복기 수정 → 닫기 → 보관함에만 저장(활성 그대로) → 올림 → 모바일에도 보관함 글
   (5) ?v126=0 = 보기 전용(지난 기록 포함 표시·저장·동기화 안 함)
   (6) 새 출발 취소 → 활성에 BTC·ETH·SOL·DOGE 되돌림·보관함 없음·무덤 정리·cutoff 해제 → 모바일도 따라옴 */
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
const SEED=[fill('BTC',T('2026-10-29T10:00:00Z'),'B',1,100,0,'Open Long',0),fill('BTC',T('2026-10-29T12:00:00Z'),'A',1,98,1,'Close Long',-2),
 fill('ETH',T('2026-10-30T10:00:00Z'),'B',1,100,0,'Open Long',0),fill('ETH',T('2026-10-30T11:00:00Z'),'A',1,105,1,'Close Long',5),
 fill('SOL',T('2026-10-30T20:00:00Z'),'B',2,50,0,'Open Long',0)];
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const base='http://127.0.0.1:'+srv.address().port+'/';const URL0=base+'?journal=hyperliquid';
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',acceptDownloads:true,...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const dls=[];
 const open=async(ctx,name,url)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>{R.errors.push(name+' 대화상자 '+d.type());d.accept();});p.on('download',d=>dls.push({who:name,file:d.suggestedFilename()}));
  await p.goto(url||URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(500);return p;};
 const login=p=>p.evaluate(P=>{cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};V110.auto=false;v110Paint();},PRJ);
 const sync=p=>p.evaluate(async()=>{for(let i=0;i<120&&(V110.busy||publicBusy>0);i++)await new Promise(r=>setTimeout(r,100));const r=await v110Sync('test',{force:true});for(let i=0;i<120&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));return r;});
 const hl=p=>p.evaluate(async()=>{for(let i=0;i<100&&(hlcBusy||hlcBlocked());i++)await new Promise(r=>setTimeout(r,100));await hlcSync(true);for(let i=0;i<100&&publicBusy>0;i++)await new Promise(r=>setTimeout(r,100));return state.trades.map(t=>t.name).sort();});
 const push=list=>{for(const f of list)C.fills.push({id:C.nextId++,raw:f});};
 const snap=p=>p.evaluate(()=>{const c=state.settings.v126||null,A=state.v126Archive||null;const by=n=>state.trades.find(t=>t.name===n);
  return {act:state.trades.map(t=>t.name+(t.v126Carry?'*':'')).sort(),arc:A?A.state.trades.map(t=>t.name+(t.v126CarryCopy?'*':'')).sort():null,on:!!(c&&c.on),ep:c&&c.epoch||null,
   graves:(state.graveyard||[]).filter(g=>g&&g.v126).length,dr:Object.keys((state.dailyReviews||{}).HL||{}).length,sc:Object.keys((state.v121Scalp||{}).hl||{}).length,
   arcEth:A?((A.state.trades.find(t=>t.name==='ETH')||{}).review||''):null,arcConf:A?(A.conflicts||[]).length:null,lim:[state.settings.limD,state.settings.limW,state.settings.limM]};});
 const over=sel=>{const W=document.documentElement.clientWidth,bad=[];for(const root of document.querySelectorAll(sel)){if(!root.getClientRects().length)continue;for(const x of [root,...root.querySelectorAll('*')]){const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className||x.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}}return bad;};
 const toSettings=p=>p.evaluate(()=>{setPage('settings');try{v12SelectTab('account');}catch{}renderAll();});
 const ctxP=await mkCtx(1440,'pc'),ctxM=await mkCtx(390,'mob');
 const P=await open(ctxP,'PC'),M=await open(ctxM,'MOB');
 await login(P);await login(M);
 /* 시드 */
 push(SEED);R.seed=await hl(P);
 R.seedMeta=await P.evaluate(async()=>{const by=n=>state.trades.find(t=>t.name===n);const eth=by('ETH'),sol=by('SOL');eth.review='ETH 처음 복기';touch(eth);sol.initialRisk=10;sol.stop0=45;sol.entryNote='SOL 근거';touch(sol);
  state.dailyReviews={...(state.dailyReviews||{}),HL:{'2026-10-29':{memo:'옛 일간 메모',score:3}}};state.v121Scalp={hl:{'2026-10-30':{memo:'옛 단타 메모'}}};
  Object.assign(state.settings,{limD:2.5,limW:6,limM:10});await persist();return {auto:state.trades.every(t=>t.sync&&t.sync.tradeKey),ids:state.trades.map(t=>t.id.slice(0,5))};});
 R.sync0={p:await sync(P),m:await sync(M)};R.mob0=await snap(M);
 /* 모바일: 옛 세대에서 ETH 글 고침(아직 안 올림) */
 await M.evaluate(async()=>{const t=state.trades.find(x=>x.name==='ETH');t.review='ETH 폰에서 고침';touch(t);await persist();});
 /* (0) 보관 실패 → 무변경 */
 await toSettings(P);await P.waitForTimeout(200);
 R.fail=await P.evaluate(async()=>{V126.failArc=true;const n0=state.trades.length,j0=JSON.stringify(state.trades);const ok=await v126Start();V126.failArc=false;
  return {ok,n:state.trades.length,same:JSON.stringify(state.trades)===j0,cfg:!!state.settings.v126,arc:!!state.v126Archive,msg:(document.getElementById('v126Msg')||{}).textContent||'',bad:!!document.querySelector('#v126Msg.bad')};});
 R.dl0=dls.length;
 /* (1) PC UI: 새 출발 */
 await toSettings(P);await P.waitForTimeout(150);
 await P.evaluate(()=>{V126.ui.msg='';v126Paint();$('v126Card').scrollIntoView({block:'start'});});
 await P.click('#v126Card [data-v126="ask"]');await P.waitForTimeout(200);
 R.confirm=await P.evaluate(()=>{const b=document.getElementById('v126Confirm');return b?{vis:b.getClientRects().length>0,carry:[...b.querySelectorAll('.v126-carry li b')].map(x=>x.textContent),txt:b.textContent.includes('보관함으로')&&b.textContent.includes('그대로'),tab:!!b.closest('#v12Set-account')}:null;});
 R.confirmL={bad:await P.evaluate(over,'#v126Card')};
 await P.screenshot({path:path.join(outDir,'pc-confirm.png'),fullPage:false}).catch(e=>R.shotErr=e.message);
 const t0=Date.now();
 await P.click('#v126Card [data-v126="go"]');
 await P.waitForFunction(()=>!V126.busy&&!!state.settings.v126,null,{timeout:30000});await P.waitForTimeout(300);
 R.start=await snap(P);
 R.startMore=await P.evaluate(async()=>{const c=state.settings.v126;const L=ledgerOf();const lim=limitStatus();const loc=await v126LocalList();setPage('records');renderAll();await new Promise(r=>setTimeout(r,200));
  const badge=[...document.querySelectorAll('#recordList .v126-b')].filter(e=>e.getClientRects().length).map(e=>e.textContent);
  return {cut:c.cutoff>0,day:c.day,eq:c.eq,eqNow:Math.round(acctBasis()*100)/100,carry:c.carry.length,preLedger:L.filter(e=>(e.timestamp||0)<c.cutoff).length,dayBasis:lim[0]&&lim[0].basis&&lim[0].basis.v126===true,dayVal:lim[0]&&lim[0].account,weekBasis:lim[1]&&lim[1].basis&&lim[1].basis.v126===true,
   local:loc.length,localN:loc[0]&&loc[0].n,badge,msg:V126.ui.msg.slice(0,8),dbg:(()=>{const d=v126Debug();return {ver:d.ver,on:d.on,arc:d.archive&&d.archive.trades,carry:d.active.carry.length,pre:d.active.preCut};})()};});
 R.dl=dls.slice();
 await P.screenshot({path:path.join(outDir,'pc-records.png')}).catch(e=>R.shotErr=e.message);
 R.push1=await sync(P);R.cloud1={act:C.payload.trades.map(t=>t.name).sort(),arc:(C.payload.v126Archive&&C.payload.v126Archive.state.trades.length)||0,cfg:!!(C.payload.settings&&C.payload.settings.v126&&C.payload.settings.v126.on)};
 R.pushFlag=await P.evaluate(()=>V126.pushEp);
 /* (2) 옛 세대 기기(모바일) 병합 */
 await toSettings(M);await M.waitForTimeout(150);
 R.mobCard=await M.evaluate(()=>{$('v126Card').scrollIntoView({block:'start'});return !!$('v126Card').querySelector('[data-v126="ask"]');});
 await M.click('#v126Card [data-v126="ask"]');await M.waitForTimeout(200);R.mobConfirmL={bad:await M.evaluate(over,'#v126Card')};
 await M.screenshot({path:path.join(outDir,'mob-confirm.png')}).catch(e=>R.shotErr=e.message);
 await M.click('#v126Card [data-v126="no"]');
 R.mobSync=await sync(M);R.mob1=await snap(M);R.mobBlock=await M.evaluate(()=>!!V110.block);
 R.mobSync2=await sync(M);R.cloud2={act:C.payload.trades.map(t=>t.name).sort(),arcEth:(C.payload.v126Archive.state.trades.find(t=>t.name==='ETH')||{}).review};
 R.pcSync2=await sync(P);R.pc2=await snap(P);
 await toSettings(M);await M.waitForTimeout(250);
 R.mobCard2=await M.evaluate(()=>{const c=$('v126Card');c.scrollIntoView({block:'start'});return {active:!!c.querySelector('[data-v126="undo-ask"]'),carry:[...c.querySelectorAll('.v126-carry li b')].map(x=>x.textContent)};});
 R.mobCardL={bad:await M.evaluate(over,'#v126Card')};
 await M.screenshot({path:path.join(outDir,'mob-card.png')}).catch(e=>R.shotErr=e.message);
 /* 새 기기(빈 상태) */
 const ctxN=await mkCtx(390,'new');const N=await open(ctxN,'NEW');await login(N);R.newSync=await sync(N);R.new1=await snap(N);await ctxN.close();
 /* 예전 앱이 옛 거래를 되살려 올린 저장본 흉내 */
 {const pl=JSON.parse(JSON.stringify(C.payload));const old=pl.v126Archive.state.trades.filter(t=>!t.v126CarryCopy).map(t=>{const x={...t};delete x.v126CarryCopy;return x;});pl.trades=[...pl.trades,...old];pl.graveyard=(pl.graveyard||[]).filter(g=>!g.v126);C.hist.push({revision:C.rev,payload:C.payload});C.rev++;C.payload=pl;C.updated=new Date().toISOString();}
 R.oldSync=await sync(P);R.old1=await snap(P);R.oldCloud=C.payload.trades.map(t=>t.name).sort();
 /* (3) 새 출발 뒤 체결 */
 const cut=await P.evaluate(()=>state.settings.v126.cutoff);
 push([fill('SOL',cut+60e3,'A',2,52,2,'Close Long',4),fill('DOGE',cut+120e3,'B',3,10,0,'Open Long',0),fill('DOGE',cut+180e3,'A',3,11,3,'Close Long',3),
  fill('XRP',T('2026-10-29T15:00:00Z'),'B',5,2,0,'Open Long',0),fill('XRP',T('2026-10-29T16:00:00Z'),'A',5,1.8,5,'Close Long',-1)]);
 R.after=await hl(P);
 R.afterMore=await P.evaluate(()=>{const s=state.trades.find(t=>t.name==='SOL');return {solCarry:!!(s&&s.v126Carry),solDone:!!(s&&calcTrade(s).done),solRisk:s&&s.initialRisk,solNote:s&&s.entryNote,drop:V126.st.snapDrop>0,
  ledgerDays:[...new Set(ledgerOf().map(e=>e.date))].sort()};});
 /* (4) 보관함 보기 */
 await P.evaluate(()=>{setPage('records');renderAll();});await P.waitForTimeout(150);
 R.chip=await P.evaluate(()=>{const c=$('v126Chip');return c?{vis:!c.hidden&&c.getClientRects().length>0,txt:c.textContent}:null;});
 await P.click('#v126Chip');await P.waitForFunction(()=>V126.mode==='arc',null,{timeout:20000});await P.waitForTimeout(400);
 R.arcView=await P.evaluate(async()=>{const bar=$('v126Bar');const badge=[...document.querySelectorAll('#recordList .v126-b')].filter(e=>e.getClientRects().length).map(e=>e.textContent);
  const sy=await v110Sync('test',{force:true});return {mode:V126.mode,names:state.trades.map(t=>t.name).sort(),bar:!!(bar&&bar.getClientRects().length),barTxt:bar?bar.textContent.slice(0,6):'',badge,sync:sy,nav:+($('navCount').textContent)};});
 R.arcBarL={bad:await P.evaluate(over,'#v126Bar')};
 await P.screenshot({path:path.join(outDir,'pc-archive.png')}).catch(e=>R.shotErr=e.message);
 R.arcEdit=await P.evaluate(async()=>{const t=state.trades.find(x=>x.name==='ETH');openTrade(t.id,'review');await new Promise(r=>setTimeout(r,300));const st=document.querySelector('#detailTitle .v126-b');t.review='보관함에서 쓴 복기';touch(t);const ok=await persist();
  const stash=!!localStorage.getItem(KEY+':v126arc');$('tradeDialog').close();return {ok,stash,realAct:V126.real.trades.map(x=>x.name).sort()};});
 await P.click('#v126Bar [data-v126="arc-close"]');await P.waitForFunction(()=>!V126.mode,null,{timeout:20000});await P.waitForTimeout(400);
 R.arcClosed=await snap(P);R.arcClosedMore=await P.evaluate(()=>({stash:!!localStorage.getItem(KEY+':v126arc'),bar:!!$('v126Bar')}));
 R.push3=await sync(P);R.mobSync3=await sync(M);R.mob3=await snap(M);
 /* (5) ?v126=0 보기 전용 */
 {const P0=await open(ctxP,'PC0',base+'?journal=hyperliquid&v126=0');await P0.waitForFunction(()=>V126.mode==='all',null,{timeout:20000}).catch(()=>{});await P0.waitForTimeout(300);
  R.v0=await P0.evaluate(async()=>{const n=state.trades.length,names=state.trades.map(t=>t.name).sort();const r=await persist();const sy=await v110Sync('test',{force:true});
   const bar=$('v126Bar');return {mode:V126.mode,n,names,persist:r,sync:sy,bar:!!(bar&&bar.getClientRects().length),arcBadge:[...document.querySelectorAll('.v126-b.arc')].length>=0};});
  R.v0L={bad:await P0.evaluate(over,'#v126Bar')};await P0.close();}
 R.afterV0=await snap(P);
 /* (5b) 미국 주식 일지(수동 기록) — 같은 기기라 HL 기준 시각 제안 → 같은 시각으로 새 출발 */
 {const U=await open(ctxP,'US',base+'?journal=us');
  R.us0=await U.evaluate(async()=>{const mk=(id,name,ed,et,xd,xt,open)=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,name,direction:'long',date:ed,stop:9,stop0:9,initialRisk:10,setup:'미분류',process:'unreviewed',review:'',violations:[],
    entries:[{id:id+'e',date:ed,time:et,shares:10,price:10,fee:0}],fills:open?[]:[{id:id+'f',date:xd,time:xt,shares:10,price:11,fee:0}],funding:[],images:[]});
   state.trades=[mk('u1','AAPL','2026-10-29','10:00:00','2026-10-29','11:00:00'),mk('u2','MSFT','2026-10-30','10:00:00',null,null,true)];state.settings.account=5000;await persist();setPage('settings');try{v12SelectTab('account');}catch{}renderAll();
   await new Promise(r=>setTimeout(r,150));const c=$('v126Card');c.scrollIntoView({block:'start'});return {x:!!c.querySelector('[data-v126="x-yes"]'),n:state.trades.length};});
  await U.click('#v126Card [data-v126="x-yes"]');await U.waitForTimeout(150);
  R.usConfirm=await U.evaluate(()=>{const b=$('v126Confirm');return b?{carry:[...b.querySelectorAll('.v126-carry li b')].map(x=>x.textContent)}:null;});
  R.usConfirmL={bad:await U.evaluate(over,'#v126Card')};
  await U.click('#v126Card [data-v126="go"]');await U.waitForFunction(()=>!V126.busy&&!!(state.settings.v126&&state.settings.v126.on),null,{timeout:30000});await U.waitForTimeout(200);
  R.us1=await U.evaluate(hc=>{const c=state.settings.v126;return {sameCut:c.cutoff===hc,act:state.trades.map(t=>t.name+(t.v126Carry?'*':'')),arc:state.v126Archive.state.trades.map(t=>t.name).sort(),eq:c.eq,day:c.day};},cut);
  await U.close();}
 /* (6) 새 출발 취소 */
 await toSettings(P);await P.waitForTimeout(200);await P.evaluate(()=>$('v126Card').scrollIntoView({block:'start'}));
 await P.click('#v126Card [data-v126="undo-ask"]');await P.waitForTimeout(150);
 R.undoBox=await P.evaluate(()=>!!$('v126UndoBox'));
 await P.click('#v126Card [data-v126="undo-go"]');await P.waitForFunction(()=>!V126.busy&&!(state.settings.v126&&state.settings.v126.on),null,{timeout:30000});await P.waitForTimeout(300);
 R.undo=await snap(P);R.undoMore=await P.evaluate(()=>({undone:!!state.settings.v126.undone,eth:(state.trades.find(t=>t.name==='ETH')||{}).review,dr:((state.dailyReviews||{}).HL||{})['2026-10-29']?.memo||null,sc:((state.v121Scalp||{}).hl||{})['2026-10-30']?.memo||null,chip:!!($('v126Chip')&&!$('v126Chip').hidden)}));
 R.push4=await sync(P);R.mobSync4=await sync(M);R.mob4=await snap(M);
 R.cloud4=C.payload.trades.map(t=>t.name).sort();
 R.casBad=C.cas.filter(c=>!c.ok).length;
 R.over=await P.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 R.overM=await M.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
