/* v110 QA — PC(1440)·모바일(390) 두 브라우저 컨텍스트 + 모의 클라우드(Supabase journal_cloud·journal_cas·hl_status·hl_fills, 이 스크립트 안 node 메모리, 외부 연결 없음).
   가짜 프로젝트 abcdefghijklmnop.supabase.co, 가짜 주소 0x1111…, kPEPE 체결은 t110-kpepe.json(구조만 실제, 주소·hash·oid·tid 가짜·시각 4일 당김).
   (s0) PC 일지 → 모바일 첫 병합  (s1) 양쪽 다른 칸 편집(화면 입력) → 둘 다 남음  (s2) 같은 칸 → 최신 + 진 값 사본·'충돌 1건' → 진 값으로 바꾸기 → 양쪽 반영
   (s3) 그림 양쪽 추가(v40Save → V100 묶음) → 둘 다  (s4) 모바일 입력 중 동기화 → 칸·포커스 유지, 나중에 저장
   (s5) kPEPE 체결 지연·순서 뒤바뀜 → POSITION_GAP 보류 중에도 롱 메모·그림 유지 → 다 오면 롱 종료 + 숏, 숏에 '같은 주문으로 청산된 직전 롱' 링크·목록 '뒤집힘'
        + 예전 재묶기 사본 1회 되살림(빈 칸만)  (s6) 같은 PC 창 2개(v83) → 칸 단위 병합(글 + 다른 창 체결 둘 다)
   (s7) 로컬 기록에서 되살리기(설정 화면에서 거래·칸 선택)  (s8) 편집 뒤 자동 저장(디바운스) · 포커스 복귀 자동 받기 · 헤더 '동기화됨 hh:mm' */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const KP=JSON.parse(fs.readFileSync(path.join(__dirname,'t110-kpepe.json'),'utf8')).fills;
/* ---- 모의 클라우드 ---- */
const C={rev:0,payload:null,updated:null,hist:[],cas:[],heads:0,fulls:0,fills:[],nextId:1};
function cloud(req){const u=new URL(req.url),p=u.pathname,q=u.search;
 if(p==='/rest/v1/journal_cloud'){if(q.includes('payload')){C.fulls++;return C.rev?[{revision:C.rev,payload:C.payload,updated_at:C.updated}]:[];}C.heads++;return C.rev?[{revision:C.rev,updated_at:C.updated}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};const ok=b.p_payload&&b.p_payload.format==='trade-journal-hyperliquid'&&Array.isArray(b.p_payload.trades);C.cas.push({dev:req.dev,exp:b.p_expected_revision,cur:C.rev,ok});if(!ok)return {__status:400,message:'bad payload'};
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
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25},{name:'kPEPE',szDecimals:0,maxLeverage:10}]};break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];break;
    case 'frontendOpenOrders':case 'userFillsByTime':case 'userFills':case 'userFunding':case 'historicalOrders':out=[];break;
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
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const login=p=>p.evaluate(P=>{cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};v110Paint();},PRJ);
 const sync=p=>p.evaluate(async()=>{for(let i=0;i<80&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));const r=await v110Sync('test',{force:true});for(let i=0;i<80&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));return r;});
 const tr=(p,id,k)=>p.evaluate(([id,k])=>{const t=state.trades.find(x=>x.id===id);return t?t[k]:'NO';},[id,k]);
 const stage=(p,id,patch)=>p.evaluate(async([id,patch])=>{const t=state.trades.find(x=>x.id===id);v100Stage(t,patch,10);await v100Flush(true);},[id,patch]);
 const idle=p=>p.evaluate(async()=>{for(let i=0;i<80&&(V110.busy||publicBusy>0);i++)await new Promise(r=>setTimeout(r,100));});
 const closeDlg=p=>p.evaluate(()=>{const d=$('tradeDialog');if(d&&d.open)d.close();const q=$('v110Pop');if(q)q.hidden=true;});
 const ctxP=await mkCtx(1440,'pc'),ctxM=await mkCtx(390,'mob');
 const P=await open(ctxP,'PC'),M=await open(ctxM,'MOB');
 /* s0: PC 일지 → 클라우드 → 모바일 첫 병합 */
 await P.evaluate(async()=>{const D=Date.now()-86400e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
  const mk=(id,name)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:D,name,direction:'long',date:new Date(D).toISOString().slice(0,10),stop:98,stop0:98,initialRisk:null,riskR:1,setup:'눌림',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
   entryNote:'',stopNote:'',entries:[ev(id+'e',D,10,100)],fills:[ev(id+'f',D+3600e3,10,101)],funding:[],images:[]});
  state.trades=[mk('gA','ETH'),mk('gB','BTC'),mk('gC','SOL')];await persist();renderAll();});
 await login(P);await login(M);
 const S=globalThis.__S={};
 S.s0={pc:await sync(P),mob:await sync(M),rev:C.rev,mobTrades:await M.evaluate(()=>state.trades.map(t=>t.id).sort()),cas0:C.cas.map(c=>c.exp)};
 /* s1: 다른 칸(화면 입력) */
 const typeArea=async(p,id,k,text,touch)=>{await p.evaluate(id=>openTrade(id,'review'),id);await p.waitForFunction(k=>!!document.querySelector(`#tradeDialog[open] [data-v71-area="${k}"]`),k,{timeout:15000});await p.waitForTimeout(250);
  const L=p.locator(`#tradeDialog [data-v71-area="${k}"]`);await L.scrollIntoViewIfNeeded();if(touch)await L.tap();else await L.click();await p.keyboard.type(text,{delay:0});};
 await typeArea(P,'gA','entryNote','PC 진입 근거');await P.evaluate(()=>document.activeElement.blur());await P.waitForTimeout(500);await closeDlg(P);
 await typeArea(M,'gA','stopNote','모바일 스탑 이유',true);await M.evaluate(()=>document.activeElement.blur());await M.waitForTimeout(500);await closeDlg(M);
 await idle(P);await idle(M);
 await sync(P);await sync(M);await sync(P);
 S.s1={pc:[await tr(P,'gA','entryNote'),await tr(P,'gA','stopNote')],mob:[await tr(M,'gA','entryNote'),await tr(M,'gA','stopNote')],
  saved:await M.evaluate(async()=>{const s=await v83Read();const t=s.trades.find(x=>x.id==='gA');return [t.entryNote,t.stopNote];}),cloud:(()=>{const t=C.payload.trades.find(x=>x.id==='gA');return [t.entryNote,t.stopNote];})()};
 /* s2: 같은 칸 충돌 */
 await stage(P,'gB',{exitNote:'PC 청산'});await P.waitForTimeout(60);await stage(M,'gB',{exitNote:'모바일 청산'});
 await idle(P);await idle(M);await sync(P);await sync(M);await sync(P);
 const chip=p=>p.evaluate(()=>{const b=document.querySelector('#v110Sync [data-v110-cf]');if(!b||b.hidden)return null;const r=b.getBoundingClientRect();return {txt:b.textContent,vis:r.width>0&&r.height>0&&r.right<=innerWidth+1};});
 S.s2={pc:await tr(P,'gB','exitNote'),mob:await tr(M,'gB','exitNote'),pcChip:await chip(P),mobChip:await chip(M),
  conf:await P.evaluate(()=>v110Open().map(c=>({tradeId:c.tradeId,field:c.field,kept:c.kept,lost:c.lost})))};
 await P.click('#v110Sync [data-v110-cf]');await P.waitForTimeout(200);
 S.s2.pop=await P.evaluate(()=>{const p=$('v110Pop');return {vis:!p.hidden,txt:p.textContent.replace(/\s+/g,' ').slice(0,300),over:p.querySelector('.v110-pop-in').scrollWidth>p.querySelector('.v110-pop-in').clientWidth+1};});
 await P.screenshot({path:path.join(outDir,'t110-conflict-pc.png')}).catch(e=>{S.shotErr=String(e);});
 await P.click('#v110Pop [data-v110-use]');await P.waitForTimeout(400);await closeDlg(P);await idle(P);
 S.s2.useLocal=await tr(P,'gB','exitNote');S.s2.pcLeft=await P.evaluate(()=>v110Open().length);
 await sync(P);await sync(M);
 S.s2.mobAfter=await tr(M,'gB','exitNote');S.s2.mobLeft=await M.evaluate(()=>v110Open().length);
 /* s3: 그림 양쪽 추가(v40Save → V100) */
 const draw=(p,id,nid)=>p.evaluate(async([id,nid])=>{const t=state.trades.find(x=>x.id===id);const b=V110.n.chartV100;await v40Save(t,l=>[...l,{id:nid,kind:'hline',ts:null,px:100.5,text:'',at:Date.now()}],'');await V77Q;await new Promise(r=>setTimeout(r,300));
  const s=await v83Read();return {v100:V110.n.chartV100-b,saved:(s.trades.find(x=>x.id===id).chartNotes||[]).map(x=>x.id)};},[id,nid]);
 S.s3={pcDraw:await draw(P,'gC','p1'),mobDraw:await draw(M,'gC','m1')};
 await idle(P);await idle(M);await sync(P);await sync(M);await sync(P);
 const ids=async(p,id)=>(await tr(p,id,'chartNotes')||[]).map(x=>x.id).sort();
 S.s3.pc=await ids(P,'gC');S.s3.mob=await ids(M,'gC');S.s3.cloud=(C.payload.trades.find(x=>x.id==='gC').chartNotes||[]).map(x=>x.id).sort();
 /* s4: 모바일 입력 중 동기화 */
 await M.evaluate(()=>openTrade('gA','review'));await M.waitForFunction(()=>!!document.querySelector('#tradeDialog[open] [data-v71-area="entryNote"]'),null,{timeout:15000});await M.waitForTimeout(250);
 {const L=M.locator('#tradeDialog [data-v71-area="entryNote"]');await L.scrollIntoViewIfNeeded();await L.tap();await M.evaluate(()=>{const a=document.activeElement;a.setSelectionRange(a.value.length,a.value.length);});await M.keyboard.type(' + 모바일 입력 중',{delay:0});}
 await stage(P,'gA',{entryNote:'PC 새 근거'});await idle(P);await sync(P);
 await M.evaluate(async()=>{await v110Sync('test',{force:true});});await M.waitForTimeout(400);
 S.s4={typing:await M.evaluate(()=>{const a=document.activeElement,ta=document.querySelector('#tradeDialog [data-v71-area="entryNote"]');return {val:ta&&ta.value,focus:!!(a&&a.dataset&&a.dataset.v71Area==='entryNote'),state:state.trades.find(x=>x.id==='gA').entryNote};})};
 await M.keyboard.type(' 끝',{delay:0});await M.evaluate(()=>document.activeElement.blur());await M.waitForTimeout(500);await closeDlg(M);await idle(M);
 await sync(M);await sync(P);
 S.s4.mob=await tr(M,'gA','entryNote');S.s4.pc=await tr(P,'gA','entryNote');S.s4.cloud=C.payload.trades.find(x=>x.id==='gA').entryNote;
 S.s4.conf=await P.evaluate(()=>v110Open().filter(c=>c.tradeId==='gA'&&c.field==='entryNote').map(c=>c.lost));
 /* s5: kPEPE 체결 지연·순서 뒤바뀜 → POSITION_GAP */
 const entries=KP.filter(f=>f.dir==='Open Long'),rest=KP.filter(f=>f.dir!=='Open Long'),b0=rest.filter(f=>f.time===rest[0].time),late=b0[3];
 const push=list=>{for(const f of list)C.fills.push({id:C.nextId++,raw:f});};
 const hl=p=>p.evaluate(async()=>{for(let i=0;i<80&&(hlcBusy||hlcBlocked());i++)await new Promise(r=>setTimeout(r,100));await hlcSync(true);const L=state.trades.filter(t=>t.name==='kPEPE');
  return L.map(t=>({id:t.id,dir:t.direction,st:t.sync&&t.sync.positionStatus,held:!!(t.sync&&t.sync.v110Held),e:t.entries.length,f:t.fills.length,note:t.entryNote,chart:(t.chartNotes||[]).map(x=>x.id)})).sort((a,b)=>a.dir.localeCompare(b.dir));});
 push(entries);S.s5={a:await hl(P)};
 const longId=S.s5.a[0]&&S.s5.a[0].id;
 await stage(P,longId,{entryNote:'kPEPE 롱 근거'});await draw(P,longId,'k1');await idle(P);
 push(rest.filter(f=>f.tid!==late.tid).reverse());   // 늦게 도착 + 서버 id 순서가 시각과 반대
 S.s5.b=await hl(P);
 push([late]);S.s5.c=await hl(P);
 S.s5.gapSeen=await P.evaluate(()=>V110.n.held);
 const shortId=(S.s5.c.find(x=>x.dir==='short')||{}).id;
 await closeDlg(P);await P.evaluate(id=>openTrade(id),shortId);await P.waitForSelector('#tradeDialog[open] .v110-flip',{timeout:10000}).catch(()=>{});await P.waitForTimeout(300);
 S.s5.flip=await P.evaluate(()=>{const e=document.querySelector('#tradeDialog .v110-flip');if(!e)return null;const r=e.getBoundingClientRect();return {txt:e.textContent,vis:r.width>0};});
 await P.click('#tradeDialog .v110-flip [data-v110-open]');await P.waitForTimeout(400);
 S.s5.opened=await P.evaluate(()=>selectedId);S.s5.back=await P.evaluate(()=>{const e=document.querySelector('#tradeDialog .v110-flip');return e?e.textContent:'';});
 await closeDlg(P);
 S.s5.tag=await P.evaluate(id=>{const t=state.trades.find(x=>x.id===id);return tickerHTML(t).includes('v110-fliptag');},shortId);
 S.s5.tagLong=await P.evaluate(id=>{const t=state.trades.find(x=>x.id===id);return tickerHTML(t).includes('v110-fliptag');},longId);
 /* 예전 재묶기 사본 1회 되살림(빈 칸만) */
 S.s5.once=await P.evaluate(()=>{const s={trades:[{id:'z1',name:'ETH',direction:'long',entryNote:'',stopNote:'지금 글',chartNotes:[],entries:[{sourceKey:'hyperliquid:x:1'}]}],sync:{conflicts:[{reason:'BACKFILL_REGROUP_REQUIRES_REVIEW',trade:{id:'z1',name:'ETH',direction:'long',entryNote:'예전 근거',stopNote:'예전 스탑',chartNotes:[{id:'o1',kind:'hline',px:1}],entries:[{sourceKey:'hyperliquid:x:1'}]}}]}};
  const n1=v110Test.restore(s),t=s.trades[0];const snap={entryNote:t.entryNote,stopNote:t.stopNote,chart:t.chartNotes.map(x=>x.id)};t.entryNote='';const n2=v110Test.restore(s);return {n1,n2,...snap,flag:s.sync.conflicts[0].v110Restored};});
 await idle(P);await sync(P);
 S.s5.mob=await M.evaluate(async id=>{for(let i=0;i<80&&(hlcBusy||hlcBlocked());i++)await new Promise(r=>setTimeout(r,100));await hlcSync(true);await v110Sync('test',{force:true});const t=state.trades.find(x=>x.id===id);return t?{note:t.entryNote,chart:(t.chartNotes||[]).map(x=>x.id),st:t.sync.positionStatus}:null;},longId);
 /* s6: 같은 PC 창 2개(v83) — 다른 창이 그 거래 체결을 바꿔 저장해도 이 창 글 유지 */
 const P2=await open(ctxP,'PC2');
 await P2.evaluate(()=>{V83.bc.onmessage=null;});
 await P.evaluate(async()=>{const t=state.trades.find(x=>x.id==='gC');t.holdNote='A창 글';touch(t);await persist();});
 S.s6={save2:await P2.evaluate(async()=>{const t=state.trades.find(x=>x.id==='gC');const f=t.fills[0];t.fills.push({...f,id:'gCf2',shares:1,price:102,seq:(f.seq||0)+5});t.entries[0].shares=11;touch(t);return await persist();})};
 await P2.waitForTimeout(400);
 S.s6.stored=await P.evaluate(async()=>{const s=await v83Read();const t=s.trades.find(x=>x.id==='gC');return {hold:t.holdNote,fills:t.fills.length,sh:t.entries[0].shares,chart:(t.chartNotes||[]).map(x=>x.id).sort()};});
 S.s6.typingBlur=await P2.evaluate(()=>v83Typing());
 await P2.close();
 await P.evaluate(()=>v83Pull(0));await P.waitForTimeout(500);
 S.s6.pcMem=await P.evaluate(()=>{const t=state.trades.find(x=>x.id==='gC');return {hold:t.holdNote,fills:t.fills.length};});
 /* s7: 로컬 기록에서 되살리기 */
 await stage(P,'gC',{review:'되살릴 사후 메모'});await idle(P);await P.evaluate(async()=>{await v110Test.snap('QA');});
 await stage(P,'gC',{review:''});await idle(P);
 await P.evaluate(()=>{setPage('settings');});await P.waitForTimeout(300);
 await P.click('#v110Box [data-v110-snaps]');await P.waitForTimeout(400);
 S.s7={list:await P.evaluate(()=>document.querySelectorAll('#v110Snaps [data-v110-snap]').length)};
 await P.click('#v110Snaps [data-v110-snap]');await P.waitForTimeout(400);
 S.s7.opts=await P.evaluate(()=>[...document.querySelectorAll('#v110Snaps [data-v110-pick]')].filter(x=>x.dataset.v110Pick==='gC').map(x=>x.dataset.v110K));
 await P.check('#v110Snaps [data-v110-pick="gC"][data-v110-k="review"]');await P.click('#v110Snaps [data-v110-restore]');await P.waitForTimeout(800);
 S.s7.after=await tr(P,'gC','review');S.s7.snaps=await P.evaluate(async()=>(await v110Test.snaps()).length);
 S.s7.box=await P.evaluate(()=>{const b=$('v110Box');return {replace:!!b.querySelector('[data-v110-replace]'),auto:$('v110Auto').checked,over:b.scrollWidth>b.clientWidth+1};});
 await P.screenshot({path:path.join(outDir,'t110-settings-pc.png'),fullPage:false}).catch(e=>{S.shotErr=String(e);});
 await P.evaluate(()=>setPage('dashboard'));
 await idle(P);await sync(P);await sync(M);
 /* s8: 자동 저장(디바운스) · 포커스 복귀 자동 받기 */
 const rev0=C.rev;
 await M.evaluate(async()=>{V110.lastPush=0;const t=state.trades.find(x=>x.id==='gB');v100Stage(t,{holdNote:'자동 저장 확인'},10);await v100Flush(true);});
 await M.waitForTimeout(7000);
 S.s8={pushed:C.rev>rev0,cloud:C.payload.trades.find(x=>x.id==='gB').holdNote};
 await P.evaluate(()=>{V110.lastFocus=0;window.dispatchEvent(new Event('focus'));});await P.waitForTimeout(3000);await idle(P);
 S.s8.pc=await tr(P,'gB','holdNote');
 const head=p=>p.evaluate(()=>{const e=document.querySelector('#v110Sync .v110-st');const r=e.getBoundingClientRect();return {txt:e.textContent,vis:r.width>0&&r.height>0,over:document.documentElement.scrollWidth>innerWidth+1};});
 S.s8.headPc=await head(P);S.s8.headMob=await head(M);
 await M.screenshot({path:path.join(outDir,'t110-mob.png')}).catch(e=>{S.shotErr=String(e);});
 S.dbg={pc:await P.evaluate(()=>{const d=v110Debug();return {ready:d.ready,lastErr:d.lastErr,retry:d.retry};}),mob:await M.evaluate(()=>{const d=v110Debug();return {ready:d.ready,lastErr:d.lastErr,retry:d.retry};})};
 S.cas={n:C.cas.length,bad:C.cas.filter(c=>!c.ok).length,hist:C.hist.length};
 Object.assign(R,S);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);console.error('PARTIAL '+JSON.stringify(globalThis.__S||{}));process.exit(1);});
