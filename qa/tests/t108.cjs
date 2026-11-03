/* v108 QA — 모의 HL·모의 Supabase(외부 연결 없음, 가짜 주소 0x1111…, 가짜 프로젝트 abcdefghijklmnop.supabase.co).
   사용자 보고: PC엔 없는 '일지 빈 칸 N건'이 모바일에만 뜸 → 판정은 같고(기기별 저장 데이터 차이) 카드에 기준·버전·클라우드 새 저장본 안내.
   (1) 1440·390 같은 데이터 → 같은 빈 칸 목록(손익비 미달만 = 제외, × 숨김 = 제외, 미기록 = 남음)
   (2) 카드에 '이 기기에 저장된 HL 일지 기준 · 앱 vNNN'이 두 폭 모두 화면에 보임(모바일 헤더 버전은 숨김이라)
   (3) 클라우드 로그인 + 클라우드 revision 7 > 이 기기 5 → '아직 안 불러온 저장본 · 버전 7' 안내, 요청은 revision·updated_at 만(본문 payload 없음), 이 기기 7이면 안내 사라짐
   (4) [설정 열기] → 설정 화면. 카드 가로 넘침 없음 */
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

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});await ctx.addInitScript(init,['0x'+'1'.repeat(40),'x']);const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
  await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(async()=>{const D=Date.now()-86400e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
   const mk=(id,name,x)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:D,name,direction:'long',date:new Date(D).toISOString().slice(0,10),stop:98,stop0:98,initialRisk:null,riskR:1,setup:'눌림',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
    entryNote:'근거',stopNote:'이유',react:true,tfIn:'htf',tfOut:'htf',riskPlan:{target:103.62},entries:[ev(id+'e',D,10,100)],fills:[ev(id+'f',D+3600e3,10,101)],funding:[],images:[],...x});
   state.settings.v92From='2026-10-01';state.trades=[mk('gA','xyz:GOLD',{}),mk('gB','xyz:XYZ100',{stopNote:''}),mk('gC','ETH',{entryNote:'',v92Hide:true})];await persist();setPage('dashboard');renderAll();});
  await page.waitForTimeout(700);
  const G={};
  G.list=await page.evaluate(()=>[...document.querySelectorAll('#v92Dash li button[data-v63-open]')].map(b=>b.dataset.v63Open));
  G.src=await page.evaluate(()=>{const e=document.querySelector('#v92Dash .v108-src');if(!e)return null;const r=e.getBoundingClientRect();return {txt:e.textContent,vis:r.width>0&&r.height>0,hasVer:e.textContent.includes(APP_VER)};});
  G.cloud0=await page.evaluate(()=>!!document.querySelector('#v92Dash .v108-cloud'));
  /* (3) 클라우드 안내 */
  G.cl=await page.evaluate(async()=>{const P='https://abcdefghijklmnop.supabase.co';cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'u-1'},access_token:'tok',expires_at:Math.floor(Date.now()/1000)+3600};
   const urls=[];const f0=window.fetch;window.fetch=async(u,o)=>{const s=String(u&&u.url||u);if(s.includes('/rest/v1/journal_cloud')){urls.push(s);return new Response(JSON.stringify([{revision:7,updated_at:'2026-11-03T12:10:00Z'}]),{status:200,headers:{'Content-Type':'application/json'}});}return f0(u,o);};
   localStorage.setItem(cloudRevisionKey(),'5');await v108Check(true);await new Promise(r=>setTimeout(r,200));
   const c=document.querySelector('#v92Dash .v108-cloud');const out={shown:!!c,txt:c?c.textContent:'',urls:urls.map(u=>u.split('?')[1].split('&')[0])};
   localStorage.setItem(cloudRevisionKey(),'7');v92Mount();out.afterSame=!!document.querySelector('#v92Dash .v108-cloud');
   localStorage.setItem(cloudRevisionKey(),'5');v92Mount();out.again=!!document.querySelector('#v92Dash .v108-cloud');
   const d=document.getElementById('v92Dash');out.over=d.scrollWidth>d.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1;return out;});
  await page.screenshot({path:require('path').join(outDir,'t108-w'+W+'.png')}).catch(e=>{G.shotErr=String(e);});
  await page.click('#v92Dash [data-v108-set]');await page.waitForTimeout(400);
  G.page=await page.evaluate(()=>currentPage);
  G.dbg=await page.evaluate(()=>{const d=v108Debug();return {journal:d.journal,local:d.local_revision,cloud:d.cloud&&d.cloud.revision,gaps:d.gaps.map(x=>x.id),hidden:d.hidden};});
  R['w'+W]=G;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
