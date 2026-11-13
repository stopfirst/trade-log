/* v131 QA — 계획 손익비 = 차트 손익비 상자(진입·SL·TP), 첫 청산 때 고정 유지. 모의 HL·모의 데이터(외부 연결 없음).
   거래(모두 BTC 롱, 상자 = 같은 방향 손익비 상자):
   OPEN  진행 중 · 최초 손절 99(1R 기준) · 상자 진입 100 / SL 95(HL 스탑 자리) / TP 107.5 → 상자 1:1.5 (예전 식 = 목표 107.5 · 최초 손절 99 → 1:7.5)
         → 계획 손익비 1.5 · v92 '손익비 미달'(기준 2) · 1R·최초 손절 그대로 · 카드 '차트 손익비 상자 기준'
   LOCK  끝난 거래 · 상자는 청산 전에 그림 · plan0 없음 → 그릴 때 상자 값으로 고정(src box) → 상자 TP를 끌어(v40Save) 바꿔도 고정값 그대로, 상자에 '고정됨 1:2.20'
   MIG   끝난 거래 · 예전 고정값 plan0 1:8.37(최초 손절 기준) + 상자 1:2.2 → 한 번 상자 값으로(prev 8.37 보관), 다시 그려도 더 안 바뀜
   MAN   손으로 고정한 plan0(manual) 3.0 → 그대로
   LATE  끝난 뒤 새로 그린 상자 → 상자 따라감(끌면 바뀜, '고정됨' 없음)
   NOBOX 상자 없음 → 예전 식 그대로
   (S) 저장: 기기 저장본(IndexedDB 아님 — state)과 다시 그리기 뒤 추가 변경 없음, stop0·initialRisk 그대로. 390 넘침 없음.
   (O) ?v131=0: 예전 식(OPEN 7.5, MIG 8.37 그대로), '고정됨' 없음. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='candleSnapshot'){const iv=IV[b.req.interval]||6e4,now=Date.now();out=[];
    for(let t=Math.ceil(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&t<=now&&i<5000;t+=iv,i++){const p=+(102+Math.sin(t/iv/5)*4).toFixed(2),c=+(102+Math.sin((t+iv)/iv/5)*4).toFixed(2);
     out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.5),l:String(Math.min(p,c)-0.5),v:'10',n:5});}}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'102'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];
   else out={};
   await new Promise(r=>setTimeout(r,40));return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const seed=async()=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const bid=ms=>'n'+Math.floor(ms).toString(36)+'abcd';
 const box=(born,ts,ts2,px,sl,tp)=>({id:bid(born),kind:'rr',side:'long',ts,ts2,px,sl,tp,text:'',at:born});
 const mk=(id,o)=>{const a=Math.floor((now-o.h0*H)/H)*H,b=o.h1==null?null:Math.floor((now-o.h1*H)/H)*H;
  const t=normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,103)],funding:[],images:[],entryNote:'근거',stopNote:'이유',react:true,tfIn:'htf',tfOut:'htf'});
  if(o.box)t.chartNotes=[box(o.born==='late'?now-60e3:a+60e3,a,a+3*H,...o.box)];
  if(o.target)t.riskPlan={target:o.target,stop:99};
  if(o.plan0)t.plan0=o.plan0;return t;};
 state.trades=[
  mk('OPEN',{h0:30,h1:null,box:[100,95,107.5]}),
  mk('LOCK',{h0:72,h1:48,box:[100,95,111]}),
  mk('MIG',{h0:72,h1:48,box:[100,95,111],plan0:{entry:100,stop:99,target:108.37,rr:8.37,at:now-40*H,src:'chart'}}),
  mk('MAN',{h0:72,h1:48,box:[100,95,111],plan0:{entry:100,stop:99,target:103,rr:3,at:now-40*H,manual:true}}),
  mk('LATE',{h0:72,h1:48,box:[100,95,110],born:'late'}),
  mk('NOBOX',{h0:72,h1:48,target:106})];
 Object.assign(state.settings,{account:10000,v92MinRR:2});await persist();setPage('records');renderAll();
};
const SNAP=()=>{const g=id=>state.trades.find(t=>t.id===id);const R={};
 for(const id of ['OPEN','LOCK','MIG','MAN','LATE','NOBOX']){const t=g(id),p=t.plan0||null;
  R[id]={pr:v71PlanRR(t)==null?null:Number(v71PlanRR(t).toFixed(3)),p0:p?{rr:p.rr,src:p.src||null,v131:!!p.v131,late:!!p.late,manual:!!p.manual,prev:p.prev?p.prev.rr:null}:null,stop0:t.stop0,ir:t.initialRisk};}
 const ck=v92Checks(g('OPEN')).find(x=>x.k==='rr');R.OPEN.chk={ok:ck.ok,bad:!!ck.bad,miss:ck.miss};return R;};
const idle=async page=>{for(let i=0;i<80;i++){const ok=await page.evaluate(()=>V104.q.length===0&&V104.inflight===0);if(ok)return true;await page.waitForTimeout(150);}return false;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+(mode==='off'?'&v131=0':''));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  const E=(f,a)=>page.evaluate(f,a);
  await E(seed);await page.waitForTimeout(800);await idle(page);
  o.dbgOn=await E(()=>typeof v131Debug==='function'?v131Debug().on:null);
  o.A=await E(SNAP);
  /* 카드(복기 탭 매매일지) */
  o.cardOpen=await E(async()=>{openTrade('OPEN','review');await new Promise(r=>setTimeout(r,500));const c=document.querySelector('.v71-rr');return c?c.textContent.replace(/\s+/g,' ').trim().slice(0,160):null;});
  o.cardMig=await E(async()=>{openTrade('MIG','review');await new Promise(r=>setTimeout(r,500));const c=document.querySelector('.v71-rr');return c?c.textContent.replace(/\s+/g,' ').trim().slice(0,200):null;});
  /* LOCK: 상자 TP 끌기(v40Save) → 고정값 그대로, 상자 '고정됨' */
  o.lock=await E(async()=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade('LOCK','manage');
   for(let i=0;i<60;i++){if(document.querySelector('#v37Chart svg.v37-svg'))break;await new Promise(r=>setTimeout(r,100));}
   const t=state.trades.find(x=>x.id==='LOCK'),x=t.chartNotes[0];const before=t.plan0&&t.plan0.rr;
   await v40Save(t,l=>l.map(y=>y.id===x.id?{...y,tp:107,at:Date.now()}:y),'');renderAll();await new Promise(r=>setTimeout(r,400));
   const t2=state.trades.find(x=>x.id==='LOCK');const lk=document.querySelector('#v37Chart text.v131-lk');
   return {before,after:t2.plan0&&t2.plan0.rr,boxTp:t2.chartNotes[0].tp,label:lk?lk.textContent:null,pr:Number(v71PlanRR(t2).toFixed(3))};});
  /* LATE: 끌면 따라감 */
  o.late=await E(async()=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade('LATE','manage');
   for(let i=0;i<60;i++){if(document.querySelector('#v37Chart svg.v37-svg'))break;await new Promise(r=>setTimeout(r,100));}
   const t=state.trades.find(x=>x.id==='LATE'),x=t.chartNotes[0];const before=t.plan0&&t.plan0.rr;
   await v40Save(t,l=>l.map(y=>y.id===x.id?{...y,tp:115,at:Date.now()}:y),'');renderAll();await new Promise(r=>setTimeout(r,400));
   const t2=state.trades.find(x=>x.id==='LATE');return {before,after:t2.plan0&&t2.plan0.rr,label:!!document.querySelector('#v37Chart text.v131-lk')};});
  /* 다시 그리기 → 더 바뀌지 않음, 저장 */
  o.again=await E(async()=>{const s0=JSON.stringify(state.trades.map(t=>t.plan0||null));const st=typeof V131!=='undefined'?{...V131.st}:null;renderAll();renderAll();await new Promise(r=>setTimeout(r,300));
   const s1=JSON.stringify(state.trades.map(t=>t.plan0||null));const st2=typeof V131!=='undefined'?V131.st:null;
   return {same:s0===s1,noMore:!st||(st2.migrate===st.migrate&&st2.fix===st.fix&&st2.follow===st.follow)};});
  o.B=await E(SNAP);
  o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  await page.screenshot({path:path.join(outDir,key+'.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  /* 새로고침 뒤에도(기기 저장) */
  await E(()=>{if($('tradeDialog').open)$('tradeDialog').close();});await page.waitForTimeout(600);await page.reload();await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.waitForTimeout(600);
  o.C=await E(SNAP);
  R[key]=o;await ctx.close();};
 await Promise.all([[1440,'on'],[390,'on'],[1440,'off']].map(one));
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
