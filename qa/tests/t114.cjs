/* v114 QA — (F) HL 펀딩 검토(JournalFundingReview.inspect) 속도: 일별 펀딩 기록 200개 × 종목 체결 × executionKeys 9천 → v113 수 초, v114 수십 ms(결과는 같은 규칙)
   (D) 진단 패널: 동기화 칩·버전 글자·설정 버튼으로 열기, 동기화·HL·잔고·실시간·메인 스레드·부팅 단계 표시, 복사 본문에 키·토큰·전체 주소 없음, 390폭 넘침 없음,
       '받는 중'(응답 없는 head)에서 칩 → 패널(설정으로 안 넘어감)·단계 '클라우드 버전 확인' → [멈춘 작업 강제 해제] → busy 해제·'받기 실패 · 다시 시도'
   (W) 워치독(v114Watch 직접 호출, 시간 짧게): 취소 무시 동기화 · 응답 없는 HL 요청 · 새어 나간 HL 칸 · 현물 busy 고착 · 잔고 5분+ 묵음 → 다시 받기 · 조용한 리더 인계
   (B) 지난 실행 신호(새로고침 뒤 V114.prev, 정상 종료 표시) · 경고 수집(토큰 가림). 모의 클라우드·모의 HL(외부 연결 없음, 가짜 주소·id). */
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
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const S=globalThis.__S={};
 const login=(P)=>P.evaluate(P0=>{cloudConfig={url:P0,key:'sb_publishable_'+'q'.repeat(24)};cloudSession={project:P0,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tokSECRETqa114',refresh_token:'rSECRETqa114',expires_at:Math.floor(Date.now()/1000)+36000};v110Paint();},PRJ);
 /* ---- (F) 펀딩 검토 속도 ---- */
 {const ctx=await mkCtx(1440,'f');const P=await open(ctx,'F');
  S.F=await P.evaluate(()=>{const acct='0x'+'3'.repeat(40),DAY=864e5,H=36e5,d0=Date.UTC(2026,8,1),syms=['ETH','BTC','SOL'];const exec=[],trades=[];
   for(const sym of syms)for(let i=0;i<60;i++){const t0=d0+i*DAY+2*H+7*60e3,key='hyperliquid:'+acct+':'+sym+':'+i;const e1={id:key+'e',sourceKey:key+':e',timestamp:t0,shares:1,sharesText:'1',price:100,seq:1},e2={id:key+'x',sourceKey:key+':x',timestamp:t0+3*H,shares:1,sharesText:'1',price:101,seq:2};
    exec.push(e1.sourceKey,e2.sourceKey);trades.push({id:'f'+sym+i,name:sym,market:'HL',direction:'long',date:'',entries:[e1],fills:[e2],funding:[],sync:{source:'hyperliquid',account:acct,tradeKey:key,historyComplete:true,feeComplete:true,positionStatus:'CLOSED'}});}
   for(let i=0;i<9000;i++)exec.push('hyperliquid:'+acct+':pad:'+i);
   const recs=[];for(let i=0;i<200;i++){const sym=syms[i%3],ts=d0+Math.floor(i/3)*DAY;recs.push({source:'hyperliquid',account:acct,sourceKey:'hyperliquid:'+acct+':funding:'+i,timestamp:ts,symbol:sym,amount:'-0.01',position:'1',nSamples:3});}
   const s={updatedAt:'x',trades,sync:{hyperliquid:{account:acct,executionKeys:exec,fundingKeys:recs.map(r=>r.sourceKey),historyStart:d0-DAY,lastSync:d0+400*DAY,quarantine:[],accountFunding:{currency:'USDC',unassignedRecords:recs,total:'-2',assigned:'0',unassigned:'-2',unassignedCount:200}}}};
   const t=performance.now();const a=JournalFundingReview.inspect(s,{isTradeValid:()=>true});const ms=Math.round(performance.now()-t);
   const st={};for(const r of a.rows)st[r.status]=(st[r.status]||0)+1;
   return {ms,rows:a.rows.length,errors:a.errors,cand:st.CANDIDATE||0,status:a.accountingStatus,frN:V114.fr.n>=1,reasons:[...new Set(a.rows.map(r=>r.reason.slice(0,12)))].slice(0,4)};});
  await ctx.close();}
 /* ---- (D) 진단 패널 · (W) 워치독 ---- */
 {const ctx=await mkCtx(390,'mob');const P=await open(ctx,'D');S.D={};S.W={};
  await P.evaluate(()=>{state.trades=[];});await login(P);
  await P.evaluate(()=>{Object.assign(V113T,{small:2500,remote:2500,push:2500,lock:1200,flush:800,idb:1500,persist:2000,all:60000,visStale:60000});});
  const idle=async()=>{await P.waitForFunction(()=>!V110.busy,null,{timeout:20000}).catch(()=>{});};
  await idle();await P.evaluate(()=>v110Sync('test',{force:true}));await idle();
  /* D1 정상 상태에서 칩 → 패널 */
  await P.click('#v110Sync .v110-st');await P.waitForTimeout(300);
  S.D.open=await P.evaluate(()=>{const b=$('v114Diag');const c=b&&b.querySelector('.v114-card');return {vis:!!(b&&!b.hidden&&b.getClientRects().length),page:currentPage,txt:b?b.textContent:'',over:c?c.scrollWidth>c.clientWidth+1:true,docScroll:document.documentElement.scrollWidth>innerWidth+1};});
  S.D.has=['앱 버전','동기화','HL 요청','잔고·현물','실시간 체결','메인 스레드','부팅 단계','펀딩 검토 계산','자동 복구'].filter(k=>!S.D.open.txt.includes(k));
  S.D.txtLen=S.D.open.txt.length;delete S.D.open.txt;
  await P.screenshot({path:path.join(outDir,'diag-390.png')}).catch(e=>{R.shotErr=e.message;});
  await P.evaluate(()=>{console.warn('qa114 경고 access_token=SECRETWARN114 apikey=sb_publishable_zzzzzzzzzzzz 0x'+'4'.repeat(40));});
  await P.click('[data-v114-act="copy"]');await P.waitForTimeout(300);
  S.D.copy=await P.evaluate(()=>{const t=V114.copied||'';return {len:t.length,secret:/SECRET|sb_publishable_q|tokSECRET/.test(t),addr:t.includes('0x'+'4'.repeat(40)),warn:t.includes('qa114 경고'),hidden:t.includes('[숨김]')};});
  await P.click('[data-v114-act="close"]');await P.waitForTimeout(150);S.D.closed=await P.evaluate(()=>$('v114Diag').hidden);
  /* 버전 글자로 열기 · 설정 버튼 */
  S.D.ver=await P.evaluate(async()=>{const v=document.querySelector('.v58-ver');if(!v)return 'no-ver';v.click();await new Promise(r=>setTimeout(r,150));const ok=!$('v114Diag').hidden;v114Close();return ok;});
  S.D.btn=await P.evaluate(async()=>{setPage('settings');await new Promise(r=>setTimeout(r,300));v114Btn();const b=$('v114OpenBtn');if(!b)return 'no-btn';b.click();await new Promise(r=>setTimeout(r,150));const ok=!$('v114Diag').hidden;v114Close();setPage('dashboard');return ok;});
  /* D2 '받는 중'에서 칩 → 패널 → 강제 해제 */
  await idle();await P.evaluate(()=>{clearTimeout(V110.kickT);V110.again=false;window.__cloudHang='dead';V113T.small=60000;v110Sync('focus');});await P.waitForTimeout(2300);await P.waitForFunction(()=>V114.syncStage==='클라우드 버전 확인',null,{timeout:8000}).catch(()=>{});
  S.D.busyChip=await P.evaluate(()=>document.querySelector('#v110Sync .v110-st').textContent);
  await P.click('#v110Sync .v110-st');await P.waitForTimeout(1200);
  S.D.busyPanel=await P.evaluate(()=>{const t=$('v114Diag').textContent;return {vis:!$('v114Diag').hidden,page:currentPage,stage:t.includes('클라우드 버전 확인'),stageTxt:V114.syncStage,busy:V114.syncStage!==''&&V110.busy};});
  S.D.released=await P.evaluate(()=>{document.querySelector('[data-v114-act="release"]').click();return {busy:V110.busy,chip:document.querySelector('#v110Sync .v110-st').textContent,fix:V114.fix.some(f=>/동기화/.test(f.msg))};});await P.waitForTimeout(500);S.D.retried=await P.evaluate(()=>V113S.n.runs);
  await P.evaluate(()=>{window.__cloudHang=null;V113T.small=2500;v114Close();});await P.waitForTimeout(400);await idle();
  /* W1 동기화가 취소를 무시하고 안 끝남 → 워치독 */
  await P.evaluate(()=>{clearTimeout(V110.kickT);V110.again=false;V113T.small=60000;V113T.all=60000;V114T.sync=1500;window.__cloudHang='dead';v110Sync('focus');});
  await P.waitForTimeout(400);S.W.busy0=await P.evaluate(()=>{v114Watch();return V110.busy;});await P.waitForTimeout(1600);
  S.W.sync=await P.evaluate(()=>{v114Watch();return {busy:V110.busy,st:V110.st,fix:V114.fix.filter(f=>/멈춤/.test(f.kind)).length>=1};});
  await P.evaluate(()=>{window.__cloudHang=null;V113T.small=2500;V114T.sync=170000;});await P.waitForTimeout(1500);await idle();
  /* W2 응답 없는 HL 요청(v113 제한보다 짧은 워치독) */
  S.W.hl=await P.evaluate(async()=>{const A2='0x'+'2'.repeat(40);hlcStatus={...(hlcStatus||{}),address:A2};V113T.hl=60000;V114T.hlReq=800;window.__hlHang.add('spotClearinghouseState');V57.at=0;V57.busy=false;
   const p=v57Spot(true);await new Promise(r=>setTimeout(r,300));const o={pend:V114.hl.size,busy0:V57.busy};await new Promise(r=>setTimeout(r,700));v114Watch();
   await Promise.race([p,new Promise(r=>setTimeout(r,3000))]);o.busy=V57.busy;o.left=V114.hl.size;o.done=V114.hlDone.some(d=>d.ok==='강제 취소');window.__hlHang.clear();V113T.hl=20000;V114T.hlReq=45000;return o;});
  /* W3 새어 나간 HL 칸 */
  S.W.leak=await P.evaluate(async()=>{const before=V104.inflight;V104.inflight=V104.CONC+2;let got=false;const w=v104Slot(0).then(()=>{got=true;v104Done();});v114Watch();v114Watch();await new Promise(r=>setTimeout(r,50));return {got,inflight:V104.inflight,before};});
  /* W4 현물 busy 고착 · 잔고 묵음 */
  S.W.spot=await P.evaluate(async()=>{V57.busy=true;V114.since.spot=Date.now()-70000;v114Watch();const o={busy:V57.busy};let n=0;const b=hlbRefresh;hlbRefresh=function(...a){n++;return Promise.resolve();};
   try{const L=v4LatestAccountBalance;if(L){L.fetchedAt=Date.now()-6*60000;}else{v4LatestAccountBalance={fetchedAt:Date.now()-6*60000,asOf:Date.now()-6*60000};}V114.kick.bal=0;hlbBusy=false;v114Watch();o.balKick=n;}finally{hlbRefresh=b;}
   o.stale=typeof v107Stale==='function'?(()=>{const e=hlbError;hlbError=null;const L=v4LatestAccountBalance;const f=L.fetchedAt;L.fetchedAt=Date.now()-11*60000;const r=v107Stale();L.fetchedAt=f;hlbError=e;return r;})():null;return o;});
  /* W5 조용한 리더 → 인계 */
  S.W.lead=await P.evaluate(async()=>{if(!v93Want())return 'nowant';V93.leader=false;V93.peer={on:false,at:0};V114.t0=Date.now()-60000;V114.kick.steal=0;v114Watch();for(let i=0;i<30&&!V93.leader;i++)await new Promise(r=>setTimeout(r,50));return {leader:V93.leader,steal:V114.n.steal};});
  /* 경고 수집 */
  S.W.warn=await P.evaluate(()=>{const w=V114.warns.find(x=>x.msg.includes('qa114'));return w?{secret:/SECRET|sb_publishable_z/.test(w.msg),hidden:w.msg.includes('[숨김]')}:null;});
  /* (B) 새로고침 뒤 지난 실행 신호 */
  await P.waitForTimeout(3200);await P.reload();await P.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await P.waitForTimeout(500);
  S.B=await P.evaluate(()=>({prev:!!V114.prev,closed:V114.prev&&V114.prev.closed,hasVer:!!(V114.prev&&V114.prev.ver),boot:V114.boot.map(b=>b.name).join('|').includes('부팅 완료'),row:v114Text().includes('지난 실행: ')}));
  await ctx.close();}
 Object.assign(R,S);console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.log(JSON.stringify({...(globalThis.__S||{}),errors:['FATAL '+(e&&e.stack||e)]}));process.exit(1);});
