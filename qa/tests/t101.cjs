/* v101 매매일지 저장 유실 QA — 모의 HL 거래 40건, 최근 종료 거래 상세 복기 탭.
   칩 6종(가격 반응·진입 TF·셋업·확신도·감정 전·사후 등급) + 텍스트칸 5종(진입 근거·스탑 이유·보유 중 생각·청산 이유·사후 메모)마다
   입력 → 0.1초 뒤 아래 동작 → 값이 state·저장본(IndexedDB/localStorage = v83Read)·다시 연 화면에 남는지.
   close(닫기 버튼 마우스) · esc(Esc) · switch(다른 거래 열기) · reload(새로고침, 텍스트는 포커스 그대로) · hide(visibilitychange hidden + pagehide, 0.15초 안 저장본 확인)
   peer(다른 창이 다른 거래를 저장 → BroadcastChannel 병합) · pull(원격 반영: HL 동기화처럼 state 교체 + renderAll + v83Pull)
   추가: 저장 실패 시 알림·재시도 후 저장, 입력 중 다시 그리기(renderDetail·v63PaintDetail)에도 입력값 유지. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
  if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5}[b.req.interval]||36e5,out=[];let p=100;
   for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<300;t+=iv,i++){const o2=p,c=p+Math.sin(i/2.3)*0.9;out.push({t,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.5),l:String(Math.min(o2,c)-0.5),v:'1000'});p=c;}return J(out);}
  if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}return J({message:'not found'},404);};};
const seedHL=async N=>{const now=Date.now(),H=3600e3;
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.12,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=i=>{const t0=now-3*H-i*13*H,px=100+(i%11)-5,dir=i%4?'long':'short',s=dir==='long'?1:-1,x=px+s*(i%3?3:-1.5),id='p'+i;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:t0,name:['ETH','BTC','SOL','HYPE'][i%4],direction:dir,date:new Date(t0).toISOString().slice(0,10),stop:px-s*1.5,stop0:px-s*1.5,initialRisk:22.5,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'',violations:[],
   entryNote:'',holdNote:'',exitNote:'',emo:{pre:[],mid:[],post:[]},grade:'',riskPlan:{target:px+s*4},chartNotes:[],
   entries:[ev(id+'e0',t0,6,px)],fills:[ev(id+'f0',t0+1.4*H,6,x,'f'+i+'a')],funding:[],images:[]});};
 Object.assign(state.settings,{account:10000});state.trades=Array.from({length:N},(_,i)=>mk(i));await persist();setPage('dashboard');renderAll();return state.trades.length;};
/* 필드: [이름, 종류, 선택자, 기대값] */
const CHIPS=[['react','[data-v92="react"]',true],['tfIn','[data-v92="tfIn"][data-v92-val="1h"]','1h'],['setup','[data-v63-set="setup"][data-v63-val="EP"]','EP'],['conf','[data-v63-set="conf"][data-v63-val="4"]',4],['pre','[data-v71="pre"][data-v71-val="확신"]',['확신']],['grade','[data-v71="grade"][data-v71-val="B"]','B']];
const TEXTS=['entryNote','stopNote','holdNote','exitNote','postEval'];
const ACTS=(process.env.T101_ACTS||'close,esc,switch').split(',');
const getV=(t,k)=>k==='pre'?[...((t.emo||{}).pre||[])]:k==='react'?!!t.react:k==='conf'?(t.conf??null):(t[k]??'');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[],res:{},bad:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,timezoneId:'Asia/Seoul',locale:'ko-KR'});await ctx.addInitScript(init);
 const P=await ctx.newPage();P.on('pageerror',e=>out.errors.push(e.message));
 const ready=async pg=>{await pg.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await pg.waitForTimeout(700);};
 await P.goto(URL0);await ready(P);await P.evaluate(seedHL,40);await P.waitForTimeout(800);
 const P2=await ctx.newPage();P2.on('pageerror',e=>out.errors.push('P2 '+e.message));await P2.goto(URL0);await ready(P2);
 const open=async(id)=>{await P.evaluate(id=>{openTrade(id,'review');},id);await P.waitForFunction(()=>!!document.querySelector('#tradeDialog[open] [data-v71-area="entryNote"]'),null,{timeout:15000});await P.waitForTimeout(250);};
 const read=async(id,k,G)=>P.evaluate(async([id,k,G])=>{const g=(new Function('return '+G))();const t=state.trades.find(x=>x.id===id);const s=await v83Read();const st=s&&s.trades.find(x=>x.id===id);
   let ls=null;try{const l=JSON.parse(localStorage.getItem(KEY)||'null');const lt=l&&l.trades.find(x=>x.id===id);ls=lt?g(lt,k):null;}catch{}return {state:t?g(t,k):'NO',saved:st?g(st,k):'NO'};},[id,k,G]);
 const uiVal=async(k)=>P.evaluate(k=>{const ta=document.querySelector(`#tradeDialog [data-v71-area="${k}"]`);if(ta)return ta.value;
   const on=s=>[...document.querySelectorAll('#tradeDialog '+s)].filter(b=>b.classList.contains('on'));
   if(k==='react')return on('[data-v92="react"]').length===1;if(k==='tfIn')return (on('[data-v92="tfIn"]')[0]||{dataset:{}}).dataset.v92Val||'';
   if(k==='setup')return (on('[data-v63-set="setup"]')[0]||{dataset:{}}).dataset.v63Val||'';if(k==='conf'){const b=on('[data-v63-set="conf"]')[0];return b?Number(b.dataset.v63Val):null;}
   if(k==='pre')return on('[data-v71="pre"]').map(b=>b.dataset.v71Val);if(k==='grade')return (on('[data-v71="grade"]')[0]||{dataset:{}}).dataset.v71Val||'';return 'NO';},k);
 const ids=await P.evaluate(()=>state.trades.map(t=>t.id));let ti=0;
 const fields=[...CHIPS.map(([k,sel,want])=>({k,sel,want,chip:true})),...TEXTS.map(k=>({k,chip:false}))];
 for(const act of ACTS)for(const f of fields){const id=ids[ti++%ids.length],other=ids[(ti+17)%ids.length],key=act+'.'+f.k;
  try{await open(id);
   const want=f.chip?f.want:'메모 '+act+' '+f.k+' 가나다';
   if(f.chip){await P.locator('#tradeDialog '+f.sel).first().scrollIntoViewIfNeeded();const b=await P.locator('#tradeDialog '+f.sel).first().boundingBox();await P.mouse.click(b.x+b.width/2,b.y+b.height/2);}
   else{const L=P.locator(`#tradeDialog [data-v71-area="${f.k}"]`);await L.scrollIntoViewIfNeeded();await L.click();await P.keyboard.type(want,{delay:0});}
   await P.waitForTimeout(100);
   let early=null;
   if(act==='close'){const b=await P.locator('#tradeDialog [data-close="tradeDialog"]').boundingBox();await P.mouse.click(b.x+b.width/2,b.y+b.height/2);}
   else if(act==='esc'){await P.keyboard.press('Escape');}
   else if(act==='switch'){await P.evaluate(o=>openTrade(o,'review'),other);}
   else if(act==='reload'){await P.reload();await ready(P);}
   else if(act==='kill'){await P.evaluate(()=>{writeSnapshot=()=>new Promise(()=>{});});await P.reload();await ready(P);}
   else if(act==='hide'){await P.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
    await P.waitForTimeout(150);early=await read(id,f.k,getV.toString());
    await P.evaluate(()=>{delete document.visibilityState;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});}
   else if(act==='peer'){await P2.evaluate(async o=>{const s=await v83Read();lastSaved=Math.max(lastSaved,s.updatedAt||0);state=s;state.trades=s.trades.map(normaliseTrade);const t=state.trades.find(x=>x.id===o);t.review='다른 창 '+Date.now();touch(t);await persist();},other);}
   else if(act==='pull'){await P.evaluate(async()=>{const s=await v83Read();const next={...clone(state),...clone(s),trades:clone(s.trades).map(normaliseTrade)};await commitExchangeState(next);renderAll();try{renderDetail();}catch{}v83Pull(0);});}
   await P.waitForTimeout(900);
   if(act==='reload'||act==='kill')out['rec_'+act]=(out['rec_'+act]||0)+await P.evaluate(()=>window.v101Debug?v101Debug().recovered:0);
   if(await P.evaluate(()=>document.activeElement&&document.activeElement.tagName==='TEXTAREA'))await P.evaluate(()=>document.activeElement.blur());
   await P.waitForTimeout(400);
   const r=await read(id,f.k,getV.toString());
   await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();});await P.waitForTimeout(150);await open(id);const ui=await uiVal(f.k);
   const W=JSON.stringify(want),ok={state:JSON.stringify(r.state)===W,saved:JSON.stringify(r.saved)===W,ui:JSON.stringify(ui)===W};if(early)ok.early=JSON.stringify(early.saved)===W;
   out.res[key]=ok;if(!Object.values(ok).every(Boolean))out.bad.push(key+' '+JSON.stringify({ok,state:r.state,saved:r.saved,ui}));
  }catch(e){out.res[key]={err:String(e.message).slice(0,120)};out.bad.push(key+' ERR '+String(e.message).slice(0,160));}
  await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();}).catch(()=>{});await P.waitForTimeout(100);}
 const EXTRA=process.env.T101_EXTRA!=='0';
 if(EXTRA){
 /* 입력 중 다시 그리기: 텍스트칸 타이핑 도중 renderDetail·v63PaintDetail → 입력값·포커스 유지 */
 {const id=ids[5];await open(id);const L=P.locator('#tradeDialog [data-v71-area="holdNote"]');await L.scrollIntoViewIfNeeded();await L.click();await P.keyboard.type('입력 중 다시 그리기',{delay:0});
  await P.evaluate(()=>{renderDetail();v63PaintDetail();});await P.keyboard.type(' 끝',{delay:0});
  out.repaint=await P.evaluate(()=>{const a=document.activeElement;return {val:(document.querySelector('#tradeDialog [data-v71-area="holdNote"]')||{}).value,focus:!!(a&&a.dataset&&a.dataset.v71Area==='holdNote')};});
  await P.evaluate(()=>document.activeElement.blur());await P.waitForTimeout(1500);out.repaintSaved=(await read(id,'holdNote',getV.toString())).saved;await P.evaluate(()=>$('tradeDialog').close());}
 /* 저장 실패 → 알림 + 재시도 → 결국 저장 */
 {const id=ids[6];await open(id);out.failRetry=await P.evaluate(async id=>{const ws=writeSnapshot;let n=0;writeSnapshot=async s=>{if(n++<2)throw Error('모의 실패');return ws(s);};
   const toasts=[];const tw=toast;toast=m=>{toasts.push(m);return tw(m);};
   const el=document.querySelector('#tradeDialog [data-v92="react"]');el.click();await new Promise(r=>setTimeout(r,6000));writeSnapshot=ws;toast=tw;
   const s=await v83Read();return {toast:toasts.some(m=>/저장 실패|다시 저장|재시도/.test(m)),state:!!state.trades.find(x=>x.id===id).react,saved:!!(s.trades.find(x=>x.id===id)||{}).react,tries:n};},id);
  await P.evaluate(()=>$('tradeDialog').close());}}
 out.n=Object.keys(out.res).length;out.okN=Object.values(out.res).filter(o=>!o.err&&Object.values(o).every(Boolean)).length;
 out.over=await P.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
