/* v107 HL 계좌 총액 = HL 화면 정의 — 모의 HL(통합 계정 unifiedAccount)·모의 Supabase, 외부 연결 없음. 가짜 주소 0x2222….
   (1) hlbRefresh가 v104 캐시를 거쳐도 성공(두 번째 userAbstraction이 캐시에서 문자열로 와도 JSON) → 거래계좌 = 현물 USDC total
   (2) USDC total이 바뀌면(격리 포지션 미실현 변화) 다음 갱신에 따라감 · userAbstraction은 캐시(네트워크 1회)
   (3) 통합 계정은 perp dex accountValue를 더하지 않음(이중 합산 없음) · 총액 타일 = USDC + 현물 markPx
   (4) 갱신 실패 + 3분 넘은 값이면 타일에 '⚠ 거래계좌 N분 전 값' (5) window.v107Debug() 분해 합 = HL 정의, 차이 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'2'.repeat(40);
const init=([A])=>{
 const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const L=window.__log=[];window.__usdc='18000';window.__fail=false;
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   L.push({t:Date.now(),type:b.type,dex:b.dex||''});let out;
   switch(b.type){
    case 'userAbstraction':out='unifiedAccount';break;
    case 'clearinghouseState':out=b.dex==='xyz'?{assetPositions:[{type:'oneWay',position:{coin:'xyz:GOLD',szi:'-10',entryPx:'4000',positionValue:'39700',unrealizedPnl:'300',returnOnEquity:'0.2',leverage:{type:'isolated',value:20,rawUsd:'41700'},liquidationPx:'4150',marginUsed:'2000',maxLeverage:25,cumFunding:{allTime:'0',sinceOpen:'0',sinceChange:'0'}}}],marginSummary:{accountValue:'2000',totalNtlPos:'39700',totalRawUsd:'41700',totalMarginUsed:'2000'},crossMarginSummary:{accountValue:'0',totalNtlPos:'0',totalRawUsd:'0',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'0',time:Date.now()}
      :{assetPositions:[],marginSummary:{accountValue:'0',totalNtlPos:'0',totalRawUsd:'0',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'0',totalNtlPos:'0',totalRawUsd:'0',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'0',time:Date.now()};break;
    case 'spotClearinghouseState':if(window.__fail)return J({error:'down'},500);out={balances:[{coin:'USDC',token:0,total:window.__usdc,hold:'2000',entryNtl:'0'},{coin:'UBTC',token:197,total:'0.25',hold:'0',entryNtl:'19000'},{coin:'SPCXD',token:610,total:'100',hold:'0',entryNtl:'14000'}]};break;
    case 'perpDexs':out=[null,{name:'xyz',fullName:'xyz',deployer:'0x0'},{name:'flx',fullName:'flx',deployer:'0x0'}];break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:b.dex?b.dex+':X':'ETH',szDecimals:2,maxLeverage:10}],collateralToken:0},[{markPx:'100'}]];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[{name:'@142',tokens:[197,0],index:0},{name:'@465',tokens:[610,0],index:1},{name:'@107',tokens:[150,0],index:2}],tokens:[{name:'USDC',index:0},{name:'UBTC',index:197},{name:'SPCXD',index:610},{name:'HYPE',index:150}]},[{coin:'@142',markPx:'76000',midPx:'76010',prevDayPx:'75000'},{coin:'@465',markPx:'137',midPx:'140',prevDayPx:'136'},{coin:'@107',markPx:'80',midPx:'80',prevDayPx:'80'}]];break;
    case 'delegatorSummary':out={delegated:'10',undelegated:'0',totalPendingWithdrawal:'0',nPendingWithdrawals:0};break;
    case 'frontendOpenOrders':case 'userFillsByTime':case 'userFills':case 'userFunding':out=[];break;
    case 'candleSnapshot':out=[];break;
    default:out={};}
   return J(out);}
  if(u.includes('.supabase.co/')){
   if(u.includes('/rpc/hl_status'))return J({address:A,max_fill_id:0,max_funding_id:0,fills_count:0,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()});
   return J([]);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}send(){}close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;
};
const login=()=>{cloudConfig={url:'https://qa0000000000000000.supabase.co',key:'sb_publishable_QAQAQAQAQAQAQAQAQAQA'};cloudSession={project:cloudConfig.url,access_token:'qa',refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+86400,user:{id:'qa-user',email:''}};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init,[A]);
 const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
 await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
 await page.evaluate(login);await page.evaluate(async()=>{state.settings.account=1000;setPage('dashboard');hlcLastRun=0;try{await hlcSync(false);}catch{}});
 const snap=()=>page.evaluate(()=>{const k=document.querySelector('#v12Hero .v12-key');return {eq:v4LatestAccountBalance?Number(v4LatestAccountBalance.equity):null,mode:v4LatestAccountBalance&&v4LatestAccountBalance.accountMode,err:hlbError||null,basis:Math.round(acctBasis()*100)/100,spot:Math.round(v66SpotUsd()*100)/100,tile:k?k.innerText.replace(/\s+/g,' '):''};});
 /* (1) */
 await page.evaluate(async()=>{hlbBusy=false;await hlbRefresh(true);await v57Spot(true);renderAll();});R.first=await snap();
 /* (2) 미실현 변화 → USDC total 18,250 */
 await page.evaluate(async()=>{window.__usdc='18250';hlbBusy=false;await hlbRefresh(true);renderAll();});R.second=await snap();
 R.absNet=await page.evaluate(()=>window.__log.filter(r=>r.type==='userAbstraction').length);
 /* (5) 진단 */
 R.dbg=await page.evaluate(async()=>{if(typeof window.v107Debug!=="function")return null;const d=await window.v107Debug({silent:true});return d&&d.sum;});
 /* (4) 갱신 실패 + 오래된 값 */
 await page.evaluate(async()=>{v4LatestAccountBalance={...v4LatestAccountBalance,fetchedAt:Date.now()-10*60e3};window.__fail=true;hlbBusy=false;await hlbRefresh(true);renderAll();});R.stale=await snap();
 await page.evaluate(async()=>{window.__fail=false;hlbBusy=false;await hlbRefresh(true);renderAll();});R.recovered=await snap();
 await page.screenshot({path:outDir+'/t107-'+tag+'.png'});
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
