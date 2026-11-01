/* v97 투자 휴식 권고 배너가 ~2초 뒤 저절로 사라지던 버그 QA (모의 데이터만, 외부 연결 없음).
   원인 재현: 대시보드 flex 배치에서 v12Dashboard가 재렌더 때 #v95Rest 에 v12-rest(order:8)를 붙여 맨 아래(화면 밖)로 밀어냄.
   시계 고정 토 2026-10-31 12:00 KST → HL 오늘 10-31, US 오늘 10-30. 거래 = 같은 날 진입 10 @100 → 청산 10 @px (수수료 0.12).
   장면(HL·US × 1440·390):
   load  3연속 손실 저장 → 새로고침(로컬 캐시로 첫 렌더) → 배너가 보이는 첫 요소
   t2s   2.5초 기다림 → 그대로
   sync  재렌더 경로 전부 뒤: renderAll ×2 · 다른 화면 갔다 오기(setPage) · renderDashboard 직접 · (HL) 모의 서버 체결 hlcSync(진입만, 연속 불변) → 여전히 보이는 첫 요소·hidden 아님·v95Dismiss 없음
   dbg   window.v95Debug(): status shown, 연속 3, 메모 본문(QA-MEMO-SECRET) 없음
   x     × → 숨김 + v95Dismiss=마지막 손실일, 재렌더 뒤에도 숨김
   flip  (×를 지운 뒤) 오늘 플러스 청산 추가(HL은 모의 서버 체결 동기화) → 배너 숨김, v95Debug status no-streak·연속 0
   넘침 0 · 페이지 오류 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40);
const init=(A)=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});window.__srv=[];
 window.fetch=async(u,o={})=>{u=String(u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}
  if(u.includes('.supabase.co/')){
   if(u.includes('/rpc/hl_status')){const mx=window.__srv.length;return J({address:A,max_fill_id:mx,max_funding_id:0,fills_count:mx,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()});}
   if(u.includes('/rest/v1/hl_fills')){const cur=+(u.match(/id=gt\.(\d+)/)||[])[1]||0;return J(window.__srv.map((raw,i)=>({id:i+1,raw})).filter(r=>r.id>cur));}
   return J([]);}
  return J({message:'not found'},404);};
 class WS{constructor(){this.readyState=0;}send(){}close(){this.readyState=3;}}WS.OPEN=1;WS.CLOSED=3;window.WebSocket=WS;};
const seed=async(spec)=>{
 const ev=(id,ts,sh,px,fee)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee,seq:ts/1000};};
 state.trades=spec.map(([day,px],i)=>{const t0=Date.parse(day+'T14:00:00Z')+i*1000;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:'r'+i,at:t0,name:HL?'ETH':'AAPL',direction:'long',date:day,stop:90,stop0:90,initialRisk:100,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'QA-MEMO-SECRET',violations:[],
   entries:[ev('r'+i+'e',t0,10,100,0.12)],fills:px==null?[]:[ev('r'+i+'f',t0+3600e3,10,px,0.12)],funding:[],images:[]});});
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10});delete state.settings.v95Dismiss;await persist();return state.trades.length;};
const read=()=>{const el=document.getElementById('v95Rest'),pg=document.getElementById('page-dashboard');
 const vis=!!el&&!el.hidden&&el.getBoundingClientRect().height>0;
 const kids=[...pg.children].filter(x=>!x.hidden&&x.getBoundingClientRect().height>0).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
 const W=document.documentElement.clientWidth,bad=[];
 if(vis)for(const x of [el,...el.querySelectorAll('*')]){const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className||x.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}
 return {vis,n:vis?+el.dataset.v95N:0,firstVisual:vis&&kids[0]===el,top:vis?Math.round(el.getBoundingClientRect().top-pg.getBoundingClientRect().top):null,
  dis:state.settings.v95Dismiss??null,bad,docScroll:document.documentElement.scrollWidth>W+1};};
const F=(tid,o)=>Object.assign({coin:'BTC',px:'100',sz:'1',side:'B',time:0,startPosition:'0',dir:'Open Long',closedPnl:'0',hash:'0x'+tid.toString(16).padStart(64,'0'),oid:tid*10,crossed:true,fee:'0.01',tid,feeToken:'USDC'},o);
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const R={tag,errors:[]};const base='http://127.0.0.1:'+srv.address().port+'/';
 for(const [mk,q] of [['HL','?journal=hyperliquid'],['US','?journal=us']])for(const W of [1440,390]){
  const key=mk+W,T=mk==='HL'?'2026-10-31':'2026-10-30';
  const ctx=await browser.newContext({viewport:{width:W,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul',bypassCSP:true});await ctx.addInitScript(init,A);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const U=base+q,ready=()=>page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  const login=()=>page.evaluate(()=>{cloudConfig={url:'https://qa0000000000000000.supabase.co',key:'sb_publishable_QAQAQAQAQAQAQAQAQAQA'};cloudSession={project:cloudConfig.url,access_token:'qa',refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+86400,user:{id:'qa-user',email:''}};});
  const o={};
  await page.goto(U);await ready();
  await page.evaluate(seed,[['2026-10-27',95],['2026-10-28',90],['2026-10-29',98]]);
  await page.goto(U);await ready();await page.waitForTimeout(200);o.load=await page.evaluate(read);
  await page.waitForTimeout(2500);o.t2s=await page.evaluate(read);
  await page.evaluate(()=>{renderAll();renderAll();setPage('records');setPage('dashboard');renderDashboard();});await page.waitForTimeout(300);
  if(mk==='HL'){await login();
   await page.evaluate(()=>{const t=Date.parse('2026-10-20T03:00:00Z');window.__srv.push({coin:'BTC',px:'100',sz:'1',side:'B',time:t,startPosition:'0',dir:'Open Long',closedPnl:'0',hash:'0x'+'a'.repeat(64),oid:9010,crossed:true,fee:'0.01',tid:901,feeToken:'USDC'});});
   o.syncMsg=await page.evaluate(async()=>{await hlcSync(true);return document.getElementById('hlcStatusText')?.textContent||'';});await page.waitForTimeout(300);}
  o.sync=await page.evaluate(read);o.trades=await page.evaluate(()=>state.trades.length);
  await page.screenshot({path:path.join(outDir,key+'-sync.png')}).catch(e=>o.shotErr=e.message);
  o.dbg=await page.evaluate(()=>{const d=window.v95Debug();return {status:d.status,run:d.consecutiveLossDays,journal:d.journal,days:d.days.length,lastLoss:d.days.slice(-3).every(r=>r.loss),pct:d.days[d.days.length-1].pct,memo:JSON.stringify(d).includes('QA-MEMO-SECRET'),first:d.position&&d.position.visualIndex};});
  await page.click('#v95Rest [data-v95-x]');await page.waitForTimeout(400);o.x=await page.evaluate(read);
  await page.evaluate(()=>{renderAll();setPage('dashboard');});await page.waitForTimeout(200);o.x2=await page.evaluate(read);
  o.xdbg=await page.evaluate(()=>window.v95Debug().status);
  /* 실제로는 연속 손실이 아니게 된 경우: 오늘 플러스 청산 */
  await page.evaluate(async()=>{delete state.settings.v95Dismiss;await persist();renderAll();});await page.waitForTimeout(150);o.back=await page.evaluate(read);
  if(mk==='HL'){
   await page.evaluate(()=>{const t=Date.parse('2026-10-31T01:00:00Z');
    window.__srv.push({coin:'SOL',px:'100',sz:'10',side:'B',time:t,startPosition:'0',dir:'Open Long',closedPnl:'0',hash:'0x'+'b'.repeat(64),oid:9020,crossed:true,fee:'0.01',tid:902,feeToken:'USDC'});
    window.__srv.push({coin:'SOL',px:'110',sz:'10',side:'A',time:t+600e3,startPosition:'10',dir:'Close Long',closedPnl:'100',hash:'0x'+'c'.repeat(64),oid:9030,crossed:true,fee:'0.01',tid:903,feeToken:'USDC'});});
   await page.evaluate(async()=>{hlcLastRun=0;await hlcSync(true);});
  }else{
   await page.evaluate(async T=>{const t=state.trades[0],ts=Date.parse(T+'T14:00:00Z');const e=JSON.parse(JSON.stringify(t.entries[0])),f=JSON.parse(JSON.stringify(t.fills[0]));
    Object.assign(e,{id:'pE',date:T,time:'14:00:00',timestamp:ts,seq:ts/1000});Object.assign(f,{id:'pF',date:T,time:'15:00:00',timestamp:ts+3600e3,seq:ts/1000+3600,price:110});
    state.trades.push(normaliseTrade({...JSON.parse(JSON.stringify(t)),id:'rP',at:ts,date:T,entries:[e],fills:[f]}));await persist();renderAll();},T);
  }
  await page.waitForTimeout(300);o.flip=await page.evaluate(read);
  o.fdbg=await page.evaluate(()=>{const d=window.v95Debug();return {status:d.status,run:d.consecutiveLossDays,lastPlus:d.days.length?d.days[d.days.length-1].usd>0:false};});
  o.layout={docScroll:o.sync.docScroll,bad:o.sync.bad};
  R[key]=o;await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
