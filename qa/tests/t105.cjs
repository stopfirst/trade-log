/* v105 QA — 모의 HL·모의 Supabase(외부 연결 없음).
   (1) 손익비 상자 흔들림: 진행 중 ETH 롱(HL 실제 SL 2280 모의), 상자 TP 끌기 뒤 10초 동안 HL 스탑 반영(v32Paint→v75)·봉 갱신·다시 그리기(다른 창 병합과 같은 경로)·v103 반영을 일으켜도 손잡이 좌표 불변,
       끄는 도중 renderDetail이 와도 놓은 자리 = 마우스 자리, 현재 스탑은 HL 값 유지
   (2) 라벨: 평소 숨김, 상자 호버 때 표시(축 스탑 가격표 포함), 벗어나면 숨김, 터치 탭 = 표시·다른 곳 탭 = 숨김
   (3) xyz:GOLD 숏 종료 거래 포지션 % ≈ +0.13%(이전 +522.7%: 분모가 진입 수량)
   (4) 일지 글칸 타이핑 지연(input → 다음 프레임, 거래 120건) 평균 < 16ms, 최대 < 50ms */
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

const H=(page)=>page.evaluate(()=>{const o={};for(const k of ['tp','sl','en']){const e=document.querySelector('#v37Chart .v43-rr circle.v43-hh[data-v43h="'+k+'"]');if(e){const r=e.getBoundingClientRect();o[k]=[+(r.left+r.width/2).toFixed(1),+(r.top+r.height/2).toFixed(1)];}}return o;});
const dist=(a,b)=>{let m=0;for(const k of ['tp','sl','en']){if(!a[k]||!b[k])return 999;m=Math.max(m,Math.abs(a[k][0]-b[k][0]),Math.abs(a[k][1]-b[k][1]));}return +m.toFixed(1);};
const op=(page,sel)=>page.evaluate(sel=>{const e=document.querySelector(sel);return e?getComputedStyle(e).opacity:null;},sel);
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const boot=async(ctxOpt)=>{const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(ctxOpt||{})});await ctx.addInitScript(init,['0x'+'1'.repeat(40),'x']);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(seed);await page.waitForTimeout(800);
  await page.evaluate(async()=>{const t=state.trades.find(x=>x.id==='open');const a=t.entries[0].timestamp;t.stop=null;t.stop0=null;t.initialRisk=null;delete t.riskPlan;t.chartNotes=[{id:'rb',kind:'rr',side:'long',ts:a+10*60e3,ts2:a+70*60e3,px:2300,sl:2290,tp:2312,text:'',at:Date.now()}];
   v32St={at:Date.now(),orders:[],failed:[]};v32Kick=async()=>{};v32Model=()=>({state:'ok',rows:[{coin:'ETH',side:'long',entry:2300,stopPx:2280,status:'full'}]});await persist();});
  await page.evaluate(()=>openTrade('open','manage'));await page.waitForTimeout(2500);
  await page.evaluate(async()=>{const svg=document.querySelector('#v37Chart svg.v37-svg');const g=v43G(svg);const P=v=>Number(v.toPrecision(8));const t=state.trades.find(x=>x.id==='open');
   await v40Save(t,l=>l.map(y=>y.id==='rb'?{...y,px:P(g.lo+(g.hi-g.lo)*0.5),sl:P(g.lo+(g.hi-g.lo)*0.3),tp:P(g.lo+(g.hi-g.lo)*0.7),at:Date.now()}:y),'');});await page.waitForTimeout(1200);await page.evaluate(()=>document.querySelector('#v37Chart').scrollIntoView({block:'center'}));await page.waitForTimeout(300);
  return {ctx,page};};
 /* (1)(2) 데스크톱 */
 {const {ctx,page}=await boot();const B={};
  await page.mouse.move(5,5);await page.waitForTimeout(250);
  B.lab0=await op(page,'#v37Chart .v43-rr .v43-lb');B.ax0=await op(page,'#v37Chart .v96-tag.stop');
  const z=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v43-rr .v43-z.loss');const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];});
  await page.mouse.move(z[0],z[1],{steps:3});await page.waitForTimeout(250);B.lab1=await op(page,'#v37Chart .v43-rr .v43-lb');B.ax1=await op(page,'#v37Chart .v96-tag.stop');
  await page.mouse.move(5,5,{steps:3});await page.waitForTimeout(250);B.lab2=await op(page,'#v37Chart .v43-rr .v43-lb');
  const h0=await H(page);B.h0=h0;
  await page.mouse.move(h0.tp[0],h0.tp[1]);await page.mouse.down();await page.mouse.move(h0.tp[0],h0.tp[1]-30,{steps:6});await page.mouse.up();await page.waitForTimeout(900);
  const h1=await H(page);B.h1=h1;B.tpMoved=+(h0.tp[1]-h1.tp[1]).toFixed(1);B.slShift=+Math.abs(h0.sl[1]-h1.sl[1]).toFixed(1);B.enShift=+Math.abs(h0.en[1]-h1.en[1]).toFixed(1);
  B.stop=await page.evaluate(()=>state.trades.find(x=>x.id==='open').stop);
  const acts=[()=>{v32Paint();},()=>{V37_CHART.forEach(c=>{c.at=0;});const t=state.trades.find(x=>x.id==='open');v37ChartMount(t);},()=>{renderAll();renderDetail();},()=>{v103Kick('open',10);}];
  let mx=0;for(let i=0;i<10;i++){await page.evaluate(i=>{const f=[()=>{v32Paint();},()=>{V37_CHART.forEach(c=>{c.at=0;});v37ChartMount(state.trades.find(x=>x.id==='open'));},()=>{renderAll();renderDetail();},()=>{v103Kick('open',10);}][i%4];try{f();}catch(e){console.warn(e);}},i);await page.waitForTimeout(1000);mx=Math.max(mx,dist(h1,await H(page)));}
  B.after10=mx;B.stopAfter=await page.evaluate(()=>state.trades.find(x=>x.id==='open').stop);
  /* SL 끌어 놓기(최초 손절이 상자를 따라감 → 예전엔 축이 바뀌어 상자가 뜀) */
  {const a=await H(page);await page.mouse.move(a.sl[0],a.sl[1]);await page.mouse.down();await page.mouse.move(a.sl[0],a.sl[1]+40,{steps:6});await page.mouse.up();await page.waitForTimeout(1500);
   const b=await H(page);B.slRelease=+(b.sl[1]-(a.sl[1]+40)).toFixed(1);B.slOthers=+Math.max(Math.abs(b.tp[1]-a.tp[1]),Math.abs(b.en[1]-a.en[1])).toFixed(1);
   B.stop0=await page.evaluate(()=>state.trades.find(x=>x.id==='open').stop0);}
  /* 끄는 도중 다시 그리기 */
  const h2=await H(page);await page.mouse.move(h2.sl[0],h2.sl[1]);await page.mouse.down();await page.mouse.move(h2.sl[0],h2.sl[1]+15,{steps:4});
  await page.evaluate(()=>{renderDetail();});await page.mouse.move(h2.sl[0],h2.sl[1]+30,{steps:4});await page.mouse.up();await page.waitForTimeout(900);
  const h3=await H(page);B.midDragDy=+(h3.sl?h3.sl[1]-(h2.sl[1]+30):999).toFixed(1);
  R.box=B;await page.screenshot({path:outDir+'/'+tag+'-box.png'});await ctx.close();}
 /* (2) 터치 */
 {const {ctx,page}=await boot({hasTouch:true,isMobile:false});const T={};
  T.lab0=await op(page,'#v37Chart .v43-rr .v43-lb');
  const z=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v43-rr .v43-z.win');const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];});
  await page.touchscreen.tap(z[0],z[1]);await page.waitForTimeout(400);T.lab1=await op(page,'#v37Chart .v43-rr .v43-lb');
  const o=await page.evaluate(()=>{const e=document.querySelector('#detailTitle');const r=e.getBoundingClientRect();return [r.left+5,r.top+r.height/2];});
  await page.touchscreen.tap(o[0],o[1]);await page.waitForTimeout(400);T.lab2=await op(page,'#v37Chart .v43-rr .v43-lb');
  R.touch=T;await ctx.close();}
 /* (3) xyz 포지션 % */
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init,['0x'+'1'.repeat(40),'x']);const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
  await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  R.xyz=await page.evaluate(async()=>{const D=Date.now()-86400e3;const ev=(id,ts,sh,px,fee,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
   const t=normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id:'g1',at:D,name:'xyz:GOLD',direction:'short',date:new Date(D).toISOString().slice(0,10),stop:3989,stop0:3989,initialRisk:250.58,riskR:1,setup:'미분류',leverage:null,marginMode:'unknown',process:'unreviewed',review:'',violations:[],
    entries:[ev('ge0',D,20,3980,61,'g1'),ev('ge1',D+60e3,8,3980,24.4,'g2')],fills:[ev('gf0',D+3600e3,28,3968.6,85.39,'g3')],funding:[],images:[]});
   const t2=normaliseTrade({...clone(t),id:'g2',fills:[ev('gf1',D+3600e3,14,3968.6,42.7,'g4')]});
   state.trades=[t,t2];await persist();renderAll();openTrade('g1','manage');await new Promise(r=>setTimeout(r,800));
   const c=calcTrade(t),x=v91Pos(t),x2=v91Pos(t2),el=document.querySelector('#detailSummary .v91-pos');
   return {pnl:+c.pnl.toFixed(2),p:x?+x.p.toFixed(4):null,base:x?Math.round(x.base):null,p2:x2?+x2.p.toFixed(4):null,base2:x2?Math.round(x2.base):null,txt:el?el.textContent:''};});
  await ctx.close();}
 /* (4) 타이핑 */
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init,['0x'+'1'.repeat(40),'x']);const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
  await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(async()=>{const now=Date.now();const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
   const T=[];for(let i=0;i<120;i++){const a=now-(i+1)*5*3600e3;T.push(normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id:'k'+i,at:a,name:['ETH','BTC','SOL'][i%3],direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:95,initialRisk:50,riskR:1,setup:'눌림',leverage:5,marginMode:'isolated',process:'compliant',review:'r',violations:[],entryNote:'근거 '+i,entries:[ev('k'+i+'e',a,10,100)],fills:[ev('k'+i+'f',a+3600e3,10,101)],funding:[],images:[]}));}
   state.trades=T;await persist();setPage('dashboard');renderAll();openTrade('k0','review');});
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{window.__lat=[];addEventListener('input',e=>{const t0=e.timeStamp;requestAnimationFrame(()=>{const ch=new MessageChannel();ch.port1.onmessage=()=>window.__lat.push(performance.now()-t0);ch.port2.postMessage(0);});},true);});
  const sel='[data-v71-area="entryNote"]';await page.locator(sel).first().scrollIntoViewIfNeeded();await page.locator(sel).first().click();await page.waitForTimeout(300);
  await page.keyboard.type(' 가격 반응 확인 후 진입 ABC def',{delay:40});await page.waitForTimeout(600);
  const L=await page.evaluate(()=>window.__lat.slice());R.type={n:L.length,avg:+(L.reduce((s,x)=>s+x,0)/Math.max(1,L.length)).toFixed(1),max:+Math.max(0,...L).toFixed(1)};
  await page.locator('#detailTitle').click();await page.waitForTimeout(2500);
  R.type.saved=await page.evaluate(async()=>{const s=await v83Read();return (s.trades.find(x=>x.id==='k0').entryNote||'');});
  await ctx.close();}
 /* (5) v106 일지 빈 칸: 손익비 기준 미달만 걸린 거래는 목록에서 빠짐, 미기록은 남음, × 숨기기 */
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init,['0x'+'1'.repeat(40),'x']);const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
  await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(async()=>{const D=Date.now()-86400e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
   const mk=(id,name,x)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:D,name,direction:'long',date:new Date(D).toISOString().slice(0,10),stop:98,stop0:null,initialRisk:null,riskR:1,setup:'눌림',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
    entryNote:'근거',stopNote:'이유',react:true,tfIn:'htf',tfOut:'htf',entries:[ev(id+'e',D,10,100)],fills:[ev(id+'f',D+3600e3,10,101)],funding:[],images:[],...x});
   state.settings.v92From='2026-10-01';state.trades=[mk('gA','xyz:GOLD',{stop0:98,riskPlan:{target:103.62}}),mk('gB','xyz:XYZ100',{stop0:null,stop:null})];await persist();setPage('dashboard');renderAll();});
  await page.waitForTimeout(600);
  const G={};G.list=await page.evaluate(()=>[...document.querySelectorAll('#v92Dash li button[data-v63-open]')].map(b=>b.dataset.v63Open));
  G.rrBad=await page.evaluate(()=>{const c=v92Checks(state.trades.find(t=>t.id==='gA')).find(x=>x.k==='rr');return {ok:c.ok,bad:!!c.bad,miss:c.miss};});
  G.x=await page.evaluate(()=>document.querySelectorAll('#v92Dash .v106-x').length);
  await page.click('#v92Dash .v106-x[data-v106-hide="gB"]');await page.waitForTimeout(800);
  G.after=await page.evaluate(()=>({shown:!!document.querySelector('#v92Dash')&&!document.querySelector('#v92Dash').hidden,hide:state.trades.find(t=>t.id==='gB').v92Hide===true}));
  G.saved=await page.evaluate(async()=>{const s=await v83Read();return !!(s.trades.find(t=>t.id==='gB')||{}).v92Hide;});
  await page.evaluate(()=>openTrade('gA','review'));await page.waitForTimeout(1200);
  G.box=await page.evaluate(()=>{const li=[...document.querySelectorAll('#v92Box .v92-list li')].find(l=>/손익비/.test(l.textContent));return li?li.className+':'+li.textContent:'';});
  R.gaps=G;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
