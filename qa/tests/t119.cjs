/* v119 QA — 동기화 충돌 PC 우선. PC(1440)·모바일(390, isMobile·hasTouch) 두 컨텍스트 + 모의 클라우드(t110과 같은 node 메모리 모의, 외부 연결 없음, 가짜 주소 0x1111…).
   (A) 병합 함수: PC 값 vs 모바일 값(모바일이 더 최근) → PC 값 + 충돌 사본(rule pc) · 같은 종류(PC·PC)/기기 모름 → 최신 · '최신 수정' 설정 → 최신 ·
       모바일 기기에서 병합해도 PC 값 · 입력 중 칸은 이 기기 값(rule typing) · 자동 칸(quickReview.appliedAt, HL 스탑, 자동 1R·자동 최초 손절, riskPlan 파생) 충돌 없음 ·
       손으로 고친 1R vs 자동 1R → 사용자 칸(PC 우선) · 동기화 직전 기준 사본과 비교해 고친 칸에 기기 표시 · 결과 칸 기기 표시 따라감
   (B) 이미 쌓인 충돌 중 자동 칸은 화면에서만 숨김(데이터 그대로) · 충돌 창 안내 'PC에서 고친 값을 남겼어요' · 설정/충돌 창 [PC(기본)][최신 수정] 누르면 바로 바뀜(대화상자 없음)
   (C) 실제 두 기기 흐름: PC가 먼저, 모바일이 나중에 같은 칸 → 양쪽 PC 값 · 충돌 1건(남긴 값 PC) · 양쪽 appliedAt·HL 스탑 서로 다르게 바뀌어도 충돌 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),http=require('http'),path=require('path');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40),PRJ='https://abcdefghijklmnop.supabase.co';
const KP=JSON.parse(fs.readFileSync(path.join(__dirname,'t110-kpepe.json'),'utf8')).fills;
/* ---- 모의 클라우드 ---- */
const C={rev:0,payload:null,updated:null,hist:[],cas:[],heads:0,fulls:0,fills:[],nextId:1};
function cloud(req){const u=new URL(req.url),p=u.pathname,q=u.search;
 if(p==='/rest/v1/journal_cloud'){if(q.includes('payload')){C.fulls++;return C.rev?[{revision:C.rev,payload:C.payload,updated_at:C.updated}]:[];}C.heads++;return C.rev?[{revision:C.rev,updated_at:C.updated}]:[];}
 if(p==='/rest/v1/rpc/journal_cas'){const b=req.body||{};const ok=b.p_payload&&b.p_payload.format==='trade-journal-hyperliquid'&&Array.isArray(b.p_payload.trades);C.cas.push({dev:req.dev,exp:b.p_expected_revision,cur:C.rev,ok});if(!ok)return {__status:400,message:'bad payload'};
  if(b.p_expected_revision===0){if(C.rev)return null;}else if(b.p_expected_revision!==C.rev)return null;
  if(C.rev)C.hist.push({revision:C.rev,payload:C.payload});C.hist=C.hist.slice(-5);C.rev++;C.payload=b.p_payload;C.updated=new Date().toISOString();return C.rev;}
 if(p==='/rest/v1/rpc/hl_status'){const mx=C.fills.reduce((m,f)=>Math.max(m,f.id),0);return {address:A,max_fill_id:mx,max_funding_id:0,fills_count:C.fills.length,funding_count:0,cron_active:true,last_ok_at:new Date().toISOString()};}
 if(p==='/rest/v1/hl_fills'){const gt=Number((u.searchParams.get('id')||'gt.0').slice(3));return C.fills.filter(f=>f.id>gt).sort((a,b)=>a.id-b.id).slice(0,1000).map(f=>({id:f.id,raw:f.raw}));}
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
 const dialogs=[];
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>{dialogs.push(name+':'+d.type());d.accept();});await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const login=p=>p.evaluate(P=>{cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};v110Paint();},PRJ);
 const sync=p=>p.evaluate(async()=>{for(let i=0;i<80&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));const r=await v110Sync('test',{force:true});for(let i=0;i<80&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));return r;});
 const tr=(p,id,k)=>p.evaluate(([id,k])=>{const t=state.trades.find(x=>x.id===id);return t?t[k]:'NO';},[id,k]);
 const stage=(p,id,patch)=>p.evaluate(async([id,patch])=>{const t=state.trades.find(x=>x.id===id);v100Stage(t,patch,10);await v100Flush(true);},[id,patch]);
 const idle=p=>p.evaluate(async()=>{for(let i=0;i<80&&(V110.busy||publicBusy>0);i++)await new Promise(r=>setTimeout(r,100));});
 const ctxP=await mkCtx(1440,'pc'),ctxM=await mkCtx(390,'mob');
 const P=await open(ctxP,'PC'),M=await open(ctxM,'MOB');
 const S=globalThis.__S={};
 S.dev={pc:await P.evaluate(()=>v119Dev()),mob:await M.evaluate(()=>v119Dev())};
 /* (A) 병합 함수 */
 S.A=await P.evaluate(()=>{const out={};const D=Date.parse('2026-10-30T00:00:00Z');
  const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0,seq:ts/1000,sourceKey:id};};
  const T=(x)=>Object.assign({id:'q1',name:'ETH',market:'HL',direction:'long',date:'2026-10-30',at:D,entries:[ev('e1',D,10,100)],fills:[ev('f1',D+3600e3,10,101)],funding:[],exitNote:'',review:'',updatedAt:1000},x);
  const st=(t)=>({format:'trade-journal-hyperliquid',currency:CURRENCY,updatedAt:t.updatedAt,settings:{},trades:[t]});
  const C=(r)=>r.state.v110Conflicts.map(c=>[c.field,c.kept,c.lost,c.rule,c.keptDev||null,c.lostDev||null]);
  const run=(b,m,o,ctx)=>v110MergeState(b?st(b):null,st(m),st(o),Object.assign({src:'cloud'},ctx||{}));
  const b=T({});
  /* 1) 이 기기 PC(더 예전) vs 다른 쪽 모바일(더 최근) → PC 값 */
  let r=run(b,T({exitNote:'PC 값',updatedAt:2000}),T({exitNote:'폰 값',updatedAt:3000,v119E:{exitNote:'mobile'}}));
  out.pcWins={v:r.state.trades[0].exitNote,c:C(r),e:r.state.trades[0].v119E};
  /* 2) 같은 종류(다른 쪽도 PC) → 최신 */
  r=run(b,T({exitNote:'PC 값',updatedAt:2000}),T({exitNote:'PC2 값',updatedAt:3000,v119E:{exitNote:'pc'}}));
  out.sameKind={v:r.state.trades[0].exitNote,c:C(r)};
  /* 3) 다른 쪽 기기 모름(예전 데이터) → 최신 */
  r=run(b,T({exitNote:'PC 값',updatedAt:2000}),T({exitNote:'옛 값',updatedAt:3000}));
  out.unknown={v:r.state.trades[0].exitNote,rule:C(r)[0]&&C(r)[0][3]};
  /* 4) 설정 '최신 수정' → 최신 */
  state.settings.v119Prefer='latest';
  r=run(b,T({exitNote:'PC 값',updatedAt:2000}),T({exitNote:'폰 값',updatedAt:3000,v119E:{exitNote:'mobile'}}));
  out.latestPref={v:r.state.trades[0].exitNote,rule:C(r)[0]&&C(r)[0][3]};
  delete state.settings.v119Prefer;
  /* 5) 모바일 기기에서 병합: 이 기기(모바일, 최근) vs PC → PC 값 */
  V119.devOv='mobile';
  r=run(b,T({exitNote:'폰 값',updatedAt:3000}),T({exitNote:'PC 값',updatedAt:2000,v119E:{exitNote:'pc'}}));
  out.onMobile={v:r.state.trades[0].exitNote,c:C(r),e:r.state.trades[0].v119E};
  /* 6) 입력 중 칸(keep)은 이 기기(모바일) 값 */
  r=run(b,T({exitNote:'폰 입력 중',updatedAt:3000}),T({exitNote:'PC 값',updatedAt:2000,v119E:{exitNote:'pc'}}),{keep:(id,k)=>k==='exitNote'});
  out.typing={v:r.state.trades[0].exitNote,c:C(r)};
  V119.devOv=null;
  /* 7) 자동 칸: appliedAt · HL 스탑 · 자동 1R · 자동 최초 손절 · riskPlan 파생 → 충돌 없음 */
  const bq=T({quickReview:{decision:'followed',appliedAt:10,answeredAt:5},stop:98,stopHistory:[],stop0:98,initialRisk:20,stop0Auto:true,stop0AutoVal:98,riskPlan:{stop:98,target:104,rr:2,reward:40}});
  const mq=T({quickReview:{decision:'followed',appliedAt:20,answeredAt:6},stop:99,stopHistory:[{at:1,from:98,to:99,src:'hl'}],stop0:99,initialRisk:10,stop0Auto:true,stop0AutoVal:99,riskPlan:{stop:98,target:104,rr:2.1,reward:41},updatedAt:2000});
  const oq=T({quickReview:{decision:'followed',appliedAt:30,answeredAt:7},stop:98.5,stopHistory:[{at:2,from:98,to:98.5,src:'hl'}],stop0:98.5,initialRisk:15,stop0Auto:true,stop0AutoVal:98.5,riskPlan:{stop:98,target:104,rr:2.2,reward:42},updatedAt:3000,v119E:{quickReview:'mobile',stop:'mobile',stop0:'mobile',initialRisk:'mobile',riskPlan:'mobile'}});
  r=run(bq,mq,oq);const t7=r.state.trades[0];
  out.auto={n:r.state.v110Conflicts.length,applied:t7.quickReview.appliedAt,stop:t7.stop,auto:[v119Test.isAuto({v119m:mq,v119o:oq},mq,'quickReview.appliedAt',20,30),v119Test.isAuto({v119m:mq,v119o:oq},mq,'stop',99,98.5),v119Test.isAuto({v119m:mq,v119o:oq},mq,'initialRisk',10,15)]};
  /* 8) 손으로 고친 1R(자동 값과 다름) vs 다른 쪽 자동 → 사용자 칸 → PC 우선 */
  const mr=T({stop0:99,stop0Auto:true,stop0AutoVal:99,initialRisk:33,updatedAt:2000}),or=T({stop0:99,stop0Auto:true,stop0AutoVal:99,initialRisk:15,updatedAt:3000,v119E:{initialRisk:'mobile'}});
  r=run(T({stop0:99,stop0Auto:true,stop0AutoVal:99,initialRisk:10}),mr,or);
  out.manualR={v:r.state.trades[0].initialRisk,c:C(r)};
  /* 9) 동기화 직전 기기 표시: 기준과 다른 사용자 칸만 */
  const keep=state.trades;const t9=normaliseTrade(T({id:'q9',exitNote:'새 메모',review:''}));state.trades=[t9];V119.dirty.clear();v119Mark(t9);
  const b9=normaliseTrade(T({id:'q9',exitNote:'',review:''}));const n9=v119Test.stampFrom(id=>id==='q9'?b9:null,()=>null);
  out.stamp={n:n9,e:t9.v119E,needPersist:V119.needPersist};V119.needPersist=false;V119.done=null;V119.dirty.clear();state.trades=keep;
  /* 10) 기기 모름(기준 없음 · 첫 병합) + 양쪽 표시 → 표시 사용 */
  r=v110MergeState(null,st(T({exitNote:'PC 값',updatedAt:2000,v119E:{exitNote:'pc'}})),st(T({exitNote:'폰 값',updatedAt:3000,v119E:{exitNote:'mobile'}})),{src:'cloud'});
  out.noBase={v:r.state.trades[0].exitNote,rule:r.state.v110Conflicts[0]&&r.state.v110Conflicts[0].rule};
  /* 11) 같은 브라우저 다른 창(v83) = 같은 기기 → 최신 */
  r=v110MergeState(st(b),st(T({exitNote:'창1',updatedAt:2000})),st(T({exitNote:'창2',updatedAt:3000,v119E:{exitNote:'mobile'}})),{src:'tab'});
  out.tab=r.state.trades[0].exitNote;
  return out;});
 /* (B) 쌓인 충돌 표시 · 안내 · 설정 */
 await login(P);await login(M);
 S.B=await P.evaluate(async()=>{const D=Date.parse('2026-10-30T00:00:00Z');
  const t=normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id:'old1',at:D,name:'BTC',direction:'long',date:'2026-10-30',stop:99,stopHistory:[{at:1,from:98,to:99,src:'hl'}],stop0:98,initialRisk:null,riskR:1,setup:'눌림',process:'unreviewed',review:'',violations:[],entryNote:'',stopNote:'',
   entries:[{id:'oe',date:'2026-10-30',time:'00:00:00',timestamp:D,shares:1,price:100,fee:0,seq:D/1000}],fills:[],funding:[],images:[]});
  state.trades=[t];
  const cf=(id,field,kept,lost)=>({id,at:Date.now(),src:'cloud',tradeId:'old1',name:'BTC',date:'2026-10-30',dir:'long',field,kept,lost,keptSide:'mine',lostAt:0});
  state.v110Conflicts=[cf('x1','quickReview.appliedAt',2,1),cf('x2','stop',99,98.5),cf('x3','exitNote','PC 메모','폰 메모'),cf('x4','riskPlan.rr',2,2.1)];
  state.v110Conflicts[2].rule='pc';state.v110Conflicts[2].keptDev='pc';state.v110Conflicts[2].lostDev='mobile';
  await persist();renderAll();v110Paint();
  const b=document.querySelector('#v110Sync [data-v110-cf]');
  return {open:v110Open().map(c=>c.id),data:state.v110Conflicts.length,chip:b&&!b.hidden?b.textContent:null};});
 await P.click('#v110Sync [data-v110-cf]');await P.waitForTimeout(250);
 S.B.pop=await P.evaluate(()=>{const p=$('v110Pop'),i=p.querySelector('.v110-pop-in');return {vis:!p.hidden,help:$('v119Help').textContent,txt:i.textContent.replace(/\s+/g,' '),items:p.querySelectorAll('[data-v110-c]').length,pressed:[...p.querySelectorAll('[data-v119-pref]')].map(b=>b.getAttribute('aria-pressed')),over:i.scrollWidth>i.clientWidth+1};});
 await P.screenshot({path:path.join(outDir,'t119-conflict-pc.png')}).catch(e=>{S.shotErr=String(e);});
 await P.click('#v110Pop [data-v119-pref="latest"]');await P.waitForTimeout(300);
 S.B.toLatest=await P.evaluate(()=>({pref:state.settings.v119Prefer,help:$('v119Help').textContent,pressed:[...document.querySelectorAll('#v110Pop [data-v119-pref]')].map(b=>b.getAttribute('aria-pressed'))}));
 await P.click('#v110Pop [data-v110-okall]').catch(()=>{});
 await P.click('#v110Pop [data-v110-ok]').catch(()=>{});await P.waitForTimeout(300);
 S.B.afterOk=await P.evaluate(()=>({open:v110Open().length,data:(state.v110Conflicts||[]).map(c=>c.id).sort()}));
 await P.evaluate(()=>{const q=$('v110Pop');if(q)q.hidden=true;setPage('settings');});await P.waitForTimeout(400);
 /* 설정 화면 토글(클라우드 로그인 전에도 카드가 있으면) */
 await P.evaluate(()=>{try{installCloudJournal();}catch{}try{v110Install();}catch{}});await P.waitForTimeout(200);
 S.B.settings=await P.evaluate(()=>{const e=$('v119Pref');if(!e)return null;return {pressed:[...e.querySelectorAll('[data-v119-pref]')].map(b=>b.getAttribute('aria-pressed')),dev:e.querySelector('.v119-dev').textContent,box:document.querySelector('#v110Box .v110-auto small').textContent};});
 if(S.B.settings){await P.click('#v119Pref [data-v119-pref="pc"]');await P.waitForTimeout(300);
  const box=await P.$('#v110Box');if(box)await box.screenshot({path:path.join(outDir,'t119-settings-pc.png')}).catch(e=>{S.shotErr=String(e);});}
 S.B.toPc=await P.evaluate(()=>({pref:state.settings.v119Prefer||'pc',pressed:[...document.querySelectorAll('#v119Pref [data-v119-pref]')].map(b=>b.getAttribute('aria-pressed')),box:(document.querySelector('#v110Box .v110-auto small')||{}).textContent||'',over:(()=>{const b=$('v110Box');return b?b.scrollWidth>b.clientWidth+1:null;})()}));
 S.B.dialogs=dialogs.slice();
 await P.evaluate(()=>setPage('dashboard'));
 /* (C) 실제 두 기기 흐름 */
 await P.evaluate(async()=>{state.v110Resolved=[...(state.v110Resolved||[]),...(state.v110Conflicts||[]).map(c=>c.id)];state.v110Conflicts=[];const D=Date.now()-86400e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
  const mk=(id,name)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:D,name,direction:'long',date:new Date(D).toISOString().slice(0,10),stop:98,stop0:98,initialRisk:null,riskR:1,setup:'눌림',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
   entryNote:'',stopNote:'',entries:[ev(id+'e',D,10,100)],fills:[ev(id+'f',D+3600e3,10,101)],funding:[],images:[],quickReview:{decision:'followed',appliedAt:1,source:'telegram'},stopHistory:[]});
  state.trades=[mk('gA','ETH'),mk('gB','BTC')];await persist();renderAll();});
 S.C={s0:[await sync(P),await sync(M)]};
 await stage(P,'gB',{exitNote:'PC 청산'});
 await stage(P,'gA',{quickReview:{decision:'followed',appliedAt:111,source:'telegram'},stop:99,stopHistory:[{at:111,from:98,to:99,src:'hl'}]});
 await P.waitForTimeout(80);
 await stage(M,'gB',{exitNote:'모바일 청산'});
 await stage(M,'gA',{quickReview:{decision:'followed',appliedAt:222,source:'telegram'},stop:98.7,stopHistory:[{at:222,from:98,to:98.7,src:'hl'}]});
 await idle(P);await idle(M);
 S.C.r=[await sync(P),await sync(M),await sync(P)];
 S.C.pc=await tr(P,'gB','exitNote');S.C.mob=await tr(M,'gB','exitNote');S.C.cloud=C.payload.trades.find(x=>x.id==='gB').exitNote;
 S.C.stamp=C.payload.trades.find(x=>x.id==='gB').v119E||null;
 S.C.conf=await P.evaluate(()=>v110Open().map(c=>({field:c.field,kept:c.kept,lost:c.lost,rule:c.rule,keptDev:c.keptDev,lostDev:c.lostDev})));
 S.C.confMob=await M.evaluate(()=>v110Open().map(c=>({field:c.field,kept:c.kept,keptSide:c.keptSide,keptDev:c.keptDev})));
 S.C.raw=await M.evaluate(()=>(state.v110Conflicts||[]).filter(c=>c.tradeId==='gA').length);S.C.rawPc=await P.evaluate(()=>(state.v110Conflicts||[]).filter(c=>c.tradeId==='gA').length);
 S.C.gA={pc:await tr(P,'gA','stop'),mob:await tr(M,'gA','stop'),pcApplied:(await tr(P,'gA','quickReview')).appliedAt,mobApplied:(await tr(M,'gA','quickReview')).appliedAt};
 S.C.chipMob=await M.evaluate(()=>{const b=document.querySelector('#v110Sync [data-v110-cf]');return b&&!b.hidden?b.textContent:null;});
 await M.evaluate(()=>v110ConfShow());await M.waitForTimeout(200);
 S.C.popMob=await M.evaluate(()=>{const p=$('v110Pop'),i=p.querySelector('.v110-pop-in');return {help:$('v119Help').textContent,txt:i.textContent.replace(/\s+/g,' ').slice(0,400),over:i.scrollWidth>i.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1};});
 await M.screenshot({path:path.join(outDir,'t119-conflict-mob.png')}).catch(e=>{S.shotErr=String(e);});
 S.C.dbg={pc:await P.evaluate(()=>{const d=v119Debug();return {stamp:d.stamp,pickPc:d.pickPc,lastErr:V110.err};}),mob:await M.evaluate(()=>{const d=v119Debug();return {stamp:d.stamp,pickPc:d.pickPc,autoSilent:d.autoSilent>0,lastErr:V110.err};})};
 Object.assign(R,S);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);console.error('PARTIAL '+JSON.stringify(globalThis.__S||{}));process.exit(1);});
