/* v128 QA — 사용자가 연 차트의 봉 요청: 바쁜 v104 대기열에서도 먼저, 시간 제한은 네트워크부터, 1회 재시도, [다시 시도]. 모의 HL(외부 연결 없음).
   모의 지연: 사용자 차트 봉(xyz:GOLD) 170ms · 배경 시세 봉(BG, v67식 pri 2) 800ms · MFE 봉(pri 0) 800ms · userFillsByTime 2000건 1200ms.
   시간을 줄이려고 켬 모드는 V128.NET=1500ms(실제 15초)로 바꿔 검사.
   (Q) 배경 봉 12·체결 3·MFE 4를 쏜 직후 상세 열기 → 차트가 배경 봉보다 먼저 나감(앞선 BG ≤ 4 = 이미 진행 중이던 것만), 빨리 그림, 대기열의 배경 우선순위(2·0) 그대로
       + 확대·스크롤 모자란 구간(v44Fetch처럼 다른 구간) 요청도 사용자 요청으로 빨리
   (W) 분당 예산 1100 사용 중(3초 뒤부터 빠짐) → 차트는 3초 기다린 뒤 성공(대기 > 시간 제한 1.5초인데 시간 초과 없음, 재시도 0)
   (R) 첫 요청 응답 없음 → 1.5초 뒤 자동 재시도 1회 → 그림(요청 2)
   (F) 두 번 다 응답 없음 → '차트를 불러오지 못했습니다' + [다시 시도] → 누르면 그 자리에서 그림, 모바일 390 넘침 없음
   (T) 429 한 번 → v104 처리(짧은 쿨다운 뒤 v104가 다시)로 그림, v128 재시도 안 씀
   (I) 새로고침 뒤 같은 끝난 거래 → 봉 요청 0(v104 IndexedDB)
   (O) ?v128=0(1440): 바쁜 대기열에서 배경 봉 뒤에 섬(예전), 예산 대기 16초 → 'signal timed out'(예전 문구 그대로), [다시 시도] 없음, v128Debug off */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200,h)=>new Response(t,{status:s,headers:{'Content-Type':'application/json',...(h||{})}});
 const L=window.__log=[];window.__hang=0;window.__r429=0;
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   const rec={t:performance.now(),type:b.type,coin:b.req&&b.req.coin,iv:b.req&&b.req.interval};L.push(rec);
   const sig=o.signal;if(sig&&sig.aborted){rec.pre='aborted';throw (sig.reason||new DOMException('aborted','AbortError'));}
   let out,ms=300,gold=b.type==='candleSnapshot'&&/GOLD/.test(b.req.coin),gold4h=gold&&b.req.interval==='4h';
   if(gold4h&&window.__r429>0){window.__r429--;rec.st=429;await new Promise(r=>setTimeout(r,100));return J('{"error":"rate"}',429,{'retry-after':'1'});}
   if(gold4h&&window.__hang>0){window.__hang--;rec.hang=1;return new Promise((_,rej)=>{if(sig)sig.addEventListener('abort',()=>rej(sig.reason||new DOMException('aborted','AbortError')),{once:true});});}
   if(b.type==='candleSnapshot'){const iv=IV[b.req.interval]||6e4;out=[];let p=2300.5;
    for(let t=Math.ceil(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<5000;t+=iv,i++){const c=+(2300.5+Math.sin(t/iv/3)*3.1).toFixed(1);out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:p.toFixed(1),c:c.toFixed(1),h:(Math.max(p,c)+1.3).toFixed(1),l:(Math.min(p,c)-1.2).toFixed(1),v:'100',n:200});p=c;}
    ms=gold?170:800;}
   else if(b.type==='userFillsByTime'){out=Array.from({length:2000},(_,i)=>({coin:'@1',px:'1',sz:'1',side:'B',time:1e12+i,tid:i,oid:i,dir:'Buy',closedPnl:'0',fee:'0',hash:'0x',crossed:true,startPosition:'0',feeToken:'USDC'}));ms=1200;}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'2300'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];
   else out={};
   await new Promise((res,rej)=>{const t=setTimeout(res,ms);if(sig)sig.addEventListener('abort',()=>{clearTimeout(t);rej(sig.reason||new DOMException('aborted','AbortError'));},{once:true});});
   rec.done=performance.now();return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const seed=async()=>{
 const now=Date.now();
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=(id,d0,d1,nm)=>{const a=Math.floor((now-d0*864e5)/36e5)*36e5,b=Math.floor((now-d1*864e5)/36e5)*36e5;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:nm||'xyz:GOLD',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:2290,stop0:2285,initialRisk:20,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],entries:[ev(id+'e0',a,1,2300)],fills:[ev(id+'f0',b,1,2310,id+'x')],funding:[],images:[]});};
 /* 10일 보유 → 자동 4시간봉(사용자 사례). 장면마다 종목을 달리해 v104 '이전 봉 먼저'(코인|봉) 캐시가 겹치지 않게 */
 state.trades=[mk('gold',20,10),mk('gold2',21,11,'xyz:GOLDB'),mk('gold3',22,12,'xyz:GOLDC'),mk('gold4',23,13,'xyz:GOLDD'),mk('gold5',24,14,'xyz:GOLDE'),mk('gold6',25,15,'xyz:GOLDF')];
 Object.assign(state.settings,{account:10000});await persist();setPage('records');renderAll();
};
const idle=async page=>{for(let i=0;i<120;i++){const ok=await page.evaluate(()=>V104.q.length===0&&V104.inflight===0);if(ok)return true;await page.waitForTimeout(250);}return false;};
/* 상세 열고 차트(봉) 또는 실패 문구까지 */
const OPEN=async(id,opt)=>{opt=opt||{};
 const sl=ms=>new Promise(r=>setTimeout(r,ms));const now=Date.now();
 if(opt.book){const [total,startExp]=opt.book,n=15,w=total/n,bk=[];for(let i=0;i<n;i++)bk.push([now-60e3+startExp+i*1000,w]);localStorage.setItem('tj:v104:w',JSON.stringify(bk));}
 else localStorage.setItem('tj:v104:w','[]');
 window.__log.length=0;
 const H='https://api.hyperliquid.xyz/info',P=b=>fetch(H,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).catch(()=>{});
 if(opt.busy){for(let i=0;i<3;i++)P({type:'userFillsByTime',user:'0xabc',startTime:1e12+i+Math.random(),aggregateByTime:false});
  for(let i=0;i<12;i++)P({type:'candleSnapshot',req:{coin:'BG',interval:'1m',startTime:now-3600e3-i*6e4,endTime:now-i*6e4}});
  for(let i=0;i<4;i++){V104.low++;try{P({type:'candleSnapshot',req:{coin:'MFE',interval:'15m',startTime:now-9*864e5-i*9e5,endTime:now-8*864e5}});}finally{V104.low--;}}
  await sl(50);}
 if($('tradeDialog').open)$('tradeDialog').close();
 const T0=performance.now();openTrade(id,'manage');
 await sl(10);const qPri=V104.q.map(x=>x.pri);
 let extra=null;
 if(opt.extra){const t=state.trades.find(x=>x.id===id),p=v37ChartPlan(t);const t1=performance.now();
  extra=await v37FetchCandles({...p,start:p.start-30*p.ivMs,end:p.start}).then(K=>({ok:true,n:K.length,ms:Math.round(performance.now()-t1)}),e=>({ok:false,e:String(e&&e.message||e)}));}
 let out=null;
 for(let i=0;i<700;i++){const box=document.querySelector('#v37Chart');const t=state.trades.find(x=>x.id===id);const p=v37ChartPlan(t);const c=p&&V37_CHART.get(p.key);
  if(box&&box.dataset.trade===id&&box.querySelector('svg.v37-svg')&&c&&c.K&&c.K.length){out={ok:true,ms:Math.round(performance.now()-T0)};break;}
  const m=box&&box.querySelector('.v37-chart-msg');if(m&&/불러오지 못했/.test(m.textContent)){out={ok:false,ms:Math.round(performance.now()-T0),msg:m.textContent.trim().slice(0,80),btn:!!m.querySelector('.v128-retry')};break;}
  await sl(50);}
 if(!out)out={ok:false,ms:-1,msg:'35초 안에 결과 없음'};
 const G=window.__log.filter(x=>x.type==='candleSnapshot'&&/GOLD/.test(x.coin||'')&&x.iv==='4h'); /* 사용자 차트(4시간봉)만 — 앱 자체 MFE(15분봉)는 뺌 */
 out.req=G.filter(x=>!x.pre).length;if(opt.dbg)out.L=G.map(x=>[Math.round(x.t-T0),x.coin,x.iv,x.pre||"",x.hang||0,x.done?Math.round(x.done-T0):null]);out.netStart=G.length?Math.round(G[0].t-T0):null;
 out.bgBefore=G.length?window.__log.filter(x=>x.coin==='BG'&&x.t<G[0].t).length:null;
 out.qPri=qPri;out.extra=extra;
 return out;};
const RUN=(page,id,opt)=>page.evaluate(`(${OPEN})(${JSON.stringify(id)},${JSON.stringify(opt)})`);
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const ONLY=(process.env.T128_ONLY||'').split(',').filter(Boolean);
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};if(ONLY.length&&!ONLY.includes(key))return;
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const ready=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});};
  await page.goto(base+(mode==='off'?'&v128=0':''));await ready();await page.evaluate(seed);await page.waitForTimeout(2500);await idle(page);
  o.dbgOn=await page.evaluate(()=>typeof v128Debug==='function'?v128Debug().on:null);
  if(mode==='on'){
   await page.evaluate(()=>{V128.NET=1500;});
   o.Q=await RUN(page,'gold',{busy:true,extra:true});await idle(page);
   o.W=await RUN(page,'gold2',{book:[1100,3000]});
   o.Wdbg=await page.evaluate(()=>{const r=v128Debug().recent.at(-1);return {retry:!!r.retry,wait:r.tries[0]['대기ms'],tries:r.tries.length,netTo:V128.st.netTo};});
   await page.evaluate(()=>localStorage.setItem('tj:v104:w','[]'));await idle(page);
   await page.evaluate(()=>{window.__hang=1;});
   o.R=await RUN(page,'gold3',{dbg:true});
   o.Rdbg=await page.evaluate(()=>{const r=v128Debug().recent.at(-1);return {retry:!!r.retry,tries:r.tries.length,res:r.tries.map(x=>x['결과'])};});
   await page.evaluate(()=>{window.__hang=2;});
   o.F=await RUN(page,'gold4',{});
   o.Fbox=await page.evaluate(()=>{const b=document.querySelector('.v128-retry');if(!b)return null;const r=b.getBoundingClientRect(),m=b.closest('.v37-chart-msg').getBoundingClientRect();
    return {txt:b.textContent,inView:r.left>=0&&r.right<=innerWidth+0.5,inMsg:r.right<=m.right+0.5||r.top>=m.top,h:Math.round(r.height)};});
   await page.screenshot({path:path.join(outDir,key+'-fail.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   o.Ftap=await page.evaluate(async()=>{const b=document.querySelector('.v128-retry');if(!b)return {btn:false};window.__log.length=0;const T0=performance.now();b.click();
    for(let i=0;i<200;i++){const box=document.querySelector('#v37Chart');const t=state.trades.find(x=>x.id==='gold4');const p=v37ChartPlan(t);const c=V37_CHART.get(p.key);
     if(box&&box.querySelector('svg.v37-svg')&&c&&c.K&&c.K.length)return {btn:true,ok:true,ms:Math.round(performance.now()-T0),req:window.__log.filter(x=>x.type==='candleSnapshot'&&x.iv==='4h').length,tap:V128.st.tap,open:$('tradeDialog').open};
     await new Promise(r=>setTimeout(r,50));}
    return {btn:true,ok:false};});
   await page.evaluate(()=>{window.__r429=1;});
   o.T=await RUN(page,'gold5',{});
   o.Tdbg=await page.evaluate(()=>({retry:V128.st.retry,r429:V104.st.r429}));
   o.st=await page.evaluate(()=>{const s=v128Debug().st;return {retry:s.retry,retryOk:s.retryOk,netTo:s.netTo,allTo:s.allTo,tap:s.tap};});
   o.docScroll=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   await page.screenshot({path:path.join(outDir,key+'.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   /* (I) 새로고침 뒤 끝난 거래 */
   await page.evaluate(()=>{if($('tradeDialog').open)$('tradeDialog').close();});await page.reload();await ready();await page.waitForTimeout(2500);await idle(page);
   o.I=await RUN(page,'gold',{});
  }else{
   o.Q=await RUN(page,'gold',{busy:true});await idle(page);
   o.B=await RUN(page,'gold2',{book:[900,16000]});
   o.docScroll=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }
  R[key]=o;await ctx.close();};
 /* 세 장면 묶음을 동시에(검사 시간 줄이기) */
 await Promise.all([[1440,'on'],[390,'on'],[1440,'off']].map(one));
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
