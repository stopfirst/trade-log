/* v130 QA — 차트 중간 끊김(사용자 보고 11-14: BTC 15분봉 큰 차트 중간 구간이 통째로 빔). 모의 HL(외부 연결 없음), 봉 15분 고정(tj.v38.chartIv).
   (G) 사용자 사례: 다른 BTC 거래(4일 전) 차트를 열어 왼쪽으로 조금 이동(→ 예전엔 V44.extra {a,b} 하나) → 이번 BTC 거래(어제) 차트를 열고 두 거래 사이를 덮게 이동
       → 화면 안 빈 봉 0(예전 ?v130=0은 사이 구간 봉이 통째로 빔 = 재현), 사이 빈 구간만 받음(이미 받은 구간 다시 안 받음)
   (F) 실패: 빈 구간 요청이 HL 500 → 1번 실패는 버튼 없음·다시 그리기만으론 다시 안 받음 → 다음 이동 때 다시(재시도) → 또 실패면 머리에 '일부 구간을 불러오지 못했습니다 [다시 시도]'
       → 누르면 그 자리에서 받아 빈 봉 0, 버튼 사라짐. 390 넘침 없음·버튼 화면 안
   (V) 확대 안 한 차트: v104 '이전 봉 먼저'(코인|봉 기억 = 여러 구간 합집합)로 빈 칸 있는 봉을 먼저 그렸는데 뒤의 정확한 구간 요청이 실패 → 빈 구간을 받아 채움(예전은 빈 칸 그대로)
   (P) 그리기 합치기 메모(v44All 같은 입력 재계산 없음), v130Debug 받은 구간 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 try{localStorage.setItem('tj.v38.chartIv','15m');}catch{}
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const L=window.__log=[];window.__fail={};
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   const rec={t:performance.now(),type:b.type,coin:b.req&&b.req.coin,iv:b.req&&b.req.interval,s:b.req&&b.req.startTime,e:b.req&&b.req.endTime};L.push(rec);
   let out,ms=60;
   if(b.type==='candleSnapshot'){const f=window.__fail[b.req.coin];if(f>0){window.__fail[b.req.coin]=f-1;rec.st=500;await new Promise(r=>setTimeout(r,40));return J('{"error":"x"}',500);}
    const iv=IV[b.req.interval]||6e4,now=Date.now();out=[];
    for(let t=Math.ceil(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&t<=now&&i<5000;t+=iv,i++){const p=+(100+Math.sin(t/iv/5)*3).toFixed(2),c=+(100+Math.sin((t+iv)/iv/5)*3).toFixed(2);
     out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.5),l:String(Math.min(p,c)-0.5),v:'10',n:5});}
    rec.n=out.length;}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'100'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];
   else out={};
   await new Promise(r=>setTimeout(r,ms));return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const seed=async()=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=(id,h0,h1,nm)=>{const a=Math.floor((now-h0*H)/H)*H,b=Math.floor((now-h1*H)/H)*H;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:nm,direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:95,initialRisk:5,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],entries:[ev(id+'e0',a,1,100)],fills:[ev(id+'f0',b,1,101,id+'x')],funding:[],images:[]});};
 /* BTC: 어제(30~24시간 전) 롱 = 사용자 사례, 4일 전(100~94시간 전) 다른 BTC 거래. SOL: 실패 장면. AVAX: 확대 안 한 차트 */
 state.trades=[mk('btcA',30,24,'BTC'),mk('btcB',100,94,'BTC'),mk('solA',30,24,'SOL'),mk('solB',100,94,'SOL'),mk('avax',40,34,'AVAX')];
 Object.assign(state.settings,{account:10000});await persist();setPage('records');renderAll();
};
const idle=async page=>{for(let i=0;i<120;i++){const ok=await page.evaluate(()=>V104.q.length===0&&V104.inflight===0&&(typeof V130==='undefined'||!V130.busy.size)&&!V44.busy.size);if(ok)return true;await page.waitForTimeout(150);}return false;};
/* 페이지 안 도우미 */
const LIB=()=>{
 const sl=ms=>new Promise(r=>setTimeout(r,ms));
 window.__open=async id=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade(id,'manage');
  for(let i=0;i<200;i++){const box=document.querySelector('#v37Chart');const t=state.trades.find(x=>x.id===id),p=v37ChartPlan(t),c=p&&V37_CHART.get(p.key);
   if(box&&box.dataset.trade===id&&box.querySelector('svg.v37-svg')&&c&&c.K&&c.K.length)return {ok:true,iv:p.iv};await sl(50);}return {ok:false};};
 window.__view=async(id,t0,t1)=>{const c=v44Ctx();if(!c||c.t.id!==id)return false;v44Set(c,{t0,t1});return true;};
 /* 화면(view) 안 봉 시각 중 빠진 개수(모의 HL은 모든 봉이 있음 → 기대 0) */
 window.__missing=id=>{const t=state.trades.find(x=>x.id===id),p=v37ChartPlan(t),c=V37_CHART.get(p.key),v=V44.view.get(v44Key(t,p))||{t0:p.start,t1:p.end};
  const iv=p.ivMs,all=v44All(p,c.K),have=new Set(all.map(k=>k.t));let miss=0,tot=0,first=null,last=null;
  for(let x=Math.ceil(v.t0/iv)*iv;x<v.t1&&x<=Date.now()-iv;x+=iv){tot++;if(!have.has(x)){miss++;if(first==null)first=x;last=x;}}
  return {miss,tot,gapH:first==null?0:Math.round((last-first)/36e5)};};
 window.__drawn=()=>document.querySelectorAll('#v37Chart svg.v37-svg rect.v37-body').length;
 window.__cnt=coin=>window.__log.filter(x=>x.type==='candleSnapshot'&&x.coin===coin).length;
};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+(mode==='off'?'&v130=0':''));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(seed);await page.evaluate(LIB);await page.waitForTimeout(1500);await idle(page);
  o.dbgOn=await page.evaluate(()=>typeof v130Debug==='function'?v130Debug().on:null);
  const E=(f,a)=>page.evaluate(f,a);
  /* (G) 사용자 사례 */
  o.Gb=await E(()=>__open('btcB'));
  await E(()=>{const t=state.trades.find(x=>x.id==='btcB'),p=v37ChartPlan(t);return __view('btcB',p.start-8*p.ivMs,p.end-8*p.ivMs);});
  await page.waitForTimeout(700);await idle(page);
  o.Ga=await E(()=>__open('btcA'));
  const c0=await E(()=>__cnt('BTC'));
  o.Gsets=await E(()=>{const A=state.trades.find(x=>x.id==='btcA'),B=state.trades.find(x=>x.id==='btcB'),pa=v37ChartPlan(A),pb=v37ChartPlan(B);
   window.__G={t0:pb.start+4*pa.ivMs,t1:pa.end};return __view('btcA',window.__G.t0,window.__G.t1);});
  await page.waitForTimeout(800);await idle(page);await page.waitForTimeout(300);
  o.G=await E(()=>__missing('btcA'));o.G.drawn=await E(()=>__drawn());
  o.G.req=await E(c0=>__cnt('BTC')-c0,c0);if(process.env.T130_DBG)o.G.L=await E(c0=>window.__log.filter(x=>x.type==='candleSnapshot'&&x.coin==='BTC').map(x=>[Math.round(x.s/9e5)%100000,Math.round((x.e-x.s)/9e5),x.n]),c0);
  o.G.reqBars=await E(c0=>window.__log.filter(x=>x.type==='candleSnapshot'&&x.coin==='BTC').slice(c0).reduce((s,x)=>s+(x.n||0),0),c0);
  await page.screenshot({path:path.join(outDir,key+'-gap.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  if(mode==='on'){
   o.Gdbg=await E(()=>{const d=v130Debug('BTC');const k=d.keys['BTC|15m'];return {segs:k?k['받은 구간'].length:-1,fails:k?k['실패'].length:-1,ok:d.st.ok,fail:d.st.fail};});
   /* (F) 실패 → 다음 이동 때 재시도 → 계속 실패면 [다시 시도] */
   o.Fs=await E(()=>__open('solB'));o.Fa=await E(()=>__open('solA'));
   await E(()=>{window.__fail.SOL=50;const A=state.trades.find(x=>x.id==='solA'),B=state.trades.find(x=>x.id==='solB'),pa=v37ChartPlan(A),pb=v37ChartPlan(B);window.__F={t0:pb.start+4*pa.ivMs,t1:pa.end};window.__fc0=__cnt('SOL');return __view('solA',window.__F.t0,window.__F.t1);});
   await page.waitForTimeout(800);await idle(page);
   o.F1=await E(()=>({req:__cnt('SOL')-window.__fc0,btn:!!document.querySelector('#v37Chart .v130-gap'),miss:__missing('solA').miss>0}));
   /* 다시 그리기(이동 아님): 다시 안 받음 */
   await E(()=>{window.__fc1=__cnt('SOL');const t=state.trades.find(x=>x.id==='solA');v37ChartMount(t);});await page.waitForTimeout(700);await idle(page);
   o.Fmount=await E(()=>({req:__cnt('SOL')-window.__fc1,skipFail:V130.st.skipFail>0}));
   /* 다음 이동: 재시도, 또 실패 */
   await E(()=>{window.__fc2=__cnt('SOL');return __view('solA',window.__F.t0+60e3,window.__F.t1+60e3);});
   await page.waitForTimeout(800);await idle(page);await page.waitForTimeout(400);
   o.F2=await E(()=>{const b=document.querySelector('#v37Chart .v130-gap .v128-retry');let box=null;if(b){const r=b.getBoundingClientRect();box={txt:b.textContent,inView:r.left>=0&&r.right<=innerWidth+0.5,h:Math.round(r.height)};}
    return {req:__cnt('SOL')-window.__fc2,retry:V130.st.retry,btn:box,note:(document.querySelector('#v37Chart .v130-gap')||{}).textContent||''};});
   o.docScrollF=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   await page.screenshot({path:path.join(outDir,key+'-fail.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   /* [다시 시도] */
   o.Ftap=await E(async()=>{window.__fail.SOL=0;const b=document.querySelector('#v37Chart .v130-gap .v128-retry');if(!b)return {btn:false};const c=__cnt('SOL');b.click();
    for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));if(!V130.busy.size&&__missing('solA').miss===0)break;}
    await new Promise(r=>setTimeout(r,400));
    return {btn:true,req:__cnt('SOL')-c,miss:__missing('solA').miss,gone:!document.querySelector('#v37Chart .v130-gap'),tap:V130.st.tap};});
   /* (P) 메모 */
   o.P=await E(()=>{const t=state.trades.find(x=>x.id==='btcA'),p=v37ChartPlan(t),c=V37_CHART.get(p.key);const a=v44All(p,c.K),b=v44All(p,c.K);return {same:a===b,hit:V130.st.memoHit>0};});
  }
  /* (V) 확대 안 한 차트 · 이전 봉(빈 칸) + 정확한 구간 실패 */
  o.V=await E(async()=>{const t=state.trades.find(x=>x.id==='avax'),p=v37ChartPlan(t),iv=p.ivMs;
   const K=[];for(let x=p.start;x<=p.end;x+=iv){if(x>p.start+8*iv&&x<p.start+20*iv)continue;const v=100+Math.sin(x/iv/5)*3;K.push({t:x,o:v,h:v+0.5,l:v-0.5,c:v,v:1});}
   V104.lastK.set('AVAX|'+p.iv,{K,at:Date.now()});window.__fail.AVAX=1;
   const r=await __open('avax');for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(__missing('avax').miss===0)break;}
   await new Promise(r=>setTimeout(r,500));
   const m=__missing('avax');return {open:r.ok,miss:m.miss,tot:m.tot,view:!!V44.view.get(v44Key(t,p)),drawn:__drawn()};});
  o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  await page.screenshot({path:path.join(outDir,key+'.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  R[key]=o;await ctx.close();};
 await Promise.all([[1440,'on'],[390,'on'],[1440,'off']].map(one));
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
