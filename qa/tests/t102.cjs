/* v102 '복기 저장'이 매매일지 글을 지우던 버그 QA — 모의 HL 거래 40건, 종료 거래 상세 복기 탭.
   각 시나리오: 일지 칸(글칸 5종·칩) 입력 → (칸 밖 안 누름 / 칸 밖 누름 / 칩) → 다른 저장 폼 제출 → state·저장본(v83Read)·다시 연 화면·새로고침 뒤 값 확인.
   review_*: '복기 저장' 버튼(마우스) · plan: 계획 정정 폼 · basis: 초기 위험 정정 폼 · stop: 스탑 변경 창 · pyr: v63Set 경로
   own: 복기 폼 자체 값(평가·위반 체크·한 문장·셋업 선택·진입근거 정정 칸)도 저장 · swap: 상세가 열린 채 state 교체(동기화) 뒤 복기 저장
   fail: 계획 정정 저장 1번 실패(restoreRecord) → 그 사이 쓴 일지 유지. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http');
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
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:t0,name:['ETH','BTC','SOL','HYPE'][i%4],direction:dir,date:new Date(t0).toISOString().slice(0,10),stop:px-s*1.5,stop0:px-s*1.5,initialRisk:22.5,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entryNote:'옛 진입 근거',holdNote:'',exitNote:'',emo:{pre:[],mid:[],post:[]},grade:'',riskPlan:{target:px+s*4},chartNotes:[],
   entries:[ev(id+'e0',t0,6,px)],fills:[ev(id+'f0',t0+1.4*H,6,x,'f'+i+'a')],funding:[],images:[]});};
 Object.assign(state.settings,{account:10000});state.trades=Array.from({length:N},(_,i)=>mk(i));await persist();setPage('dashboard');renderAll();return state.trades.length;};
const G=(t,k)=>k==='pre'?[...((t.emo||{}).pre||[])]:k==='react'?!!t.react:k==='conf'?(t.conf??null):k==='violations'?[...(t.violations||[])].sort():(t[k]??'');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[],res:{},bad:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,timezoneId:'Asia/Seoul',locale:'ko-KR'});await ctx.addInitScript(init);
 const P=await ctx.newPage();P.on('pageerror',e=>out.errors.push(e.message));
 const ready=async()=>{await P.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await P.waitForTimeout(700);};
 await P.goto(URL0);await ready();await P.evaluate(seedHL,40);await P.waitForTimeout(800);
 const open=async(id)=>{await P.evaluate(id=>{const d=$('tradeDialog');if(d.open)d.close();openTrade(id,'review');},id);await P.waitForFunction(()=>!!document.querySelector('#tradeDialog[open] [data-v71-area="entryNote"]')&&!!document.querySelector('#tradeDialog #reviewForm'),null,{timeout:15000});await P.waitForTimeout(250);};
 const read=(id,keys)=>P.evaluate(async([id,keys,Gs])=>{const g=(new Function('return '+Gs))();const t=state.trades.find(x=>x.id===id);const s=await v83Read();const st=s&&s.trades.find(x=>x.id===id);
   const o={};for(const k of keys)o[k]={state:t?g(t,k):'NO',saved:st?g(st,k):'NO'};return o;},[id,keys,G.toString()]);
 const ui=(keys)=>P.evaluate(keys=>{const o={};const on=s=>[...document.querySelectorAll('#tradeDialog '+s)].filter(b=>b.classList.contains('on'));const f=$('reviewForm');
   for(const k of keys){const ta=document.querySelector(`#tradeDialog #v71Card [data-v71-area="${k}"]`)||document.querySelector(`#tradeDialog [data-v71-area="${k}"]`);
    if(k==='react')o[k]=on('[data-v92="react"]').length===1;else if(k==='setup')o[k]=(on('[data-v63-set="setup"]')[0]||{dataset:{}}).dataset.v63Val||'';
    else if(k==='conf'){const b=on('[data-v63-set="conf"]')[0];o[k]=b?Number(b.dataset.v63Val):null;}
    else if(k==='pre')o[k]=on('[data-v71="pre"]').map(b=>b.dataset.v71Val);else if(k==='grade')o[k]=(on('[data-v71="grade"]')[0]||{dataset:{}}).dataset.v71Val||'';
    else if(k==='regime')o[k]=f.elements.regime.value;else if(k==='pyrNotes'){const t=state.trades.find(x=>x.id===selectedId);o[k]=t.pyrNotes||null;}
    else if(k==='process')o[k]=(f.querySelector('input[name="process"]:checked')||{}).value||'';else if(k==='review')o[k]=f.elements.review.value;
    else if(k==='violations')o[k]=[...f.querySelectorAll('input[name="violation"]:checked')].map(x=>x.value).sort();
    else if(ta)o[k]=ta.value;else o[k]='NO';}return o;},keys);
 const click=async sel=>{const L=P.locator(sel).first();await L.scrollIntoViewIfNeeded();const b=await L.boundingBox();await P.mouse.click(b.x+b.width/2,b.y+b.height/2);};
 const type=async(k,txt)=>{const L=P.locator(`#tradeDialog #v71Card [data-v71-area="${k}"]`);await L.scrollIntoViewIfNeeded();await L.click();await P.keyboard.press('ControlOrMeta+a');await P.keyboard.type(txt,{delay:0});};
 const blur=async()=>{await click('#tradeDialog #v71Card .v63-head');};
 const reviewSave=async()=>{await click('#tradeDialog #reviewForm button[type="submit"]');};
 const chip={react:'[data-v92="react"]',setup:'[data-v63-set="setup"][data-v63-val="EP"]',conf:'[data-v63-set="conf"][data-v63-val="4"]',pre:'[data-v71="pre"][data-v71-val="확신"]',grade:'[data-v71="grade"][data-v71-val="B"]'};
 const chipWant={react:true,setup:'EP',conf:4,pre:['확신'],grade:'B'};
 const ids=await P.evaluate(()=>state.trades.map(t=>t.id));let ti=0;const later=[];
 /* 판정: 동작 뒤 1.2초 → state·저장본·다시 연 화면 */
 const verify=async(key,id,want)=>{await P.waitForTimeout(1200);const keys=Object.keys(want),r=await read(id,keys);await open(id);const u=await ui(keys);
  const ok={};const bad=[];for(const k of keys){const W=JSON.stringify(want[k]);const o={state:JSON.stringify(r[k].state)===W,saved:JSON.stringify(r[k].saved)===W,ui:JSON.stringify(u[k])===W};ok[k]=Object.values(o).every(Boolean);if(!ok[k])bad.push(k+' '+JSON.stringify({o,state:r[k].state,saved:r[k].saved,ui:u[k]}));}
  out.res[key]=ok;if(bad.length)out.bad.push(key+': '+bad.join(' | '));later.push([key,id,want]);
  await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();});await P.waitForTimeout(150);};
 const TEXTS=['entryNote','stopNote','holdNote','exitNote','postEval'];
 const scen=async(key,fn)=>{try{await fn();}catch(e){out.res[key]={err:String(e.message).slice(0,140)};out.bad.push(key+' ERR '+String(e.message).slice(0,200));await P.evaluate(()=>{for(const d of ['tradeDialog','actionDialog']){const x=$(d);if(x&&x.open)x.close();}}).catch(()=>{});}};
 /* 1) 글칸 5종 × 칸 밖 안 누르고 바로 '복기 저장' / 칸 밖 누른 뒤 '복기 저장' */
 for(const mode of ['direct','blur'])for(const k of TEXTS)await scen('review_'+mode+'.'+k,async()=>{const id=ids[ti++];await open(id);const want='글 '+mode+' '+k+' 유지';await type(k,want);if(mode==='blur'){await blur();await P.waitForTimeout(300);}
  await P.waitForTimeout(100);await reviewSave();await verify('review_'+mode+'.'+k,id,{[k]:want});});
 /* 2) 칩 → '복기 저장' */
 for(const k of Object.keys(chip))await scen('review_chip.'+k,async()=>{const id=ids[ti++];await open(id);await click('#tradeDialog '+chip[k]);await P.waitForTimeout(100);await reviewSave();await verify('review_chip.'+k,id,{[k]:chipWant[k]});});
 /* 3) 한 번에 전부 입력(칩 5 + 글 5) → '복기 저장' */
 await scen('review_all',async()=>{const id=ids[ti++];await open(id);const want={};for(const k of Object.keys(chip)){await click('#tradeDialog '+chip[k]);want[k]=chipWant[k];}
  for(const k of TEXTS){want[k]='전부 '+k;await type(k,want[k]);}await reviewSave();await verify('review_all',id,want);});
 /* 4) 복기 폼 자체 값 + 일지 글 같이 */
 await scen('own',async()=>{const id=ids[ti++];await open(id);await type('entryNote','왜 샀나 최신');await type('exitNote','청산 이유 최신');
  await P.evaluate(()=>{document.querySelector('#reviewForm input[name="process"][value="violation"]').click();const cb=document.querySelector('#reviewForm input[name="violation"]');cb.checked=true;});
  const v0=await P.evaluate(()=>document.querySelector('#reviewForm input[name="violation"]').value);
  const L=P.locator('#tradeDialog #reviewForm textarea[name="review"]');await L.scrollIntoViewIfNeeded();await L.click();await P.keyboard.type('다음엔 손절 먼저',{delay:0});
  await reviewSave();await verify('own',id,{entryNote:'왜 샀나 최신',exitNote:'청산 이유 최신',process:'violation',violations:[v0],review:'다음엔 손절 먼저'});});
 /* 5) 접힘 '진입근거 정정' 칸 ↔ '왜 샀나' 칸 동기화(마지막 편집이 이김) */
 await scen('fold',async()=>{const id=ids[ti++];await open(id);await type('entryNote','왜 샀나 먼저');
  out.foldSynced=await P.evaluate(()=>document.querySelector('#reviewForm textarea[name="entryNote"]').value);
  await P.evaluate(()=>{document.querySelector('#reviewForm details.fold').open=true;});const L=P.locator('#tradeDialog #reviewForm textarea[name="entryNote"]');await L.scrollIntoViewIfNeeded();await L.click();await P.keyboard.press('ControlOrMeta+a');await P.keyboard.type('정정 칸 나중',{delay:0});
  out.cardSynced=await P.evaluate(()=>document.querySelector('#v71Card [data-v71-area="entryNote"]').value);
  await P.selectOption('#tradeDialog #reviewForm select[name="regime"]',{index:1});const reg=await P.evaluate(()=>document.querySelector('#reviewForm select[name="regime"]').value);
  await reviewSave();await verify('fold',id,{entryNote:'정정 칸 나중',regime:reg});});
 /* 6) 셋업 칩 뒤 폼 셋업 선택(최신 편집 우선) */
 await scen('setupLast',async()=>{const id=ids[ti++];await open(id);await click('#tradeDialog '+chip.setup);await P.waitForTimeout(100);
  out.selSynced=await P.evaluate(()=>document.querySelector('#reviewForm select[name="setup"]').value);
  await P.evaluate(()=>{document.querySelector('#reviewForm details.fold').open=true;});const opt=await P.evaluate(()=>[...document.querySelector('#reviewForm select[name="setup"]').options].map(o=>o.value).find(v=>v&&v!=='EP'&&v!=='미분류'));
  await P.selectOption('#tradeDialog #reviewForm select[name="setup"]',opt);await type('holdNote','셋업 바꾼 뒤 메모');await reviewSave();await verify('setupLast',id,{setup:opt,holdNote:'셋업 바꾼 뒤 메모'});});
 /* 7) 다른 저장 폼: 계획 정정 · 초기 위험 정정 · 스탑 변경 · 추매 사유(v63Set) */
 await scen('plan',async()=>{const id=ids[ti++];await open(id);await type('holdNote','계획 정정 전 메모');await type('entryNote','계획 정정 전 진입');
  await P.evaluate(()=>{const f=$('planForm');f.closest('details').open=true;f.elements.reason.value='정정 테스트';f.elements.stop.value='새 손절 계획';});await click('#tradeDialog #planForm button[type="submit"]');
  await verify('plan',id,{holdNote:'계획 정정 전 메모',entryNote:'계획 정정 전 진입'});});
 await scen('basis',async()=>{const id=ids[ti++];await open(id);await type('postEval','기준값 정정 전 평가');
  await P.evaluate(()=>{const f=$('basisForm');f.closest('details').open=true;f.elements.initialRisk.value='30';});await click('#tradeDialog #basisForm button[type="submit"]');
  await verify('basis',id,{postEval:'기준값 정정 전 평가'});});
 await scen('stop',async()=>{const id=ids[ti++];await open(id);await type('exitNote','스탑 변경 전 청산 메모');
  await P.evaluate(()=>openAction('stop'));await P.waitForSelector('#actionDialog[open] #stopForm');await P.evaluate(()=>{$('stopForm').elements.stop.value='90';});
  await click('#actionDialog #stopForm button[type="submit"]');await P.waitForTimeout(400);await verify('stop',id,{exitNote:'스탑 변경 전 청산 메모'});});
 await scen('pyr',async()=>{const id=ids[ti++];await open(id);await type('stopNote','추매 사유 전 스탑 이유');await P.evaluate(id=>v63Set(id,{pyrNotes:{k1:'추매 이유'}}),id);
  await reviewSave();await verify('pyr',id,{stopNote:'추매 사유 전 스탑 이유',pyrNotes:{k1:'추매 이유'}});});
 /* 8) 상세가 열린 채 state 교체(동기화 병합처럼) → 일지 입력 → 복기 저장 / 계획 정정 */
 await scen('swap',async()=>{const id=ids[ti++];await open(id);
  await P.evaluate(async()=>{const s=await v83Read();const next={...clone(state),...clone(s),trades:clone(s.trades).map(normaliseTrade)};await commitExchangeState(next);});
  await type('entryNote','교체 뒤 진입 이유');const L=P.locator('#tradeDialog #reviewForm textarea[name="review"]');await L.scrollIntoViewIfNeeded();await L.click();await P.keyboard.type('교체 뒤 한 문장',{delay:0});
  await reviewSave();await verify('swap',id,{entryNote:'교체 뒤 진입 이유',review:'교체 뒤 한 문장'});});
 await scen('swapPlan',async()=>{const id=ids[ti++];await open(id);await type('holdNote','교체 전 보유 메모');await blur();await P.waitForTimeout(300);
  await P.evaluate(async()=>{const s=await v83Read();const next={...clone(state),...clone(s),trades:clone(s.trades).map(normaliseTrade)};await commitExchangeState(next);});
  await P.evaluate(()=>{const f=$('planForm');f.closest('details').open=true;f.elements.reason.value='교체 뒤 정정';f.elements.failure.value='교체 뒤 실패 조건';});await click('#tradeDialog #planForm button[type="submit"]');
  await P.waitForTimeout(1200);const r=await P.evaluate(async id=>{const s=await v83Read();const st=s.trades.find(x=>x.id===id),t=state.trades.find(x=>x.id===id);return {state:t.plans.failure,saved:st.plans.failure};},id);
  out.swapPlan=r;await verify('swapPlan.note',id,{holdNote:'교체 전 보유 메모'});});
 /* 9) 다른 폼 저장 실패(restoreRecord) 중에도 쓴 일지 유지 */
 await scen('fail',async()=>{const id=ids[ti++];await open(id);
  await P.evaluate(()=>{const ws=writeSnapshot;let n=0;window.__ws=ws;writeSnapshot=async s=>{if(n++<1)throw Error('모의 실패');return ws(s);};});
  await type('postEval','실패 중 평가');
  await P.evaluate(()=>{const f=$('planForm');f.closest('details').open=true;f.elements.reason.value='실패 테스트';});await click('#tradeDialog #planForm button[type="submit"]');
  await P.waitForTimeout(3500);await P.evaluate(()=>{writeSnapshot=window.__ws;});await verify('fail',id,{postEval:'실패 중 평가'});});
 /* 새로고침 뒤 전부 유지 */
 await P.reload();await ready();
 const rl={};for(const [key,id,want] of later){const r=await read(id,Object.keys(want));const ok=Object.keys(want).every(k=>JSON.stringify(r[k].saved)===JSON.stringify(want[k])&&JSON.stringify(r[k].state)===JSON.stringify(want[k]));rl[key]=ok;if(!ok)out.bad.push('reload '+key+' '+JSON.stringify(r));}
 out.reloadN=Object.keys(rl).length;out.reloadOk=Object.values(rl).filter(Boolean).length;
 out.n=Object.keys(out.res).length;out.okN=Object.values(out.res).filter(o=>!o.err&&Object.values(o).every(Boolean)).length;
 out.dbg=await P.evaluate(()=>window.v102Debug?v102Debug():null);
 out.over=await P.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
