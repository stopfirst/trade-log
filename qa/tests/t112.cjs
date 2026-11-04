/* v112 QA — 모의 클라우드(journal_cloud·journal_cas, 이 스크립트 안 node 메모리) + 모의 HL(fetch·WebSocket), 외부 연결 없음. 가짜 주소·id만.
   (m) 병합 엣지(페이지 안 v110Test.merge 순수 호출, work/AUDIT-20261104/merge-edge.cjs 이식 + 확장):
       일간·주간 복기 다른 날/같은 날 다른 칸(시장 → 날짜 → 칸) · 수동 체결 가격 정정·체결 삭제 유지 · 양쪽 체결 정정 → 충돌 사본 · 체결 줄 복기 칸 ·
       문자열 배열(v109Dismiss·violations·emo.pre) 원소 합집합·기준 대비 삭제 · 설정 객체(v63Goals) 하위 키 · 계산 캐시 v63x 차이만인 삭제 거래
   (i) 둘러보기 무업로드: 일지 동기화 뒤 상세 4개(복기 탭, MFE/MAE 계산)·화면 순회 → 자동 저장('edit') 올리기 0 · 클라우드 rev 그대로 ·
       45초 받기('poll') = head 1번만(전체 받기 0·올리기 0) · MFE/MAE 계산 뒤 일지 칸 요소 그대로(카드 통째 교체 없음) ·
       실제 편집은 올림(저장본에 v63x 없음)
   (d) '클라우드 것으로 바꾸기' 확인 창 취소 → 동기화 기준 그대로   (e) 같은 브라우저 두 탭: 탭 B가 다른 탭이 바꾼 기준 대신 자기 기준으로 병합 → 두 탭 편집 모두 클라우드에
   (s) HL 손실 한도: 주소 있고 현물 미수신 → 하루 한도 '계산 중' 보류(USDC만 4% 손실이라도 hit 아님) · 패널·진입 점검 경고·저장 확인·위젯 배지 →
       현물 도착(마감 현물 계산 중도 보류) → 마감 현물 포함 분모로 다시 그림(2%, hit 아님) */
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
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
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
 let DISMISS=false;
 const mkCtx=async(W,dev)=>{const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});
  await ctx.exposeBinding('__cloud',(src,req)=>cloud({...req,dev}));await ctx.addInitScript(init,[A]);return ctx;};
 const open=async(ctx,name)=>{const p=await ctx.newPage();p.on('pageerror',e=>R.errors.push(name+' '+e.message));p.on('dialog',d=>DISMISS?d.dismiss():d.accept());await p.goto(URL0);await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);return p;};
 const login=p=>p.evaluate(P=>{cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:'11111111-2222-3333-4444-555555555555',email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};v110Paint();},PRJ);
 const idle=p=>p.evaluate(async()=>{for(let i=0;i<100&&(V110.busy||publicBusy>0);i++)await new Promise(r=>setTimeout(r,100));});
 const sync=p=>p.evaluate(async()=>{for(let i=0;i<100&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));const r=await v110Sync('test',{force:true});for(let i=0;i<100&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));return r;});
 const stage=(p,id,patch)=>p.evaluate(async([id,patch])=>{const t=state.trades.find(x=>x.id===id);v100Stage(t,patch,10);await v100Flush(true);},[id,patch]);
 const closeDlg=p=>p.evaluate(()=>{const d=$('tradeDialog');if(d&&d.open)d.close();});
 const S=globalThis.__S={};
 const ctxP=await mkCtx(1440,'pc');const P=await open(ctxP,'PC');
 /* ---- (m) 병합 엣지 ---- */
 S.m=await P.evaluate(()=>{const M=v110Test.merge,Cl=x=>JSON.parse(JSON.stringify(x)),out={};
  const tr=(id,extra)=>({id,name:'AAPL',direction:'long',date:'2026-11-01',updatedAt:1000,entries:[{id:id+'e',date:'2026-11-01',time:'10:00:00',timestamp:1,shares:1,price:100}],fills:[],funding:[],entryNote:'',...extra});
  const st=(trades,extra)=>({trades,settings:{account:1000},updatedAt:1000,sync:{},graveyard:[],archive:[],...extra});
  /* 1) 일간 복기(감사 재현 모양: 날짜 → 칸) */
  {const b=st([tr('a')],{dailyReviews:{'2026-11-01':{good:'x'}}});const m=Cl(b);m.dailyReviews['2026-11-02']={good:'PC에서 쓴 11-02'};m.updatedAt=2000;const o=Cl(b);o.dailyReviews['2026-11-03']={good:'폰에서 쓴 11-03'};o.updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state;out.daily={keys:Object.keys(r.dailyReviews).sort(),conf:r.v110Conflicts.length};}
  /* 1b) 앱 실제 모양: 시장 → 날짜 → 칸, 같은 날 다른 칸 + 다른 날 */
  {const b=st([tr('a')],{dailyReviews:{hl:{'2026-11-01':{good:'',mistakes:'',memo:'',updatedAt:1}}},weeklyReviews:{hl:{'2026-10-26':{good:'g',focus:['손절'],updatedAt:1}}}});
   const m=Cl(b);m.dailyReviews.hl['2026-11-01'].good='PC 잘한 점';m.dailyReviews.hl['2026-11-01'].updatedAt=2000;m.weeklyReviews.hl['2026-10-26'].focus.push('PC 집중');m.weeklyReviews.hl['2026-11-02']={good:'PC W45',updatedAt:2000};m.updatedAt=2000;
   const o=Cl(b);o.dailyReviews.hl['2026-11-01'].mistakes='폰 실수';o.dailyReviews.hl['2026-11-01'].updatedAt=3000;o.dailyReviews.hl['2026-11-02']={good:'폰 11-02',updatedAt:3000};o.weeklyReviews.hl['2026-10-26'].focus.push('폰 집중');o.updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state,d=r.dailyReviews.hl,w=r.weeklyReviews.hl;
   out.nested={d1:[d['2026-11-01'].good,d['2026-11-01'].mistakes,d['2026-11-01'].updatedAt],d2:d['2026-11-02']&&d['2026-11-02'].good,wFocus:w['2026-10-26'].focus,w45:w['2026-11-02']&&w['2026-11-02'].good,conf:r.v110Conflicts.length};}
  /* 1c) 같은 날 같은 칸 → 최근 쪽 + 충돌 사본(일간 복기 라벨) */
  {const b=st([],{dailyReviews:{hl:{'2026-11-01':{memo:'',updatedAt:1}}}});const m=Cl(b);m.dailyReviews.hl['2026-11-01'].memo='PC 메모';m.updatedAt=2000;const o=Cl(b);o.dailyReviews.hl['2026-11-01'].memo='폰 메모';o.updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state;out.sameField={memo:r.dailyReviews.hl['2026-11-01'].memo,conf:r.v110Conflicts.map(c=>[c.field,c.kept,c.lost,c.tradeId]),label:r.v110Conflicts[0]?v110Label(r.v110Conflicts[0].field):''};}
  /* 2) 수동 거래 체결 가격 정정 + 다른 쪽 나중에 메모만 */
  {const b=st([tr('a')]);const m=Cl(b);m.trades[0].entries[0].price=101.5;m.trades[0].updatedAt=2000;const o=Cl(b);o.trades[0].entryNote='폰 메모';o.trades[0].updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state;out.execEdit={price:r.trades[0].entries[0].price,note:r.trades[0].entryNote,conf:r.v110Conflicts.length};
   const r2=M(b,o,m,{src:'cloud'}).state;out.execEditRev={price:r2.trades[0].entries[0].price,note:r2.trades[0].entryNote};}
  /* 2b) 체결 1개 삭제 정정 */
  {const b=st([tr('a',{entries:[{id:'e1',date:'2026-11-01',time:'10:00:00',timestamp:1,shares:1,price:100},{id:'e2',date:'2026-11-01',time:'10:05:00',timestamp:2,shares:1,price:100}]})]);
   const m=Cl(b);m.trades[0].entries.pop();m.trades[0].updatedAt=2000;const o=Cl(b);o.trades[0].review='폰 복기';o.trades[0].updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state;out.execDelete={n:r.trades[0].entries.length,review:r.trades[0].review};}
  /* 2c) 양쪽이 같은 수동 거래 체결을 다르게 정정 → 한쪽 + 충돌 사본 */
  {const b=st([tr('a')]);const m=Cl(b);m.trades[0].entries[0].price=101;m.trades[0].updatedAt=2000;const o=Cl(b);o.trades[0].entries[0].price=102;o.trades[0].updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state;out.execBoth={price:r.trades[0].entries[0].price,conf:r.v110Conflicts.map(c=>[c.field,c.lost&&c.lost[0]&&c.lost[0].price])};}
  /* 3) 체결 줄 복기 칸(체결 많은 쪽과 별개) */
  {const b=st([tr('a',{fills:[{id:'f1',sourceKey:'k1',date:'2026-11-01',time:'11:00:00',timestamp:5,shares:1,price:101,compliance:'unreviewed'}]})]);
   const m=Cl(b);m.trades[0].fills[0].compliance='followed';m.trades[0].updatedAt=2000;const o=Cl(b);o.trades[0].fills.push({id:'f2',sourceKey:'k2',date:'2026-11-01',time:'11:30:00',timestamp:6,shares:1,price:102,compliance:'unreviewed'});o.trades[0].updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state;out.fillReview={n:r.trades[0].fills.length,comp:r.trades[0].fills[0].compliance};}
  /* 4) 문자열 배열: 숨긴 감지·위반·감정 단계 */
  {const b=st([tr('a',{v109Dismiss:['risk'],violations:['추격','손절 미준수'],emo:{pre:['차분'],mid:[],post:[]}})]);
   const m=Cl(b);m.trades[0].v109Dismiss.push('limit');m.trades[0].violations=m.trades[0].violations.filter(x=>x!=='추격');m.trades[0].emo.pre.push('조급');m.trades[0].updatedAt=2000;
   const o=Cl(b);o.trades[0].v109Dismiss.push('v111order');o.trades[0].violations.push('물타기');o.trades[0].emo.pre.push('FOMO');o.trades[0].updatedAt=3000;
   const r=M(b,m,o,{src:'cloud'}).state,t=r.trades[0];out.arrays={dis:[...t.v109Dismiss].sort(),vio:[...t.violations].sort(),pre:[...t.emo.pre].sort(),conf:r.v110Conflicts.length};
   const r0=M(null,{...Cl(b),trades:[{...Cl(b).trades[0],v92Hide:['a'],updatedAt:2000}]},{...Cl(b),trades:[{...Cl(b).trades[0],v92Hide:['b'],updatedAt:3000}]},{src:'cloud'}).state;out.arraysNoBase=[...r0.trades[0].v92Hide].sort();}
  /* 5) 설정 객체 하위 키(주간 목표) */
  {const b=st([],{settings:{v63Goals:{'2026-W44':{t:'a'}}}});const m=Cl(b);m.settings.v63Goals['2026-W45']={t:'PC'};m.updatedAt=2000;const o=Cl(b);o.settings.v63Goals['2026-W46']={t:'폰'};o.updatedAt=3000;
   out.goals=Object.keys(M(b,m,o,{src:'cloud'}).state.settings.v63Goals).sort();}
  /* 6) 한쪽에서 지운 거래, 다른 쪽은 계산 캐시(v63x)만 다름 → 지움 */
  {const b=st([tr('a'),tr('z')]);const m=Cl(b);m.trades=m.trades.filter(t=>t.id!=='z');m.updatedAt=2000;const o=Cl(b);o.trades[1].v63x={v:1,mfeR:2};
   out.delCache=M(b,m,o,{src:'cloud'}).state.trades.map(t=>t.id);}
  /* 7) 계산 캐시는 변경 판단에서 빠짐 */
  {const s1=st([tr('a')]),s2=Cl(s1);s2.trades[0].v63x={v:1,mfeR:1};out.canon=v110Canon(s1)===v110Canon(s2);out.strip=!('v63x' in v110Test.strip(s2).trades[0])&&('v63x' in s2.trades[0]);}
  return out;});
 /* ---- (i) 둘러보기 무업로드 ---- */
 await P.evaluate(async()=>{const now=Date.now(),H=3600e3;const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
  const mk=(i)=>{const t0=now-30*H-i*20*H,id='q'+i;return normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:t0,name:['ETH','BTC','SOL'][i%3],direction:'long',date:new Date(t0).toISOString().slice(0,10),stop:98,stop0:98,initialRisk:20,riskR:1,setup:'눌림',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
   entryNote:'근거 '+i,stopNote:'',entries:[ev(id+'e',t0,10,100)],fills:[ev(id+'f',t0+3*H,10,101)],funding:[],images:[]});};
  Object.assign(state.settings,{account:1000});state.trades=Array.from({length:8},(_,i)=>mk(i));await persist();renderAll();});
 await login(P);
 S.i={first:await sync(P),rev0:C.rev};
 await P.waitForTimeout(1500);await idle(P);
 const cas0=C.cas.length,rev0=C.rev;S.i.cas0=cas0;
 /* 상세 복기 탭: MFE/MAE 계산(봉 모의) → 저장 → 자동 저장 예약 */
 await P.evaluate(()=>openTrade('q0','review'));await P.waitForFunction(()=>!!document.querySelector('#tradeDialog[open] [data-v71-area="entryNote"]'),null,{timeout:15000});
 await P.evaluate(()=>{window.__ta=document.querySelector('#tradeDialog [data-v71-area="entryNote"]');window.__card=$('v63Card');});
 await P.waitForFunction(()=>{const t=state.trades.find(x=>x.id==='q0');return !!(t&&t.v63x);},null,{timeout:15000}).catch(()=>{});await P.waitForTimeout(800);
 S.i.detail=await P.evaluate(()=>({ta:!!(window.__ta&&window.__ta.isConnected),card:!!(window.__card&&window.__card.isConnected),mfe:/MFE/.test(($('v63Card')||{}).textContent||''),v63x:!!state.trades.find(x=>x.id==='q0').v63x,partial:v112Debug().excPartial>=1}));
 await closeDlg(P);
 for(const id of ['q1','q2','q3']){await P.evaluate(id=>openTrade(id,'review'),id);await P.waitForTimeout(900);await closeDlg(P);}
 for(const pg of ['weekly','analysis','records','calendar','dashboard']){await P.evaluate(pg=>setPage(pg),pg);await P.waitForTimeout(300);}
 await P.waitForTimeout(5000);await idle(P);
 const h0=C.heads,f0=C.fulls;
 S.i.edit=await P.evaluate(async()=>{const r=await v110Sync('edit');return r;});
 S.i.poll=await P.evaluate(async()=>{const r=await v110Sync('poll');return r;});
 await idle(P);
 S.i.after={cas:C.cas.length-cas0,rev:C.rev-rev0,heads:C.heads-h0,fulls:C.fulls-f0,cached:await P.evaluate(()=>state.trades.filter(t=>t.v63x).length),fast:await P.evaluate(()=>v112Debug().fast>=1),clean:await P.evaluate(()=>v112Debug().clean)};
 /* 실제 편집은 올림 + 저장본에 계산 캐시 없음 */
 await stage(P,'q1',{review:'실제 편집'});await idle(P);
 S.i.real={r:await P.evaluate(async()=>{for(let i=0;i<100&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));return await v110Sync('edit');}),cas:C.cas.length-cas0,cloud:(C.payload.trades.find(t=>t.id==='q1')||{}).review,v63x:C.payload.trades.some(t=>'v63x' in t)};
 /* ---- (d) 클라우드 것으로 바꾸기 취소 → 기준 그대로 ---- */
 await idle(P);
 S.d={set:await P.evaluate(async()=>{V110.auto=false;const t=state.trades.find(x=>x.id==='q2');t.review='안 올린 이 기기 글';touch(t);return await persist();})};
 DISMISS=true;
 S.d.ret=await P.evaluate(async()=>{const r=await v110Replace();return r;});
 DISMISS=false;
 S.d.after=await P.evaluate(async()=>{const b=await v110GetBase();const t=b.payload.trades.find(x=>x.id==='q2');return {baseReview:t.review,local:state.trades.find(x=>x.id==='q2').review,rev:b.rev};});
 S.d.rev=C.rev;
 await P.evaluate(()=>{V110.auto=true;});
 /* ---- (e) 같은 브라우저 두 탭 ---- */
 await sync(P);
 const P2=await open(ctxP,'PC2');await login(P2);await sync(P2);
 await P2.evaluate(()=>{try{V83.bc.onmessage=null;}catch{}});
 await stage(P,'q3',{holdNote:'A탭 글'});await idle(P);S.e={a:await sync(P),revA:C.rev};
 await P2.evaluate(async()=>{const t=state.trades.find(x=>x.id==='q4');t.exitNote='B탭 글';touch(t);await persist();});
 S.e.b=await P2.evaluate(async()=>{for(let i=0;i<100&&V110.busy;i++)await new Promise(r=>setTimeout(r,100));V110.lastPush=0;return await v110Sync('edit');});
 await idle(P2);
 const ct=id=>C.payload.trades.find(t=>t.id===id)||{};
 S.e.cloud={a:ct('q3').holdNote,b:ct('q4').exitNote};S.e.tabBase=await P2.evaluate(()=>v112Debug().tabBase>=1||/* v117: 탭마다 메모리 기준(V117.base)으로 병합 — 다른 탭이 IndexedDB 기준을 바꿔도 이 탭이 마지막으로 맞춘 기준을 씀 */(typeof v117Ready==='function'&&v117Ready()&&!!V117.base&&V117.n.pull>=1));
 await P2.close();
 /* ---- (s) HL 손실 한도: 현물 미수신 보류 ---- */
 const ctxS=await mkCtx(1440,'spot');const Q=await open(ctxS,'SPOT');
 S.s=await Q.evaluate(async(A)=>{window.__spotGo=false;window.__spotHeld=true;try{localStorage.removeItem('tj.v57.spot');}catch{}V57.spot=null;V57.at=0;
  hlcStatus={...(hlcStatus||{}),address:A};
  /* 전일·기간 시작 직전 마감 USDC 1000(모의) */
  v28PrevBefore=function(k0){return k0?{key:v17AddDays(k0,-1),value:1000,source:'qa',expected:true}:null;};
  const D='2026-10-31',ev=(id,time,sh,px)=>({id,date:D,time,timestamp:Date.parse(D+'T'+time+'Z'),shares:sh,price:px,fee:0,seq:Date.parse(D+'T'+time+'Z')/1000});
  state.trades=[normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id:'L1',at:Date.parse(D+'T01:00:00Z'),name:'ETH',direction:'long',date:D,stop:95,stop0:95,initialRisk:50,riskR:1,setup:'눌림',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],entryNote:'',entries:[ev('L1e','01:00:00',10,100)],fills:[ev('L1f','02:00:00',10,97)],funding:[],images:[]})];
  Object.assign(state.settings,{account:1000,limD:3,limW:6,limM:10});await persist();renderAll();
  const L=limitStatus(),day=L.find(l=>l.mode==='day');const el=$('riskLimits');
  let pre=null;try{pre=v46Calc({dir:'long',price:100,stop:95,risk:1,account:1000});}catch(e){pre={err:String(e)};}
  try{openNew({direct:true});}catch{}const ov=$('limitOverride');const over=ov?ov.hidden:null;try{$('newDialog').close();}catch{}
  let w=null;try{w=v36Data();}catch{}
  return {hold:{day:!!day.hold,hit:day.hit,pct:day.pct,usdcOnlyPct:-30/1000*100,limit:day.limit,mode:day.basis.mode,txt:v28BasisText(day.basis),why:day.basis.v112Hold},
   panel:{hold:/계산 중/.test(el.textContent),reached:/도달/.test(el.textContent)},
   pre:(pre&&pre.warn||[]).filter(x=>/손실 한도/.test(x)),limitOverrideHidden:over,
   widget:{badge:w&&w.badge&&w.badge.text,day:w&&(w.rows.find(r=>r.mode==='day')||{}).hit}};},A);
 /* 현물 도착 → 마감 현물 계산 중(보류) → 계산 끝 → 다시 그림 */
 await Q.evaluate(async()=>{window.__spotGo=true;await v57Spot(true);});
 S.s.spot=await Q.evaluate(()=>({items:(V57.spot&&V57.spot.items||[]).length,st:v109SpotSt()}));
 await Q.waitForFunction(()=>{const L=limitStatus();return L.every(l=>!l.hold)&&L.every(l=>l.basis&&l.basis.spot>0);},null,{timeout:25000}).catch(()=>{});
 await Q.waitForTimeout(500);
 S.s.after=await Q.evaluate(()=>{const day=limitStatus().find(l=>l.mode==='day'),el=$('riskLimits');return {rows:limitStatus().map(l=>[l.mode,l.limit,l.sum,!!l.hold,l.hit]),hold:!!day.hold,hit:day.hit,pct:Math.round(day.pct*100)/100,spot:day.basis.spot,value:day.basis.value,panelHold:/계산 중/.test(el.textContent),txt:v28BasisText(day.basis)};});
 S.dbg=await Q.evaluate(()=>v112Debug());
 Object.assign(R,S);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);console.error('PARTIAL '+JSON.stringify(globalThis.__S||{}));process.exit(1);});
