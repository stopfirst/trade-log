/* v109 QA: (1) 차트 그리기 자석 — 버튼 끔→약→강→끔 순환·기기 저장, 강 = 봉의 가장 가까운 O·H·L·C(시각 = 봉 가운데),
   약 = 12px 안일 때만, 끔 = 누른 그대로, Ctrl 누르는 동안 반전(PC), 손익비 상자 SL 손잡이·추세선 끝·직사각형 모서리 끌기, 모바일 탭.
   기대 좌표는 테스트가 봉·축에서 직접 다시 계산(앱의 v109Snap을 부르지 않음).
   (2) 포지션 위험 %: HL 전일 마감 USDC만 있고 마감 현물이 아직 없을 때(현물 조회 전·계산 중) 2.95%로 부풀지 않음, 현물 로딩 뒤 거래 상세 다시 그림.
   모의 데이터만(가짜 주소 0xaaaa…, 가짜 봉·잔고). 하네스 = t103. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');
  if(b.type==='userFillsByTime'){if(window.__v67arm!==undefined){window.__v67=window.__v67arm;window.__v67arm=undefined;}return J([]);}if(b.type==='userFunding')return J([]);
  if(b.type==='spotClearinghouseState')return J({balances:[{coin:'USDC',token:0,total:'18388'},{coin:'UBTC',token:197,total:'0.244841'},{coin:'SPCXD',token:300,total:'107.816'}]});
  if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[{name:'@142',tokens:[197,0],index:0},{name:'@300',tokens:[300,0],index:1}]},[{markPx:'76698',midPx:'76698'},{markPx:'137.68',midPx:'137.68'}]]);
  if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5}[b.req.interval]||36e5,out=[];let p=100;
   for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<200;t+=iv,i++){const o2=p,c=p+Math.sin(i/2.3)*0.9+(i>40&&i<70?0.25:-0.05);out.push({t,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.5),l:String(Math.min(o2,c)-0.5)});p=c;}return J(out);}return J({},400);}
  return J({message:'not found'},404);};};
const seed=()=>{
 const now=Date.now(),D=Date.parse(new Date(now-86400000).toISOString().slice(0,10)+'T00:00:00Z');
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.12,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=o=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:o.id,at:o.e[0][0],name:o.name,direction:o.dir||'long',date:new Date(o.e[0][0]).toISOString().slice(0,10),stop:o.stop??null,stop0:o.stop0??null,initialRisk:o.R??null,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:o.process||'unreviewed',review:o.review||'',violations:o.viol||[],entries:o.e.map((x,i)=>ev(o.id+'e'+i,...x)),fills:(o.f||[]).map((x,i)=>ev(o.id+'f'+i,...x)),funding:[],images:[],...(o.extra||{})});
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10,limStart:new Date(D).toISOString().slice(0,10),reviewStart:'2026-10-01'});
 state.trades=[mk({id:'big',name:'xyz:INTC',e:[[D+3*3600e3,30,100],[D+3.6*3600e3,10,101.2]],f:[[D+4.4*3600e3,20,102.1,'102'],[D+5*3600e3,20,101.6,'103']],stop0:null,stop:null,R:300,extra:{chartNotes:[]}})];
 setPage('dashboard');renderAll();window.scrollTo(0,0);
};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const rep={errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/';
 for(const W of [1440,390]){
 const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',hasTouch:W<500});await ctx.addInitScript(init);const page=await ctx.newPage();
 page.on('pageerror',e=>rep.errors.push(e.message));
 await page.goto(URL0+'?journal=hyperliquid');await page.waitForTimeout(2200);await page.evaluate(seed);await page.waitForTimeout(200);
 await page.evaluate(()=>{try{localStorage.removeItem('tj.v109.mag');localStorage.removeItem('tj.v109.last');}catch{}openTrade('big','manage');});await page.waitForTimeout(3800);
 await page.evaluate(()=>{const t=state.trades.find(x=>x.id==='big');t.chartNotes=[];v32St={at:Date.now(),orders:[],failed:[]};v32Kick=async()=>{};v32Model=()=>({state:'ok',rows:[]});V40.mode='view';V40.pend=null;v37ChartMount(t);document.querySelector('#v37Chart').scrollIntoView();});await page.waitForTimeout(300);
 const r={W};
 /* 봉 좌표: 보이는 봉 i번째의 가운데 x, 그 봉 값 v의 화면 y (+dy 화면 px) */
 const P=(i,which,dy=0,dxf=0.3)=>page.evaluate(([i,which,dy,dxf])=>{const svg=document.querySelector('#v37Chart svg.v37-svg'),g=v43G(svg),R=svg.getBoundingClientRect();const t=state.trades.find(x=>x.id==='big'),p=v37ChartPlan(t),K=V37_CHART.get(p.key).K,iv=p.ivMs;
  const vis=K.filter(k=>k.t>=g.t0&&k.t+iv<=g.t1);const k=vis[Math.max(0,Math.min(vis.length-1,Math.round(vis.length*i)))];const ux=R.width/g.W,uy=R.height/g.H;
  const sx=R.left+g.X(k.t+iv*dxf)*ux,sy=R.top+g.Y(k[which])*uy+dy;
  /* 기대값(앱 코드와 독립): 누른 화면 y에 가장 가까운 O·H·L·C, 거리(화면 px), 누른 그대로의 값 */
  const cy=(sy-R.top)/uy,cx=(sx-R.left)/ux;let best=null,bd=Infinity;for(const v of [k.o,k.h,k.l,k.c]){const d=Math.abs(g.Y(v)-cy)*uy;if(d<bd){bd=d;best=v;}}
  const raw={ts:Math.round(g.t0+(cx-g.L)/g.pw*(g.t1-g.t0)),px:Number((g.hi-(cy-g.T)/g.ph*(g.hi-g.lo)).toPrecision(8))};
  return {x:sx,y:sy,snap:{ts:Math.round(k.t+iv/2),px:Number(best.toPrecision(8))},dpx:bd,raw};},[i,which,dy,dxf]);
 const same=(a,b)=>!!a&&!!b&&Math.abs(a.ts-b.ts)<=1&&Math.abs(a.px-b.px)<=Math.abs(b.px)*1e-7;
 const near=(a,b)=>!!a&&!!b&&Math.abs(a.ts-b.ts)<=60e3&&Math.abs(a.px-b.px)<=Math.abs(b.px)*2e-4;  /* 누른 그대로(화면 좌표 반올림 오차) */
 const tool=async k=>{await page.evaluate(k=>document.querySelector(`#v37Chart [data-v40mode="${k}"]`).click(),k);await page.waitForTimeout(250);};
 const tap=async(q,o)=>{if(W<500&&!(o&&o.mouse))await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);await page.waitForTimeout(300);};
 const magBtn=()=>page.evaluate(()=>{const b=document.querySelector('#v37Chart [data-v109mag]');if(!b)return null;const R=b.getBoundingClientRect();return {mode:b.dataset.v109mag,eff:b.dataset.v109eff,txt:b.textContent.trim(),pressed:b.getAttribute('aria-pressed'),inTools:!!b.closest('.v40-tools'),vis:R.width>0&&R.height>0,store:localStorage.getItem('tj.v109.mag')};});
 const cycle=async()=>{await page.evaluate(()=>document.querySelector('#v37Chart [data-v109mag]').click());await page.waitForTimeout(250);return magBtn();};
 const lastTrend=()=>page.evaluate(()=>{const l=state.trades.find(x=>x.id==='big').chartNotes.filter(x=>x.kind==='trend');const x=l[l.length-1];return x?{a:{ts:x.ts,px:x.px},b:{ts:x.ts2,px:x.px2},n:l.length}:null;});
 /* 버튼 순환 */
 r.btn0=await magBtn();r.cyc=[];for(let i=0;i<3;i++)r.cyc.push(await cycle());
 const drawTrend=async(qa,qb,o)=>{await tool('trend');await tap(qa,o);await tap(qb,o);await page.waitForTimeout(250);return lastTrend();};
 /* 강: 봉 고가 위 40px(멀리) → 고가, 봉 저가 아래 5px → 저가 */
 await page.evaluate(()=>{localStorage.setItem('tj.v109.mag','strong');v37ChartMount(state.trades.find(x=>x.id==='big'));});
 {const qa=await P(.3,'h',-40),qb=await P(.6,'l',5);const got=await drawTrend(qa,qb);r.strong={a:same(got&&got.a,qa.snap),b:same(got&&got.b,qb.snap),aIsHigh:true,dpxA:Math.round(qa.dpx)};
  r.strong.hint=await page.evaluate(()=>{V40.mode='trend';v37ChartMount(state.trades.find(x=>x.id==='big'));const h=document.querySelector('#v37Chart .v40-hint');const s=h?h.textContent:'';V40.mode='view';v37ChartMount(state.trades.find(x=>x.id==='big'));return /자석 강/.test(s);});}
 /* 약: 멀리(40px) → 그대로, 가까이(5px) → 붙음 */
 await page.evaluate(()=>{localStorage.setItem('tj.v109.mag','weak');v37ChartMount(state.trades.find(x=>x.id==='big'));});
 {const qa=await P(.35,'h',-40),qb=await P(.65,'l',5);const got=await drawTrend(qa,qb);r.weak={farRaw:near(got&&got.a,qa.raw),farNotSnap:!same(got&&got.a,qa.snap),nearSnap:same(got&&got.b,qb.snap),nearDpx:qb.dpx<=12};}
 /* 끔: 둘 다 그대로 */
 await page.evaluate(()=>{localStorage.setItem('tj.v109.mag','off');v37ChartMount(state.trades.find(x=>x.id==='big'));});
 {const qa=await P(.25,'h',-40),qb=await P(.55,'l',5);const got=await drawTrend(qa,qb);r.off={a:near(got&&got.a,qa.raw),b:near(got&&got.b,qb.raw),bNotSnap:!same(got&&got.b,qb.snap)};}
 if(W===1440){
  /* Ctrl 누르는 동안 반전: 끔 → 마지막 켜짐(강), 버튼에 (Ctrl) 표시 / 놓으면 원래대로 */
  const qa=await P(.4,'h',-40),qb=await P(.7,'h',-40);await tool('trend');await page.keyboard.down('Control');await page.waitForTimeout(100);r.ctrlBtn=await magBtn();
  await page.mouse.click(qa.x,qa.y);await page.waitForTimeout(300);await page.mouse.click(qb.x,qb.y);await page.waitForTimeout(300);await page.keyboard.up('Control');await page.waitForTimeout(150);
  const got=await lastTrend();r.ctrl={a:same(got&&got.a,qa.snap),b:same(got&&got.b,qb.snap),btnAfter:(await magBtn()).txt};
  /* 마우스 이동 중 자석 표시 동그라미(강) */
  await page.evaluate(()=>{localStorage.setItem('tj.v109.mag','strong');V40.mode='trend';v37ChartMount(state.trades.find(x=>x.id==='big'));});await page.waitForTimeout(150);
  {const q=await P(.5,'h',-30);await page.mouse.move(q.x-3,q.y);await page.mouse.move(q.x,q.y,{steps:3});await page.waitForTimeout(150);r.dot=await page.evaluate(()=>!!document.querySelector('#v37Chart .v45-xh .v109-dot'));}
  await page.keyboard.press('Escape');await page.evaluate(()=>{V40.mode='view';V40.pend=null;v37ChartMount(state.trades.find(x=>x.id==='big'));});await page.waitForTimeout(200);
 }
 /* 끌기(강): 추세선 끝점 · 손익비 상자 SL · 직사각형 모서리 */
 await page.evaluate(()=>{localStorage.setItem('tj.v109.mag','strong');const t=state.trades.find(x=>x.id==='big');V40.mode='view';V40.pend=null;
  const svg=document.querySelector('#v37Chart svg.v37-svg'),g=v43G(svg),P=v=>Number(v.toPrecision(8)),sp=g.t1-g.t0,R=g.hi-g.lo;
  t.chartNotes=[{id:'tr1',kind:'trend',ts:Math.round(g.t0+sp*.1),px:P(g.lo+R*.3),ts2:Math.round(g.t0+sp*.2),px2:P(g.lo+R*.35),text:'',at:1},
   {id:'rr1',kind:'rr',side:'long',ts:Math.round(g.t0+sp*.55),ts2:Math.round(g.t0+sp*.8),px:P(g.lo+R*.86),sl:P(g.lo+R*.8),tp:P(g.lo+R*.94),text:'',at:2},
   {id:'rc1',kind:'rect',ts:Math.round(g.t0+sp*.05),px:P(g.lo+R*.97),ts2:Math.round(g.t0+sp*.12),px2:P(g.lo+R*.9),text:'',at:3}];v37ChartMount(t);});
 await page.waitForTimeout(400);
 const hc=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};},sel);
 const dragTo=async(sel,q)=>{const h=await hc(sel);if(!h)return false;await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move((h.x+q.x)/2,(h.y+q.y)/2,{steps:4});await page.mouse.move(q.x,q.y,{steps:4});await page.mouse.up();await page.waitForTimeout(900);return true;};
 const note=id=>page.evaluate(id=>{const x=state.trades.find(t=>t.id==='big').chartNotes.find(y=>y.id===id);return x?{...x}:null;},id);
 {const q=await P(.45,'l',8);const ok=await dragTo('[data-v40id="tr1"] [data-v61t="b"]',q);const x=await note('tr1');r.dragTrend={found:ok,snap:same(x&&{ts:x.ts2,px:x.px2},q.snap)};}
 {const q=await P(.6,'l',6);const ok=await dragTo('[data-v40id="rr1"] [data-v43h="sl"]',q);const x=await note('rr1');r.dragBox={found:ok,snap:!!x&&Math.abs(x.sl-q.snap.px)<=Math.abs(q.snap.px)*1e-7,slOnly:!!x&&x.sl<x.px};}
 {const q=await P(.2,'l',10);const ok=await dragTo('[data-v40id="rc1"] [data-v61h="br"]',q);const x=await note('rc1');r.dragRect={found:ok,snap:same(x&&{ts:x.ts2,px:x.px2},q.snap)};}
 r.store=await page.evaluate(()=>localStorage.getItem('tj.v109.mag'));
 r.dbg=await page.evaluate(()=>window.v109Debug&&window.v109Debug());
 r.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 r.toolsBad=await page.evaluate(()=>{const b=document.querySelector('#v37Chart [data-v109mag]'),box=document.querySelector('#tradeDialog').getBoundingClientRect();if(!b)return ['nobtn'];const R=b.getBoundingClientRect();return R.right>box.right+0.5||R.left<box.left-0.5?['v109-mag:'+Math.round(R.left)+'-'+Math.round(R.right)]:[];});
 await page.locator('#v37Chart').screenshot({path:outDir+'/t109-'+W+'.png'});
 rep['w'+W]=r;await ctx.close();}

 // ===== 위험 %: XMR 롱 29.261 @ 624.743, 최초 손절 606.37 → 1R 537.61. 전일 마감 USDC 18,240 + 마감 현물 33,623 =====
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);const page=await ctx.newPage();
 page.on('pageerror',e=>rep.errors.push(e.message));
 await page.goto(URL0+'?journal=hyperliquid');await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.waitForTimeout(800);
 const k={};
 k.setup=await page.evaluate(()=>{const now=Date.now();const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:1.7,seq:ts/1000};};
  state.settings.riskMax=2.5;state.settings.openMax=6;
  state.trades=[normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:'xmr',at:now-3600e3,name:'XMR',direction:'long',date:new Date(now-3600e3).toISOString().slice(0,10),stop:606.37,stop0:606.37,initialRisk:537.61,riskR:1,setup:'미분류',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],entries:[ev('x1',now-3600e3,29.261,624.743)],fills:[],funding:[],images:[]})];
  window.__addr='0x'+'a'.repeat(40);hlcStatus=Object.assign(hlcStatus||{},{address:window.__addr});
  const y=new Date(Date.now()-86400000).toISOString().slice(0,10);const prev={key:y,value:18240,source:'close',expected:true};v27Prev=()=>({...prev});v28PrevBefore=()=>({...prev});
  v66Usdc=()=>18388;V57.spot=null;V57.at=0;window.__v67=undefined;v67Get=()=>window.__v67;
  return {day:v37First(state.trades[0]).date};});
 const read=()=>page.evaluate(()=>{const t=state.trades[0],d=v37Detect(t),f=v37First(t),b=v37Basis(t,f.date),dbg=v109Debug();const risk=d.find(x=>x.code==='risk');
  return {basis:b===null?null:Math.round(b*100)/100,pct:b>0?Math.round(537.61/b*1e4)/100:null,risk:risk?risk.label:null,codes:d.map(x=>x.code),spot:dbg.spot,fallback:dbg.fallback,hold:dbg.hold,detail:risk?risk.detail:null};});
 /* (a) 현물 조회 전(주소는 있음): 판정 보류 — 예전엔 537.61 / 18,240 = 2.95% 위반 */
 k.pending=await read();
 k.oldWay=await page.evaluate(()=>Math.round(537.61/v28Denom(v37First(state.trades[0]).date).value*1e4)/100);
 /* 거래 상세(복기 탭)를 연 채로 현물 도착(v57Spot, 모의 HL) → 다시 그림 */
 await page.evaluate(()=>{const t=state.trades[0];t.stop=t.stop0=573.48;t.initialRisk=1500.08;V57.spot=null;V57.busy=true;openTrade('xmr','review');});await page.waitForTimeout(1500);
 k.dlg0=await page.evaluate(()=>({open:$('tradeDialog').open,sel:selectedId,sig:v109Sig(),m:($('tradeDialog').textContent.match(/포지션 위험 [0-9.]+%/)||[null])[0]}));
 await page.evaluate(async()=>{V57.busy=false;await v57Spot(true);});await page.waitForTimeout(600);
 k.afterSpot=await page.evaluate(()=>({R:state.trades[0].initialRisk,spotUsd:Math.round(V57.spot.usd),dlg:($('tradeDialog').textContent.match(/포지션 위험 [0-9.]+%/)||[null])[0],redo:v109Debug().redetail}));
 /* v67 마감 현물 도착 → 다시 그림(분모 = 마감 USDC + 마감 현물) */
 await page.evaluate(async()=>{V67.by.clear();V67.fail.clear();V67.busy=false;window.__v67arm=33623;await v67Load();});await page.waitForTimeout(600);
 k.afterClose=await page.evaluate(()=>({dlg:($('tradeDialog').textContent.match(/포지션 위험 [0-9.]+%/)||[null])[0],redo:v109Debug().redetail}));
 await page.evaluate(()=>{$('tradeDialog').close();const t=state.trades[0];t.stop=t.stop0=606.37;t.initialRisk=537.61;});
 /* (b) 현물 있음 · 마감 현물 계산 중 → 지금 계좌(18,388 + 현물) */
 await page.evaluate(()=>{window.__v67=undefined;});k.computing=await read();
 /* (c) 마감 현물 계산 끝 → 18,240 + 33,623 */
 await page.evaluate(()=>{window.__v67=33623;});k.closed=await read();
 /* (d) 마감 현물 0(마감 뒤 산 현물) → 마감 USDC 그대로 */
 await page.evaluate(()=>{window.__v67=0;});k.zero=await read();
 /* (e) 주소 없음(현물 정보 못 받는 환경) → 예전처럼 마감 USDC */
 await page.evaluate(()=>{window.__v67=undefined;V57.spot=null;hlcStatus.address='';});k.noAddr=await read();
 rep.risk=k;await ctx.close();}
 console.log(JSON.stringify(rep));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
