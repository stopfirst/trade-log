/* v104 HL 요청 한도 QA — 모의 HL(공식 가중치로 계산)·모의 Supabase·모의 WebSocket, 외부 연결 없음. 가짜 주소 0x1111….
   (1) 대시보드 탭 2개: 첫 4분 뒤 3분 동안 분당 가중치(두 탭 합) 상한 (2) 숨은 탭: 요청 0 (3) HL이 계속 429: 요청 수 상한(재시도 폭주 없음)
   (4) 차트 첫 표시 시간(HL 응답 300ms): 끝난 거래 · 새로고침 뒤 같은 거래는 봉 요청 0(IndexedDB) · 429 중 진행 중 거래는 이전 봉 + '속도 제한' 안내 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40);
const init=([A,scen])=>{
 const J=(v,s=200,h={})=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json',...h}});
 const L=window.__log=[];window.__r429=false;
 const W2=new Set(['clearinghouseState','spotClearinghouseState','l2Book','allMids','orderStatus','exchangeStatus']);
 const ITEM20=new Set(['recentTrades','historicalOrders','userFills','userFillsByTime','fundingHistory','userFunding']);
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 if(scen==='hidden'){let hid=false;Object.defineProperty(document,'visibilityState',{get:()=>hid?'hidden':'visible',configurable:true});Object.defineProperty(document,'hidden',{get:()=>hid,configurable:true});
  window.__hide=v=>{hid=v;document.dispatchEvent(new Event('visibilitychange'));};}
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   const rec={t:Date.now(),type:b.type,w:0,n:0,st:200,coin:b.req&&b.req.coin,iv:b.req&&b.req.interval};L.push(rec);
   if(window.__r429){rec.st=429;rec.w=0;return J({},429);}
   let out;
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:b.dex?[]:[{type:'oneWay',position:{coin:'ETH',szi:'1',entryPx:'2300',positionValue:'2310',unrealizedPnl:'10',returnOnEquity:'0.1',leverage:{type:'cross',value:10},liquidationPx:'2000',marginUsed:'231',maxLeverage:25,cumFunding:{allTime:'0',sinceOpen:'0',sinceChange:'0'}}}],marginSummary:{accountValue:'1000',totalNtlPos:'2310',totalRawUsd:'-1310',totalMarginUsed:'231'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'2310',totalRawUsd:'-1310',totalMarginUsed:'231'},crossMaintenanceMarginUsed:'50',withdrawable:'700',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'},{coin:'HYPE',token:150,total:'2',hold:'0',entryNtl:'60'}]};break;
    case 'perpDexs':out=[null,...['xyz','flx','vntl','hyna','km','abcd','cash','para','mkts','io'].map(n=>({name:n,fullName:n,deployer:'0x0'}))];break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:b.dex?'xyz:INTC':'ETH',szDecimals:2,maxLeverage:10}],collateralToken:({flx:360,vntl:360,hyna:235,km:360,cash:268})[b.dex]||0},[{markPx:'100'}]];break;
    case 'meta':out={universe:[{name:b.dex?'xyz:INTC':'ETH',szDecimals:4,maxLeverage:25},{name:'BTC',szDecimals:5,maxLeverage:40}]};break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[{name:'@107',tokens:[150,0],index:107}],tokens:[{name:'USDC',index:0,szDecimals:8},{name:'HYPE',index:150,szDecimals:2}]},[{coin:'@107',markPx:'30',midPx:'30',prevDayPx:'29'}]];break;
    case 'frontendOpenOrders':out=[{coin:'ETH',side:'A',limitPx:'2200',sz:'1',oid:1,timestamp:Date.now()-1e6,triggerCondition:'Price below 2200',isTrigger:true,triggerPx:'2200',isPositionTpsl:true,reduceOnly:true,orderType:'Stop Market',origSz:'1',tif:null,cloid:null}];break;
    case 'userFillsByTime':case 'userFills':case 'userFunding':out=[];break;
    case 'candleSnapshot':{const iv=IV[b.req.interval]||6e4;out=[];let p=2300;for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<5000;t+=iv,i++){const c=p+Math.sin(i/3)*3;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+1),l:String(Math.min(p,c)-1),v:'10',n:5});p=c;}break;}
    default:out={};}
   rec.n=Array.isArray(out)?out.length:0;
   rec.w=(W2.has(b.type)?2:b.type==='userRole'?60:20)+(ITEM20.has(b.type)?Math.floor(rec.n/20):0)+(b.type==='candleSnapshot'?Math.floor(rec.n/60):0);
   if(window.__delay)await new Promise(r=>setTimeout(r,window.__delay));
   return J(out);}
  if(u.includes('.supabase.co/')){
   if(u.includes('/rpc/hl_status'))return J({address:A,max_fill_id:0,max_funding_id:0,fills_count:0,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()});
   return J([]);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;(window.__ws=window.__ws||[]).push(this);setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}
  send(d){const m=JSON.parse(d);if(m.method==='subscribe')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'userFills',data:{isSnapshot:true,user:m.subscription.user,fills:[]}})}),25);if(m.method==='ping')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'pong'})}),5);}
  close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;
};
const seed=()=>{
 const now=Date.now();
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=o=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:o.id,at:o.e[0][0],name:o.name,direction:'long',date:new Date(o.e[0][0]).toISOString().slice(0,10),stop:o.stop??null,stop0:o.stop0??null,initialRisk:o.R??null,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],entries:o.e.map((x,i)=>ev(o.id+'e'+i,...x)),fills:(o.f||[]).map((x,i)=>ev(o.id+'f'+i,...x)),funding:[],images:[]});
 const tr=[];const names=['ETH','BTC','xyz:INTC','SOL'];
 for(let i=0;i<20;i++){const a=now-(i+1)*6*3600e3;tr.push(mk({id:'c'+i,name:names[i%4],e:[[a,1,2300]],f:[[a+90*60e3,1,2310,'f'+i]],stop:2290,stop0:2290,R:10}));}
 tr.push(mk({id:'open',name:'ETH',e:[[now-3*3600e3,1,2300]],stop:2200,stop0:2200,R:100}));
 state.trades=tr;Object.assign(state.settings,{account:1000});setPage('dashboard');renderAll();
};
const login=()=>{cloudConfig={url:'https://qa0000000000000000.supabase.co',key:'sb_publishable_QAQAQAQAQAQAQAQAQAQA'};cloudSession={project:cloudConfig.url,access_token:'qa',refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+86400,user:{id:'qa-user',email:''}};};

const sum=(L,t0,t1)=>{let w=0,n=0;const by={};for(const r of L){if(r.t<t0||r.t>=t1)continue;n++;w+=r.w;by[r.type]=(by[r.type]||0)+1;}return {n,w,by};};
const svgAt=async(page,ms)=>{const t0=Date.now();while(Date.now()-t0<ms){const r=await page.evaluate(()=>{const b=document.querySelector('#v37Chart');return !!(b&&b.querySelector('svg.v37-svg'));});if(r)return Date.now()-t0;await page.waitForTimeout(25);}return -1;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const mkPage=async(ctx)=>{const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(seed);await page.evaluate(login);await page.evaluate(async()=>{hlcLastRun=0;try{await hlcSync(false);}catch{}});return page;};
 const newCtx=async(scen)=>{const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init,[A,scen]);return ctx;};
 const logs=async pages=>{let L=[];for(const p of pages)L=L.concat(await p.evaluate(()=>window.__log));return L;};
 await Promise.all([
  (async()=>{/* (1) 탭 2개 */const ctx=await newCtx('dash');const p1=await mkPage(ctx),p2=await mkPage(ctx);
   await p1.clock.runFor(240000);const t1=await p1.evaluate(()=>Date.now());await p1.clock.runFor(180000);const t2=await p1.evaluate(()=>Date.now());
   const s=sum(await logs([p1,p2]),t1,t2);R.dash={perMin:Math.round(s.w/3),n:s.n,by:s.by,dbg:await p1.evaluate(()=>window.v104Debug())};await ctx.close();})(),
  (async()=>{/* (2) 숨은 탭 */const ctx=await newCtx('hidden');const p=await mkPage(ctx);await p.clock.runFor(20000);await p.evaluate(()=>window.__hide(true));
   const t1=await p.evaluate(()=>Date.now());await p.clock.runFor(180000);const t2=await p.evaluate(()=>Date.now());R.hidden=sum(await logs([p]),t1,t2);await ctx.close();})(),
  (async()=>{/* (3) 계속 429 */const ctx=await newCtx('r429');const p=await mkPage(ctx);await p.clock.runFor(20000);await p.evaluate(()=>{window.__r429=true;});
   const t1=await p.evaluate(()=>Date.now());await p.clock.runFor(180000);const t2=await p.evaluate(()=>Date.now());const s=sum(await logs([p]),t1,t2);
   R.r429={n:s.n,cool:await p.evaluate(()=>{const c=JSON.parse(localStorage.getItem('tj:v104:cool')||'{}');return c.n||0;})};await ctx.close();})(),
  (async()=>{/* (4) 차트 */const ctx=await newCtx('chart');const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
   await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(seed);await page.waitForTimeout(2500);
   await page.evaluate(()=>{window.__delay=300;});const open=async id=>page.evaluate(id=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade(id,'manage');},id);
   const C={};await open('c1');C.first=await svgAt(page,20000);await open('open');C.open=await svgAt(page,20000);
   await page.evaluate(()=>{window.__r429=true;$('tradeDialog').close();});await page.clock.fastForward(70000);await open('open');C.r429=await svgAt(page,20000);
   for(let i=0;i<80;i++){C.note=await page.evaluate(()=>{const h=document.querySelector('#v37Chart .v37-chart-head');return h?h.textContent:'';});if(/속도 제한/.test(C.note))break;await page.waitForTimeout(100);}
   C.stillSvg=await page.evaluate(()=>!!document.querySelector('#v37Chart svg.v37-svg'));
   await page.evaluate(()=>{window.__r429=false;localStorage.removeItem('tj:v104:cool');});
   await page.reload();await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(seed);await page.waitForTimeout(2000);
   await page.evaluate(()=>{window.__delay=300;window.__log.length=0;});await open('c1');C.reload=await svgAt(page,20000);await page.waitForTimeout(500);
   C.reloadReq=await page.evaluate(()=>window.__log.filter(r=>r.type==='candleSnapshot'&&r.coin==='BTC').length);
   R.chart=C;await ctx.close();})()]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
