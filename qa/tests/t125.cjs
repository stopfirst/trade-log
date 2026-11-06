/* v125 차트 불러오기 속도 QA — 모의 HL(봉 응답 400ms 지연, 응답 크기 실측과 비슷), 외부 연결 없음.
   장면(1440·390, v125 켬 / ?v125=0 비교):
   (1) 끝난 거래 첫 열기: 차트 봉 요청이 openTrade 안에서(동기 작업 중) 이미 나감(예전 = 끝난 뒤), 요청 1건, 차트 그림
   (2) 닫고 다시 열기: 봉 요청 0, 첫 열기보다 빠름  (3) 새로고침 뒤 같은 거래: 봉 요청 0(IndexedDB), 차트 그림
   (4) 차트 내용 동일: 같은 거래·같은 폭의 SVG가 ?v125=0과 글자 하나까지 같음(봉 개수·viewBox 포함)
   (5) 대화상자 닫힌 채 renderDetail: 1초 동안 차트 다시 그리기 0번(예전 = 매 프레임)
   (6) PC 마우스: 목록 줄 pointerdown에서 봉 요청 시작 → 클릭으로 열면 합류(요청 1건). 터치(390)는 미리 받지 않음
   (7) v125Debug(): 켬·출처·요청 시작 ms, ?v125=0이면 꺼짐 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const L=window.__log=[];window.__inOpen=false;
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   const rec={t:performance.now(),type:b.type,coin:b.req&&b.req.coin,iv:b.req&&b.req.interval,inOpen:window.__inOpen};L.push(rec);
   let out;
   if(b.type==='candleSnapshot'){const iv=IV[b.req.interval]||6e4;out=[];let p=2300.5;
    for(let t=Math.ceil(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<5000;t+=iv,i++){const c=+(2300.5+Math.sin(t/iv/3)*3.1+Math.cos(t/iv/17)*6).toFixed(1);
     out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:p.toFixed(1),c:c.toFixed(1),h:(Math.max(p,c)+1.3).toFixed(1),l:(Math.min(p,c)-1.2).toFixed(1),v:(100+Math.abs(Math.sin(t/iv))*300).toFixed(4),n:200});p=c;}
    await new Promise(r=>setTimeout(r,400));}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'2300'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];
   else out={};
   return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const seed=async()=>{
 const now=Date.now();
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=o=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:o.id,at:o.e[0][0],name:o.name,direction:'long',date:new Date(o.e[0][0]).toISOString().slice(0,10),stop:o.stop??null,stop0:o.stop0??null,initialRisk:o.R??null,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],entries:o.e.map((x,i)=>ev(o.id+'e'+i,...x)),fills:(o.f||[]).map((x,i)=>ev(o.id+'f'+i,...x)),funding:[],images:[]});
 const a=Math.floor((now-3*864e5)/6e4)*6e4,b=Math.floor((now-2*864e5)/6e4)*6e4,c=Math.floor((now-5*864e5)/6e4)*6e4;
 const T=[mk({id:'old',name:'ETH',e:[[a,1,2300],[a+15*60e3,1,2301],[a+40*60e3,0.5,2303]],f:[[a+70*60e3,1,2310,'of1'],[a+110*60e3,1.5,2312,'of2']],stop:2290,stop0:2285,R:20}),
  mk({id:'two',name:'ETH',e:[[b,1,2300]],f:[[b+50*60e3,1,2306,'tf1']],stop:2290,stop0:2290,R:10}),
  mk({id:'three',name:'ETH',e:[[c,1,2300]],f:[[c+80*60e3,1,2296,'hf1']],stop:2290,stop0:2290,R:10}),
  mk({id:'open',name:'ETH',e:[[now-3*3600e3,1,2300]],stop:2200,stop0:2200,R:100})];
 state.trades=T;Object.assign(state.settings,{account:10000});await persist();setPage('records');renderAll();
};
const hook=()=>{const b=openTrade;openTrade=function(...a){window.__inOpen=true;try{return b.apply(this,a);}finally{window.__inOpen=false;}};};
const svgOf=()=>{const s=document.querySelector('#v37Chart svg.v37-svg');return s?s.outerHTML:'';};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){for(const mode of ['on','off']){
  const key=(mode==='on'?'w':'off')+W,o={};
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const URL0=base+(mode==='off'?'&v125=0':'');
  const ready=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(hook);};
  await page.goto(URL0);await ready();await page.evaluate(seed);await page.waitForTimeout(2500);
  /* 봉이 그려질 때까지(차트 SVG + 그 거래 plan 봉이 메모리에) */
  const openWait=async id=>{await page.evaluate(()=>{window.__log.length=0;});const t0=Date.now();
   await page.evaluate(id=>{if($('tradeDialog').open)$('tradeDialog').close();window.__T0=performance.now();openTrade(id,'manage');},id);
   let ms=-1;for(let i=0;i<400;i++){const r=await page.evaluate(id=>{const b=document.querySelector('#v37Chart');const t=state.trades.find(x=>x.id===id);const p=t&&v37ChartPlan(t);const c=p&&V37_CHART.get(p.key);
     return !!(b&&b.dataset.trade===id&&!b.hidden&&b.querySelector('svg.v37-svg')&&c&&c.K&&c.K.length)?Math.round(performance.now()-window.__T0):-1;},id);if(r>=0){ms=r;break;}await page.waitForTimeout(20);}
   await page.waitForTimeout(500);
   const L=await page.evaluate(()=>window.__log.filter(x=>x.type==='candleSnapshot').map(x=>({inOpen:x.inOpen,iv:x.iv})));
   return {ms,req:L.length,inOpen:L.length?L[0].inOpen:null,wall:Date.now()-t0};};
  o.first=await openWait('old');
  o.again=await openWait('old');
  o.svg=await page.evaluate(svgOf);o.svgLen=o.svg.length;o.bars=(o.svg.match(/class="v37-body/g)||[]).length;
  o.vb=await page.evaluate(()=>{const s=document.querySelector('#v37Chart svg.v37-svg');const b=document.querySelector('#v37Chart');return {vb:s&&s.getAttribute('viewBox'),boxW:b&&b.clientWidth};});
  /* (5) 닫힌 대화상자 + renderDetail → 차트 다시 그리기 횟수(1초) */
  o.closedLoop=await page.evaluate(async()=>{$('tradeDialog').close();await new Promise(r=>setTimeout(r,100));const box=document.querySelector('#v37Chart');let n=0;
   const mo=new MutationObserver(l=>{n+=l.length;});mo.observe(box,{childList:true,subtree:true});renderDetail();await new Promise(r=>setTimeout(r,1000));mo.disconnect();return n;});
  /* 닫힌 뒤 다시 열면 정상 */
  o.afterLoop=await openWait('two');
  /* (6) 목록 줄 누르기 → 미리 받기 → 클릭 합류 */
  o.press=await page.evaluate(async()=>{if($('tradeDialog').open)$('tradeDialog').close();window.__log.length=0;setPage('records');renderAll();await new Promise(r=>setTimeout(r,200));
   const el=[...document.querySelectorAll('[data-open="three"]')].find(e=>e.offsetParent!==null);if(!el)return {el:false};
   const isMouse=!matchMedia('(pointer: coarse)').matches;
   el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:isMouse?'mouse':'touch',button:0,isPrimary:true}));
   const atDown=window.__log.filter(x=>x.type==='candleSnapshot').length;await new Promise(r=>setTimeout(r,120));
   el.click();
   for(let i=0;i<200;i++){const b=document.querySelector('#v37Chart');const t=state.trades.find(x=>x.id==='three');const p=t&&v37ChartPlan(t);const c=p&&V37_CHART.get(p.key);if(b&&b.dataset.trade==='three'&&b.querySelector('svg.v37-svg')&&c&&c.K)break;await new Promise(r=>setTimeout(r,25));}
   await new Promise(r=>setTimeout(r,500));
   return {el:true,mouse:isMouse,atDown,total:window.__log.filter(x=>x.type==='candleSnapshot').length,open:$('tradeDialog').open,trade:document.querySelector('#v37Chart')?.dataset.trade||null};});
  o.dbg=await page.evaluate(()=>typeof window.v125Debug==='function'?window.v125Debug():null);
  if(o.dbg){o.dbgOn=o.dbg.on;o.dbgPress=o.dbg.st.press;o.dbgJoin=o.dbg.st.join;o.dbgSrc=o.dbg.opens.map(x=>x['출처']);o.dbgReq=o.dbg.opens.map(x=>x['요청 시작 ms']);o.dbgKeys=o.dbg.idbKeys;}
  delete o.dbg;
  /* (3) 새로고침 뒤 */
  await page.evaluate(()=>{if($('tradeDialog').open)$('tradeDialog').close();});await page.reload();await ready();await page.waitForTimeout(2500);
  o.reload=await openWait('old');
  o.svgReload=(await page.evaluate(svgOf))===o.svg;
  o.docScroll=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  await page.screenshot({path:path.join(outDir,key+'.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  R[key]=o;await ctx.close();}
  R['same'+W]=R['w'+W].svg===R['off'+W].svg&&R['w'+W].svgLen>1000;
  R['w'+W].svg=undefined;R['off'+W].svg=undefined;}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
