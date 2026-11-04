/* v115 QA — 응답 없는 다른 창이 잠금을 쥔 경우 · 안전 모드 · 되살림 한 번 · 진단 복사 상자 · 비정상 종료 제안. 모의 클라우드·모의 HL(외부 연결 없음, 가짜 주소·id).
   (G) 같은 브라우저의 다른 페이지(빈 페이지)가 로그인 갱신·동기화·실시간 리더·기기 저장 잠금을 쥐고 영원히 놓지 않음 + 토큰 만료 →
       v114: '받는 중' 고정·hlcBusy 고정·HL 요청 0·리더 아님. v115: 잠금 6~8초 뒤 잠금 없이 진행 → 동기화됨, HL 체결 반영 끝, 잔고 요청, 이 창이 리더, 경고 줄 '다른 창 확인', 진단에 잠금 보유자.
   (H) 건강한 다른 v115 창이 리더면 인계(steal)하지 않음.
   (I) 다른 창이 기기 저장소(IndexedDB records 쓰기)를 붙잡음 → persist가 끝없이 기다리지 않고 '저장 대기'로 넘어감(클릭 잠금 풀림), 그 창이 닫히면 최신본 저장.
   (S) ?safe=1: 안전 모드 줄, 클라우드·HL 요청 0(봉 제외), 진단 열림, [일반 모드로 다시 열기]는 safe 없는 주소.
   (R) 보존 사본 되살림: 같은 사본·거래·칸은 한 번만(다시 비어도 다시 채우지 않음).
   (C) 진단 [복사]: 상자에 본문·상태 문구, 알림(toast)이 진단 창 위.
   (A) 다른 창이 30분 안에 정상 종료 없이 신호가 끊김 → '지난번 비정상 종료' 줄 + [안전 모드로 열기]. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const C={rev:0,payload:null,cas:[],heads:0,fulls:0,calls:0,tok:0};
function cloud(req){const u=new URL(req.url),p=u.pathname;C.calls++;
 if(p==='/rest/v1/journal_cloud'){if(u.search.includes('payload')){C.fulls++;return C.rev?[{revision:C.rev,payload:C.payload,updated_at:new Date().toISOString()}]:[];}C.heads++;return C.rev?[{revision:C.rev,updated_at:new Date().toISOString()}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};C.cas.push({dev:req.dev,exp:b.p_expected_revision});if(b.p_expected_revision!==C.rev)return null;C.rev++;C.payload=b.p_payload;return C.rev;}
 if(p==='/auth/v1/token'){C.tok=(C.tok||0)+1;return {access_token:'tokNEW115',refresh_token:'rNEW115',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'}};}
 if(p==='/rest/v1/rpc/hl_status')return {address:A,max_fill_id:0,max_funding_id:0,fills_count:0,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()};
 return [];}
const init=([A])=>{
 const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.__spotGo=true;window.__spotN=0;
 window.__hlHang=new Set();window.__cloudHang=null;window.__cloudDelay=0;window.__hangN=0;
 const hang=(o,dead)=>new Promise((res,rej)=>{window.__hangN++;if(dead)return;const s=o&&o.signal;if(s){if(s.aborted)return rej(s.reason||new DOMException('aborted','AbortError'));s.addEventListener('abort',()=>rej(s.reason||new DOMException('aborted','AbortError')),{once:true});}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(navigator.onLine===false)throw new TypeError('Failed to fetch');
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;if(b.type!=='candleSnapshot')window.__hlN=(window.__hlN||0)+1;if(window.__hlHang.has(b.type))await hang(o,false);
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':{window.__spotN++;for(let i=0;i<600&&!window.__spotGo;i++)await new Promise(r=>setTimeout(r,50));
     out={balances:window.__spotHeld?[{coin:'USDC',token:0,total:'0',hold:'0',entryNtl:'0'},{coin:'HYPE',token:1,total:'10',hold:'0',entryNtl:'0'}]:[{coin:'USDC',token:0,total:'0',hold:'0',entryNtl:'0'}]};break;}
    case 'spotMetaAndAssetCtxs':out=[{universe:[{tokens:[1,0],index:0,name:'@1'}],tokens:[{name:'USDC',index:0,szDecimals:8},{name:'HYPE',index:1,szDecimals:2}]},[{markPx:'10',midPx:'10'}]];break;
    case 'perpDexs':out=[null];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'frontendOpenOrders':case 'userFillsByTime':case 'userFills':case 'userFunding':case 'historicalOrders':out=[];break;
    case 'candleSnapshot':{const iv=IV[b.req.interval]||6e4;out=[];let p=100;for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<3000;t+=iv,i++){const c=p+Math.sin(i/3)*0.3;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.1),l:String(Math.min(p,c)-0.1),v:'10',n:5});p=c;}break;}
    default:out={};}
   return J(out);}
  if(u.includes('.supabase.co/')){const full=u.includes('payload'),isHead=u.includes('/journal_cloud')&&!full;const H=window.__cloudHang;
   if(H&&((H==='head'&&isHead)||(H==='full'&&full)||(H==='any')))await hang(o,false);if(H==='dead'&&isHead)await hang(o,true);
   if(full&&window.__cloudDelay){await new Promise((res,rej)=>{const t=setTimeout(res,window.__cloudDelay);o.signal&&o.signal.addEventListener('abort',()=>{clearTimeout(t);rej(o.signal.reason);},{once:true});});}
   let body;try{body=o.body?JSON.parse(o.body):undefined;}catch{}const r=await window.__cloud({url:u,method:o.method||'GET',body});
   if(r&&r.__status)return J({message:r.message},r.__status);return J(r===undefined?null:r);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}
  send(d){const m=JSON.parse(d);if(m.method==='subscribe')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'userFills',data:{isSnapshot:true,user:m.subscription.user,fills:[]}})}),25);if(m.method==='ping')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'pong'})}),5);}
  close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;
};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';const BASE='http://127.0.0.1:'+srv.address().port;
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);await ctx.route('**/ghost',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>ghost</title><p>ghost'}));return ctx;};
 const open=async(ctx,name,url)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(url||URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const S=globalThis.__S={};
 const login=(P,exp)=>P.evaluate(([P0,exp])=>{cloudConfig={url:P0,key:'sb_publishable_'+'q'.repeat(24)};localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(cloudConfig));try{v14Where='local';localStorage.setItem('tj:v14-keep-login','1');}catch{}
  cloudSession={project:P0,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tokSECRETqa115',refresh_token:'rSECRETqa115',expires_at:Math.floor(Date.now()/1000)+(exp?-600:36000)};cloudSaveSession(cloudSession);v110Paint();},[PRJ,!!exp]);
 const KEYN='tl:journal:hyperliquid-v1',LOCKS=['tj-v14-cloud-refresh','tj-v110:'+KEYN,'tj-hlws:'+KEYN,KEYN+'-write'];
 /* ---- (G) 응답 없는 다른 창이 잠금 4개를 쥠 + 토큰 만료 ---- */
 {const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'G');await login(P,false);
  await P.evaluate(()=>{state.trades=[];return persist();});await P.waitForFunction(()=>!V110.busy,null,{timeout:20000}).catch(()=>{});
  const g=await ctx.newPage();await g.goto(BASE+'/ghost');await g.evaluate(ns=>Promise.all(ns.map(n=>new Promise(ok=>navigator.locks.request(n,()=>{ok();return new Promise(()=>{});})))),LOCKS);
  await login(P,true);const tok0=C.tok;await P.reload();await P.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});const t0=Date.now();
  await P.waitForFunction(()=>V110.st==='ok'&&!hlcBusy&&hlbLast>0&&V93.leader&&!!V115.warn,null,{timeout:45000}).catch(()=>{});
  S.G=await P.evaluate(()=>({st:V110.st,hlcBusy,addr:!!(hlcStatus&&hlcStatus.address),hlb:hlbLast>0,hlN:(window.__hlN||0)>0,leader:V93.leader,steal:V115.n.steal>=1,
   tokenTO:((V115.n.lockTimeout['tj-v14-cloud-refresh']||0)+V115.n.tokenNoLock+V115.n.tokenTimeout)>=1,syncTO:(V113S.n.lockSkip||0)>=1,warn:/응답 없는 다른 일지 창/.test(V115.warn),
   bar:(()=>{const b=$('v115Bar');return !!(b&&!b.hidden&&b.textContent.includes('다른 창 확인'));})(),fresh:!!(cloudSession&&cloudSession.access_token==='tokNEW115'),
   diag:(()=>{const t=v114Text();return {sec:t.includes('[v115 · 다른 창·잠금·안전 모드]'),lock:/잠금: .*로그인 갱신:쥠\(\? 응답 없음/.test(t),rev:/자동 동기화 기준 rev/.test(t)&&!/클라우드 버전 0/.test(t),secret:/SECRETqa115|tokNEW115/.test(t)};})(),
   over:document.documentElement.scrollWidth>innerWidth+1}));
  S.G.sec=Math.round((Date.now()-t0)/1000)<=45;S.G.tok=C.tok>tok0;
  await P.screenshot({path:path.join(outDir,'ghost-1440.png')}).catch(e=>{R.shotErr=e.message;});
  /* (H) 건강한 v115 창이 리더 → 새 창은 인계하지 않음 (잠금을 쥔 빈 페이지는 닫음) */
  await g.close();await P.waitForTimeout(500);
  const Q=await open(ctx,'H');await Q.waitForTimeout(9000);
  S.H=await Q.evaluate(()=>({leader:V93.leader,steal:V115.n.steal,peer:V93.peer.at>0}));S.H.pLeader=await P.evaluate(()=>V93.leader);
  await Q.close();await ctx.close();}
 /* ---- (I) 다른 창이 기기 저장소를 붙잡음 ---- */
 {const ctx=await mkCtx(1440,'idb');const P=await open(ctx,'I');await P.evaluate(()=>{V115T.idb=1500;});
  const g=await ctx.newPage();await g.goto(BASE+'/ghost');
  await g.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('trade-journal-hyperliquid-v1');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('records','readwrite');const st=tx.objectStore('records');const spin=()=>{st.get('main').onsuccess=spin;};spin();ok();};}));
  S.I=await P.evaluate(async()=>{const t=Date.now();state.settings.v115qa=1;const ok=await Promise.race([persist(),new Promise(r=>setTimeout(()=>r('timeout'),8000))]);
   const ms=Date.now()-t;await new Promise(r=>setTimeout(r,100));const o={ok,ms:ms<6000,save:$('saveState').textContent.includes('저장 대기'),hang:!!V115.hang};state.settings.v115qa=2;await persist();o.co=V115.n.coalesce>=1;await new Promise(r=>setTimeout(r,2000));o.busy=interactionBusy();return o;});
  await g.close();await P.waitForTimeout(2500);
  S.I.after=await P.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('trade-journal-hyperliquid-v1');r.onsuccess=()=>{const q=r.result.transaction('records').objectStore('records').get('main');q.onsuccess=()=>ok({qa:q.result&&q.result.settings&&q.result.settings.v115qa,hang:!!V115.hang,save:$('saveState').textContent.includes('이 기기에 저장됨')});};}));
  await ctx.close();}
 /* ---- (S) 안전 모드 ---- */
 {const ctx=await mkCtx(390,'safe');const P=await open(ctx,'S0');await login(P,false);await P.waitForTimeout(1500);
  const P2=await open(ctx,'S',URL0+'&safe=1');await P.close();
  await P2.evaluate(()=>{window.__hlN=0;});const c1=C.calls;await P2.waitForTimeout(6000);
  S.S=await P2.evaluate(async()=>{const b=$('v115Bar');const r={safe:V115.safe,bar:!!(b&&!b.hidden&&b.textContent.includes('안전 모드')),hl:window.__hlN||0,sync:await v110Sync('qa',{force:true}),
   over:document.documentElement.scrollWidth>innerWidth+1};v114Open();await new Promise(x=>setTimeout(x,200));r.diag=!$('v114Diag').hidden&&v114Text().includes('안전 모드(동기화·HL 수집 꺼짐)');v114Close();r.url=v115Url(false).includes('safe=')?'has-safe':'ok';return r;});
  S.S.cloud=C.calls-c1;await P2.screenshot({path:path.join(outDir,'safe-390.png')}).catch(e=>{R.shotErr=e.message;});await ctx.close();}
 /* ---- (R) 되살림 한 번 · (C) 복사 상자 · (A) 비정상 종료 제안 ---- */
 {const ctx=await mkCtx(1440,'r');const P=await open(ctx,'R');
  S.R=await P.evaluate(()=>{const tk='hyperliquid:0xabc:ETH:1';const t={id:'t1',name:'ETH',direction:'long',entryNote:'',entries:[{sourceKey:'k1'}],fills:[],sync:{tradeKey:tk}};
   const c={reason:'BACKFILL_REGROUP_REQUIRES_REVIEW',trade:{id:'old1',name:'ETH',direction:'long',entryNote:'왜 샀나 QA',entries:[{sourceKey:'k1'}],fills:[],sync:{tradeKey:tk}}};
   const s={trades:[t],sync:{conflicts:[c]}};const n1=v110RestoreFrom(s);const v1=t.entryNote;t.entryNote='';delete c.v110Restored;const n2=v110RestoreFrom(s);return {n1,v1,n2,v2:t.entryNote,skip:V115.n.restoreSkip>=1};});
  S.C=await P.evaluate(async()=>{v114Open();await new Promise(r=>setTimeout(r,200));const ok=await v114Copy();const ta=$('v115CopyBox');const st=document.querySelector('.v115-copy-st');
   const zt=Number(getComputedStyle($('toast')).zIndex),zd=Number(getComputedStyle($('v114Diag')).zIndex);const card=document.querySelector('.v114-card');
   const r={box:!!ta&&ta.value.includes('[v115 · 다른 창·잠금·안전 모드]'),st:!!(st&&st.textContent.length>5),toastTop:zt>zd,over:card.scrollWidth>card.clientWidth+1};v114Close();return r;});
  S.A=await P.evaluate(()=>{const m=JSON.parse(localStorage.getItem(V115_TABS)||'{}');m.zzzz9999={at:Date.now()-60000,ver:'v114',stage:'HL 체결 반영',closed:false};localStorage.setItem(V115_TABS,JSON.stringify(m));
   v115Suggest();const b=$('v115Bar');const r={bar:!!(b&&!b.hidden&&b.textContent.includes('지난번 비정상 종료')&&b.textContent.includes('HL 체결 반영')),btn:!!(b&&b.querySelector('[data-v115="safe"]'))};
   b.querySelector('[data-v115="hide"]').click();r.hid=b.hidden;return r;});
  await ctx.close();}
 Object.assign(R,S);console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.log(JSON.stringify({...(globalThis.__S||{}),errors:['FATAL '+(e&&e.stack||e)]}));process.exit(1);});
