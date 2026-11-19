/* v133 QA — 차트 겹층(가로선·그림·축 라벨·체결 마커)과 봉·평균 진입/스탑 점선이 같은 세로 범위, 세로 확대 유지, 예산 소진 때 사용자 차트 즉시 + '불러오는 중'. 모의 HL(외부 연결 없음).
   (S) 15분봉 끝난 거래(xyz:GOLD) + 가로선 메모. 가격축 위로 끌기(세로 확대)·차트 위아래 끌기(세로 이동)·가격축 휠(세로 배율)·차트 휠(가로) 각 프레임 뒤:
       line.v37-line.entry y == data-v40g 기준 평균 진입 Y, 첫 봉 꼬리 y == data-v40g 기준 고가 Y, 가로선 y == 봉 좌표계(평균 진입·스탑 점선으로 잡은 축) 가격 위치.
       끌기 뒤 세로 확대 비율 유지 + 같은 화면 다시 그리기(v37ChartMount) 뒤에도 같은 범위.
   (B) 같은 코인 다른 거래를 먼저 열어 '이전 봉'이 있는 상태 + 분당 장부 1050 사용 중 → 차트 봉 요청이 바로 나감(대기 < 0.6초), 일부 봉 표시 중 머리에 '불러오는 중', 다 받으면 사라짐.
   (O) ?v133=0(1440): 예전 동작 재현 — 세로 확대가 다시 그린 뒤 취소되거나 프레임 어긋남, 예산 대기로 요청이 3초 넘게 늦음, '불러오는 중' 없음. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{try{localStorage.setItem('tj.v38.chartIv','15m');}catch{}
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const L=window.__log=[];window.__slow=0;
 const IV={'1m':6e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   const rec={t:performance.now(),type:b.type,coin:b.req&&b.req.coin,iv:b.req&&b.req.interval,s:b.req&&b.req.startTime};L.push(rec);
   let out,ms=60;
   if(b.type==='candleSnapshot'){const iv=IV[b.req.interval]||6e4;out=[];
    for(let t=Math.ceil(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<5000;t+=iv,i++){const k=t/iv,o2=2300+Math.sin(k/7)*6,c=2300+Math.sin((k+1)/7)*6;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:o2.toFixed(2),c:c.toFixed(2),h:(Math.max(o2,c)+0.9+((k*13)%5)*0.3).toFixed(2),l:(Math.min(o2,c)-0.9-((k*7)%5)*0.3).toFixed(2),v:'100',n:10});}
    ms=window.__slow&&/GOLD/.test(b.req.coin)?window.__slow:60;}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'2300'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders|clearinghouse|Abstraction|Role/.test(b.type||''))out=[];
   else out={};
   await new Promise(r=>setTimeout(r,ms));rec.done=performance.now();return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const seed=async()=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=(id,a,b,nm,ex)=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:nm,direction:'long',date:new Date(a).toISOString().slice(0,10),stop:2293,stop0:2293,initialRisk:20,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],entries:[ev(id+'e0',a,1,2301)],fills:[ev(id+'f0',b,1,2304,id+'x')],funding:[],images:[],...(ex||{})});
 const a=Math.floor((now-72*H)/H)*H,b=Math.floor((now-30*H)/H)*H;
 state.trades=[mk('tgt',a,b,'xyz:GOLD',{chartNotes:[{id:'h1',kind:'hline',ts:null,px:2304.5,text:'',at:1}]}),
  mk('oth',a+30*H,b+4*H,'xyz:GOLD'),mk('tg2',a,b,'xyz:SILV'),mk('ot2',a+30*H,b+4*H,'xyz:SILV')];
 Object.assign(state.settings,{account:10000});await persist();setPage('records');renderAll();
};
/* 한 프레임 판정: 겹층 좌표(data-v40g) vs 본체(점선·봉) */
const PROBE=()=>{const svg=document.querySelector('#v37Chart svg.v37-svg');if(!svg)return null;const a=String(svg.getAttribute('data-v40g')||'').split(',').map(Number);if(a.length!==10)return null;
 const [W,Hh,L,T,pw,ph,t0,t1,lo,hi]=a,Y=v=>T+(hi-v)/(hi-lo)*ph;const box=document.querySelector('#v37Chart');const t=state.trades.find(x=>x.id===box.dataset.trade);
 const avg=v43Avg(t),stop=Number(t.stop);const e=svg.querySelector('line.v37-line.entry'),s=svg.querySelector('line.v37-line.stop');const eY=e?+e.getAttribute('y1'):NaN,sY=s?+s.getAttribute('y1'):NaN;
 const base=v=>eY+(v-avg)*(sY-eY)/(stop-avg); /* 봉 좌표계(본체가 그린 두 점선으로 잡은 축) */
 const hl=svg.querySelector('g[data-v40id="h1"] line.v40-hl');const hlY=hl?+hl.getAttribute('y1'):NaN;
 const p=v37ChartPlan(t),c=V37_CHART.get(p.key);let wick=NaN,wickGeo=NaN;
 /* 화면 가운데쯤 꼬리 하나: x로 봉 시각을 거꾸로 찾아(가로 확대·이동·더 받은 봉 포함) 그 봉 고가의 겹층 Y와 비교 */
 const ws=[...svg.querySelectorAll('line.v37-wick')];const w=ws[Math.floor(ws.length/2)];let all=c&&c.K||[];try{all=v44All(p,all);}catch{}
 if(w&&all.length){const x=+w.getAttribute('x1'),ts=t0+(x-L)/pw*(t1-t0)-p.ivMs/2;let best=null;for(const k of all){const dd=Math.abs(k.t-ts);if(!best||dd<best.d)best={d:dd,k};}
  if(best&&best.d<p.ivMs*0.3){wick=+w.getAttribute('y1');wickGeo=Y(best.k.h);}}
 const d=x=>Number.isFinite(x)?+Math.abs(x).toFixed(2):99;
 return {entry:d(eY-Y(avg)),wick:d(wick-wickGeo),hline:d(hlY-base(2304.5)),ppu:+(ph/(hi-lo)).toFixed(4),lo:+lo.toFixed(4),hi:+hi.toFixed(4)};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+(mode==='off'?'&v133=0':''));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(seed);await page.waitForTimeout(1500);
  o.dbgOn=await page.evaluate(()=>typeof v133Debug==='function'?v133Debug().on:null);
  const P=()=>page.evaluate(PROBE);const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,30)))));
  const openC=async id=>{await page.evaluate(id=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade(id,'manage');},id);
   await page.waitForFunction(()=>{const s=document.querySelector('#v37Chart svg.v37-svg');return s&&s.getAttribute('data-v40g');},null,{timeout:20000});await page.waitForTimeout(600);
   await page.evaluate(()=>document.querySelector('#v37Chart').scrollIntoView({block:'center'}));await page.waitForTimeout(250);};
  /* (S) 겹층 동기 */
  await openC('tgt');
  const fr=[];const rec=async lab=>{await frame();const x=await P();fr.push({lab,...x});return x;};
  const p0=await rec('처음');
  const geo=await page.evaluate(()=>{const s=document.querySelector('#v37Chart svg.v37-svg');const b=s.getBoundingClientRect();const a=s.getAttribute('data-v40g').split(',').map(Number);const k=b.width/a[0];
   const ax=document.querySelector('#v37Chart [data-v96ax="p"]');const r=ax?ax.getBoundingClientRect():null;
   return {ax:r?{x:r.left+r.width/2,y:r.top+r.height*0.45}:{x:b.left+(a[2]+a[4]+30)*k,y:b.top+(a[3]+a[5]*0.45)*k},pl:{x:b.left+(a[2]+a[4]*0.45)*k,y:b.top+(a[3]+a[5]*0.5)*k}};});
  /* 가격축 위로 끌기 = 세로 확대 */
  await page.mouse.move(geo.ax.x,geo.ax.y);await page.mouse.down();
  for(let i=1;i<=8;i++){await page.mouse.move(geo.ax.x,geo.ax.y-i*14);await rec('축 끌기 '+i);}
  await page.mouse.up();const pz=await rec('축 놓음');await page.waitForTimeout(400);const pz2=await rec('축 놓은 뒤');
  o.zoom=+(pz2.ppu/p0.ppu).toFixed(3);
  await page.evaluate(()=>{const t=state.trades.find(x=>x.id==='tgt');v37ChartMount(t);});const pzR=await rec('다시 그림');
  o.zoomKept=+(pzR.ppu/pz2.ppu).toFixed(4);o.zoomRangeSame=Math.abs(pzR.lo-pz2.lo)<1e-6&&Math.abs(pzR.hi-pz2.hi)<1e-6;
  /* 차트 위아래 끌기 = 세로 이동 */
  await page.mouse.move(geo.pl.x,geo.pl.y);await page.mouse.down();
  for(let i=1;i<=6;i++){await page.mouse.move(geo.pl.x+i*2,geo.pl.y+i*12);await rec('세로 이동 '+i);}
  await page.mouse.up();await page.waitForTimeout(400);const pm=await rec('이동 놓은 뒤');
  o.panMoved=Math.abs(pm.lo-pzR.lo)>1e-6;o.panZoomKept=+(pm.ppu/pzR.ppu).toFixed(4);
  await page.evaluate(()=>{const t=state.trades.find(x=>x.id==='tgt');v37ChartMount(t);});const pmR=await rec('이동 다시 그림');
  o.panKept=Math.abs(pmR.lo-pm.lo)<1e-6&&Math.abs(pmR.hi-pm.hi)<1e-6;
  /* 가격축 휠 = 세로 배율, 차트 휠 = 가로 */
  if(W>=500){await page.mouse.move(geo.ax.x,geo.ax.y);for(let i=1;i<=4;i++){await page.mouse.wheel(0,-120);await rec('축 휠 '+i);}
   const pw1=await rec('축 휠 뒤');o.wheelY=+(pw1.ppu/pmR.ppu).toFixed(3);
   await page.mouse.move(geo.pl.x,geo.pl.y);for(let i=1;i<=3;i++){await page.mouse.wheel(0,-120);await rec('차트 휠 '+i);}}
  else{/* 모바일: 손가락 대신 같은 경로(세로 배율 직접 바꾸고 다시 그림) */
   for(let i=1;i<=3;i++){await page.evaluate(()=>{const t=state.trades.find(x=>x.id==='tgt'),p=v37ChartPlan(t),k=v96Key(t,p);V96.yz.set(k,(V96.yz.get(k)||1)*0.85);v37ChartMount(t);});await rec('배율 '+i);}}
  o.frames=fr.length;o.maxEntry=Math.max(...fr.map(x=>x.entry));o.maxWick=Math.max(...fr.map(x=>x.wick));o.maxHline=Math.max(...fr.map(x=>x.hline));
  o.worst=fr.slice().sort((a,b)=>Math.max(b.entry,b.wick,b.hline)-Math.max(a.entry,a.wick,a.hline))[0];
  o.drift=await page.evaluate(()=>{const d=v133Debug?v133Debug()['지금 차트']:null;return d?d.drift:null;}).catch(()=>null);
  await page.locator('#v37Chart').screenshot({path:path.join(outDir,key+'-sync.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  o.docScroll=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  /* (B) 예산 소진 + 이전 봉 일부 → 즉시 요청·'불러오는 중' (SILV 쌍: S 장면 캐시와 안 겹침) */
  await openC('ot2');await page.evaluate(()=>{if($('tradeDialog').open)$('tradeDialog').close();});
  await page.waitForFunction(()=>V104.q.length===0&&V104.inflight===0,null,{timeout:20000});
  o.B=await page.evaluate(async off=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));const now=Date.now(),bk=[];
   const first=off?now-60e3+4000:now-60e3+10000;for(let i=0;i<15;i++)bk.push([first+i*1000,70]);localStorage.setItem('tj:v104:w',JSON.stringify(bk));
   window.__slow=1500;window.__log.length=0;const T0=performance.now();openTrade('tg2','manage');
   const t=state.trades.find(x=>x.id==='tg2');let part=null,full=null,ld=false,ldGone=null,ldBox=null;
   for(let i=0;i<400;i++){const p=v37ChartPlan(t),c=V37_CHART.get(p.key);const svg=document.querySelector('#v37Chart svg.v37-svg');const el=document.querySelector('#v37Chart .v37-chart-head .v133-ld');
    if(el&&!ld){ld=true;const r=el.getBoundingClientRect();ldBox={txt:el.textContent.trim(),inView:r.left>=0&&r.right<=innerWidth+0.5,h:Math.round(r.height)};}
    if(svg&&c&&c.K&&c.K.length){if((c.v104stale||c.K.v104stale)&&!part)part={ms:Math.round(performance.now()-T0),n:c.K.length,ld:!!el};
     if(!(c.v104stale||c.K.v104stale)){full={ms:Math.round(performance.now()-T0),n:c.K.length};ldGone=!el;break;}}
    await sl(25);}
   const G=window.__log.filter(x=>x.type==='candleSnapshot'&&/SILV/.test(x.coin||''));window.__slow=0;
   return {part,full,ld,ldBox,ldGone,netStart:G.length?Math.round(G[0].t-T0):null,req:G.length,lane:typeof V133!=='undefined'?V133.st.laneGo:null};},mode==='off');
  if(mode==='on'){await page.evaluate(()=>{window.__slow=4000;});
   /* 화면 확인용: 일부 봉 + '불러오는 중' 상태 스크린샷 */
   await page.evaluate(()=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade('oth','manage');});await page.waitForTimeout(200);
   await page.evaluate(()=>document.querySelector('#v37Chart').scrollIntoView({block:'center'}));await page.waitForTimeout(150);
   o.Bshot=await page.evaluate(()=>!!document.querySelector('#v37Chart .v133-ld'));
   await page.locator('#v37Chart').screenshot({path:path.join(outDir,key+'-loading.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   o.docScroll2=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   await page.evaluate(()=>{window.__slow=0;});}
  R[key]=o;await ctx.close();};
 await Promise.all([[1440,'on'],[390,'on'],[1440,'off']].map(one));
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
