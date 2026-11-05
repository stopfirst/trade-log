/* v121 단타 분리 (모의 데이터, 가짜 주소 0x1111…). 시계 2026-10-31 12:00 KST = 03:00 UTC → HL 오늘 10-31.
   거래(HL, 2주, 수수료 0, 초기 1R 10, 10-31 UTC):
     L31  BTC  00:00→00:31 (31분)  100→99.5  −1   R −0.1   → 스윙(빈 칸·복기 필요에 남음)
     S29  ETH  01:00→01:29 (29분)  100→102.5 +5            → 단타, 빈 칸·복기 필요에서 빠짐
     SBIG SOL  01:40→01:50 (10분)  100→92.5  −15  R −1.5   → 단타지만 −1R 넘긴 손실 → 남음
     L1   DOGE 02:10→02:30 (20분)  100→99    −2   R −0.2   → 단타, 빠짐
     REV  AVAX 02:35→02:45 (10분)  100→101.5 +3            → L1 손실 청산 5분 뒤 진입 = 복수매매 의심 → 남음
   세션(10-31): 단타 4건 · 2승 2패 50% · 순손익 −9 · 평균 보유 17분(17.25) · 복수매매 의심 1건 · 예외 SBIG·REV.
   기준 20분 → S29·L1 스윙(빈 칸에 들어옴), 35분 → L31도 단타(빠짐), 빈칸 → 기본 30.
   세션 메모: 입력 → 0.7초 뒤 state.v121Scalp.hl['2026-10-31'] 저장 · 캘린더 같은 날 같은 값 · 새로고침 뒤 유지 · 동기화 병합(날짜별·칸별)·충돌 라벨·v119 기기 표시. PC 1440 · 모바일 390 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const IV={'1m':6e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'}]};break;
    case 'perpDexs':out=[null];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];break;
    case 'candleSnapshot':{const iv=IV[b.req.interval]||6e4;out=[];let p=100;for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<2000;t+=iv,i++){const c=p+Math.sin(i/3)*0.3;out.push({t,T:t+iv-1,s:b.req.coin,i:b.req.interval,o:String(p),c:String(c),h:String(Math.max(p,c)+0.1),l:String(Math.min(p,c)-0.1),v:'10',n:5});p=c;}break;}
    default:out=[];}
   return J(out);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}send(){}close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;};
const seed=()=>{const ev=(id,ts,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:2,price:px,fee:0,seq:ts/1000,sourceKey:'hyperliquid:qa121:'+id};};
 const T=s=>Date.parse('2026-10-31T'+s+':00Z');
 const mk=(id,name,a,b,px0,px1)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:T(a),name,direction:'long',date:'2026-10-31',stop:null,stop0:null,initialRisk:10,riskR:1,setup:'미분류',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
  entries:[ev(id+'e',T(a),px0)],fills:[ev(id+'f',T(b),px1)],funding:[],images:[],sync:{positionStatus:'CLOSED',executionKeys:[],feeComplete:true,exchangePnlComplete:true}});
 state.settings.v92From='2026-10-25';
 state.trades.push(mk('L31','BTC','00:00','00:31',100,99.5),mk('S29','ETH','01:00','01:29',100,102.5),mk('SBIG','SOL','01:40','01:50',100,92.5),mk('L1','DOGE','02:10','02:30',100,99),mk('REV','AVAX','02:35','02:45',100,101.5));
 V121.memo=null;renderAll();};
const chk=(sel)=>{const W=document.documentElement.clientWidth,bad=[];
 document.querySelectorAll(sel).forEach(el=>{const r=el.getBoundingClientRect();if(!r.width||el.closest('[hidden]'))return;const host=el.closest('.card,.v121-cal')||document.body,hb=host.getBoundingClientRect();if(r.right>Math.min(W,hb.right)+0.5||r.left<Math.max(0,hb.left)-0.5)bad.push(String(el.className||el.id||el.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+Math.round(hb.right));});
 return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
const SEL='#v121Today,#v121Today *,#v121Cal,#v121Cal *,#v92Rev,#v92Rev *,#v92Dash,#v92Dash *,#v121Split,#v121Split *,#v121Set,#v121Set *';
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[]};
 const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){const w='w'+W,r={};out[w]=r;
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});await ctx.addInitScript(init);
  const A=await ctx.newPage();A.on('pageerror',e=>out.errors.push(w+' '+e.message));A.on('dialog',d=>{out.errors.push(w+' dialog '+d.message());d.dismiss();});
  await A.goto(URL0);await A.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await A.waitForTimeout(800);
  await A.evaluate(seed);await A.waitForTimeout(200);
  const ids=a=>a.map(x=>x).sort();
  const snap=()=>A.evaluate(()=>{const d=v121Debug();return {min:d.min,scalps:d.scalps.map(s=>s.id).sort(),skipped:d.skipped.slice().sort(),
   exc:Object.fromEntries(d.scalps.map(s=>[s.id,s.exc])),hold:Object.fromEntries(d.scalps.map(s=>[s.id,s.holdMin])),rev:d.scalps.filter(s=>s.revenge).map(s=>s.id),
   gaps:v92Rows().map(x=>x.t.id).sort(),need:state.trades.filter(t=>v111NeedReview(t)).map(t=>t.id).sort()};});
  r.base=await snap();
  /* 대시보드 빈 칸 카드 */
  r.dash=await A.evaluate(()=>{setPage('dashboard');v92Mount();const c=$('v92Dash');return {vis:!!(c&&!c.hidden),head:c?c.querySelector('.v92-head b').textContent:'',skip:c&&c.querySelector('.v121-skip')?c.querySelector('.v121-skip').textContent:'',
   badged:c?[...c.querySelectorAll('.v92-gaps li')].filter(li=>li.querySelector('.v121-b')).map(li=>li.querySelector('[data-v63-open]').dataset.v63Open).sort():[],
   why:c?[...c.querySelectorAll('.v121-why')].map(e=>e.textContent):[],ver:!!(c&&c.querySelector('.v108-src'))};});
  r.dashChk=await A.evaluate(chk,SEL);
  /* 복기 '오늘' 단타 세션 */
  r.today=await A.evaluate(async()=>{setPage('weekly');await new Promise(r=>setTimeout(r,400));const c=$('v121Today');if(!c)return {has:false};
   const k=x=>{const e=c.querySelector('[data-v121-k="'+x+'"]');return e?e.textContent:null;};
   return {has:true,vis:!c.hidden,beforeDaily:c.nextElementSibling===$('v21dHost'),n:k('n'),win:k('win'),net:k('net'),hold:k('hold'),rev:k('rev'),
    exc:[...c.querySelectorAll('.v121-exc [data-v63-open]')].map(b=>b.dataset.v63Open).sort(),excHead:c.querySelector('.v121-exc>b')?c.querySelector('.v121-exc>b').textContent:'',memo:!!$('v121MemoToday'),gapsRev:!!($('v92Rev')&&!$('v92Rev').hidden)};});
  r.todayChk=await A.evaluate(chk,SEL);
  await A.evaluate(()=>$('v121Today')&&$('v121Today').scrollIntoView({block:'center'}));
  await A.screenshot({path:path.join(outDir,w+'-today.png')}).catch(e=>{r.shotErr=String(e);});
  /* 세션 메모: 입력 → 저장 */
  await A.click('#v121MemoToday');await A.keyboard.type('첫 30분만 · 손절 뒤 재진입 1번');await A.waitForTimeout(1300);
  r.memo=await A.evaluate(()=>({saved:state.v121Scalp&&state.v121Scalp.hl&&state.v121Scalp.hl['2026-10-31']?state.v121Scalp.hl['2026-10-31'].memo:null,st:($('v121Today').querySelector('[data-v121-st]')||{}).textContent,focus:document.activeElement&&document.activeElement.id,saves:V121.n.save}));
  /* 입력 중 다시 그리기(동기화 등) → 칸·포커스 그대로 */
  r.typing=await A.evaluate(async()=>{const i=$('v121MemoToday');i.focus();i.value+='!';i.dispatchEvent(new Event('input',{bubbles:true}));v121Today();renderAll();await new Promise(r=>setTimeout(r,50));const j=$('v121MemoToday');return {same:i===j,val:j.value,focus:document.activeElement===j};});
  await A.waitForTimeout(1000);
  r.memo2=await A.evaluate(()=>state.v121Scalp.hl['2026-10-31'].memo);
  await A.evaluate(()=>{const i=$('v121MemoToday');i.blur();});
  /* 캘린더 날짜 상세 */
  r.cal=await A.evaluate(async()=>{selectedCalendarDay='2026-10-31';setPage('calendar');await new Promise(r=>setTimeout(r,400));const c=$('v121Cal');if(!c)return {has:false};
   const k=x=>{const e=c.querySelector('[data-v121-k="'+x+'"]');return e?e.textContent:null;};
   return {has:true,inDetail:c.parentNode===$('calendarDayDetail'),n:k('n'),net:k('net'),memo:($('v121MemoCal')||{}).value,exc:[...c.querySelectorAll('.v121-exc [data-v63-open]')].map(b=>b.dataset.v63Open).sort()};});
  r.calChk=await A.evaluate(chk,SEL);
  await A.evaluate(()=>$('v121Cal')&&$('v121Cal').scrollIntoView({block:'center'}));
  await A.screenshot({path:path.join(outDir,w+'-cal.png')}).catch(e=>{r.shotErr=String(e);});
  r.calNone=await A.evaluate(async()=>{selectedCalendarDay='2026-10-20';renderCalendar();await new Promise(r=>setTimeout(r,150));return !!$('v121Cal');});
  /* 거래 기록 배지 · 상세 */
  r.rec=await A.evaluate(async()=>{setPage('records');await new Promise(r=>setTimeout(r,400));const box=$('recordList');const got=new Set();
   box.querySelectorAll('[data-open]').forEach(el=>{if(el.getClientRects().length&&el.querySelector('.v121-b'))got.add(el.dataset.open);});return [...got].sort();});
  r.recChk=await A.evaluate(()=>{const W=document.documentElement.clientWidth;return {docScroll:document.documentElement.scrollWidth>W+1};});
  r.detail=await A.evaluate(async()=>{openTrade('S29');await new Promise(r=>setTimeout(r,300));const b=$('detailTitle').querySelector('.v121-b');const o={s29:b?b.textContent:null};$('tradeDialog').close();
   openTrade('L31');await new Promise(r=>setTimeout(r,300));o.l31=!!$('detailTitle').querySelector('.v121-b');$('tradeDialog').close();
   openTrade('SBIG');await new Promise(r=>setTimeout(r,300));const e=$('detailTitle').querySelector('.v121-b');o.sbigExc=!!(e&&e.classList.contains('exc'));$('tradeDialog').close();return o;});
  /* 분석: 단타/스윙 접힘, 핵심 지표는 그대로 */
  r.ana=await A.evaluate(async()=>{setPage('analysis');await new Promise(r=>setTimeout(r,400));const body=()=>($('v71Body')||{}).textContent||'';const on=body();
   V121.on=false;renderAnalysis();const off=body(),gone=!$('v121Split');V121.on=true;V121.memo=null;renderAnalysis();const d=$('v121Split');const closed=d?!d.open:null;d.open=true;d.dispatchEvent(new Event('toggle'));await new Promise(r=>setTimeout(r,100));
   const rows=Object.fromEntries([...d.querySelectorAll('tr[data-v121-row]')].map(tr=>[tr.dataset.v121Row,[...tr.querySelectorAll('td')].map(td=>td.textContent)]));
   return {same:on===off&&on.length>0,gone,closed,after:d.previousElementSibling===$('v71Stats'),rows};});
  r.anaChk=await A.evaluate(chk,SEL);
  await A.evaluate(()=>$('v121Split')&&$('v121Split').scrollIntoView({block:'center'}));
  await A.screenshot({path:path.join(outDir,w+'-ana.png')}).catch(e=>{r.shotErr=String(e);});
  /* 설정: 단타 기준 바로 수정 */
  await A.evaluate(()=>{setPage('settings');});await A.waitForTimeout(300);await A.click('#v12SetNav [data-v12-tab="account"]');await A.waitForTimeout(200);
  r.set={has:await A.evaluate(()=>!!$('v121Min')),help:await A.evaluate(()=>($('v121SetHelp')||{}).textContent||'')};
  r.setChk=await A.evaluate(chk,SEL);
  await A.evaluate(()=>$('v121Set')&&$('v121Set').scrollIntoView({block:'center'}));
  await A.screenshot({path:path.join(outDir,w+'-set.png')}).catch(e=>{r.shotErr=String(e);});
  const setMin=async v=>{await A.fill('#v121Min',v);await A.press('#v121Min','Enter');await A.waitForTimeout(500);return snap();};
  r.m20=await setMin('20');r.m35=await setMin('35');r.mBad=await A.evaluate(async()=>{const i=$('v121Min');i.value='0';await v121SaveMin(i);return {min:v121Min(),val:i.value};});
  r.mDef=await setMin('');r.setSaved=await A.evaluate(()=>('v121Min' in state.settings));
  r.today35=await A.evaluate(async()=>{state.settings.v121Min=35;V121.memo=null;setPage('weekly');await new Promise(r=>setTimeout(r,300));const e=$('v121Today').querySelector('[data-v121-k="n"]');const n=e?e.textContent:null;delete state.settings.v121Min;V121.memo=null;await persist();return n;});
  /* 새로고침 뒤 메모 유지 */
  await A.reload();await A.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await A.waitForTimeout(800);
  r.reload=await A.evaluate(async()=>{setPage('weekly');await new Promise(r=>setTimeout(r,400));return {saved:state.v121Scalp&&state.v121Scalp.hl&&state.v121Scalp.hl['2026-10-31']&&state.v121Scalp.hl['2026-10-31'].memo,input:($('v121MemoToday')||{}).value||null,min:v121Min(),trades:state.trades.filter(t=>['L31','S29','SBIG','L1','REV'].includes(t.id)).length};});
  /* 메모 지우면 키도 지움 */
  r.clear=await A.evaluate(async()=>{const i=$('v121MemoToday');if(!i)return 'no input';i.value='';await v121SaveMemo(i);return state.v121Scalp===undefined?'gone':JSON.stringify(state.v121Scalp);});
  if(W===1440){
   /* 동기화 병합: 날짜별·칸별, 같은 칸 충돌 기록·라벨, v119 기기 표시 */
   r.merge=await A.evaluate(()=>{const base={trades:[],settings:{},updatedAt:1,v121Scalp:{hl:{'2026-10-30':{memo:'A',updatedAt:1}}}};
    const m={trades:[],settings:{},updatedAt:5,v121Scalp:{hl:{'2026-10-30':{memo:'A',updatedAt:1},'2026-10-31':{memo:'M',updatedAt:5}}}};
    const o={trades:[],settings:{},updatedAt:6,v121Scalp:{hl:{'2026-10-30':{memo:'O',updatedAt:6}}}};
    const r1=v110MergeState(clone(base),clone(m),clone(o),{src:'cloud'});
    const b2={trades:[],settings:{},updatedAt:1,v121Scalp:{hl:{'2026-10-31':{memo:'X',updatedAt:1}}}},m2={trades:[],settings:{},updatedAt:5,v121Scalp:{hl:{'2026-10-31':{memo:'M1',updatedAt:5}}}},o2={trades:[],settings:{},updatedAt:6,v121Scalp:{hl:{'2026-10-31':{memo:'O1',updatedAt:6}}}};
    const r2=v110MergeState(clone(b2),clone(m2),clone(o2),{src:'cloud'});const c=r2.conflicts.filter(x=>!/updatedAt/.test(x.field));
    return {both:r1.state.v121Scalp,conf1:r1.conflicts.length,conf2:c.map(x=>({field:x.field,kept:x.kept,lost:x.lost})),label:c[0]?v110Label(c[0].field):null};});
   r.stamp=await A.evaluate(()=>{state.v121Scalp={hl:{'2026-10-31':{memo:'PC 메모',updatedAt:Date.now()}}};const n=v119Test.stampFrom(()=>null,k=>k==='v121Scalp'?{}:null);return {n,dev:v119Dev(),T:state.v119T&&state.v119T['v121Scalp.hl.2026-10-31']||null};});
   r.imp=await A.evaluate(()=>{const p={format:FORMAT,currency:CURRENCY,v:5,trades:[],v121Scalp:{hl:{'2026-10-29':{memo:'가져온 메모',updatedAt:3}},bad:[1]}};const cv=convertPayload(p);const mg=mergeStates({...clone(state),v121Scalp:{hl:{'2026-10-31':{memo:'지금',updatedAt:9}}}},cv);return {cv:cv.v121Scalp,mg:mg.v121Scalp};});
  }
  await ctx.close();}
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
