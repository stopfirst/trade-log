/* v111 QA — PC(1440)·모바일(390) + 모의 클라우드(journal_cloud·journal_cas·hl_status·hl_fills·flip_alerts, 이 스크립트 안 node 메모리, 외부 연결 없음). 가짜 주소·id만.
   (m) '주문 실수': t110-kpepe.json(실제 11-03 kPEPE 79체결 구조, 주소·hash·oid·tid 가짜, 시각 4일 당김 → 10-30 22:05:13 KST = 실제 11-03 22:05:13)
       → 롱 종료 + 숏, 숏에 kind 'order'(한 주문 반전, 롱 4,456,063 → 숏 10,020,607) · 목록 배지 '주문 실수'(v110 '뒤집힘' 대신, 중복 없음) · 상세 줄
       + 서버 flip_alerts 행(같은 oid·tid) → src app+server · 합성 ETH(청산 4분59초 뒤 반대 진입 = 'window') · BTC(5분1초 = 아님) · SOL(같은 방향 재진입 = 아님)
       · × 숨김(PC 클릭·모바일 탭) → t.v109Dismiss 'v111order' · 배지가 '뒤집힘'으로 · 월간 줄 건수 감소 · 다시 보기 복구 · 저장본 유지
       · 복기 탭 '복수매매 · 월간' 2026-10 '주문 실수' 건수·손익·승률
   (t) 타이핑: 입력 중 renderDetail·renderAll·v63PaintDetail·보통 저장(v100Flush)·자동 동기화(v110Sync 'poll') 미룸(칸 그대로·포커스 유지) → 멈춘 뒤 한 번 · 저장본에 글
   (a) 자동 높이: 10줄 진입 근거·복기 폼 칸 스크롤 없음, 줄 추가하면 늘어남, 일지 다시 읽기 글 90자 넘어도 전체
   (r) '복기 필요': 흔적 없는 종료 거래만 · 평가/등급/감정/청산 이유/사후 메모/복기 글/텔레그램 중 하나면 없음 · 진행 중 없음 · 'API' 없음 · 개별 복기 미완료·복기 대기 같은 기준 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const KP=JSON.parse(fs.readFileSync(path.join(__dirname,'t110-kpepe.json'),'utf8')).fills;
const flip=KP.find(f=>f.dir==='Long > Short');
const C={rev:0,payload:null,cas:[],fills:[],nextId:1,flipReads:0,flipRows:[]};
function cloud(req){const u=new URL(req.url),p=u.pathname;
 if(p==='/rest/v1/journal_cloud'){if(u.search.includes('payload'))return C.rev?[{revision:C.rev,payload:C.payload,updated_at:new Date().toISOString()}]:[];return C.rev?[{revision:C.rev,updated_at:new Date().toISOString()}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};C.cas.push(b.p_expected_revision);if(b.p_expected_revision!==C.rev)return null;C.rev++;C.payload=b.p_payload;return C.rev;}
 if(p==='/rest/v1/rpc/hl_status'){const mx=C.fills.reduce((m,f)=>Math.max(m,f.id),0);return {address:A,max_fill_id:mx,max_funding_id:0,fills_count:C.fills.length,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()};}
 if(p==='/rest/v1/hl_fills'){const gt=Number((u.searchParams.get('id')||'gt.0').slice(3));return C.fills.filter(f=>f.id>gt).sort((a,b)=>a.id-b.id).slice(0,1000).map(f=>({id:f.id,raw:f.raw}));}
 if(p==='/rest/v1/flip_alerts'){if(req.method!=='GET')return {__status:405,message:'read only'};C.flipReads++;return C.flipRows;}
 if(req.method!=='GET')C.writes=(C.writes||[]).concat(p);
 return [];}
const init=([A])=>{
 const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const IV={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'8h':288e5,'12h':432e5,'1d':864e5,'3d':2592e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'}]};break;
    case 'perpDexs':out=[null];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25},{name:'kPEPE',szDecimals:0,maxLeverage:10}]};break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];break;
    case 'frontendOpenOrders':case 'userFillsByTime':case 'userFills':case 'userFunding':case 'historicalOrders':out=[];break;
    case 'candleSnapshot':{const iv=IV[b.req.interval]||6e4;out=[];let p=100;for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<3000;t+=iv,i++){const c=p+Math.sin(i/3)*0.3;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.1),l:String(Math.min(p,c)-0.1),v:'10',n:5});p=c;}break;}
    default:out={};}
   return J(out);}
  if(u.includes('.supabase.co/')){let body;try{body=o.body?JSON.parse(o.body):undefined;}catch{}const r=await window.__cloud({url:u,method:o.method||'GET',body});
   if(r&&r.__status)return J({message:r.message},r.__status);return J(r===undefined?null:r);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}
  send(d){const m=JSON.parse(d);if(m.method==='subscribe')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'userFills',data:{isSnapshot:true,user:m.subscription.user,fills:[]}})}),25);if(m.method==='ping')setTimeout(()=>this.onmessage&&this.onmessage({data:JSON.stringify({channel:'pong'})}),5);}
  close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;
};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const dialogs=[];
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>{dialogs.push(d.message());d.accept();});await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const login=p=>p.evaluate(P=>{cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};v110Paint();},PRJ);
 const S=globalThis.__S={};
 const ctxP=await mkCtx(1440,'pc');const P=await open(ctxP,'PC');
 await login(P);
 /* ---- (m) 주문 실수 ---- */
 for(const f of KP)C.fills.push({id:C.nextId++,raw:f});
 S.m={};
 S.m.trades=await P.evaluate(async()=>{for(let k=0;k<4&&state.trades.filter(t=>t.name==='kPEPE').length<2;k++){for(let i=0;i<120&&(hlcBusy||hlcBlocked());i++)await new Promise(r=>setTimeout(r,100));await hlcSync(true);await new Promise(r=>setTimeout(r,300));}
  return state.trades.filter(t=>t.name==='kPEPE').map(t=>({dir:t.direction,st:t.sync&&t.sync.positionStatus})).sort((a,b)=>a.dir.localeCompare(b.dir));});
 /* 합성 거래(앱 자동 판정 창): 청산 뒤 4분59초 반대 = window, 5분1초 = 아님, 같은 방향 = 아님 */
 await P.evaluate(()=>{const ev=(id,ts,sh,px,oid)=>{const d=new Date(ts+9*3600e3).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,orderId:oid,fillId:id.replace(/\D/g,'')||null,sourceKey:'hyperliquid:qa:'+id};};
  const T=Date.parse('2026-10-29T03:00:00Z'),H=3600e3;const mk=(id,name,dir,t0,t1,px0,px1,oidA,oidB)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:t0,name,direction:dir,date:new Date(t0+9*H).toISOString().slice(0,10),stop:null,stop0:null,initialRisk:null,riskR:1,setup:'미분류',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'1e',t0,2,px0,oidA)],fills:[ev(id+'2f',t1,2,px1,oidB)],funding:[],images:[],sync:{positionStatus:'CLOSED',executionKeys:[],feeComplete:true,exchangePnlComplete:true}});
  const m=5*60000;
  state.trades.push(mk('wE1','ETH','long',T,T+H,100,101,'91001','91002'),mk('wE2','ETH','short',T+H+m-1000,T+2*H,100,98,'91003','91004'),
   mk('wB1','BTC','long',T,T+H,100,99,'92001','92002'),mk('wB2','BTC','short',T+H+m+1000,T+2*H,100,98,'92003','92004'),
   mk('wS1','SOL','long',T,T+H,100,99,'93001','93002'),mk('wS2','SOL','long',T+H+60000,T+2*H,100,102,'93003','93004'));renderAll();});
 const model=()=>P.evaluate(()=>{const m=v111Test.model();return state.trades.filter(t=>m.has(t.id)).map(t=>{const i=m.get(t.id);return {coin:i.coin,dir:t.direction,kind:i.kind,src:i.src.join('+'),gap:Math.round(i.gapMs/1000),prevSize:Math.round(i.prevSize),newSize:Math.round(i.newSize),oid:i.oid,tid:i.tid,time:i.time};}).sort((a,b)=>a.coin.localeCompare(b.coin));});
 S.m.model=await model();
 const shortId=await P.evaluate(()=>(state.trades.find(t=>t.name==='kPEPE'&&t.direction==='short')||{}).id);
 const longId=await P.evaluate(()=>(state.trades.find(t=>t.name==='kPEPE'&&t.direction==='long')||{}).id);
 const tags=id=>P.evaluate(id=>{const t=state.trades.find(x=>x.id===id),h=tickerHTML(t);return {mis:(h.match(/v111-mistag/g)||[]).length,flip:(h.match(/v110-fliptag/g)||[]).length};},id);
 S.m.tagShort=await tags(shortId);S.m.tagLong=await tags(longId);S.m.tagE2=await tags('wE2');S.m.tagB2=await tags('wB2');
 /* 서버 flip_alerts(서버 2.13.0 형식) 같은 oid·tid */
 C.flipRows=[{ref:'fl:hl:kPEPE:'+flip.oid,kind:'order',symbol:'kPEPE',dex:null,prev_dir:'long',new_dir:'short',prev_size:'4456063',new_size:'10020607',px:String(flip.px),at:new Date(flip.time).toISOString(),oid:String(flip.oid),tid:String(flip.tid),close_oid:null,close_tid:null,close_at:null,gap_sec:'0',reduce_only:false,reduce_only_source:'fills'}];
 const fr0=C.flipReads;S.m.pull=await P.evaluate(()=>v111Test.pull(true));S.m.model2=(await model()).filter(x=>x.coin==='kPEPE');S.m.flipReads=C.flipReads-fr0;/* 이 pull의 읽기만(느린 환경의 주기 읽기 제외) */
 /* 거래 목록 화면 배지 */
 await P.evaluate(()=>{setPage('records');renderAll();});await P.waitForTimeout(500);
 S.m.listMis=await P.evaluate(()=>document.querySelectorAll('#page-records .v111-mistag').length>0);
 /* 상세 */
 await P.evaluate(id=>openTrade(id,'review'),shortId);await P.waitForTimeout(900);
 const det=()=>P.evaluate(()=>{const d=$('tradeDialog'),m=d.querySelector('.v111-mis'),line=d.querySelector('.v111-misline');const r=m&&m.getBoundingClientRect();
  return {mis:!!m&&r.width>0,desc:line?line.textContent:'',boxes:d.querySelectorAll('.v110-flip').length,hid:!!d.querySelector('[data-v111-un]'),over:d.scrollWidth>d.clientWidth+1};});
 S.m.det=await det();
 await P.click('#tradeDialog .v111-x');await P.waitForTimeout(700);
 S.m.afterX={det:await det(),dis:await P.evaluate(id=>state.trades.find(t=>t.id===id).v109Dismiss,shortId),tag:await tags(shortId)};
 await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();});await P.waitForTimeout(1200);
 S.m.saved=await P.evaluate(async id=>{const s=await v83Read();return (s.trades.find(t=>t.id===id)||{}).v109Dismiss;},shortId);
 /* 월간(숨긴 상태 → 1건, 다시 보기 → 2건) */
 const month=()=>P.evaluate(()=>{setPage('weekly');V99.month='2026-10';v99Monthly();const tr=document.querySelector('#page-weekly tr[data-v99-row="v111order"]');const sm=document.querySelector('#page-weekly details[data-v91="v99"] summary small');
  const r=v111Test.month('2026-10');return {row:tr?[...tr.children].map(c=>c.textContent.trim()):null,n:r.n,closed:r.closed,usd:Math.round(r.usd*100)/100,win:r.win,meta:sm?sm.textContent:''};});
 S.m.monthHidden=await month();
 await P.evaluate(id=>openTrade(id,'review'),shortId);await P.waitForTimeout(800);
 await P.click('#tradeDialog [data-v111-un]');await P.waitForTimeout(700);
 S.m.restored={det:await det(),dis:await P.evaluate(id=>state.trades.find(t=>t.id===id).v109Dismiss||null,shortId)};
 await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();});await P.waitForTimeout(600);
 S.m.month=await month();
 S.m.expectUsd=await P.evaluate(ids=>Math.round(ids.reduce((s,id)=>s+calcTrade(state.trades.find(t=>t.id===id)).pnl,0)*100)/100,[shortId,'wE2']);
 S.m.writes=C.writes||[];
 /* ---- (t) 타이핑 중 미룸 ---- */
 S.t={};
 await P.evaluate(()=>{setPage('dashboard');openTrade('wB1','review');});await P.waitForTimeout(900);
 const L=P.locator('#tradeDialog [data-v71-area="entryNote"]');await L.scrollIntoViewIfNeeded();await L.click();
 await P.evaluate(()=>{window.__ta=document.querySelector('#tradeDialog [data-v71-area="entryNote"]');window.__f0=V100.n.flush;window.__d0={...v111Debug().n};window.__v0=window.V117?{...V117.n}:{};});
 await P.keyboard.type('입력 중 다시 그리기 ',{delay:20});
 S.t.during=await P.evaluate(async()=>{/* v117: 상세가 열려 있고 긴 글 칸에 쓰는 중이면 v111 대기열 대신 V117.bgPend(15초 조용할 때)로 미룸 → 둘 다 셈 */const dv=k=>window.V117?(V117.n[k]||0)-(window.__v0[k]||0):0;renderDetail();renderAll();v63PaintDetail();v100Flush();const s=await v110Sync('poll');const d=v111Debug();
  const ta=document.querySelector('#tradeDialog [data-v71-area="entryNote"]');return {same:ta===window.__ta,focus:document.activeElement===window.__ta,flush:V100.n.flush-window.__f0,detail:d.n.detail-window.__d0.detail+dv('d_det')+dv('d_det63'),render:d.n.render-window.__d0.render+dv('d_ra'),sync:d.n.sync-window.__d0.sync,syncRet:s,queued:[...new Set([...d.queued,...(window.V117?Object.keys(V117.bgPend).map(k=>({det:'renderDetail',det63:'renderDetail',ra:'renderAll'}[k]||k)):[]),...(dv('flushDefer')>0?['flush']:[])])].sort()};});
 await P.keyboard.type('끝',{delay:20});
 await P.waitForTimeout(3500);
 /* v117: 마지막 키 뒤 15초 조용하면 미룬 상세·전체 다시 그리기 */
 await P.waitForFunction(()=>!window.V117||!Object.keys(V117.bgPend).filter(k=>k==='det'||k==='det63').length,null,{timeout:25000}).catch(()=>{});await P.waitForTimeout(300);
 S.t.after=await P.evaluate(async()=>{const d=v111Debug();const ta=document.querySelector('#tradeDialog [data-v71-area="entryNote"]');const s=await v83Read();
  return {queued:d.queued,redrawn:ta!==window.__ta,focus:document.activeElement===ta,val:ta.value,saved:(s.trades.find(t=>t.id==='wB1')||{}).entryNote,flushed:V100.n.flush>window.__f0};});
 await P.evaluate(()=>document.activeElement.blur());await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();});
 /* ---- (a) 자동 높이 ---- */
 const LONG=Array.from({length:10},(_,i)=>'줄 '+(i+1)+' 길게 적은 진입 근거 내용입니다').join('\n');
 await P.evaluate(async L=>{const t=state.trades.find(x=>x.id==='wS2');t.entryNote=L;t.review=L;t.postEval='사후 메모 '+'아주 긴 글 '.repeat(20)+'끝';t.grade='B';touch(t);await persist();openTrade('wS2','review');},LONG);await P.waitForTimeout(1000);
 const auto=(p)=>p.evaluate(()=>{const out={};for(const [k,sel] of [['entry','#tradeDialog [data-v71-area="entryNote"]'],['review','#reviewForm textarea[name="review"]']]){const ta=document.querySelector(sel);if(!ta){out[k]=null;continue;}
  ta.scrollIntoView({block:'center'});out[k]={scroll:ta.scrollHeight>ta.clientHeight+1,tall:ta.clientHeight>150,auto:ta.classList.contains('v111-auto'),h:ta.clientHeight};}return out;});
 S.a={pc:await auto(P),fs:await P.evaluate(()=>v111Debug().fieldSizing)};
 const L2=P.locator('#tradeDialog [data-v71-area="entryNote"]');await L2.click();await P.keyboard.press('End');await P.keyboard.press('Control+End');
 const h0=await P.evaluate(()=>document.activeElement.clientHeight);for(let i=0;i<4;i++){await P.keyboard.press('Enter');await P.keyboard.type('추가 '+i);}await P.waitForTimeout(150);
 S.a.grow=await P.evaluate(h0=>{const ta=document.activeElement;return {more:ta.clientHeight>h0+40,scroll:ta.scrollHeight>ta.clientHeight+1};},h0);
 await P.evaluate(()=>document.activeElement.blur());await P.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();});await P.waitForTimeout(500);
 await P.evaluate(()=>setPage('weekly'));await P.waitForTimeout(1200);
 S.a.read=await P.evaluate(()=>{const b=[...document.querySelectorAll('.v71-read small')].map(x=>x.textContent).find(x=>x.includes('사후 메모'));return b?{len:b.length,end:b.endsWith('끝')}:null;});
 /* ---- (r) 복기 필요 ---- */
 S.r=await P.evaluate(async()=>{const T=Date.parse('2026-10-20T03:00:00Z'),H=3600e3;let k=0;const ev=(id,ts,sh,px)=>{const d=new Date(ts+9*H).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,sourceKey:'hyperliquid:qa:'+id,fillId:String(80000+(++k)),orderId:String(70000+k)};};
  const mk=(id,extra,open)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:T,name:'HYPE',direction:'long',date:'2026-10-20',stop:null,stop0:null,initialRisk:null,riskR:1,setup:'미분류',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e',T,2,100)],fills:open?[]:[ev(id+'f',T+H,2,101)],funding:[],images:[],sync:{positionStatus:open?'OPEN':'CLOSED',executionKeys:[],feeComplete:true,exchangePnlComplete:true},...extra});
  const cases={none:{},process:{process:'compliant'},grade:{grade:'B'},emo:{emo:{pre:[],mid:[],post:['만족']}},exitNote:{exitNote:'목표 도달'},postEval:{postEval:'잘함'},review:{review:'복기 글'},quick:{quickReview:{at:Date.now(),grade:'B'}},entryOnly:{entryNote:'진입 근거만'}};
  state.trades=state.trades.filter(t=>t.name!=='HYPE');for(const [c,x] of Object.entries(cases))state.trades.push(mk('r_'+c,x));state.trades.push(mk('r_open',{},true));await persist();setPage('dashboard');renderAll();
  const out={};for(const id of [...Object.keys(cases).map(c=>'r_'+c),'r_open']){const t=state.trades.find(x=>x.id===id),h=tickerHTML(t);out[id]={need:h.includes('>복기 필요<'),api:h.includes('>API<'),tg:h.includes('텔레그램으로 복기'),v18:v18NeedsReview(t)};}
  const q=$('reviewQueue');out.queue=q?q.textContent.replace(/\s+/g,' ').slice(0,40):'';out.pendingIds=state.trades.filter(t=>t.name==='HYPE'&&v111Test.need(t)).map(t=>t.id).sort();return out;});
 /* ---- 모바일: 주문 실수 탭 × · 자동 높이 ---- */
 const ctxM=await mkCtx(390,'mob');const M=await open(ctxM,'MOB');
 await M.evaluate(async([j])=>{const s=JSON.parse(j);state=s;state.trades=state.trades.map(normaliseTrade);await persist();renderAll();},[JSON.stringify(await P.evaluate(()=>state))]);
 await M.evaluate(id=>openTrade(id,'review'),shortId);await M.waitForTimeout(900);
 S.mob={det:await M.evaluate(()=>{const d=$('tradeDialog'),m=d.querySelector('.v111-mis');const r=m&&m.getBoundingClientRect();return {mis:!!m&&r.width>0,over:d.scrollWidth>d.clientWidth+1,doc:document.documentElement.scrollWidth>innerWidth+1};})};
 await M.screenshot({path:path.join(outDir,'t111-mob-mis.png')}).catch(e=>{S.shotErr=String(e);});
 await M.tap('#tradeDialog .v111-x');await M.waitForTimeout(700);
 S.mob.afterTap=await M.evaluate(id=>({dis:state.trades.find(t=>t.id===id).v109Dismiss,hid:!!document.querySelector('#tradeDialog [data-v111-un]')}),shortId);
 await M.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();openTrade('wS2','review');});await M.waitForTimeout(900);
 S.mob.auto=await auto(M);
 await P.screenshot({path:path.join(outDir,'t111-pc.png')}).catch(e=>{S.shotErr=String(e);});
 S.dialogs=dialogs.length;
 Object.assign(R,S);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);console.error('PARTIAL '+JSON.stringify(globalThis.__S||{}));process.exit(1);});
