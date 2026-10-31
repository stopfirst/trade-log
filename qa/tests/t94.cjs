/* v94 첫 로딩 속도 QA — CSP 그대로 적용(bypassCSP 없음)한 실제 로딩.
   v94: 처음 그릴 때(journalReady 전) 분석 화면 묶음·새 기록 미리보기·캘린더 기준 달을 첫 화면 뒤(한가할 때)로 미룸.
   장면: (A) 거래 300건 저장 후 새로고침 → 준비 시점에 미룬 일 있음·대시보드 그려짐 → 한가할 때 처리(idle) → 캘린더 기준 달 = 마지막 거래 달,
             주간 리뷰·분석 카드 생김, 미룬 결과 = 일반 renderAll 결과(분석 화면 HTML 동일)
         (B) 준비 직후 바로 분석 / 복기 / 캘린더 화면 이동, 새 기록 열기 → 그 자리에서 먼저 처리(결과 정상)
         (C) 390·1440 대시보드 넘침 없음 (D) 미국 주식 일지도 정상, CSP 위반·페이지 오류 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'Content-Type':u.endsWith('.js')?'text/javascript; charset=utf-8':u.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream'});return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);if(b.type==='candleSnapshot')return J([]);return J([]);}return J({message:'not found'},404);};
 window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'')));
 let rv;Object.defineProperty(window,'journalReady',{configurable:true,get(){return rv;},set(v){rv=v;if(v&&!window.__readyAt){window.__readyAt=performance.now();
  try{window.__atReady={pend:Object.keys((window.V94&&V94.pend)||{}).sort(),deferred:window.V94?V94.stat.deferred:-1,cal:typeof calendarMonth!=='undefined'?calendarMonth:null,
   dash:(()=>{const p=document.getElementById('page-dashboard');return !!p&&!p.hidden&&p.innerText.length>200;})(),v63:!!document.getElementById('v63Week')};}catch(e){window.__atReady={err:e.message};}
  const A={analysis:()=>{setPage('analysis');return {pend:!!V94.pend,flushed:V94.stat.flushed,v63:!!document.querySelector('#page-analysis #v63Week'),v71:!!document.getElementById('v71Stats'),page:currentPage};},
   weekly:()=>{setPage('weekly');return {pend:!!V94.pend,flushed:V94.stat.flushed,v63:!!document.querySelector('#page-weekly #v63Week'),page:currentPage};},
   calendar:()=>{setPage('calendar');return {pend:!!V94.pend,flushed:V94.stat.flushed,cal:calendarMonth,page:currentPage};},
   newTrade:()=>{openNew({direct:true});return {pend:!!V94.pend,flushed:V94.stat.flushed,open:!!document.getElementById('newDialog').open,qty:document.getElementById('sizeQty').textContent.length>0};}};
  const act=sessionStorage.getItem('qa94act');if(act){sessionStorage.removeItem('qa94act');try{window.__act=A[act]();}catch(e){window.__act={err:e.message};}}}}});};
const seed=async()=>{const D=Date.parse('2026-09-10T00:00:00Z');
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.12,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 state.trades=Array.from({length:300},(_,i)=>{const t0=D+(i%20)*86400e3+i*60e3;return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:'q'+i,at:t0,name:HL?['ETH','BTC','SOL','xyz:INTC'][i%4]:['AAPL','MSFT','NVDA'][i%3],direction:HL&&i%3===0?'short':'long',date:new Date(t0).toISOString().slice(0,10),stop:i%3===0?110:90,stop0:i%3===0?110:90,initialRisk:100,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'메모 '+i,violations:[],entries:[ev('q'+i+'e0',t0,10,100),ev('q'+i+'e1',t0+600e3,5,101)],fills:[ev('q'+i+'f0',t0+3600e3,15,100+(i%7)-3,HL?'f'+i:null)],funding:[],images:[]});});
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10});await persist();return state.trades.length;};
const chk=()=>{const W=document.documentElement.clientWidth,bad=[];for(const el of document.querySelectorAll('#page-dashboard .card, .page-head .header-right > *')){const r=el.getBoundingClientRect();if(!r.width||el.hidden)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((el.id||el.className)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
const ANA=()=>{const p=document.getElementById('page-analysis'),w=document.getElementById('page-weekly');const strip=s=>s.replace(/\d{1,2}:\d{2}(:\d{2})?/g,'');return {ana:strip(p?p.innerHTML:''),wk:strip(w?w.innerHTML:''),size:['sizeQty','sizeRisk','sizeStopPct','footerRisk'].map(i=>document.getElementById(i)?.textContent).join('|')};};
const waitFlush=async(page,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await page.evaluate(()=>!!window.V94&&!V94.pend))return Date.now()-t0;await page.waitForTimeout(50);}return -1;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const R={tag,errors:[],console:[]};const base='http://127.0.0.1:'+srv.address().port+'/';
 for(const [key,q,W] of [['hl','?journal=hyperliquid',1440],['hl390','?journal=hyperliquid',390],['us','?journal=us',1440]]){
  const ctx=await browser.newContext({viewport:{width:W,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));page.on('console',m=>{const t=m.text();if(/Content Security Policy|Refused to/i.test(t))R.console.push(key+': '+t.slice(0,160));});
  const U=base+q;const ready=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});};
  await page.goto(U);await ready();const n=await page.evaluate(seed);
  await page.goto(U);await ready();
  const o={n,at:await page.evaluate(()=>window.__atReady),readyMs:await page.evaluate(()=>Math.round(window.__readyAt)),ric:await page.evaluate(()=>typeof requestIdleCallback)};
  o.flushWait=await waitFlush(page);
  o.after=await page.evaluate(()=>({flushed:V94.stat.flushed,cal:calendarMonth,latest:latestCalendarMonth(),v63:!!document.getElementById('v63Week'),v71:!!document.getElementById('v71Stats'),v91:!!document.querySelector('#page-analysis .v91-det, #page-analysis [id^="v91"]'),dash:document.getElementById('page-dashboard').innerText.length>200,page:currentPage}));
  await page.waitForTimeout(1500);const s1=await page.evaluate(ANA);
  await page.evaluate(()=>renderAll());await page.waitForTimeout(1500);const s2=await page.evaluate(ANA);
  o.same={ana:s1.ana===s2.ana,wk:s1.wk===s2.wk,size:s1.size===s2.size,anaLen:s1.ana.length};if(!o.same.ana){let i=0;while(i<s1.ana.length&&s1.ana[i]===s2.ana[i])i++;o.same.diff=[s1.ana.slice(Math.max(0,i-60),i+80),s2.ana.slice(Math.max(0,i-60),i+80)];}
  o.layout=await page.evaluate(chk);
  await page.screenshot({path:path.join(outDir,key+'-dash.png')}).catch(e=>o.shotErr=e.message);
  if(key!=='hl390'){
   o.imm={};
   for(const nm of ['analysis','weekly','calendar','newTrade']){
    await page.evaluate(a=>sessionStorage.setItem('qa94act',a),nm);await page.goto(U);await ready();await page.waitForTimeout(300);
    o.imm[nm]={at:await page.evaluate(()=>window.__atReady.pend),act:await page.evaluate(()=>window.__act)};}
  }
  o.csp=await page.evaluate(()=>window.__csp);
  R[key]=o;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
