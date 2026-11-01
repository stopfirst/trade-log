/* v99 복수매매 감지 QA — 모의 거래(체결 시각 고정)로 4규칙 · 경계 · 월간 집계 · 진입 이유 칩 저장 · 설정 변경.
   시계 고정(qa/lib/pw.cjs): 토 2026-10-31 12:00 KST → HL 이번 달 2026-10(UTC), US 2026-10(미국 동부).
   HL (UTC, timestamp 있음, 수량 10·수수료 0, 손익 = 10×(청산−진입)):
     S1 09-15 10:00→11:00 −50 · S2 09-15 11:05 진입(5분) −10 → 9월 복수매매 1
     P1 10-26 09:00→10:00 +30 · P2 10:05 진입 +10 → 이익 청산 뒤 진입 = 표시 없음
     F1 10-27 10:00→11:00 −20 · F2 12:00→13:00 −20 · F3 23:00→23:55 −40 · G 10-28 00:05 진입 +50 → UTC 날짜 넘어도 10분 = 복수매매, 연패는 날짜 따로(10-28 손실 0)
     A 10-29 01:00→02:00 −50(1R 100) · B 02:15:00 진입(정확히 15분) −100(1R 150) → 복수매매 + 위험 키움
     C 03:15:01 진입(15분 1초) −30(1R 120) → 표시 없음(직전 손실 후 15분) · D 05:00 진입 +80(1R 130) → 3연패 후 진입 + 위험 키움(쿨다운 밖이지만 같은 날 C 손실 다음 거래, 130 > 120)
   US (미국 동부 벽시계, timestamp 없음 = ET 해석): U1 AAPL 10-29 09:40→10:00 −50 · U2 TSLA 10:15 진입 +40 → 복수매매(15분) + 갈아타기
     U3 AAPL 13:00 +20(같은 종목 → 갈아타기 아님) · U4 NVDA 15:00→15:30 −20 → 갈아타기(이유 미답 = 위반 아님)
     U7 MSFT 10-27 19:50 ET 손실 −30 · U8 META 20:10 ET(timestamp = 10-28 00:10 UTC) +10 → ET 같은 날 → 갈아타기
   장면(HL·US × 1440·390): 거래 기록 줄·배지, 상세 매매일지 줄, 복기 월간 카드(10월 숫자 · ‹ 9월 · › 막힘), 연결(processOf·v46Tags·v37Detect·v74),
     US 칩 '강해 보여서' 클릭 → 저장·배지·위반 집계 반영·새로고침 유지·카드 안 열림, 설정 쿨다운 20·연패 2 → 즉시 재계산, 넘침 0, 페이지 오류 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}return J({message:'not found'},404);};};
const HLSPEC=[['S1','BTC','2026-09-15T10:00:00Z','2026-09-15T11:00:00Z',95,100],['S2','ETH','2026-09-15T11:05:00Z','2026-09-15T12:00:00Z',99,100],
 ['P1','BTC','2026-10-26T09:00:00Z','2026-10-26T10:00:00Z',103,100],['P2','ETH','2026-10-26T10:05:00Z','2026-10-26T11:00:00Z',101,100],
 ['F1','BTC','2026-10-27T10:00:00Z','2026-10-27T11:00:00Z',98,100],['F2','ETH','2026-10-27T12:00:00Z','2026-10-27T13:00:00Z',98,100],['F3','SOL','2026-10-27T23:00:00Z','2026-10-27T23:55:00Z',96,100],
 ['G','BTC','2026-10-28T00:05:00Z','2026-10-28T01:00:00Z',105,100],
 ['A','BTC','2026-10-29T01:00:00Z','2026-10-29T02:00:00Z',95,100],['B','ETH','2026-10-29T02:15:00Z','2026-10-29T03:00:00Z',90,150],
 ['C','SOL','2026-10-29T03:15:01Z','2026-10-29T04:00:00Z',97,120],['D','BTC','2026-10-29T05:00:00Z','2026-10-29T06:00:00Z',108,130]];
/* US: [id,name,entry 'YYYY-MM-DD HH:MM:SS'(ET), exit ET, exitPx, risk, entryTimestampISO?] */
const USSPEC=[['U1','AAPL','2026-10-29 09:40:00','2026-10-29 10:00:00',95,100],['U2','TSLA','2026-10-29 10:15:00','2026-10-29 11:00:00',104,100],
 ['U3','AAPL','2026-10-29 13:00:00','2026-10-29 14:00:00',102,100],['U4','NVDA','2026-10-29 15:00:00','2026-10-29 15:30:00',98,100],
 ['U7','MSFT','2026-10-27 19:00:00','2026-10-27 19:50:00',97,100],['U8','META','2026-10-27 20:10:00','2026-10-27 21:00:00',101,100,'2026-10-28T00:10:00Z']];
const seed=async([hl,us])=>{
 const ev=(id,date,time,ts,sh,px,fill)=>({id,date,time,...(ts!=null?{timestamp:ts}:{}),shares:sh,price:px,fee:0,seq:(ts??Date.parse(date+'T'+time+'Z'))/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})});
 const mk=(id,name,ed,et,ets,xd,xt,xts,px,risk)=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:ets??Date.parse(ed+'T'+et+'Z'),name,direction:'long',date:ed,stop:100-risk/10,stop0:100-risk/10,initialRisk:risk,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'',violations:[],
  entries:[ev(id+'e',ed,et,ets,10,100)],fills:[ev(id+'f',xd,xt,xts,10,px,HL?'f'+id:null)],funding:[],images:[]});
 state.trades=HL?hl.map(([id,nm,a,b,px,r])=>{const ta=Date.parse(a),tb=Date.parse(b);return mk(id,nm,a.slice(0,10),a.slice(11,19),ta,b.slice(0,10),b.slice(11,19),tb,px,r);})
  :us.map(([id,nm,a,b,px,r,ts])=>mk(id,nm,a.slice(0,10),a.slice(11),ts?Date.parse(ts):null,b.slice(0,10),b.slice(11),null,px,r));
 Object.assign(state.settings,{account:10000});delete state.settings.v99Cool;delete state.settings.v99MaxLoss;
 await persist();setPage('records');renderAll();return state.trades.length;};
const vis=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
const readRec=()=>{const out={};for(const t of state.trades){const els=[...document.querySelectorAll('#recordList .v99-line[data-v99-trade="'+t.id+'"]')].filter(e=>e.getClientRects().length);const el=els[0];
  if(!el)continue;out[t.id]={gap:el.querySelector('.v99-gap')?.textContent||null,b:[...el.querySelectorAll('.v99-b')].map(b=>b.textContent+(b.classList.contains('strong')?'!':'')+(b.classList.contains('soft')?'~':'')),why:[...el.querySelectorAll('.v99-chip')].map(c=>c.textContent+(c.classList.contains('on')?'*':''))};}return out;};
const over=sel=>{const W=document.documentElement.clientWidth,bad=[];for(const root of document.querySelectorAll(sel)){if(!root.getClientRects().length)continue;for(const x of [root,...root.querySelectorAll('*')]){const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className||x.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}}return bad;};
const readMonth=()=>{const c=document.getElementById('v99Card');if(!c)return null;const q=s=>c.querySelector(s)?.textContent?.trim()??null;
 return {open:c.open,month:q('#v99Month'),flagged:q('#v99Flagged'),total:q('#v99Total'),without:q('#v99Without'),meta:q('summary small'),
  rows:Object.fromEntries([...c.querySelectorAll('tr[data-v99-row]')].map(r=>[r.dataset.v99Row,[...r.children].map(x=>x.childNodes[0]?.textContent?.trim()??'')])),
  why:q('tr[data-v99-row="switch"] th small'),prev:c.querySelector('[data-v99m="-1"]')?.disabled??null,next:c.querySelector('[data-v99m="1"]')?.disabled??null,empty:q('.v99-empty')};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const R={tag,errors:[]};const base='http://127.0.0.1:'+srv.address().port+'/';
 for(const [mk,q] of [['HL','?journal=hyperliquid'],['US','?journal=us']])for(const W of [1440,390]){
  const key=mk+W;
  const ctx=await browser.newContext({viewport:{width:W,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul',bypassCSP:true});await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const U=base+q,ready=()=>page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.goto(U);await ready();await page.waitForTimeout(300);
  const o={};
  o.n=await page.evaluate(seed,[HLSPEC,USSPEC]);await page.waitForTimeout(200);
  o.dbg=await page.evaluate(()=>Object.fromEntries(v99Debug().map(x=>[x.id,{gap:x.gapMin,f:x.flags}])));
  if(mk==='US')o.et=await page.evaluate(()=>[v99EtMs('2026-10-29','10:00:00')===Date.parse('2026-10-29T14:00:00Z'),v99EtMs('2026-12-01','10:00:00')===Date.parse('2026-12-01T15:00:00Z')]);
  o.rec=await page.evaluate(readRec);
  o.recL={bad:await page.evaluate(over,'#recordList .v99-line')};
  await page.screenshot({path:path.join(outDir,key+'-records.png')}).catch(e=>o.shotErr=e.message);
  /* 연결 */
  const id=mk==='HL'?'B':'U2';
  o.link=await page.evaluate(id=>{const t=state.trades.find(x=>x.id===id),ok=state.trades.find(x=>x.id===(HL?'C':'U3'));
   return {proc:processOf(t),procOk:processOf(ok),tags:v46Tags(t),det:v37Detect(t).map(d=>d.code).filter(c=>c.startsWith('v99'))};},id);
  /* 상세 매매일지 */
  await page.evaluate(id=>openTrade(id,'review'),id);await page.waitForTimeout(400);
  o.detail=await page.evaluate(()=>{const el=document.querySelector('#v71Card .v99-line');return el?{gap:el.querySelector('.v99-gap')?.textContent||null,b:[...el.querySelectorAll('.v99-b')].map(b=>b.textContent),why:el.querySelectorAll('.v99-chip').length,auto:[...document.querySelectorAll('#v37Auto .v37-chip')].map(c=>c.textContent)}:null;});
  o.detailL={bad:await page.evaluate(over,'#v71Card .v99-line')};
  await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(e=>o.shotErr=e.message);
  await page.evaluate(()=>$('tradeDialog').close());
  /* 분석: 위반 비용 · 패턴 */
  await page.evaluate(()=>{setPage('analysis');renderAll();});await page.waitForTimeout(300);
  o.ana=await page.evaluate(()=>{const c=document.getElementById('v46CostBody');const pat=[...document.querySelectorAll('#page-analysis .v71-sub')].find(e=>e.textContent.startsWith('복수매매 표시별'));
   const rows=pat?[...pat.nextElementSibling.querySelectorAll('tbody tr')].map(r=>r.querySelector('th').textContent+':'+r.querySelector('td').textContent):null;
   return {cost:c?['복수매매 의심','위험 키움','3연패 후 진입','갈아타기(강해 보여서)'].filter(x=>c.textContent.includes(x)):null,pat:rows};});
  /* 복기 월간 */
  await page.evaluate(()=>{setPage('weekly');renderAll();});await page.waitForTimeout(400);
  await page.evaluate(()=>document.getElementById('v99Card')?.scrollIntoView({block:'start'}));await page.waitForTimeout(100);
  o.m10=await page.evaluate(readMonth);o.mL={bad:await page.evaluate(over,'#v99Card')};
  await page.screenshot({path:path.join(outDir,key+'-month.png')}).catch(e=>o.shotErr=e.message);
  if(mk==='HL'){await page.click('#v99Card [data-v99m="-1"]');await page.waitForTimeout(150);o.m9=await page.evaluate(readMonth);
   await page.click('#v99Card [data-v99m="1"]');await page.waitForTimeout(150);o.mBack=(await page.evaluate(readMonth)).month;}
  /* US 진입 이유 칩 */
  if(mk==='US'){
   await page.evaluate(()=>{setPage('records');renderAll();});await page.waitForTimeout(250);
   const sel='#recordList .v99-line[data-v99-trade="U4"] [data-v99why="strong"]';
   const vsel=await page.evaluate(s=>{const a=[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length);a.forEach((e,i)=>e.dataset.qa=i);return a.length;},sel);
   o.chipN=vsel;await page.click(sel+'[data-qa="0"]');await page.waitForTimeout(50);
   o.chip0=await page.evaluate(()=>{const el=[...document.querySelectorAll('#recordList .v99-line[data-v99-trade="U4"]')].find(e=>e.getClientRects().length);return {why:state.trades.find(t=>t.id==='U4').v99Why,dlg:$('tradeDialog').open,
     b:[...el.querySelectorAll('.v99-b')].map(b=>b.textContent),on:[...el.querySelectorAll('.v99-chip.on')].map(c=>c.textContent)};});
   await page.waitForTimeout(1200);
   o.chip1=await page.evaluate(()=>({proc:processOf(state.trades.find(t=>t.id==='U4')),saved:state.updatedAt>0}));
   await page.goto(U);await ready();await page.waitForTimeout(500);
   o.chip2=await page.evaluate(()=>{setPage('weekly');renderAll();const t=state.trades.find(t=>t.id==='U4');return {why:t.v99Why??null};});await page.waitForTimeout(300);
   o.m10b=await page.evaluate(readMonth);
   /* 다시 누르면 해제 */
   await page.evaluate(()=>{setPage('records');renderAll();});await page.waitForTimeout(250);
   await page.evaluate(s=>{[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length)[0].click();},sel);await page.waitForTimeout(900);
   o.chip3=await page.evaluate(()=>({why:state.trades.find(t=>t.id==='U4').v99Why??null,proc:processOf(state.trades.find(t=>t.id==='U4'))}));
  }
  /* 설정 */
  await page.evaluate(()=>{setPage('settings');try{v12SelectTab('account');}catch{}renderAll();});await page.waitForTimeout(250);
  o.set0=await page.evaluate(()=>({cool:$('v99Cool')?.value??null,max:$('v99MaxLoss')?.value??null,ph:$('v99Cool')?.placeholder??null,vis:!!$('v99Set')&&$('v99Set').getClientRects().length>0}));
  await page.evaluate(()=>$('v99Set')?.scrollIntoView({block:'center'}));
  await page.fill('#v99Cool','20');await page.press('#v99Cool','Enter');await page.waitForTimeout(400);
  await page.fill('#v99MaxLoss','2');await page.press('#v99MaxLoss','Enter');await page.waitForTimeout(400);
  o.set1=await page.evaluate(()=>({cool:state.settings.v99Cool,max:state.settings.v99MaxLoss,dbg:Object.fromEntries(v99Debug().filter(x=>x.flags.length).map(x=>[x.id,x.flags]))}));
  o.setL={bad:await page.evaluate(over,'#v99Set')};
  await page.screenshot({path:path.join(outDir,key+'-settings.png')}).catch(e=>o.shotErr=e.message);
  await page.fill('#v99Cool','abc').catch(()=>{});await page.fill('#v99Cool','-3');await page.press('#v99Cool','Enter');await page.waitForTimeout(300);
  o.setInvalid=await page.evaluate(()=>state.settings.v99Cool);
  await page.fill('#v99Cool','');await page.press('#v99Cool','Enter');await page.waitForTimeout(300);
  o.setClr=await page.evaluate(()=>[('v99Cool' in state.settings),v99Cool()]);
  o.docScroll=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  R[key]=o;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
