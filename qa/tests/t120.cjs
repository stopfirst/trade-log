/* v120 QA — 거래 상세(복기)를 닫으면 열기 직전 목록 화면·스크롤 위치로. 모의 클라우드·모의 HL(외부 연결 없음, 가짜 주소·id). PC 1440 · 모바일 390 각각:
   (R) 거래 기록 300건 → '더 보기'(PC 표 200줄 / 모바일 카드 ≥100) → 150번째 근처 줄로 스크롤(PC = 표 스크롤 상자, 모바일 = 창) → 줄 눌러 상세 →
       일지 칸에 입력 → 닫기 버튼 → 같은 탭·같은 스크롤(±3px)·누른 줄 같은 화면 위치·펼친 건수 유지·강조. v119에선 PC 표 상자가 0(맨 위)으로.
   (E) Esc로 닫기(입력 없음) → 같은 위치.
   (L) 닫은 뒤 늦은 렌더(목록 비웠다 0.4초 뒤 다시 그림 = 나눠 그리기·지연 렌더 흉내) → 렌더 끝난 뒤 같은 위치.
   (U) 닫은 뒤 사용자가 스크롤(휠/터치) → 사용자 위치 유지(되돌리지 않음).
   (S) 상세 없이 같은 조건 다시 그리기(동기화) → 표 상자 위치 유지, 검색 바꾸면 처음부터(v113 그대로).
   (D) 대시보드 카드 상세 목록(v15Drill)에서 거래 열기 → 닫으면 목록 창 다시 열림·같은 스크롤.
   (W) 복기 탭 목록에서 열기 → 입력 → 닫기 → 같은 위치.  (C) 캘린더 날짜 상세에서 열기 → 닫기 → 같은 날짜·같은 위치.
   (G) 상세 안에서 다른 탭으로 옮긴 뒤 닫기 → 복원 안 함(옮긴 탭 그대로). */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const C={rev:0,payload:null,cas:[],heads:0,fulls:0};
function cloud(req){const u=new URL(req.url),p=u.pathname;
 if(p==='/rest/v1/journal_cloud'){if(u.search.includes('payload')){C.fulls++;return C.rev?[{revision:C.rev,payload:C.payload,updated_at:new Date().toISOString()}]:[];}C.heads++;return C.rev?[{revision:C.rev,updated_at:new Date().toISOString()}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};C.cas.push({dev:req.dev,exp:b.p_expected_revision});if(b.p_expected_revision!==C.rev)return null;C.rev++;C.payload=b.p_payload;return C.rev;}
 if(p==='/rest/v1/rpc/hl_status')return {address:A,max_fill_id:0,max_funding_id:0,fills_count:0,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()};
 return [];}
const init=([A])=>{
 const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.__spotGo=true;window.__spotN=0;
 window.__hlHang=new Set();window.__cloudHang=null;window.__cloudDelay=0;window.__hangN=0;
 const hang=(o,dead)=>new Promise((res,rej)=>{window.__hangN++;if(dead)return;const s=o&&o.signal;if(s){if(s.aborted)return rej(s.reason||new DOMException('aborted','AbortError'));s.addEventListener('abort',()=>rej(s.reason||new DOMException('aborted','AbortError')),{once:true});}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(navigator.onLine===false)throw new TypeError('Failed to fetch');
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;if(window.__hlHang.has(b.type))await hang(o,false);
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':{window.__spotN++;for(let i=0;i<600&&!window.__spotGo;i++)await new Promise(r=>setTimeout(r,50));
     out={balances:window.__spotHeld?[{coin:'USDC',token:0,total:'0',hold:'0',entryNtl:'0'},{coin:'HYPE',token:1,total:'10',hold:'0',entryNtl:'0'}]:[{coin:'USDC',token:0,total:'0',hold:'0',entryNtl:'0'}]};break;}
    case 'spotMetaAndAssetCtxs':out=[{universe:[{tokens:[1,0],index:0,name:'@1'}],tokens:[{name:'USDC',index:0,szDecimals:8},{name:'HYPE',index:1,szDecimals:2}]},[{markPx:'10',midPx:'10'}]];break;
    case 'perpDexs':out=[null];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'frontendOpenOrders':case 'userFillsByTime':case 'userFills':case 'userFunding':case 'historicalOrders':out=[];break;
    case 'candleSnapshot':{const iv=IV[b.req.interval]||6e4;out=[];let p=100;for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<3000;t+=iv,i++){const c=p+Math.sin(i/3)*0.3;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.1),l:String(Math.min(p,c)-0.1),v:'10',n:5});p=c;}break;}
    default:out={};}
   return J(out);}
  if(u.includes('.supabase.co/')){const full=u.includes('payload'),isHead=u.includes('/journal_cloud')&&!full;const H=window.__cloudHang;
   if(H&&((H==='head'&&isHead)||(H==='full'&&full)||(H==='any')))await hang(o,false);if(H==='dead'&&isHead)await hang(o,true);
   if(full&&window.__cloudDelay){await new Promise((res,rej)=>{const t=setTimeout(res,window.__cloudDelay);o.signal&&o.signal.addEventListener('abort',()=>{clearTimeout(t);rej(o.signal.reason);},{once:true});});}
   let body;try{body=o.body?JSON.parse(o.body):undefined;}catch{}const r=await window.__cloud({url:u,method:o.method||'GET',body});
   if(r&&r.__status)return J({message:r.message},r.__status);return J(r===undefined?null:r);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}
  send(d){const m=JSON.parse(d);if(m.method==='subscribe')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'userFills',data:{isSnapshot:true,user:m.subscription.user,fills:[]}})}),25);if(m.method==='ping')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'pong'})}),5);}
  close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;
};

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>d.accept());await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const seed=(p,N,STEP=7)=>p.evaluate(async ([N,STEP])=>{const now=Date.now(),H=3600e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
  const T=[];for(let i=0;i<N;i++){const t0=now-5*H-i*STEP*H,id='r'+i,win=i%3!==0;T.push(normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:t0,name:['ETH','BTC','SOL','HYPE'][i%4],direction:i%5?'long':'short',date:new Date(t0).toISOString().slice(0,10),stop:98,stop0:98,initialRisk:20,riskR:1,setup:['눌림','베이스 돌파','미분류'][i%3],leverage:5,marginMode:'cross',process:i%4?'compliant':'violation',review:i%2?'복기 '+i:'',violations:[],entryNote:'근거',
   entries:[ev(id+'e',t0,10,100)],fills:i===0?[]:[ev(id+'f',t0+H,10,win?103:98)],funding:[],images:[]}));}
  state.trades=T;Object.assign(state.settings,{account:10000});await persist();setPage('records');renderAll();return T.length;},[N,STEP]);

 const S=globalThis.__S={};
 /* 화면 상태: 탭·창 스크롤·표 상자 스크롤·줄/카드 수·대상 요소 화면 위치 */
 const st=(p,key)=>p.evaluate(key=>{const sc=document.querySelector('#recordList .record-table-scroll');const b=$('recordList');let top=null,flash=false;
  if(key){const root=$('v15Drill')&&$('v15Drill').open?$('v15Drill'):document.getElementById('page-'+currentPage);const el=[...root.querySelectorAll('['+key[0]+'="'+key[1]+'"]')].find(e=>e.getClientRects().length);if(el){top=Math.round(el.getBoundingClientRect().top);flash=!!document.querySelector('.v120-flash');}}
  return {page:currentPage,win:Math.round(scrollY),inner:sc?Math.round(sc.scrollTop):null,rows:b.querySelectorAll('tr[data-open]').length,cards:b.querySelectorAll('.record-card').length,top,flash,dlg:$('tradeDialog').open,drill:!!($('v15Drill')&&$('v15Drill').open),drillTop:$('v15Drill')?Math.round($('v15Drill').scrollTop):null};},key);
 const near=(a,b,t=3)=>a!=null&&b!=null&&Math.abs(a-b)<=t;
 const same=(b,a)=>({page:a.page===b.page,win:near(a.win,b.win),inner:b.inner==null?a.inner==null:near(a.inner,b.inner),top:near(a.top,b.top)});
 /* 대상 고르기: root 안 보이는 것 중 idx번째를 화면 가운데로 */
 const pick=(p,sel,idx,inner)=>p.evaluate(([sel,idx,inner])=>{window.dispatchEvent(new Event('wheel'));},[sel,idx,inner]).then(()=>p.evaluate(([sel,idx,inner])=>{const root=$('v15Drill')&&$('v15Drill').open?$('v15Drill'):document.getElementById('page-'+currentPage);const els=[...root.querySelectorAll(sel)].filter(e=>e.getClientRects().length);if(!els.length)return null;const el=els[Math.min(idx,els.length-1)];
   el.scrollIntoView({block:'center'});const a=[...el.attributes].find(x=>/^data-(open|calendar-trade|v18-open|v18-review|v63-open|v15-open)$/.test(x.name));return [a.name,a.value];},[sel,idx,inner]));
 const clickKey=(p,key)=>p.evaluate(key=>{const root=$('v15Drill')&&$('v15Drill').open?$('v15Drill'):document.getElementById('page-'+currentPage);const el=[...root.querySelectorAll('['+key[0]+'="'+key[1]+'"]')].find(e=>e.getClientRects().length);(el.querySelector('.row-open')||el).click();},key);
 const typeNote=async p=>{await p.evaluate(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v71-area]')||document.querySelector('#tradeDialog textarea');ta&&ta.focus();});await p.keyboard.type('v120 복기 메모',{delay:15});await p.waitForTimeout(500);};
 const closeBtn=p=>p.evaluate(()=>document.querySelector('#tradeDialog [data-close="tradeDialog"]').click());
 const cycle=async(P,o,key,{edit=true,how='btn',late=false,user=false}={})=>{
  o.before=await st(P,key);await clickKey(P,key);await P.waitForTimeout(800);o.opened=await P.evaluate(()=>$('tradeDialog').open);
  if(edit)await typeNote(P);
  if(how==='esc')await P.keyboard.press('Escape');else await closeBtn(P);
  if(late){await P.waitForTimeout(150);await P.evaluate(()=>{const b=$('recordList');if(currentPage==='records'&&b){b.innerHTML='';setTimeout(()=>renderRecords(),400);}else{const pg=document.getElementById('page-'+currentPage);const h=pg.style.minHeight;pg.style.display='none';setTimeout(()=>{pg.style.display='';},400);}});}
  await P.waitForTimeout(250);o.flash=(await st(P,key)).flash;
  if(user){await P.waitForTimeout(100);if(o.before.inner!=null){await P.mouse.move(700,500);await P.mouse.wheel(0,-400);}else{await P.evaluate(()=>{window.dispatchEvent(new Event('touchstart'));window.scrollBy(0,-400);});}}
  await P.waitForTimeout(600);await P.waitForFunction(()=>typeof v120Debug!=='function'||!v120Debug().guard,null,{timeout:9000}).catch(()=>{});await P.waitForTimeout(200);o.after=await st(P,key);o.same=same(o.before,o.after);o.dbg=await P.evaluate(()=>{if(typeof v120Debug!=='function')return {};const d=v120Debug();return {n:d.n,last:d.last};});return o;};
 const one=async W=>{const w='w'+W,O=S[w]={};const ctx=await mkCtx(W,'d'+W);const P=await open(ctx,w);await seed(P,300);await P.waitForTimeout(800);
  const rowSel=W>600?'tr[data-open]':'.record-card';
  /* (R) */
  await P.evaluate(()=>document.querySelector('[data-v113-more]').click());await P.waitForTimeout(500);
  O.R={};let key=await pick(P,rowSel,150);await P.waitForTimeout(500);O.R.key=key;await cycle(P,O.R,key,{edit:true});
  O.R.rowsKept=W>600?O.R.after.rows===O.R.before.rows&&O.R.before.rows>=200:O.R.after.cards===O.R.before.cards&&O.R.before.cards>=100;
  O.R.scrolled=W>600?O.R.before.inner>3000:O.R.before.win>3000;
  /* (E) */
  O.E={};key=await pick(P,rowSel,120);await P.waitForTimeout(400);await cycle(P,O.E,key,{edit:false,how:'esc'});
  /* (L) */
  O.L={};key=await pick(P,rowSel,90);await P.waitForTimeout(400);await cycle(P,O.L,key,{edit:true,late:true});
  /* (U) */
  O.U={};key=await pick(P,rowSel,140);await P.waitForTimeout(400);await cycle(P,O.U,key,{edit:true,user:true});
  O.U.kept=W>600?O.U.after.inner<O.U.before.inner-200:O.U.after.win<O.U.before.win-200;O.U.stop=O.U.dbg.last&&O.U.dbg.last.end;
  /* (S) 상세 없이 다시 그리기 */
  if(W>600){O.S={};await pick(P,rowSel,100);await P.waitForTimeout(300);const b=await st(P);await P.evaluate(()=>renderAll());await P.waitForTimeout(400);const a=await st(P);O.S.keep=near(a.inner,b.inner)&&b.inner>1000;
   await P.fill('#recordSearch','BTC');await P.waitForTimeout(400);O.S.search=(await st(P)).inner;await P.fill('#recordSearch','');await P.waitForTimeout(300);}
  /* (D) 카드 상세 목록 */
  O.D={};await seed(P,300,1);await P.waitForTimeout(600);await P.evaluate(()=>{setPage('dashboard');v15OpenDrill('week');});await P.waitForTimeout(600);
  key=await pick(P,'[data-v15-open]',40);await P.waitForTimeout(300);O.D.key=key;
  if(key){O.D.before=await st(P,key);await clickKey(P,key);await P.waitForTimeout(700);O.D.mid=await P.evaluate(()=>({trade:$('tradeDialog').open,drill:$('v15Drill').open}));await typeNote(P);await closeBtn(P);await P.waitForTimeout(600);await P.waitForFunction(()=>typeof v120Debug!=='function'||!v120Debug().guard,null,{timeout:9000}).catch(()=>{});await P.waitForTimeout(200);
   O.D.after=await st(P,key);O.D.reopen=O.D.after.drill;O.D.drillSame=near(O.D.after.drillTop,O.D.before.drillTop)&&O.D.before.drillTop>200;O.D.topSame=near(O.D.after.top,O.D.before.top);}
  await P.evaluate(()=>{$('v15Drill')&&$('v15Drill').open&&$('v15Drill').close();});await P.waitForTimeout(300);
  /* (W) 복기 탭 */
  O.W={};await P.evaluate(()=>setPage('weekly'));await P.waitForTimeout(800);key=await pick(P,'[data-v63-open],[data-v18-review],[data-v18-open]',8);await P.waitForTimeout(400);O.W.key=key;
  if(key){await cycle(P,O.W,key,{edit:true});O.W.scrolled=O.W.before.win>500;}
  /* (C) 캘린더 날짜 상세 */
  O.C={};await P.evaluate(()=>{setPage('calendar');const t=state.trades.find(x=>x.id==='r6');selectedCalendarDay=calcTrade(t).ledger.slice(-1)[0].date;calendarMonth=selectedCalendarDay.slice(0,7);renderCalendar();});await P.waitForTimeout(600);
  key=await pick(P,'[data-calendar-trade]',0);await P.waitForTimeout(400);O.C.key=key;
  if(key){O.C.day=await P.evaluate(()=>selectedCalendarDay);await cycle(P,O.C,key,{edit:true});O.C.dayKept=await P.evaluate(d=>selectedCalendarDay===d,O.C.day);O.C.scrolled=O.C.before.win>100;}
  /* (G) 상세 안에서 탭 이동 뒤 닫기 */
  O.G={};await P.evaluate(()=>setPage('records'));await P.waitForTimeout(500);key=await pick(P,rowSel,30);await P.waitForTimeout(300);await clickKey(P,key);await P.waitForTimeout(600);
  await P.evaluate(()=>{setPage('settings');$('tradeDialog').close();});await P.waitForTimeout(1500);O.G.page=await P.evaluate(()=>currentPage);O.G.win=await P.evaluate(()=>Math.round(scrollY));O.G.skip=await P.evaluate(()=>typeof v120Debug==='function'?v120Debug().n.skipPage:null);
  await P.screenshot({path:path.join(outDir,'t120-'+w+'.png')}).catch(e=>{R.shotErr=e.message;});
  await ctx.close();};
 await Promise.all([one(1440),one(390)]);
 Object.assign(R,S);console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.log(JSON.stringify({...(globalThis.__S||{}),errors:['FATAL '+(e&&e.stack||e)]}));process.exit(1);});
