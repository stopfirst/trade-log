/* v117 QA — 거래 상세 타이핑 중 메인 스레드 멈춤 수정(저장·동기화 조각 + Worker). 모의 클라우드·모의 HL(외부 연결 없음, 가짜 주소·id). 실제 시계.
   (W) Worker 켜짐.  (P) 기기 저장: Worker가 IndexedDB에 씀(같은 글·같은 updatedAt), 아직 시작 안 한 저장 5번 → 합침, 마지막 변경까지 저장.
   (S) 자동 동기화 올리기: 클라우드 저장본에 같은 글, 계산 캐시 v63x 빠짐, cloudIdentity 있음, 기준 사본(IndexedDB)에 같은 rev·글, 메인 스레드 키 정렬 직렬화(v110Canon) 0번.
       바뀐 것 없으면 'same'(올리기 없음).
   (M) 다른 기기에서 다른 거래를 고친 사이 이 기기에서 입력 → 받아 병합: 두 변경 다 남음, 다시 올린 저장본에도 둘 다.
   (G) 상세 열고 입력 중 renderAll·renderAccountBalance는 미뤘다가 닫으면 실행.  (L) 원장: 일지 글만 바뀌면 재사용, 체결 값이 바뀌면 다시 만듦.
   (R) CPU 4배 + 거래 260·사진 약 1.5MB에서 상세 '보유 중 생각'에 입력하며 저장·동기화 → 메인 스레드 v110Canon 0번, 조각 최장·긴 작업 최장 기록.
   (F) ?v117=0 → 예전 경로로 저장·동기화 그대로. v116에선 (W)(P)(S)(L)(G) 실패. */
process.env.QA_REAL_CLOCK='1';
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const C={rev:0,payload:null,cas:[],heads:0,fulls:0,calls:0,tok:0,sum:[]};
/* 진단(CI에서만 S 흔들림 원인 찾기): 올린 저장본의 칸별·거래별 지문 → 연속 두 올리기 사이 바뀐 곳 */
const v117H=v=>require('crypto').createHash('md5').update(JSON.stringify(v)===undefined?'u':JSON.stringify(v)).digest('hex').slice(0,8);
function v117Sum(P){const top={},tr={};for(const [k,v] of Object.entries(P||{}))if(k!=='trades')top[k]=v117H(v);for(const t of (P&&P.trades)||[]){const f={};for(const [k,v] of Object.entries(t))f[k]=v117H(v);tr[t.id]=f;}return {top,tr};}
function v117Diff(a,b){if(!a||!b)return null;const out=[];for(const k of new Set([...Object.keys(a.top),...Object.keys(b.top)]))if(a.top[k]!==b.top[k])out.push(k);
 for(const id of new Set([...Object.keys(a.tr),...Object.keys(b.tr)])){const x=a.tr[id]||{},y=b.tr[id]||{};for(const k of new Set([...Object.keys(x),...Object.keys(y)]))if(x[k]!==y[k])out.push('trades.'+id+'.'+k);}return out.slice(0,20);}
function cloud(req){const u=new URL(req.url),p=u.pathname;C.calls++;
 if(p==='/rest/v1/journal_cloud'){if(u.search.includes('payload')){C.fulls++;return C.rev?[{revision:C.rev,payload:C.payload,updated_at:new Date().toISOString()}]:[];}C.heads++;return C.rev?[{revision:C.rev,updated_at:new Date().toISOString()}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};C.cas.push({dev:req.dev,exp:b.p_expected_revision});if(b.p_expected_revision!==C.rev)return null;C.rev++;C.payload=b.p_payload;try{C.sum.push(v117Sum(C.payload));if(C.sum.length>12)C.sum.shift();}catch{}return C.rev;}
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
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);
  await ctx.addInitScript(()=>{window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)]);}).observe({type:'longtask',buffered:true});}catch{}
   window.__ev=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__ev.push([e.name,Math.round(e.startTime),Math.round(e.duration)]);}).observe({type:'event',durationThreshold:16,buffered:true});}catch{}});return ctx;};
 const open=async(ctx,name,url)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(url||URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  /* 한 번만 도는 설정 이전(v64·v82 원칙 반영: 열고 4~4.5초 뒤·로그인 0.8~1.2초 뒤 타이머로 settings 바꾸고 persist)이 빠른 CI에선 (P)(S) 도중에 끼어들어
     기기 저장 updatedAt·클라우드 저장본(settings)을 한 번 더 바꿈 → (P) same false · (S) 두 번째 올리기(base·same false). 검사 전에 미리 끝내 둠(이미 했으면 바로 돌아옴). */
  await p.evaluate(async()=>{try{if(typeof v64Apply==='function')await v64Apply();if(typeof v82Apply==='function')await v82Apply();}catch{}});await p.waitForTimeout(600);return p;};
 const S=globalThis.__S={};
 const login=(P)=>P.evaluate(([P0])=>{cloudConfig={url:P0,key:'sb_publishable_'+'q'.repeat(24)};localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(cloudConfig));try{v14Where='local';localStorage.setItem('tj:v14-keep-login','1');}catch{}
  cloudSession={project:P0,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tokSECRETqa117',refresh_token:'rSECRETqa117',expires_at:Math.floor(Date.now()/1000)+36000};cloudSaveSession(cloudSession);v110Paint();},[PRJ]);
 /* 시드: 수동 HL 거래 n건(진입 20·청산 2) + 사진 */
 const seed=(P,n,mb)=>P.evaluate(async([n,mb])=>{const mk=(w,h,seed)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');const id=g.createImageData(w,h);let x=seed*9301+49297;for(let i=0;i<id.data.length;i+=4){x=(x*1103515245+12345)&0x7fffffff;const v=(x>>16)&255;id.data[i]=v;id.data[i+1]=(v*3+i)&255;id.data[i+2]=(i>>6)&255;id.data[i+3]=255;}g.putImageData(id,0,0);return c.toDataURL('image/jpeg',0.8);};
  const tr=[];const d0=Date.parse('2026-09-01T00:00:00Z');for(let i=0;i<n;i++){const day=new Date(d0+i*4*3600e3).toISOString().slice(0,10);const es=[];for(let k=0;k<20;k++)es.push({id:'e'+k,date:day,time:'10:'+String(10+k).padStart(2,'0'),shares:1+k%3,price:100+i%7+k*0.1,fee:0.01,seq:k*2});
   tr.push(normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,direction:'long',leverage:5,marginMode:'cross',funding:[],id:'qa117-'+i,at:Date.parse(day),updatedAt:Date.parse(day),name:'QA'+(i%9),date:day,entry:100,stop:90,stop0:90,initialRisk:10,riskR:1,setup:'미분류',trigger:'',regime:'',entryNote:'근거 '+i,plans:{},originalPlans:{},violations:[],entries:es,fills:[{id:'f0',date:day,time:'15:00',shares:19,price:101+i%5,fee:0.02,seq:100},{id:'f1',date:day,time:'15:30',shares:20,price:102,fee:0.02,seq:101}],images:[]}));}
  let bytes=0,k=0;while(bytes<mb*1048576&&k<12){const d=mk(700,420,k+1);tr[k%6].images.push({id:'img'+k,name:'c'+k+'.jpg',type:'image/jpeg',data:d,caption:'',phase:'진입',updatedAt:Date.now()});bytes+=d.length;k++;}
  state.trades=tr;state.settings.account=10000;await persist();renderAll();return {n:tr.length,bytes};},[n,mb]);
 const idbMain=P=>P.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('trade-journal-hyperliquid-v1');r.onsuccess=()=>{const q=r.result.transaction('records').objectStore('records').get('main');q.onsuccess=()=>{const v=q.result;r.result.close();ok(v?{u:v.updatedAt,h:(v.trades.find(t=>t.id==='qa117-0')||{}).holdNote||'',n:v.trades.length}:null);};};}));
 const idbBase=P=>P.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('tj-v110-hl');r.onsuccess=()=>{const q=r.result.transaction('kv').objectStore('kv').get(v110BaseKey());q.onsuccess=()=>{const v=q.result;r.result.close();ok(v?{rev:v.rev,h:(v.payload.trades.find(t=>t.id==='qa117-0')||{}).holdNote||'',id:!!v.payload.cloudIdentity,v63x:v.payload.trades.some(t=>'v63x' in t)}:null);};};r.onerror=()=>ok(null);}));
 const cloudT=id=>{const p=C.payload;const t=p&&p.trades&&p.trades.find(x=>x.id===id);return t;};
 /* ---- (W)(P)(S)(M)(G)(L) ---- */
 {const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'A');S.seed=await seed(P,260,1.5);
  S.W=await P.evaluate(async()=>{for(let i=0;i<40&&!(V117.wok);i++)await new Promise(r=>setTimeout(r,100));return {on:V117.on,worker:V117.wok,dbg:typeof window.v117Debug==='function'};});
  /* (P) */
  await P.evaluate(async()=>{state.trades[0].holdNote='P1';await persist();});const m1=await idbMain(P);
  const co=await P.evaluate(async()=>{const c0=V117.n.coalesce,w0=V117.n.wput;state.trades[0].holdNote='P2';const ps=[];for(let i=0;i<5;i++)ps.push(persist());const rs=await Promise.all(ps);return {all:rs.every(x=>x===true),co:V117.n.coalesce-c0,w:V117.n.wput-w0,u:state.updatedAt};});
  const m2=await idbMain(P);S.P={w1:m1&&m1.h==='P1',same:!!m2&&m2.h==='P2'&&m2.u===co.u&&m2.n===260,all:co.all,co:co.co>=3,wput:co.w>=1&&co.w<=2};
  /* (S) */
  await login(P);await P.waitForFunction(()=>!V110.busy,null,{timeout:30000}).catch(()=>{});
  const s1=await P.evaluate(async()=>{for(let i=0;i<60&&V110.busy;i++)await new Promise(r=>setTimeout(r,250));state.trades[1].v63x={mfe:1,mae:2};state.trades[0].holdNote='S1';await persist();const c0=V112.n.canon,p0=V110.n.push;let r=await v110Sync('manual');
   /* 느린 CPU: persist가 깨운 자동 동기화가 먼저 돌고 있으면 v110Sync는 false(이미 도는 중) → 끝나길 기다려 그 자동 동기화가 올렸으면 'pushed', 아니면 다시 */
   if(r===false){for(let i=0;i<120&&V110.busy;i++)await new Promise(q=>setTimeout(q,250));r=V110.n.push>p0?'pushed':await v110Sync('manual');}
   return {r,canon:V112.n.canon-c0,run:V117.n.run};});
  await P.waitForFunction(()=>!V110.busy,null,{timeout:30000}).catch(()=>{});const ct=cloudT('qa117-0'),c1=cloudT('qa117-1');let b1=await idbBase(P);/* 빠른 CI: 기준 사본 기록(Worker·조각)이 늦게 끝날 수 있음 → 최대 15초 기다림 */for(let i=0;i<60&&!(b1&&b1.rev===C.rev);i++){await P.waitForTimeout(250);b1=await idbBase(P);}
  const s2=await P.evaluate(async()=>{/* 빠른 CI: 앞 올리기 뒤 자동 동기화가 돌고 있으면 v110Sync는 false(이미 도는 중) → 끝난 뒤 확인 */let r;for(let k=0;k<3;k++){for(let i=0;i<120&&V110.busy;i++)await new Promise(r=>setTimeout(r,250));r=await v110Sync('manual');if(r!==false)break;}return {r};});
  try{const n=C.sum.length;S.Sdbg={s1:s1.r,s2:s2.r,rev:C.rev,brev:b1?b1.rev:null,bh:b1?b1.h:null,cas:C.cas.slice(-6).map(x=>x.exp),diff:n>=2?v117Diff(C.sum[n-2],C.sum[n-1]):null};}catch(e){S.Sdbg={x:String(e&&e.message||e).slice(0,80)};}
  S.S={pushed:s1.r==='pushed',canon:s1.canon,text:!!ct&&ct.holdNote==='S1',v63x:!!c1&&!('v63x' in c1),ident:!!(C.payload&&C.payload.cloudIdentity),n:C.payload&&C.payload.trades.length===260,base:!!b1&&b1.rev===C.rev&&b1.h==='S1'&&!b1.id&&!b1.v63x,same:s2.r==='same',run:s1.run>=1};
  /* (M) 다른 기기 변경 + 이 기기 입력 → 받아 병합 */
  {const t5=cloudT('qa117-5');t5.review='폰 메모 QA';t5.updatedAt=Date.now();C.payload.updatedAt=Date.now();C.rev++;}
  const mm=await P.evaluate(async()=>{for(let i=0;i<120&&V110.busy;i++)await new Promise(r=>setTimeout(r,250));const t=state.trades[0];v100Stage(t,{holdNote:'PC 글 QA'});let r=await v110Sync('manual');/* 그 사이 자동 동기화가 먼저 시작했으면 끝난 뒤 한 번 더 */if(r===false){for(let i=0;i<120&&V110.busy;i++)await new Promise(r=>setTimeout(r,250));r=await v110Sync('manual');}const a=state.trades.find(x=>x.id==='qa117-0'),b=state.trades.find(x=>x.id==='qa117-5');return {r,a:a.holdNote,b:b.review,adopt:V117.n.adopt,pull:V117.n.pull};});
  S.M={both:mm.a==='PC 글 QA'&&mm.b==='폰 메모 QA',pushed:mm.r==='pushed',cloud:!!cloudT('qa117-0')&&cloudT('qa117-0').holdNote==='PC 글 QA'&&cloudT('qa117-5').review==='폰 메모 QA',pull:mm.pull>=1,adopt:mm.adopt>=1};
  /* (L) 원장 재사용 */
  S.L=await P.evaluate(async()=>{const h0=V117.n.ledgerHit||0,m0=V117.n.ledgerMiss||0;const a=ledgerOf();ledgerOf();const hit=(V117.n.ledgerHit||0)-h0>=1;
   const t=state.trades[0];t.holdNote='글만 바꿈';await persist();ledgerOf();const hit2=(V117.n.ledgerMiss||0)-m0<=1;
   const s0=ledgerOf().reduce((s,e)=>s+e.usd,0);t.fills=t.fills.map((f,i)=>i===0?{...f,price:f.price+5}:f);await persist();const s1=ledgerOf().reduce((s,e)=>s+e.usd,0);
   return {hit,hit2,changed:Math.abs(s1-s0-95)<1e-6,d:Math.round((s1-s0)*100)/100};});
  /* (G) 입력 중 뒤 화면 다시 그리기 미룸 */
  await P.evaluate(()=>openTrade('qa117-2','manage'));await P.waitForTimeout(800);
  const ta=await P.$('#tradeDialog textarea[data-v71-area="holdNote"]');if(ta){await ta.click();await P.keyboard.type('abc',{delay:40});}
  S.G=await P.evaluate(async()=>{const d0=V117.n.bgDefer,r0=V117.n.bgRun;renderAll();renderAccountBalance();const def=V117.n.bgDefer-d0>=2;$('tradeDialog').close();await new Promise(r=>setTimeout(r,1500));
   return {area:!!document.querySelector('[data-v71-area]'),def,ran:V117.n.bgRun-r0>=2,empty:!Object.keys(V117.bgPend).length,text:(state.trades.find(t=>t.id==='qa117-2')||{}).holdNote==='abc'};});
  await P.screenshot({path:path.join(outDir,'v117-1440.png')}).catch(e=>{R.shotErr=e.message;});
  /* (K) 입력 글자 누락 0: 쓰는 중 상세가 다시 그려져도(칸 교체) 글·초점 유지 — 일지 칸·추매 사유 칸, 칸을 옮겨도 '입력 중' 유지(미룬 무거운 작업이 그 틈에 안 돎),
     입력칸 클릭은 '직접 누름'이 아님(상세 다시 그리기 즉시 실행 안 함), 저장값 공백 정리로 끝 띄어쓰기가 사라져 다음 단어가 붙지 않음, 닫은 뒤 저장된 글 = 친 글 */
  {await P.evaluate(async()=>{const t=state.trades.find(x=>x.id==='qa117-6');t.entries=t.entries.map((e,k)=>({...e,time:String(10+Math.floor(k*5/60)).padStart(2,'0')+':'+String((k*5)%60).padStart(2,'0')}));t.updatedAt=Date.now();await persist();}); /* 5분 간격 진입 → 추매 칸 */
   await P.evaluate(()=>openTrade('qa117-6','manage'));await P.waitForTimeout(900);
   const force=()=>P.evaluate(()=>{V111.bypass++;try{renderDetail();}finally{V111.bypass--;}});
   let eH='',eP='',pk=null;const K={};
   const h=await P.$('#tradeDialog textarea[data-v71-area="holdNote"]');await h.click();
   await P.keyboard.type('첫 문장 ',{delay:25});eH+='첫 문장 ';await force();
   K.hFocus=await P.evaluate(()=>!!document.activeElement&&document.activeElement.matches('textarea[data-v71-area="holdNote"]'));
   await P.keyboard.type('이어서 씀 ',{delay:25});eH+='이어서 씀 ';
   let pyr=await P.$('#tradeDialog textarea[data-v90-key]');
   if(!pyr){/* 시드 거래에 추매 칸이 없으면 같은 모양의 칸을 상세에 직접 그려 넣는 대신 추매 기록이 있는 거래로 */K.noPyr=true;}
   else{pk=await pyr.getAttribute('data-v90-key');await pyr.click();await P.keyboard.type('추매 이유 하나',{delay:25});eP+='추매 이유 하나';
    K.busyAfterMove=await P.evaluate(()=>v117Busy());
    K.userAct=await P.evaluate(()=>v117UserAct());
    const d0=await P.evaluate(()=>V117.n.bgDefer);await P.evaluate(()=>renderDetail());K.deferred=(await P.evaluate(()=>V117.n.bgDefer))-d0>=1;
    await force();K.pFocus=await P.evaluate(()=>!!document.activeElement&&document.activeElement.matches('textarea[data-v90-key]'));
    await P.keyboard.type(' 둘',{delay:25});eP+=' 둘';
    /* 저장·동기화 중(전역 잠금)에도 추매 사유 칸 글자가 버려지지 않음 */
    await P.evaluate(()=>{publicBusy++;});await P.keyboard.type(' 셋',{delay:25});eP+=' 셋';await P.evaluate(()=>{publicBusy--;});
    K.pState=await P.evaluate(([pk])=>(state.trades.find(x=>x.id==='qa117-6').pyrNotes||{})[pk]||'',[pk]);}
   /* 일지 칸으로 돌아와 이어 쓰기(그 사이 다시 그려져도 끝 띄어쓰기 유지) */
   await force();const h2=await P.$('#tradeDialog textarea[data-v71-area="holdNote"]');K.ws=await h2.evaluate(e=>e.value);await h2.click();await P.keyboard.press('Control+End');await P.keyboard.type('끝',{delay:25});eH+='끝';
   await P.evaluate(()=>$('tradeDialog').close());await P.waitForTimeout(900);
   const st=await P.evaluate(([pk])=>{const t=state.trades.find(x=>x.id==='qa117-6');return {h:t.holdNote||'',p:pk?((t.pyrNotes||{})[pk]||''):null};},[pk]);
   K.hOk=st.h===eH.trim();K.pOk=pk?st.p===eP.trim():true;K.pLive=pk?K.pState==='추매 이유 하나 둘 셋':true;K.wsOk=K.ws==='첫 문장 이어서 씀 ';K.h=st.h;K.p=st.p;S.K=K;}
  /* (R) CPU 4배 타이핑 */
  {const cdp=await ctx.newCDPSession(P);await P.evaluate(()=>openTrade('qa117-3','manage'));await P.waitForTimeout(1500);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   const ta2=await P.$('#tradeDialog textarea[data-v71-area="holdNote"]');const T0=await P.evaluate(()=>{window.__c0=V112.n.canon;window.__s0=V117.ms.maxSlice=0;window.__run0=V117.n.run;window.__p0=V117.n.persist;return performance.now();});
   if(ta2)await ta2.click();const words='코루 롱 계획대로 가는지 본다 물타기 이유 스탑 비중 '.split(' ');
   for(let i=0;i<10;i++){await P.keyboard.type(words[i%words.length]+' ',{delay:110});if(i%3===2){await P.evaluate(()=>{persist();v110Sync('manual');});await P.waitForTimeout(1600);}}
   await P.waitForTimeout(2500);await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   S.R=await P.evaluate(async T0=>{for(let i=0;i<80&&V110.busy;i++)await new Promise(r=>setTimeout(r,250));const lt=window.__lt.filter(x=>x[0]>=T0),ev=window.__ev.filter(x=>x[1]>=T0&&/key|input/.test(x[0]));
    return {canon0:V112.n.canon-window.__c0===0,runs:V117.n.run-window.__run0>=2,persist:V117.n.persist-window.__p0>=2,slice:V117.ms.maxSlice,sliceOk:V117.ms.maxSlice<400,ltMax:Math.max(0,...lt.map(x=>x[1])),keyMax:Math.max(0,...ev.map(x=>x[2])),ltOk:Math.max(0,...lt.map(x=>x[1]))<1500,/* 샌드박스 2코어·CPU4에선 v117 첫 빌드도 0.9~1.5초(조각 사이 GC·Worker 메시지) — 실측 기준은 probe 5분 재현 */ltTop:lt.slice().sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>[Math.round(x[0]-T0),x[1]]),
     text:/코루 롱/.test((state.trades.find(t=>t.id==='qa117-3')||{}).holdNote||''),st:V110.st};},T0);}
  await ctx.close();}
 /* ---- (F) ?v117=0 예전 경로 ---- */
 {const ctx=await mkCtx(1440,'pc');const P=await open(ctx,'F',URL0+'&v117=0');await login(P);await P.evaluate(()=>v110Sync('manual'));await P.waitForFunction(()=>state.trades.length>=260&&!V110.busy,null,{timeout:40000}).catch(()=>{});
  const cas0=C.cas.length;S.F=await P.evaluate(async()=>{const t=state.trades.find(x=>x.id==='qa117-4');if(t)t.review='예전 경로';const ok=await persist();const r=await v110Sync('manual');return {on:V117.on,ok,r:String(r)};});
  S.F.cloud=!!cloudT('qa117-4')&&cloudT('qa117-4').review==='예전 경로';S.F.cas=C.cas.length>cas0;await ctx.close();}
 Object.assign(R,S);console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.log(JSON.stringify({...(globalThis.__S||{}),errors:['FATAL '+(e&&e.stack||e)]}));process.exit(1);});
