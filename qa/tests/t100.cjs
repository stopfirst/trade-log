/* v100 일지 칩 반응 속도 QA — 모의 HL 거래 320건(진입 3·청산 3 체결, 메모·감정·차트 메모), 최근 종료 거래 상세 복기 탭(차트·매매일지 카드 열림).
   HL × 1440·390:
   (1) 칩 10종(감정 전·중·후, 사후 등급, 가격 반응, 진입/청산 TF, 셋업, 확신도, 컨디션): 클릭한 그 작업 안에서 class·값이 바뀜(다음 프레임 전) → sync 전부 true
   (2) 실제 마우스 클릭 4종: 다음 프레임까지 < 50ms, 클릭 뒤 350ms 안 80ms 넘는 long task 0 (저장은 0.4초 뒤 모아서)
   (3) 저장 중(전역 잠금 publicBusy>0)에도 같은 칩 5연타 · TF 칩 5연타 모두 반영, '다시 시도' 알림 없음 → 저장본 = 화면 = state
   (4) 메모 칸: 잠금 중 타이핑 글자 안 사라짐, 포커스 빠지면 저장 · 진입 전 체크 n/5 그 자리 갱신 · 채점 점수 갱신
   (5) 상세 창 열린 동안 renderAll 0회, 닫으면 한 번 · 새로고침 뒤 칩 상태 유지 · 스크롤 튐 0
   US 1440: v99 진입 이유 칩 즉시 반영·저장, 거래 기록 화면은 목록만 다시 그림. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
  if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5}[b.req.interval]||36e5,out=[];let p=100;
   for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<400;t+=iv,i++){const o2=p,c=p+Math.sin(i/2.3)*0.9;out.push({t,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.5),l:String(Math.min(o2,c)-0.5),v:String(1000+i%97*13)});p=c;}return J(out);}
  if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}return J({message:'not found'},404);};
 window.__lt=[];window.__pd=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())__lt.push({s:e.startTime,d:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
 addEventListener('pointerdown',e=>__pd.push(performance.now()),true);};
const seedHL=async N=>{const now=Date.now(),H=3600e3;
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.12,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const coins=['ETH','BTC','SOL','xyz:INTC','HYPE','xyz:NVDA'],E=['차분','조급','FOMO','불안','후회'];
 const mk=i=>{const t0=now-3*H-i*13*H,px=100+(i%11)-5,win=i%3!==0,dir=i%4?'long':'short',s=dir==='long'?1:-1,x=px+s*(win?2+(i%5):-1.5),id='p'+i;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:t0,name:coins[i%coins.length],direction:dir,date:new Date(t0).toISOString().slice(0,10),stop:px-s*1.5,stop0:px-s*1.5,initialRisk:22.5,riskR:1,setup:i?['눌림','베이스 돌파','미분류'][i%3]:'미분류',leverage:5,marginMode:'isolated',process:i%5?'compliant':'violation',review:'복기 '+i,violations:i%5?[]:['추격'],
   entryNote:'진입 근거 '+i,holdNote:'',exitNote:i%3?'청산 이유':'',emo:{pre:i?[E[i%5]]:[],mid:[],post:[]},grade:'',riskPlan:{target:px+s*4},
   chartNotes:i<2?[{id:'n1'+i,kind:'note',ts:t0+0.5*H,px:px+0.4,text:'메모',at:1},{id:'n2'+i,kind:'hline',ts:null,px:px+1,text:'저항',at:2}]:[],
   entries:[ev(id+'e0',t0,6,px),ev(id+'e1',t0+0.4*H,3,px+0.1*s),ev(id+'e2',t0+0.8*H,3,px+0.2*s)],
   fills:[ev(id+'f0',t0+1.4*H,4,x,'f'+i+'a'),ev(id+'f1',t0+1.9*H,4,x,'f'+i+'b'),ev(id+'f2',t0+2.4*H,4,x,'f'+i+'c')],funding:[],images:[]});};
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10});state.trades=Array.from({length:N},(_,i)=>mk(i));await persist();setPage('dashboard');renderAll();return state.trades.length;};
const CH=[['pre','[data-v71="pre"][data-v71-val="확신"]'],['grade','[data-v71="grade"][data-v71-val="C"]'],['react','[data-v92="react"]'],['tfIn','[data-v92="tfIn"][data-v92-val="1h"]'],['tfOut','[data-v92="tfOut"][data-v92-val="4h"]'],
 ['setup','[data-v63-set="setup"][data-v63-val="EP"]'],['conf','[data-v63-set="conf"][data-v63-val="4"]'],['cond','[data-v63-set="cond"][data-v63-val="좋음"]'],['mid','[data-v71="mid"][data-v71-val="인내"]'],['post','[data-v71="post"][data-v71-val="만족"]']];
const FIELDS=t=>({react:!!t.react,tfIn:t.tfIn||'',tfOut:t.tfOut||'',setup:t.setup,conf:t.conf??null,cond:t.cond||'',grade:t.grade||'',emo:{pre:[...(t.emo?.pre||[])].sort(),mid:[...(t.emo?.mid||[])].sort(),post:[...(t.emo?.post||[])].sort()},stopNote:t.stopNote||''});
const UI=()=>{const on=s=>[...document.querySelectorAll(s)].filter(b=>b.classList.contains('on'));const v=(s,a)=>{const b=on(s)[0];return b?b.dataset[a]:''};
 return {react:on('[data-v92="react"]').length===1,tfIn:v('[data-v92="tfIn"]','v92Val'),tfOut:v('[data-v92="tfOut"]','v92Val'),setup:v('[data-v63-set="setup"]','v63Val'),conf:(x=>x?Number(x):null)(v('[data-v63-set="conf"]','v63Val')),cond:v('[data-v63-set="cond"]','v63Val'),grade:v('[data-v71="grade"]','v71Val'),
  emo:{pre:on('[data-v71="pre"]').map(b=>b.dataset.v71Val).sort(),mid:on('[data-v71="mid"]').map(b=>b.dataset.v71Val).sort(),post:on('[data-v71="post"]').map(b=>b.dataset.v71Val).sort()},stopNote:(document.querySelector('[data-v71-area="stopNote"]')||{}).value||''};};
async function arm(P,sel){return P.evaluate(sel=>{const q=()=>document.querySelector(sel),el0=q();if(!el0)return false;const on0=el0.classList.contains('on');window.__m={at:null,fr:null};
 const mo=new MutationObserver(()=>{const e=q();if(!__m.at&&e&&e.classList.contains('on')!==on0){__m.at=performance.now();requestAnimationFrame(()=>{__m.fr=performance.now();});mo.disconnect();}});
 mo.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});return true;},sel);}
const readM=(P,win)=>P.evaluate(win=>{const pd=__pd[__pd.length-1]||0,lt=__lt.filter(x=>x.s>=pd-2&&x.s<pd+win);return {fr:__m.fr?+(__m.fr-pd).toFixed(1):null,lt80:lt.filter(x=>x.d>=80).length,ltMax:+(lt.length?Math.max(...lt.map(x=>x.d)):0).toFixed(0)};},win);
async function mclick(P,sel){await P.locator(sel).first().scrollIntoViewIfNeeded();const b=await P.locator(sel).first().boundingBox();await P.mouse.click(b.x+b.width/2,b.y+b.height/2);}
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/';
 for(const W of [1440,390]){const r={};out['w'+W]=r;
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,timezoneId:'Asia/Seoul',locale:'ko-KR'});await ctx.addInitScript(init);
  const P=await ctx.newPage();P.on('pageerror',e=>out.errors.push(W+' '+e.message));await P.goto(URL0+'?journal=hyperliquid');await P.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await P.waitForTimeout(1200);
  r.n=await P.evaluate(seedHL,320);await P.waitForTimeout(1500);
  const tid=await P.evaluate(()=>{const c=state.trades.filter(t=>calcTrade(t).done).sort((a,b)=>b.at-a.at)[0];return c.id;});r.tid=tid;
  await P.evaluate(id=>openTrade(id,'review'),tid);await P.waitForTimeout(2500);
  r.detail=await P.evaluate(()=>({chart:!!document.querySelector('#tradeDialog svg'),v92:!!$('v92Box'),v63:!!$('v63Card'),v71:!!$('v71Card')}));
  const fr0=await P.evaluate(()=>(window.v100Debug?v100Debug():{fullRender:-1,dirty:null,pending:-1}).fullRender);
  // (1) 칩 10종: 같은 작업 안에서 class·값 반영
  r.sync={};for(const [k,sel] of CH){r.sync[k]=await P.evaluate(async([sel,id])=>{const el=document.querySelector(sel);if(!el)return 'missing';const t=state.trades.find(x=>x.id===id),before=JSON.stringify(t),on=el.classList.contains('on');
    el.click();const ok=el.classList.contains('on')!==on&&JSON.stringify(t)!==before;await new Promise(res=>requestAnimationFrame(res));return ok;},[sel,tid]);}
  await P.waitForTimeout(900);
  // (2) 실제 마우스
  r.mouse=[];for(const sel of ['[data-v92="react"]','[data-v63-set="conf"][data-v63-val="2"]','[data-v71="grade"][data-v71-val="B"]','[data-v92="tfIn"][data-v92-val="4h"]']){
   await P.locator(sel).first().scrollIntoViewIfNeeded();await P.waitForTimeout(300);await arm(P,sel);await mclick(P,sel);await P.waitForTimeout(350);r.mouse.push(await readM(P,350));await P.waitForTimeout(700);}
  r.frameOk=r.mouse.every(x=>x.fr!==null&&x.fr<50);r.lt80=r.mouse.reduce((s,x)=>s+x.lt80,0);
  // (3) 저장 중에도 5연타
  await P.waitForTimeout(800);await P.evaluate(()=>{publicBusy++;document.querySelectorAll('.toast,#toast').forEach(t=>t.textContent='');});
  const react0=await P.evaluate(id=>!!state.trades.find(x=>x.id===id).react,tid);
  for(let i=0;i<5;i++){await mclick(P,'[data-v92="react"]');await P.waitForTimeout(80);}
  for(const v of ['ltf','1h','4h','1d','1h']){await mclick(P,`[data-v92="tfIn"][data-v92-val="${v}"]`);await P.waitForTimeout(80);}
  r.busy={react:(await P.evaluate(id=>!!state.trades.find(x=>x.id===id).react,tid))!==react0,uiReact:(await P.evaluate(()=>document.querySelector('[data-v92="react"]').classList.contains('on')))!==react0,
   tfIn:await P.evaluate(id=>state.trades.find(x=>x.id===id).tfIn,tid),toast:await P.evaluate(()=>/다시 시도/.test([...document.querySelectorAll('.toast,#toast')].map(x=>x.textContent).join('|')))};
  // (4) 메모 칸: 잠금 중 타이핑
  await P.locator('[data-v71-area="stopNote"]').scrollIntoViewIfNeeded();await P.click('[data-v71-area="stopNote"]');await P.keyboard.type('직전 저점 아래 ABC',{delay:20});
  r.typed=await P.evaluate(()=>document.querySelector('[data-v71-area="stopNote"]').value);
  await P.evaluate(()=>{publicBusy--;});await P.click('#tradeDialog .v71-card .v63-head b');await P.waitForTimeout(1600);
  r.check=await P.evaluate(id=>{const t=state.trades.find(x=>x.id===id),ch=v92Checks(t);return {n:$('v92Box').querySelector('.v92-n').textContent,want:ch.filter(x=>x.ok).length+'/'+ch.length,stopLi:[...$('v92Box').querySelectorAll('.v92-list li.ok')].some(li=>/스탑 이유/.test(li.textContent))};},tid);
  r.score=await P.evaluate(id=>{const t=state.trades.find(x=>x.id===id);return {ui:parseInt($('v63Card').querySelector('.v63-score').textContent),want:v63Score(t).score};},tid);
  // 저장본 = state = 화면
  r.state=await P.evaluate(([id,F])=>(new Function('return '+F))()(state.trades.find(x=>x.id===id)),[tid,FIELDS.toString()]);
  r.saved=await P.evaluate(async([id,F])=>{const s=await v83Read();return (new Function('return '+F))()(s.trades.find(x=>x.id===id));},[tid,FIELDS.toString()]);
  r.ui=await P.evaluate(F=>(new Function('return '+F))()(),UI.toString());
  r.match={savedState:JSON.stringify(r.saved)===JSON.stringify(r.state),uiState:JSON.stringify(r.ui)===JSON.stringify(r.state)};
  // 스크롤 튐
  r.scroll=await P.evaluate(async()=>{const d=$('tradeDialog'),el=document.querySelector('[data-v92="tfOut"][data-v92-val="ltf"]');el.scrollIntoView({block:'center'});const y0=d.scrollTop,r0=el.getBoundingClientRect().top;el.click();await new Promise(res=>setTimeout(res,1500));const e2=document.querySelector('[data-v92="tfOut"][data-v92-val="ltf"]');return Math.abs(d.scrollTop-y0)+Math.abs(Math.round(e2.getBoundingClientRect().top-r0));});
  // (5) 창 열린 동안 renderAll 0 → 닫으면 한 번
  r.renderWhileOpen=(await P.evaluate(()=>(window.v100Debug?v100Debug():{fullRender:-1,dirty:null,pending:-1}).fullRender))-fr0;
  await P.evaluate(()=>$('tradeDialog').close());await P.waitForTimeout(2200);r.renderAfterClose=(await P.evaluate(()=>(window.v100Debug?v100Debug():{fullRender:-1,dirty:null,pending:-1})))
  r.renderAfterClose={full:r.renderAfterClose.fullRender-fr0>=1,dirty:r.renderAfterClose.dirty,pending:r.renderAfterClose.pending};
  r.over=await P.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  // 새로고침 뒤 유지
  const want=await P.evaluate(([id,F])=>(new Function('return '+F))()(state.trades.find(x=>x.id===id)),[tid,FIELDS.toString()]);r.savedFinal=JSON.stringify(await P.evaluate(async([id,F])=>{const s=await v83Read();return (new Function('return '+F))()(s.trades.find(x=>x.id===id));},[tid,FIELDS.toString()]))===JSON.stringify(want);await P.reload();await P.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await P.waitForTimeout(1500);
  await P.evaluate(id=>openTrade(id,'review'),tid);await P.waitForTimeout(1500);
  r.reload=JSON.stringify(await P.evaluate(F=>(new Function('return '+F))()(),UI.toString()))===JSON.stringify(want);
  await P.locator('#tradeDialog .v92-box').screenshot({path:path.join(outDir,'v92box-'+W+'.png')}).catch(e=>{r.shotErr=e.message;});
  // 정리: 검사 값 축약
  r.stateSum=JSON.stringify({react:want.react,tfIn:want.tfIn,tfOut:want.tfOut,setup:want.setup,conf:want.conf,cond:want.cond,grade:want.grade,emo:want.emo,stopNote:want.stopNote});
  delete r.state;delete r.saved;delete r.ui;await ctx.close();}
 // US: v99 진입 이유 칩
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,timezoneId:'Asia/Seoul',locale:'ko-KR'});await ctx.addInitScript(init);const U=await ctx.newPage();U.on('pageerror',e=>out.errors.push('US '+e.message));
  await U.goto(URL0+'?journal=us');await U.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await U.waitForTimeout(1000);
  await U.evaluate(async N=>{const ev=(id,date,time,sh,px)=>({id,date,time,shares:sh,price:px,fee:0,seq:Date.parse(date+'T'+time+'Z')/1000});const nm=['AAPL','TSLA','NVDA','MSFT','META'],T=[],base=Date.parse('2026-10-30T00:00:00Z');
   for(let i=0;i<N;i++){const d=new Date(base-Math.floor(i/4)*864e5).toISOString().slice(0,10),hh=9+(i%4)*1.5,h=String(Math.floor(hh)).padStart(2,'0'),m=hh%1?'30':'00',loss=i%2===0;
    T.push(normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:'u'+i,at:Date.parse(d+'T'+h+':'+m+':00Z'),name:nm[i%5],direction:'long',date:d,stop:98,stop0:98,initialRisk:20,riskR:1,setup:'미분류',process:'compliant',review:'',violations:[],
     entries:[ev('u'+i+'e',d,h+':'+m+':00',10,100)],fills:[ev('u'+i+'f',d,h+':'+(m==='00'?'20':'50')+':00',10,loss?97:103)],funding:[],images:[]}));}
   Object.assign(state.settings,{account:10000});state.trades=T;await persist();setPage('records');renderAll();},120);
  await U.waitForTimeout(1500);const d0=await U.evaluate(()=>(window.v100Debug?v100Debug():{fullRender:-1,dirty:null,pending:-1}));
  const us={};us.chip=await U.evaluate(async()=>{const el=document.querySelector('[data-v99why="strong"]');if(!el)return 'missing';const id=el.dataset.v99Id,t=state.trades.find(x=>x.id===id);el.click();const ok=el.classList.contains('on')&&t.v99Why==='strong';return {ok,id};});
  await U.waitForTimeout(3500);const d1=await U.evaluate(()=>(window.v100Debug?v100Debug():{fullRender:-1,dirty:null,pending:-1}));
  us.saved=await U.evaluate(async id=>{const s=await v83Read();return s.trades.find(x=>x.id===id).v99Why;},us.chip.id);
  us.proc=await U.evaluate(id=>processOf(state.trades.find(x=>x.id===id)),us.chip.id);
  us.recordsOnly=(d1.records||0)>(d0.records||0)&&d1.fullRender===d0.fullRender&&d1.dirty===true;
  us.badge=await U.evaluate(id=>[...document.querySelectorAll(`#recordList .v99-line[data-v99-trade="${id}"] [data-v99-code="switch"]`)].filter(e=>e.getClientRects().length).map(e=>e.textContent)[0]||null,us.chip.id);
  us.chip=us.chip.ok;out.US=us;await ctx.close();}
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
