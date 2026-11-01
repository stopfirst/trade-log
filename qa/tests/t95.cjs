/* v95 투자 휴식 권고 QA — 3거래일 연속 실현 손실 → 대시보드 맨 위 주황 배너.
   시계 고정(qa/lib/pw.cjs): 토 2026-10-31 12:00 KST → HL 오늘 = 2026-10-31(UTC), US 오늘 = 2026-10-30(미국 동부).
   거래 1건 = 같은 날 진입 10주 @100 → 청산 10주 @px (수수료 0.12씩). 계좌 기준액 10,000 → 분모 10,000(마감 기록 없음).
   장면(HL·US × 1440·390): s1 3연속 손실 → 배너(3) · gap 중간에 진입만 있는 날(청산 없음) → 여전히 배너(3, 그날 빠짐)
     · plus 오늘 플러스 → 없음 · zero 0원인 날이 끊음 → 없음 · four 4연속 → '(4거래일 연속 손실)'
     · 닫기(×) → 숨김·settings.v95Dismiss 저장·다시 그려도/새로고침해도 숨김 → 새 손실일(오늘) 추가 → 다시 표시(4)
     · 넘침 0 · 배너가 대시보드 첫 요소 · 페이지 오류 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}return J({message:'not found'},404);};};
/* spec: [[day, exitPx|null(진입만), fee?], ...] */
const seed=async(spec)=>{
 const ev=(id,ts,sh,px,fee,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 state.trades=spec.map(([day,px,fee],i)=>{const t0=Date.parse(day+'T14:00:00Z')+i*1000,f=fee??0.12;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:'r'+i,at:t0,name:HL?'ETH':'AAPL',direction:'long',date:day,stop:90,stop0:90,initialRisk:100,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'',violations:[],
   entries:[ev('r'+i+'e',t0,10,100,f)],fills:px==null?[]:[ev('r'+i+'f',t0+3600e3,10,px,f,HL?'f'+i:null)],funding:[],images:[]});});
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10});delete state.settings.v95Dismiss;
 await persist();setPage('dashboard');renderAll();window.scrollTo(0,0);return state.trades.length;};
const read=()=>{const el=document.getElementById('v95Rest'),pg=document.getElementById('page-dashboard');const vis=!!el&&!el.hidden&&el.getBoundingClientRect().height>0;
 const W=document.documentElement.clientWidth,bad=[];
 if(vis)for(const x of [el,...el.querySelectorAll('*')]){const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className||x.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}
 return {vis,title:vis?el.querySelector('b').textContent:'',days:vis?[...el.querySelectorAll('small span')].map(s=>s.textContent):[],first:!!el&&pg.firstElementChild===el,
  last:vis?el.dataset.v95Last:null,dis:state.settings.v95Dismiss??null,bad,docScroll:document.documentElement.scrollWidth>W+1};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const R={tag,errors:[]};const base='http://127.0.0.1:'+srv.address().port+'/';
 for(const [mk,q] of [['HL','?journal=hyperliquid'],['US','?journal=us']])for(const W of [1440,390]){
  const key=mk+W,T=mk==='HL'?'2026-10-31':'2026-10-30';
  const ctx=await browser.newContext({viewport:{width:W,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul',bypassCSP:true});await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const U=base+q,ready=()=>page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.goto(U);await ready();await page.waitForTimeout(300);
  const o={today:await page.evaluate(()=>v12Today())};
  const run=async(nm,spec)=>{await page.evaluate(seed,spec);await page.waitForTimeout(150);o[nm]=await page.evaluate(read);};
  await run('s1',[['2026-10-27',95],['2026-10-28',90],['2026-10-29',98]]);
  await page.screenshot({path:path.join(outDir,key+'-s1.png')}).catch(e=>o.shotErr=e.message);
  await run('gap',[['2026-10-26',95],['2026-10-27',95],['2026-10-28',null],['2026-10-29',95]]);
  await run('plus',[['2026-10-27',95],['2026-10-28',90],['2026-10-29',98],[T,105]]);
  await run('zero',[['2026-10-26',95],['2026-10-27',95],['2026-10-28',100,0],['2026-10-29',95],[T,95]]);
  await run('four',[['2026-10-23',105],['2026-10-26',95],['2026-10-27',95],['2026-10-28',90],['2026-10-29',98]]);
  /* 닫기 */
  await run('d0',[['2026-10-27',95],['2026-10-28',90],['2026-10-29',98]]);
  await page.click('#v95Rest [data-v95-x]');await page.waitForTimeout(400);
  o.d1=await page.evaluate(read);
  await page.evaluate(()=>renderAll());await page.waitForTimeout(150);o.d2=await page.evaluate(read);
  await page.goto(U);await ready();await page.waitForTimeout(500);o.d3=await page.evaluate(read);
  /* 새 손실일(오늘) 추가 → 다시 표시 */
  await page.evaluate(async T=>{const t=state.trades[0],ts=Date.parse(T+'T14:00:00Z');const e=JSON.parse(JSON.stringify(t.entries[0])),f=JSON.parse(JSON.stringify(t.fills[0]));
   Object.assign(e,{id:'nE',date:T,time:'14:00:00',timestamp:ts,seq:ts/1000});Object.assign(f,{id:'nF',date:T,time:'15:00:00',timestamp:ts+3600e3,seq:ts/1000+3600,price:96,...(HL?{fillId:'fN',sourceKey:'hyperliquid:abc:fN'}:{})});
   state.trades.push(normaliseTrade({...JSON.parse(JSON.stringify(t)),id:'rN',at:ts,date:T,entries:[e],fills:[f]}));await persist();renderAll();},T);
  await page.waitForTimeout(200);o.d4=await page.evaluate(read);
  await page.screenshot({path:path.join(outDir,key+'-d4.png')}).catch(e=>o.shotErr=e.message);
  o.layout={docScroll:o.d4.docScroll,bad:o.d4.bad};
  R[key]=o;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
