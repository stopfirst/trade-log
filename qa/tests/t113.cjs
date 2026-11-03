/* v113 QA — (L) 거래 기록 목록 경량화 (N) 동기화 멈춤 방지 (H) HL 요청 멈춤 방지. 모의 클라우드·모의 HL(외부 연결 없음, 가짜 주소·id).
   (L) PC 1440: 300건 → 표 줄 100개만(카드 0개 = 예전 601줄 대신 100줄), 건수·합계는 전체(300건) 기준, 줄 순서 = 전체 정렬 앞 100,
       줄 내용(종목 칸 배지 포함) = tickerHTML 그대로, '더 보기' → 200(덧붙인 줄에도 v99 진입 이유 줄), 표 끝까지 스크롤 → 300(IntersectionObserver), 끝나면 버튼 없음,
       같은 조건 다시 그리기(동기화·편집) → 펼친 줄 유지, 거래 삭제 → 줄 수 유지·건수 299건, 검색 → 첫 묶음부터, 검색 지우면 100.
       모바일 390: 카드 50개만(표 줄 0), 더 보기 → 100, 창 1440으로 → 표 100줄(카드 0), 다시 390 → 카드 100.
   (N) 시간 제한을 짧게(QA용 V113T) 두고: 응답 없는 head → '받는 중 n초' → '받기 실패 · 다시 시도', busy 해제 → 칩 누르면 재시도 → '동기화됨'.
       취소를 무시하는 죽은 요청 → 전체 감시로 끝남 · 다른 탭이 잠금을 안 놓음 → 잠금 없이 진행 · 저장 대기열 멈춤 → 제한 뒤 진행 ·
       오프라인 전환 → '오프라인' → 온라인 복귀 자동 동기화 · 숨김→표시 복귀(얼었던 동기화) → 끊고 다시 · 느린 저장본 받기(3초) → 경과 시간 표시 뒤 성공.
   (H) HL 현물 조회 응답 없음 → 시간 제한 뒤 V57.busy·v104 칸 해제, 다음 HL 요청 정상 · 마감 현물(v62) 멈춤 → busy 해제 ·
       '현물 반영 계산 중'이 제한(QA 2초) 넘으면 거래계좌 변동 + '현물 반영 지연' 경고. v112에선 (L) 줄 수·(N)(H) 실패. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const C={rev:0,payload:null,cas:[],heads:0,fulls:0};
function cloud(req){const u=new URL(req.url),p=u.pathname;
 if(p==='/rest/v1/journal_cloud'){if(u.search.includes('payload')){C.fulls++;return C.rev?[{revision:C.rev,payload:C.payload,updated_at:new Date().toISOString()}]:[];}C.heads++;return C.rev?[{revision:C.rev,updated_at:new Date().toISOString()}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};C.cas.push({dev:req.dev,exp:b.p_expected_revision});if(b.p_expected_revision!==C.rev)return null;C.rev++;C.payload=b.p_payload;return C.rev;}
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
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;if(window.__hlHang.has(b.type))await hang(o,false);
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
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const seed=(p,N)=>p.evaluate(async N=>{const now=Date.now(),H=3600e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
  const T=[];for(let i=0;i<N;i++){const t0=now-5*H-i*7*H,id='r'+i,win=i%3!==0;T.push(normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:t0,name:['ETH','BTC','SOL','HYPE'][i%4],direction:i%5?'long':'short',date:new Date(t0).toISOString().slice(0,10),stop:98,stop0:98,initialRisk:20,riskR:1,setup:['눌림','베이스 돌파','미분류'][i%3],leverage:5,marginMode:'cross',process:i%4?'compliant':'violation',review:i%2?'복기 '+i:'',violations:[],entryNote:'근거',
   entries:[ev(id+'e',t0,10,100)],fills:i===0?[]:[ev(id+'f',t0+H,10,win?103:98)],funding:[],images:[]}));}
  state.trades=T;Object.assign(state.settings,{account:10000});await persist();setPage('records');renderAll();return T.length;},N);
 const L=p=>p.evaluate(()=>{const b=$('recordList');const vis=s=>[...b.querySelectorAll(s)].filter(e=>e.getClientRects().length).length;
  return {rows:b.querySelectorAll('tr[data-open]').length,cards:b.querySelectorAll('.record-card').length,visRows:vis('tr[data-open]'),visCards:vis('.record-card'),more:!!b.querySelector('[data-v113-more]'),count:$('recordCount').textContent.trim()};});
 const S=globalThis.__S={};
 /* ---- (L) PC ---- */
 {const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'PC');S.L={};S.L.n=await seed(P,300);await P.waitForTimeout(600);
  S.L.first=await L(P);
  S.L.order=await P.evaluate(()=>{const ids=[...$('recordList').querySelectorAll('tr[data-open]')].map(r=>r.dataset.open);return V113.list.length===300&&ids.join()===V113.list.slice(0,100).map(t=>t.id).join();});
  S.L.countAll=await P.evaluate(()=>{const txt=$('recordCount').textContent;v15Count(V113.list,'','');const full=$('recordCount').textContent;return txt===full;});
  const same=()=>P.evaluate(()=>{const bad=[];const rows=[...$('recordList').querySelectorAll('tr[data-open]')];for(const i of [0,99,rows.length-1]){const r=rows[i];if(!r)continue;const t=state.trades.find(x=>x.id===r.dataset.open);const d=document.createElement('div');d.innerHTML=tickerHTML(t);try{localizeJournal(d);}catch{}
    const btn=r.querySelector('.row-open');if(btn.textContent.replace(/\s+/g,' ').trim()!==d.textContent.replace(/\s+/g,' ').trim())bad.push(i);}return bad;});
  S.L.same0=await same();
  await P.click('[data-v113-more]');await P.waitForTimeout(300);S.L.more1=await L(P);S.L.same1=await same();
  S.L.v99=await P.evaluate(()=>{const rows=[...$('recordList').querySelectorAll('tr[data-open]')].slice(100);let want=0,got=0;for(const r of rows){const t=state.trades.find(x=>x.id===r.dataset.open);if(v99Box(t,'row'))want++;if(r.querySelector('.v99-line'))got++;}return {want,got,ok:want===got};});
  await P.evaluate(()=>{renderRecords();});await P.waitForTimeout(200);S.L.keep=await L(P);
  await P.evaluate(async()=>{state.trades=state.trades.filter(t=>t.id!=='r5');await persist();renderAll();});await P.waitForTimeout(300);S.L.del=await L(P);
  for(let k=0;k<6;k++){await P.evaluate(()=>{const sc=document.querySelector('#recordList .record-table-scroll');sc.scrollTop=sc.scrollHeight;});await P.waitForTimeout(400);}
  S.L.scroll=await L(P);S.L.auto=await P.evaluate(()=>v113Debug().st.auto>=1);
  await P.fill('#recordSearch','BTC');await P.waitForTimeout(400);S.L.search=await L(P);S.L.btcAll=await P.evaluate(()=>V113.list.length);
  await P.fill('#recordSearch','');await P.waitForTimeout(400);S.L.clear=await L(P);
  await P.screenshot({path:path.join(outDir,'records-pc.png')}).catch(e=>{R.shotErr=e.message;});
  /* 모바일 폭 */
  await P.setViewportSize({width:390,height:844});await P.waitForTimeout(500);S.L.toMob=await L(P);
  await P.setViewportSize({width:1440,height:900});await P.waitForTimeout(500);S.L.toPc=await L(P);
  await ctx.close();}
 {const ctx=await mkCtx(390,'mob');const P=await open(ctx,'MOB');await seed(P,300);await P.waitForTimeout(600);
  S.M={first:await L(P)};
  await P.evaluate(()=>document.querySelector('[data-v113-more]').scrollIntoView({block:'center'}));await P.waitForTimeout(300);
  const b=await L(P);if(b.cards===50)await P.click('[data-v113-more]');await P.waitForTimeout(400);S.M.more=await L(P);
  S.M.v99=await P.evaluate(()=>{const cs=[...$('recordList').querySelectorAll('.record-card')].slice(50);let want=0,got=0;for(const c of cs){const t=state.trades.find(x=>x.id===c.dataset.open);if(v99Box(t,'card'))want++;if(c.querySelector('.v99-line'))got++;}return want===got;});
  await P.screenshot({path:path.join(outDir,'records-390.png')}).catch(e=>{R.shotErr=e.message;});
  await P.setViewportSize({width:1440,height:900});await P.waitForTimeout(500);S.M.toPc=await L(P);
  await P.setViewportSize({width:390,height:844});await P.waitForTimeout(500);S.M.back=await L(P);
  await ctx.close();}
 /* ---- (N) 동기화 멈춤 ---- */
 {const ctx=await mkCtx(1440,'sync');const P=await open(ctx,'SYNC');S.N={};await seed(P,6);await P.evaluate(()=>setPage('dashboard'));
  await P.evaluate(P0=>{Object.assign(V113T,{small:2500,remote:2500,push:2500,lock:1200,flush:800,idb:1500,persist:2000,all:4000,visStale:800});
   cloudConfig={url:P0,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P0,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};v110Paint();},PRJ);
  const chip=()=>P.evaluate(()=>{const e=document.querySelector('#v110Sync .v110-st');return e?e.textContent:null;});
  const idle=async()=>{await P.waitForFunction(()=>!V110.busy,null,{timeout:20000}).catch(()=>{});};
  await idle();S.N.first=await P.evaluate(async()=>{for(let i=0;i<50&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));return v110Sync('test',{force:true});});await idle();
  S.N.ok0=/^동기화됨/.test(await chip()||'');
  /* N1 응답 없는 head */
  await idle();await P.waitForTimeout(300);await idle();await P.evaluate(()=>{clearTimeout(V110.kickT);V110.again=false;window.__cloudHang='head';v110Sync('focus');});await P.waitForTimeout(2200);S.N.busyChip=await chip();
  await P.waitForTimeout(1500);S.N.failChip=await chip();S.N.failBusy=await P.evaluate(()=>V110.busy);S.N.err1=await P.evaluate(()=>V110.err);
  await P.evaluate(()=>{window.__cloudHang=null;});await P.click('#v110Sync .v110-st');await P.waitForTimeout(150);S.N.page=await P.evaluate(()=>currentPage);await idle();await P.waitForTimeout(200);
  S.N.retryChip=/^동기화됨/.test(await chip()||'');S.N.retryTap=await P.evaluate(()=>V113S.n.retryTap);
  /* N2 취소를 무시하는 죽은 요청 */
  const t0=Date.now();S.N.dead=await P.evaluate(async()=>{window.__cloudHang='dead';const r=await v110Sync('test',{force:true});window.__cloudHang=null;return {r,busy:V110.busy,st:V110.st,wd:V113S.n.watchdog};});S.N.deadMs=Date.now()-t0;
  S.N.deadChip=await chip();await idle();
  /* N3 다른 탭이 잠금을 쥐고 안 놓음 */
  S.N.lock=await P.evaluate(async()=>{let rel;navigator.locks.request('tj-v110:'+KEY,()=>new Promise(r=>{rel=r;}));await new Promise(r=>setTimeout(r,50));const s0=V113S.n.lockSkip,t0=Date.now();const r=await v110Sync('test',{force:true});rel&&rel();return {r,skip:V113S.n.lockSkip-s0,fast:Date.now()-t0<6000};});
  /* N4 저장 대기열 멈춤 */
  S.N.q=await P.evaluate(async()=>{const old=V77Q;V77Q=new Promise(()=>{});const r=await v110Sync('test',{force:true});V77Q=old;return {r,to:V113S.n.to['저장 대기']||0};});
  /* N5 오프라인 → 온라인 */
  await ctx.setOffline(true);await P.waitForTimeout(400);S.N.offChip=await chip();
  S.N.offSync=await P.evaluate(()=>v110Sync('poll'));
  await ctx.setOffline(false);await P.waitForTimeout(300);await idle();await P.waitForTimeout(300);S.N.onChip=/^동기화됨/.test(await chip()||'');
  /* N6 숨김 → 표시 복귀: 얼었던 동기화 끊고 다시 */
  await P.evaluate(()=>{V113T.small=60000;window.__cloudHang='head';window.__vis='visible';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__vis});Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__vis==='hidden'});
   V110.lastFocus=0;clearTimeout(V110.kickT);V110.again=false;v110Sync('poll');});
  await P.waitForTimeout(1200);S.N.vis0=await P.evaluate(()=>({busy:V110.busy,st:V110.st}));
  await P.evaluate(()=>{window.__vis='hidden';document.dispatchEvent(new Event('visibilitychange'));});await P.waitForTimeout(300);
  await P.evaluate(()=>{window.__cloudHang=null;V113T.small=2500;window.__vis='visible';document.dispatchEvent(new Event('visibilitychange'));});
  await P.waitForTimeout(500);await idle();await P.waitForTimeout(2500);await idle();
  S.N.vis=await P.evaluate(()=>({st:V110.st,err:V110.err,busy:V110.busy,visAbort:V113S.n.visAbort,ok:/^동기화됨/.test(document.querySelector('#v110Sync .v110-st').textContent)}));
  /* N7 느린 저장본 받기(다른 기기가 새로 저장 → 전체 받기 3초) */
  await idle();C.rev++;C.payload={...C.payload,trades:[...(C.payload.trades||[])],settings:{...(C.payload.settings||{}),v113Other:1}};
  await P.evaluate(()=>{Object.assign(V113T,{remote:6000,all:15000});window.__cloudDelay=3000;clearTimeout(V110.kickT);V110.again=false;v110Sync('poll');});await P.waitForTimeout(2600);S.N.slowChip=await chip();
  await idle();await P.waitForTimeout(300);S.N.slow=await P.evaluate(()=>({err:V110.err,ok:/^동기화됨/.test(document.querySelector('#v110Sync .v110-st').textContent),other:state.settings.v113Other===1}));
  await P.evaluate(()=>{window.__cloudDelay=0;});
  await ctx.close();}
 /* ---- (H) HL 멈춤 ---- */
 {const ctx=await mkCtx(1440,'hl');const P=await open(ctx,'HL');
  S.H=await P.evaluate(async A=>{A='0x'+'2'.repeat(40);Object.assign(V113T,{hl:1500,hlCandle:1500,spotStale:2000});hlcStatus={...(hlcStatus||{}),address:A};window.__spotHeld=true;const o={};
   window.__hlHang.add('spotClearinghouseState');const t0=Date.now();V57.at=0;await v57Spot(true);o.spotMs=Date.now()-t0;o.to=V113S.n.hlTimeout>=1;for(let i=0;i<60&&(V57.busy||V104.inflight);i++)await new Promise(r=>setTimeout(r,100));o.spotBusy=V57.busy;o.inflight=V104.inflight;o.queue=V104.q.length;
   const mids=await v57Post({type:'metaAndAssetCtxs'}).then(x=>Array.isArray(x),()=>false);o.next=mids;
   window.__hlHang.delete('spotClearinghouseState');for(let i=0;i<60&&V57.busy;i++)await new Promise(r=>setTimeout(r,100));V57.at=0;await v57Spot(true);o.spotOk=!!(V57.spot&&V57.spot.items&&V57.spot.items.length);
   V57.spot={addr:A,items:[{coin:'HYPE',pair:'@1',qty:10,px:10,usd:100}],usd:100,miss:0,at:Date.now()};V62.v=null;V62.at=0;window.__hlHang.add('userFillsByTime');window.__hlHang.add('userFills');const b0=Date.now();const p=v62Load(Date.now()-3600e3);await new Promise(r=>setTimeout(r,100));o.v62busy0=V62.busy;
   await Promise.race([p,new Promise(r=>setTimeout(r,8000))]);o.v62busy=V62.busy;o.v62ms=Date.now()-b0<8000;window.__hlHang.clear();
   const m={total:{pending:true,from:1000,cur:990,change:-10,pct:-1,approx:false},prev:{key:'2026-10-30',value:1000},mode:'close',main:-1};
   let h1='';try{h1=v27HTML(m);}catch(e){h1='ERR '+e.message;}o.pend0=/현물 반영 계산 중/.test(h1)&&!/현물 반영 지연/.test(h1);
   await new Promise(r=>setTimeout(r,2200));let h2='';try{h2=v27HTML(m);}catch(e){h2='ERR '+e.message;}o.stale=/현물 반영 지연/.test(h2)&&!/현물 반영 계산 중/.test(h2);
   let h3='';try{h3=v27HTML({...m,total:{...m.total,pending:false}});}catch{}o.reset=!/현물 반영 지연/.test(h3)&&V113H.pendAt===0;
   return o;},A);
  await ctx.close();}
 Object.assign(R,S);console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.log(JSON.stringify({...(globalThis.__S||{}),errors:['FATAL '+(e&&e.stack||e)]}));process.exit(1);});
