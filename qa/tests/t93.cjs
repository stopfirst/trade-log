/* v93 HL 체결 실시간(WebSocket userFills) QA — 모의 WebSocket·모의 Supabase·모의 HL(전부 페이지 안 가짜, 외부 연결 없음).
   장면: (1) 연결·구독 메시지·헤더 초록 (2) 스냅샷 = 병합만(거래 안 생김) (3) 새 체결 → 수 초 안에 거래 생성
         (4) 같은 tid 다시/스냅샷/서버 행 도착 → 중복 없음 (5) 끊김 → 회색·즉시 주기 조회(폴백)·지수 백오프 재연결, 끊긴 동안 서버 수집분은 주기 조회로 반영
         (6) 재연결 → 초록, v89 주기 조회 생략 (7) 두 번째 탭: 연결 안 함(리더 1개)·초록 공유·체결 공유, 첫 탭 닫히면 넘겨받아 연결
         1440 / 390 헤더 넘침 검사, 페이지 오류 0. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40);
const init=(A)=>{
 const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const C=window.__c={status:0,fills:0,info:{},wsSent:[]};window.__srv=[];window.__wsBlock=false;window.__ws=[];
 window.fetch=async(u,o={})=>{u=String(u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}C.info[b.type]=(C.info[b.type]||0)+1;
   if(b.type==='userFillsByTime'||b.type==='userFunding')return J([]);if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J({},400);}
  if(u.includes('.supabase.co/')){
   if(u.includes('/rpc/hl_status')){C.status++;const mx=window.__srv.length;return J({address:A,max_fill_id:mx,max_funding_id:0,fills_count:mx,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()});}
   if(u.includes('/rest/v1/hl_fills')){C.fills++;const cur=+(u.match(/id=gt\.(\d+)/)||[])[1]||0;return J(window.__srv.map((raw,i)=>({id:i+1,raw})).filter(r=>r.id>cur));}
   if(u.includes('/rest/v1/hl_funding'))return J([]);
   return J([]);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;this.sent=[];window.__ws.push(this);
   setTimeout(()=>{if(window.__wsBlock){this.readyState=3;this.onerror&&this.onerror({});this.onclose&&this.onclose({code:1006});return;}this.readyState=1;this.onopen&&this.onopen({});},30);}
  send(d){this.sent.push(d);C.wsSent.push(d);const m=JSON.parse(d);
   if(m.method==='subscribe'){setTimeout(()=>this._in({channel:'subscriptionResponse',data:m}),10);setTimeout(()=>this._in({channel:'userFills',data:{isSnapshot:true,user:m.subscription.user,fills:[]}}),25);}
   if(m.method==='ping')setTimeout(()=>this._in({channel:'pong'}),5);}
  _in(m){if(this.readyState!==1)return;this.onmessage&&this.onmessage({data:JSON.stringify(m)});}
  close(){if(this.readyState===3)return;this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;
 window.WebSocket=FakeWS;
 window.__open=()=>window.__ws.filter(w=>w.readyState===1);
 window.__push=m=>{const w=window.__open().pop();if(w)w._in(m);return !!w;};
 window.__kill=()=>{for(const w of window.__open()){w.readyState=3;w.onclose&&w.onclose({code:1006});}};
};
const F=(tid,o)=>Object.assign({coin:'ETH',px:'100',sz:'1',side:'B',time:0,startPosition:'0',dir:'Open Long',closedPnl:'0',hash:'0x'+tid.toString(16).padStart(64,'0'),oid:tid*10,crossed:true,fee:'0.01',tid,feeToken:'USDC'},o);
const login=async(page)=>page.evaluate((A)=>{cloudConfig={url:'https://qa0000000000000000.supabase.co',key:'sb_publishable_QAQAQAQAQAQAQAQAQAQA'};cloudSession={project:cloudConfig.url,access_token:'qa',refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+86400,user:{id:'qa-user',email:''}};},A);
const snap=()=>{const tr=state.trades.filter(t=>t.market==='HL');const ids=tr.flatMap(t=>[...(t.entries||[]),...(t.fills||[])].map(e=>String(e.fillId||'')));
 return {n:tr.length,ev:ids.length,uniq:new Set(ids).size,ids:ids.sort(),open:tr.map(t=>!calcTrade(t).done)};};
const chk=()=>{const W=document.documentElement.clientWidth,bad=[];const el=document.getElementById('v93Live');
 for(const x of [el,...document.querySelectorAll('.page-head .header-right > *')]){if(!x||x.hidden)continue;const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.id||x.className)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}
 const t=el&&el.querySelector('span');if(t&&t.scrollWidth>t.clientWidth+1)bad.push('v93 text cut');
 return {docScroll:document.documentElement.scrollWidth>W+1,bad,on:!!(el&&el.classList.contains('on')),shown:!!(el&&!el.hidden&&el.getBoundingClientRect().width>0),txt:el?el.textContent:''};};
const wait=async(page,fn,arg,ms=6000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await page.evaluate(fn,arg))return Date.now()-t0;await page.waitForTimeout(50);}return -1;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const R={tag,errors:[],errors2:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init,A);
 const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(e.message));
 await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:20000});await page.waitForTimeout(400);
 R.before=await page.evaluate(()=>({ws:window.__ws.length,shown:!!document.getElementById('v93Live'),on:document.getElementById('v93Live')?.classList.contains('on')||false}));
 await login(page);
 await page.evaluate(async()=>{hlcLastRun=0;await hlcSync(false);});
 R.connectMs=await wait(page,()=>V93.live===true);
 R.conn=await page.evaluate(()=>({ws:window.__ws.length,url:window.__ws[0]&&window.__ws[0].url,sub:window.__c.wsSent.map(s=>JSON.parse(s)).filter(m=>m.method==='subscribe').map(m=>m.subscription),leader:V93.leader,live:V93.live}));
 // (2) 스냅샷: 병합만
 const now=await page.evaluate(()=>Date.now());
 const f1=F(5001,{time:now-120000}),f2=F(5002,{time:now-1000,sz:'1',startPosition:'1'}),f3=F(5003,{time:now-500,side:'A',dir:'Close Long',startPosition:'2',sz:'1',closedPnl:'2',px:'102'}),f4=F(5004,{time:now+5000,side:'A',dir:'Close Long',startPosition:'1',sz:'1',closedPnl:'3',px:'103'});
 await page.evaluate(([A,f])=>window.__push({channel:'userFills',data:{isSnapshot:true,user:A,fills:[f]}}),[A,f1]);await page.waitForTimeout(900);
 R.afterSnap=await page.evaluate((s)=>({mem:V93.mem.size,st:V93.st.snap,j:eval('('+s+')')(),status:window.__c.status}),snap.toString());
 // (3) 새 체결 → 거래
 const statusBefore=await page.evaluate(()=>window.__c.status);
 await page.evaluate(([A,a,b])=>{window.__t0=performance.now();window.__push({channel:'userFills',data:{user:A,fills:[a,b]}});},[A,f2,f3]);
 R.applyMs=await wait(page,()=>state.trades.some(t=>t.market==='HL'&&(t.fills||[]).some(e=>String(e.fillId)==='5003')),null,8000);
 await page.waitForTimeout(1500);
 R.afterFill=await page.evaluate((s)=>({j:eval('('+s+')')(),toast:(document.getElementById('toast')||{}).textContent||'',applied:V93.st.applied,bal:V93.st.bal,chs:window.__c.info.clearinghouseState||0}),snap.toString());
 // (4) 중복: 같은 tid 다시, 스냅샷 재전송, 서버 행 도착(수동 조회)
 await page.evaluate(([A,a,b,c])=>{window.__push({channel:'userFills',data:{user:A,fills:[b]}});window.__push({channel:'userFills',data:{isSnapshot:true,user:A,fills:[a,b,c]}});},[A,f1,f2,f3]);
 await page.waitForTimeout(800);
 await page.evaluate(([a,b,c])=>{window.__srv.push(a,b,c);},[f1,f2,f3]);
 await page.evaluate(async()=>{await hlcSync(true);});await page.waitForTimeout(500);
 R.dup=await page.evaluate(async(s)=>{const c=await v93LoadBase(hlcCacheId());const k=c?c.fills.map(r=>r.tid):[];return {j:eval('('+s+')')(),cacheN:k.length,cacheUniq:new Set(k).size,cursor:c&&c.fillCursor,dupCount:V93.st.dup>0};},snap.toString());
 // 헤더 1440
 R.w1440=await page.evaluate(chk);await page.screenshot({path:outDir+'/'+tag+'-1440-live.png',clip:{x:0,y:0,width:1440,height:220}});
 // (6) v89 주기 조회 생략 (연결 중)
 R.v89=await page.evaluate(async(A)=>{V89.addr=A;V89.from=Date.now()-3600e3;V89.to=Date.now();V89.at=0;V89.meta={pairs:new Map()};const before=window.__c.info.userFillsByTime||0;const r=await v89Ensure(V89.from);return {ret:r,calls:(window.__c.info.userFillsByTime||0)-before,skip:V93.st.v89skip};},A);
 // (5) 끊김 → 폴백·백오프
 await page.evaluate(()=>{window.__wsBlock=true;window.__s0=window.__c.status;window.__ws0=window.__ws.length;window.__kill();});
 await page.waitForTimeout(1200);
 R.down=await page.evaluate(()=>({live:V93.live,on:document.getElementById('v93Live').classList.contains('on'),polled:window.__c.status>window.__s0,timer:!!V93.timer}));
 R.v89down=await page.evaluate(async()=>{const before=window.__c.info.userFillsByTime||0;V89.at=0;await v89Ensure(V89.from);return {calls:(window.__c.info.userFillsByTime||0)-before};});
 await page.waitForTimeout(5200);
 R.backoff=await page.evaluate(()=>({tries:window.__ws.length-window.__ws0,retry:V93.retry,live:V93.live}));
 // 끊긴 동안 서버가 모은 체결 → 기존 주기 조회로 반영
 await page.evaluate((f)=>{window.__srv.push(f);},f4);
 await page.evaluate(async()=>{hlcLastRun=0;await hlcSync(false);});await page.waitForTimeout(400);
 R.fallback=await page.evaluate((s)=>eval('('+s+')')(),snap.toString());
 // 재연결
 await page.evaluate(()=>{window.__wsBlock=false;dispatchEvent(new Event('online'));});
 R.reconnMs=await wait(page,()=>V93.live===true,null,5000);
 await page.evaluate(([A,f])=>window.__push({channel:'userFills',data:{isSnapshot:true,user:A,fills:[f]}}),[A,f4]);await page.waitForTimeout(500);
 R.re=await page.evaluate((s)=>({on:document.getElementById('v93Live').classList.contains('on'),open:window.__open().length,j:eval('('+s+')')()}),snap.toString());
 // 390
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 R.w390=await page.evaluate(chk);await page.screenshot({path:outDir+'/'+tag+'-390-live.png',clip:{x:0,y:0,width:390,height:320}});
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(300);
 // (7) 두 번째 탭
 const p2=await ctx.newPage();p2.on('pageerror',e=>R.errors2.push(e.message));
 await p2.goto(URL0);await p2.waitForFunction(()=>window.journalReady===true,null,{timeout:20000});await login(p2);
 await p2.evaluate(async()=>{hlcLastRun=0;await hlcSync(false);});
 await wait(p2,()=>document.getElementById('v93Live')&&document.getElementById('v93Live').classList.contains('on'),null,5000);
 const f5=F(5005,{time:now+8000,sz:'2',startPosition:'0',px:'104'});
 await page.evaluate(([A,f])=>window.__push({channel:'userFills',data:{user:A,fills:[f]}}),[A,f5]);
 R.tab1Ms=await wait(page,()=>state.trades.some(t=>(t.entries||[]).some(e=>String(e.fillId)==='5005')),null,8000);
 R.tab2Ms=await wait(p2,()=>state.trades.some(t=>(t.entries||[]).some(e=>String(e.fillId)==='5005')),null,8000);
 R.tab2=await p2.evaluate((s)=>({ws:window.__ws.length,leader:V93.leader,on:document.getElementById('v93Live').classList.contains('on'),mem:V93.mem.has('t:5005'),j:eval('('+s+')')()}),snap.toString());
 R.tab1=await page.evaluate((s)=>eval('('+s+')')(),snap.toString());
 await page.close();
 R.takeoverMs=await wait(p2,()=>V93.leader&&V93.live&&window.__open().length===1,null,8000);
 R.tab2b=await p2.evaluate(()=>({ws:window.__ws.length,leader:V93.leader}));
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
