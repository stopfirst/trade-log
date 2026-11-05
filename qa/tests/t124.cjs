/* v124 복수매매 'N연패 후 진입' = 같은 날 연속 손실(이익 청산이면 0, 0원 청산은 그대로) QA — 모의 거래(체결 시각 고정).
   HL (UTC 날짜, timestamp 있음, 수량 10·수수료 0, 손익 = 10×(청산−진입), 1R 모두 100, 진입 간격 1시간·보유 10분 → 쿨다운·위험 키움 없음):
     10-20 손-이-손-손: A1 −20 · A2 +30 · A3 −20 · A4 −20 · A5 진입 → 연속 2 = 표시 없음 (예전 횟수 3 = 표시)
     10-21 손-손-손: B1·B2·B3 −20 · B4 진입(+30) → 연속 3 = 표시 · B5 진입 → B4 이익으로 0 = 표시 없음 (예전 = 표시)
     10-22 손-0-손-손: C1 −20 · C2 0.00 · C3 −20 · C4 −20 · C5 진입 → 연속 3 = 표시 (예전도 표시)
     날짜 경계: D1·D2·D3 10-23 21:00~23:10 UTC −20 · D4 10-23 23:50 UTC 진입 → 표시 · D5 10-24 00:20 UTC 진입(KST 09:20) → 새 날 0 = 표시 없음
   US (미국 동부 벽시계): U1·U2·U3 10-27 18:00~19:40 ET −20 · U4 20:30 ET(timestamp = 10-28 00:30 UTC) 진입 → ET 같은 날 = 표시 · U5 10-28 09:40 ET 진입 → 표시 없음
   장면(HL·US × 1440·390): v99Debug 플래그·v124Debug(날짜) 연속 값·거래 기록 배지·연결(processOf·v37Detect)·월간 표 줄 문구·설정(칸 이름·토글·도움말),
     토글 끄기 → settings.v124Count = true·예전 횟수 판정 → 다시 켜기, ?v124=0 → 예전 판정·토글 잠김, 넘침 0, 페이지 오류 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}return J({message:'not found'},404);};};
/* [id, 종목, 진입 UTC ISO, 청산 UTC ISO, 청산가] (진입가 100) */
const HLSPEC=[
 ['A1','BTC','2026-10-20T01:00:00Z','2026-10-20T01:10:00Z',98],['A2','ETH','2026-10-20T02:00:00Z','2026-10-20T02:10:00Z',103],['A3','SOL','2026-10-20T03:00:00Z','2026-10-20T03:10:00Z',98],['A4','BTC','2026-10-20T04:00:00Z','2026-10-20T04:10:00Z',98],['A5','ETH','2026-10-20T05:00:00Z','2026-10-20T05:10:00Z',101],
 ['B1','BTC','2026-10-21T01:00:00Z','2026-10-21T01:10:00Z',98],['B2','ETH','2026-10-21T02:00:00Z','2026-10-21T02:10:00Z',98],['B3','SOL','2026-10-21T03:00:00Z','2026-10-21T03:10:00Z',98],['B4','BTC','2026-10-21T04:00:00Z','2026-10-21T04:10:00Z',103],['B5','ETH','2026-10-21T05:00:00Z','2026-10-21T05:10:00Z',101],
 ['C1','BTC','2026-10-22T01:00:00Z','2026-10-22T01:10:00Z',98],['C2','ETH','2026-10-22T02:00:00Z','2026-10-22T02:10:00Z',100],['C3','SOL','2026-10-22T03:00:00Z','2026-10-22T03:10:00Z',98],['C4','BTC','2026-10-22T04:00:00Z','2026-10-22T04:10:00Z',98],['C5','ETH','2026-10-22T05:00:00Z','2026-10-22T05:10:00Z',101],
 ['D1','BTC','2026-10-23T21:00:00Z','2026-10-23T21:10:00Z',98],['D2','ETH','2026-10-23T22:00:00Z','2026-10-23T22:10:00Z',98],['D3','SOL','2026-10-23T23:00:00Z','2026-10-23T23:10:00Z',98],['D4','BTC','2026-10-23T23:50:00Z','2026-10-23T23:55:00Z',101],['D5','ETH','2026-10-24T00:20:00Z','2026-10-24T00:30:00Z',101]];
/* US: [id, 종목, 진입 ET 'YYYY-MM-DD HH:MM:SS', 청산 ET, 청산가, 진입 timestamp ISO?] */
const USSPEC=[['U1','AAPL','2026-10-27 18:00:00','2026-10-27 18:10:00',98],['U2','AAPL','2026-10-27 19:00:00','2026-10-27 19:10:00',98],['U3','AAPL','2026-10-27 19:30:00','2026-10-27 19:40:00',98],
 ['U4','AAPL','2026-10-27 20:30:00','2026-10-27 20:40:00',101,'2026-10-28T00:30:00Z'],['U5','AAPL','2026-10-28 09:40:00','2026-10-28 09:50:00',101]];
const seed=async([hl,us])=>{
 const ev=(id,date,time,ts,sh,px,fill)=>({id,date,time,...(ts!=null?{timestamp:ts}:{}),shares:sh,price:px,fee:0,seq:(ts??Date.parse(date+'T'+time+'Z'))/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})});
 const mk=(id,name,ed,et,ets,xd,xt,xts,px)=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:ets??Date.parse(ed+'T'+et+'Z'),name,direction:'long',date:ed,stop:90,stop0:90,initialRisk:100,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'',violations:[],
  entries:[ev(id+'e',ed,et,ets,10,100)],fills:[ev(id+'f',xd,xt,xts,10,px,HL?'f'+id:null)],funding:[],images:[]});
 state.trades=HL?hl.map(([id,nm,a,b,px])=>{const ta=Date.parse(a),tb=Date.parse(b);return mk(id,nm,a.slice(0,10),a.slice(11,19),ta,b.slice(0,10),b.slice(11,19),tb,px);})
  :us.map(([id,nm,a,b,px,ts])=>mk(id,nm,a.slice(0,10),a.slice(11),ts?Date.parse(ts):null,b.slice(0,10),b.slice(11),null,px));
 Object.assign(state.settings,{account:10000});delete state.settings.v99Cool;delete state.settings.v99MaxLoss;delete state.settings.v124Count;
 await persist();setPage('records');renderAll();return state.trades.length;};
const flags=()=>Object.fromEntries(v99Debug().filter(x=>x.flags.length).map(x=>[x.id,x.flags]));
const over=sel=>{const W=document.documentElement.clientWidth,bad=[];for(const root of document.querySelectorAll(sel)){if(!root.getClientRects().length)continue;for(const x of [root,...root.querySelectorAll('*')]){const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className||x.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}}return bad;};
const readBadges=()=>{const out={};for(const t of state.trades){const el=[...document.querySelectorAll('#recordList .v99-line[data-v99-trade="'+t.id+'"]')].find(e=>e.getClientRects().length);const b=el?[...el.querySelectorAll('.v99-b')].map(b=>b.textContent):[];if(b.length)out[t.id]=b;}return out;};
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
  o.on=await page.evaluate(()=>v124On());
  o.flags=await page.evaluate(flags);
  o.detail=await page.evaluate(id=>{const i=v99Info(state.trades.find(t=>t.id===id));const f=i&&i.flags.find(x=>x.code==='maxloss');return f?f.detail:null;},mk==='HL'?'B4':'U4');
  o.dbg=await page.evaluate(days=>Object.fromEntries(days.map(d=>{const x=v124Debug(d);return [d,{mode:x.mode,closes:x.closes.map(c=>c.id+':'+c.kind+':'+c.streak),entries:x.entries.map(e=>e.id+':'+e.streak+'/'+e.count+(e.flag?'!':''))}];})),mk==='HL'?['2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24']:['2026-10-27','2026-10-28']);
  o.dbgVer=await page.evaluate(()=>{const x=v124Debug();return {v:x.ver,j:x.journal,max:x.max,day:/^\d{4}-\d\d-\d\d$/.test(x.day)};});
  o.rec=await page.evaluate(readBadges);o.recL={bad:await page.evaluate(over,'#recordList .v99-line')};
  await page.screenshot({path:path.join(outDir,key+'-records.png')}).catch(e=>o.shotErr=e.message);
  o.link=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const t=state.trades.find(x=>x.id===id);return [id,{proc:processOf(t),det:v37Detect(t).map(d=>d.code).filter(c=>c==='v99maxloss')}];})),mk==='HL'?['A5','B4','B5','C5','D4','D5']:['U4','U5']);
  /* 복기 월간(HL 10월 = 연패 표시 3건: B4·C5·D4) */
  await page.evaluate(()=>{setPage('weekly');renderAll();});await page.waitForTimeout(400);
  await page.evaluate(()=>document.getElementById('v99Card')?.scrollIntoView({block:'start'}));await page.waitForTimeout(100);
  o.month=await page.evaluate(()=>{const c=document.getElementById('v99Card');if(!c)return null;const r=c.querySelector('tr[data-v99-row="maxloss"]');
   return {row:r?[r.querySelector('th').textContent.trim(),r.querySelector('td').childNodes[0].textContent.trim()]:null,hint:r?r.querySelector('th').title:null,note:c.querySelector('.section-note')?.textContent||''};});
  o.monthL={bad:await page.evaluate(over,'#v99Card')};
  /* 설정 */
  await page.evaluate(()=>{setPage('settings');try{v12SelectTab('account');}catch{}renderAll();});await page.waitForTimeout(250);
  await page.evaluate(()=>$('v99Set')?.scrollIntoView({block:'center'}));await page.waitForTimeout(100);
  const readSet=()=>({lab:$('v99MaxLoss')?.parentElement?.firstChild?.nodeValue||null,cb:$('v124Streak')?{checked:$('v124Streak').checked,dis:$('v124Streak').disabled,vis:$('v124Streak').getClientRects().length>0}:null,help:$('v99SetHelp')?.textContent||'',count:state.settings.v124Count??null});
  o.set0=await page.evaluate(readSet);o.setL={bad:await page.evaluate(over,'#v99Set')};
  await page.screenshot({path:path.join(outDir,key+'-settings.png')}).catch(e=>o.shotErr=e.message);
  await page.click('#v124Streak');await page.waitForTimeout(600);
  o.off=await page.evaluate(()=>({on:v124On(),flags:Object.fromEntries(v99Debug().filter(x=>x.flags.length).map(x=>[x.id,x.flags]))}));o.set1=await page.evaluate(readSet);
  /* 새로고침 뒤 유지 */
  await page.goto(U);await ready();await page.waitForTimeout(400);
  o.offReload=await page.evaluate(()=>({on:v124On(),count:state.settings.v124Count??null}));
  await page.evaluate(()=>{setPage('settings');try{v12SelectTab('account');}catch{}renderAll();});await page.waitForTimeout(250);
  await page.evaluate(()=>$('v124Streak')?.scrollIntoView({block:'center'}));
  await page.click('#v124Streak');await page.waitForTimeout(600);
  o.back=await page.evaluate(()=>({on:v124On(),has:'v124Count' in state.settings,flags:Object.fromEntries(v99Debug().filter(x=>x.flags.length).map(x=>[x.id,x.flags]))}));
  /* 연속 2회로 설정 → 즉시 재계산 */
  await page.fill('#v99MaxLoss','2');await page.press('#v99MaxLoss','Enter');await page.waitForTimeout(400);
  o.max2=await page.evaluate(()=>({max:state.settings.v99MaxLoss,flags:Object.fromEntries(v99Debug().filter(x=>x.flags.length).map(x=>[x.id,x.flags])),help:$('v99SetHelp')?.textContent||''}));
  await page.fill('#v99MaxLoss','');await page.press('#v99MaxLoss','Enter');await page.waitForTimeout(300);
  /* ?v124=0 */
  await page.goto(U+'&v124=0');await ready();await page.waitForTimeout(400);
  o.url0=await page.evaluate(()=>({on:v124On(),flags:Object.fromEntries(v99Debug().filter(x=>x.flags.length).map(x=>[x.id,x.flags]))}));
  await page.evaluate(()=>{setPage('settings');try{v12SelectTab('account');}catch{}renderAll();});await page.waitForTimeout(250);
  o.url0set=await page.evaluate(readSet);
  o.docScroll=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  R[key]=o;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
