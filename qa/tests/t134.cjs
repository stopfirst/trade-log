/* v134 QA — 거래 상세 간소화(화면에서만 숨김). 모의 HL·모의 데이터(외부 연결 없음).
   거래(BTC, 이번 주 청산):
   A    끝난 거래 · 손절 없음(자동 감지 '손절 미설정') · 관리 계획 글 · 텔레그램 복기 · 진입/청산 코멘트 → 상세에서 채점 제목·점수·항목·계획 준수 폼·자동 감지·관리 계획 숨김, MFE 줄은 보임
   B    끝난 거래 · 미평가 → 거래 기록 표 '과정' 열 '—', 주간 리뷰 '과정 점수'·'복기 안 한 거래'·'가장 점검할 거래'·점수 열 없음
   OPEN 진행 중
   (D) 데이터 그대로: process·plans·violations 바뀌지 않음, v63Score 계산 그대로.
   (O) ?v134=0: 예전 화면(채점 점수·계획 준수 폼·관리 계획·주간 과정 점수·미평가) 복원. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='candleSnapshot'){const r=b.req,M={'1m':6e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5},iv=M[r.interval]||9e5;out=[];let p=100;
    for(let t=Math.ceil(r.startTime/iv)*iv;t<=r.endTime&&out.length<3000;t+=iv){const o2=p,c=p+Math.sin(t/iv/7)*0.8;out.push({t,T:t+iv-1,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.4),l:String(Math.min(o2,c)-0.4),v:'10',n:5,i:r.interval,s:r.coin});p=c;}}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'102'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];
   else out={};
   await new Promise(r=>setTimeout(r,30));return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const seed=async()=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const mk=(id,o)=>{const a=Math.floor((now-o.h0*H)/H)*H,b=o.h1==null?null:Math.floor((now-o.h1*H)/H)*H;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,o.px||103)],funding:[],images:[],...(o.x||{})});};
 state.trades=[
  mk('A',{h0:60,h1:40,px:98,x:{stop:null,stop0:null,initialRisk:null,entryComment:'진입 메모',exitComment:'청산 메모',avoidable:false,plans:{stop:'95 아래 이탈',failure:'',strength:'',runner:''},quickReview:{decision:'compliant',answeredAt:new Date(now-30*H).toISOString()}}}),
  mk('B',{h0:58,h1:56,px:104}),
  mk('OPEN',{h0:20,h1:null})];
 Object.assign(state.settings,{account:10000,v92From:'2026-10-01'});await persist();setPage('records');renderAll();
};
const vis=sel=>{const el=typeof sel==='string'?document.querySelector(sel):sel;return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+(mode==='off'?'&v134=0':''));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  const E=(f,a)=>page.evaluate(f,a);
  await page.evaluate(`window.__vis=${vis.toString()}`);
  await E(seed);await page.waitForTimeout(600);
  o.dbgOn=await E(()=>typeof v134Debug==='function'?v134Debug().on:null);
  const before=await E(()=>JSON.stringify(state.trades.map(t=>[t.id,t.process,t.plans,t.violations,t.planHistory])));
  await E(async()=>{openTrade('A','review');await new Promise(r=>setTimeout(r,1500));});
  o.H=await E(()=>{const v=window.__vis,q=s=>document.querySelector(s),c=q('#v63Card');
   return {card:v(c),head:v('#v63Card .v63-head'),items:v('#v63Card .v63-items'),exc:v('#v63Card .v63-exc'),mt:(q('#v63Card .v134-mt')||{}).textContent||null,
    mfe:/MFE 최대 유리/.test((q('#v63Card .v63-exc')||{}).innerText||'')&&/MAE 최대 불리/.test((q('#v63Card .v63-exc')||{}).innerText||'')&&/실제 R/.test((q('#v63Card .v63-exc')||{}).innerText||''),
    score:/\/100/.test(c&&c.innerText||''),form:v('#reviewForm'),autoExists:!!q('#v37Auto'),auto:v('#v37Auto'),save:v('#tradeDialog [data-v37-save]'),tg:v('#v37TgLine'),eval:v('#reviewForm .evaluation'),
    plan:[...document.querySelectorAll('#tradeDialog .v76-review .plan-card')].some(v),planAny:[...document.querySelectorAll('#tradeDialog .plan-card')].filter(v).map(x=>x.className+':'+x.textContent.trim().slice(0,30)),planTitle:[...document.querySelectorAll('#tradeDialog .detail-section-title')].some(x=>v(x)&&/진입 당시의 관리 계획/.test(x.textContent)),
    planFold:v(q('#planForm')&&q('#planForm').closest('details')),basis:v(q('#basisForm')&&q('#basisForm').closest('details')),
    journal:v('#v71Card'),j132:v('#v132J'),chart:v('#v37Chart'),summary:v('#detailSummary'),manage:v('#tradeDialog .v76-manage'),timeline:v('#tradeDialog .timeline'),del:v('#deleteTrade'),
    tlPill:[...document.querySelectorAll('#tradeDialog .timeline .pill')].filter(v).map(x=>x.textContent.trim()),
    tlNote:[...document.querySelectorAll('#tradeDialog .timeline .event-note')].filter(v).map(x=>x.textContent.trim()),
    dbg:v134Debug().detail};});
  o.dlgScroll=await E(()=>{const d=$('tradeDialog');const bad=[];d.querySelectorAll('#detailBody *').forEach(e=>{const r=e.getBoundingClientRect(),dr=d.getBoundingClientRect();if(r.width&&r.right>dr.right+1&&window.__vis(e))bad.push(e.className||e.tagName);});return bad.slice(0,5);});
  await E(()=>{const c=$('v63Card');if(c)c.scrollIntoView({block:'center'});});await page.waitForTimeout(300);
  await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  await E(()=>{const c=document.querySelector('#tradeDialog .v76-manage');if(c)c.scrollIntoView({block:'start'});});await page.waitForTimeout(300);
  await page.screenshot({path:path.join(outDir,key+'-manage.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  await E(()=>$('tradeDialog').close());await page.waitForTimeout(400);
  /* (D) 데이터 그대로 */
  o.D=await E(b=>{const now=JSON.stringify(state.trades.map(t=>[t.id,t.process,t.plans,t.violations,t.planHistory]));const s=v63Score(state.trades.find(x=>x.id==='A'));return {same:now===b,score:typeof s.score==='number',pending:s.pending};},before);
  /* 주간 리뷰 */
  o.W=await E(async()=>{setPage('analysis');renderAll();await new Promise(r=>setTimeout(r,800));const b=$('v63WeekBody');const h=b?b.innerHTML:'';const tx=b?b.innerText:'';
   return {has:!!b,trades:/<span>거래<\/span>/.test(h),procScore:tx.includes('과정 점수'),unrev:tx.includes('복기 안 한 거래'),worst:tx.includes('가장 점검할 거래'),scoreCol:/<th>점수<\/th>/.test(h),scoreCell:/<td class="mono v63-score/.test(h),
    meta:(document.querySelector('#v63Week .card-head .meta')||{}).textContent||''};});
  /* 거래 기록 표 '과정' 열 */
  o.Rec=await E(async()=>{setPage('records');renderAll();await new Promise(r=>setTimeout(r,800));const rows=[...document.querySelectorAll('.record-desktop tbody tr')].filter(window.__vis);
   return {n:rows.length,proc:rows.map(r=>{const td=r.querySelectorAll('td')[6];return td?td.textContent.trim():null;}).sort()};});
  o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),one([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
