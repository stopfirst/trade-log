/* v116 QA — 늦은 타이머 구조 · v91 접힘 묶음 다시 그리기 반복 · renderAll 폭주 묶음. 모의 클라우드·모의 HL(외부 연결 없음, 가짜 주소·id). 실제 시계(QA_REAL_CLOCK).
   (T) 페이지의 setTimeout/setInterval을 100초 늦게 만드는 주입(사용자 PC 진단 '타이머 지연 107529ms' 재현) + 토큰 만료 + HL 현물 메타 응답 없음 →
       v115: '동기화 대기'·HL 주소 없음·잔고 없음·리더 아님(사용자 화면과 같음). v116: 동기화됨·HL 체결 반영·잔고·리더·현물 메타 시간 초과로 칸 비움, 구조 횟수>0, 진단 'v116 · 타이머' 절.
       AbortSignal.timeout(300)도 3초 안에 끝남.
   (L) 분석 '계획 vs 실제 · 청산 진단' 묶음을 펼친 채로 → renderAll이 끝없이 다시 불리지 않음(5초 동안 실제 그리기 ≤ 3), 사람이 다시 펼치면 1번.
   (S) 짧은 몰림(renderAll 15번 연달아)은 15번 다 그림 · 입력 없이 0.1초마다 5초(초당 10번 이어짐) → 2초 뒤부터 0.5초에 1번으로 묶임(실제 ≤ 36), 묶음 기록, 끝나면 마지막 1번. */
process.env.QA_REAL_CLOCK='1';
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
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(()=>{if(localStorage.getItem('qa116delay')!=='1')return;const D=100000,st=window.setTimeout,si=window.setInterval;
   window.setTimeout=function(f,ms,...a){const d=Number(ms)||0;return st(f,d>=50?d+D:d,...a);};window.setInterval=function(f,ms,...a){return si(f,Math.max(Number(ms)||0,D),...a);};window.__qaDelay=true;});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);
  await ctx.addInitScript(()=>{if(localStorage.getItem('qa116delay')!=='1')return;const f0=window.fetch;let once=0;window.__qaHung=0;
   window.fetch=function(u,o){try{const s=String(u&&u.url||u);if(s.startsWith('https://api.hyperliquid.xyz')&&/clearinghouseState/.test(String(o&&o.body||''))&&once<1){once++;window.__qaHung++;const sg=o&&o.signal;
    return new Promise((_,rej)=>{if(sg)sg.addEventListener('abort',()=>rej(sg.reason||new DOMException('aborted','AbortError')),{once:true});});}}catch{}return f0.apply(this,arguments);};});return ctx;};
 const open=async(ctx,name,url)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(url||URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const S=globalThis.__S={};
 const login=(P,exp)=>P.evaluate(([P0,exp])=>{cloudConfig={url:P0,key:'sb_publishable_'+'q'.repeat(24)};localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(cloudConfig));try{v14Where='local';localStorage.setItem('tj:v14-keep-login','1');}catch{}
  cloudSession={project:P0,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tokSECRETqa116',refresh_token:'rSECRETqa116',expires_at:Math.floor(Date.now()/1000)+(exp?-600:36000)};cloudSaveSession(cloudSession);v110Paint();},[PRJ,!!exp]);
 /* ---- (T) 타이머 100초 지연 + 토큰 만료 + 현물 메타 응답 없음 ---- */
 {const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'T');await login(P,false);
  await P.waitForFunction(()=>!V110.busy,null,{timeout:20000}).catch(()=>{});
  await login(P,true);await P.evaluate(()=>localStorage.setItem('qa116delay','1'));
  await P.reload();await P.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});const t0=Date.now();
  await P.waitForFunction(()=>V110.st==='ok'&&!hlcBusy&&hlbLast>0&&V93.leader&&(V113S.n.hlTimeout||0)>=1,null,{timeout:60000}).catch(()=>{});
  S.T=await P.evaluate(async()=>{const a=AbortSignal.timeout(300);const t=Date.now();const ab=await new Promise(r=>{a.addEventListener('abort',()=>r(Date.now()-t),{once:true});setTimeout(()=>r(-1),3000);});
   const tx=v114Text();return {delay:!!window.__qaDelay,st:V110.st,hlcBusy,addr:!!(hlcStatus&&hlcStatus.address),hlb:hlbLast>0,leader:V93.leader,hlTO:(V113S.n.hlTimeout||0)>=1,hung:window.__qaHung||0,rescued:V116.n.rescued>0,abort:ab>0&&ab<3000,
    diag:{sec:tx.includes('[v116 · 타이머·다시 그리기]'),lag:/진짜 타이머 지연: 지금 \d+ms/.test(tx),secret:/SECRETqa116|tokNEW115/.test(tx)},chip:($('v110Sync')||{}).textContent.includes('동기화됨')};});
  S.T.sec=Math.round((Date.now()-t0)/1000)<=60;
  await P.evaluate(()=>localStorage.removeItem('qa116delay'));await P.screenshot({path:path.join(outDir,'timers-1440.png')}).catch(e=>{R.shotErr=e.message;});await ctx.close();}
 /* ---- (L) v91 접힘 묶음 펼친 채 다시 그리기 ---- */
 {const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'L');
  S.L=await P.evaluate(async()=>{const tries=[['analysis','loss'],['analysis','pat'],['weekly','wkauto']];let pick=null;
   for(const [pg,k] of tries){setPage(pg);await new Promise(r=>setTimeout(r,1200));if(document.querySelector('#page-'+pg+' details.v91-grp[data-v91="'+k+'"]')){pick=[pg,k];break;}}
   if(!pick)return {found:false};const [pg,k]=pick;const q=()=>document.querySelector('#page-'+pg+' details.v91-grp[data-v91="'+k+'"]');
   const n0=V114.ra.n;q().open=true;await new Promise(r=>setTimeout(r,1500));renderAll();await new Promise(r=>setTimeout(r,5000));
   const loop=V114.ra.n-n0,still=!!(q()&&q().open);q().querySelector('summary').click();await new Promise(r=>setTimeout(r,300));const closed=!q().open;
   const n1=V114.ra.n;q().querySelector('summary').click();await new Promise(r=>setTimeout(r,1500));const user=V114.ra.n-n1;
   return {found:true,key:k,loop,loopOk:loop<=3,still,auto:typeof V116R!=='undefined'&&V116R.autoToggle>=1,closed,user:user>=1&&user<=2};});
  /* ---- (S) 입력 없이 renderAll 40번 연속 ---- */
  S.S=await P.evaluate(async()=>{setPage('dashboard');await new Promise(r=>setTimeout(r,2500));
   /* 짧은 몰림 15번(0초 간격)은 그대로 다 그림 */
   const b0=V114.ra.n;for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,0));renderAll();}const burst=V114.ra.n-b0;await new Promise(r=>setTimeout(r,3500));
   /* 0.1초마다 5초 = 50번(초당 10번 이어짐) → 묶음 */
   const n0=V114.ra.n,s0=V116R.skip,t0=performance.now();let lastSkip=false;while(performance.now()-t0<5000){const k0=V116R.skip;renderAll();lastSkip=V116R.skip>k0;await new Promise(r=>setTimeout(r,100));}const mid=V114.ra.n-n0,pend=V116R.pend;await new Promise(r=>setTimeout(r,800));
   /* v118: '끝나면 마지막 1번'은 마지막 호출이 묶였을 때(예약이 남아 있을 때)만 해당 — 마지막 호출이 바로 그려졌으면(묶음 예약이 그 전에 이미 돎) 더 그릴 게 없음. v117에서도 이 위상 차이로 흔들림 */
   return {burst:burst===15,mid:mid<=36,skip:V116R.skip-s0>=10,last:(lastSkip||pend)?V114.ra.n-n0>mid:true};});
  await ctx.close();}
 Object.assign(R,S);console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.log(JSON.stringify({...(globalThis.__S||{}),errors:['FATAL '+(e&&e.stack||e)]}));process.exit(1);});
