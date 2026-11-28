/* v135 QA — 한줄평가(거래 객체 oneLine). 모의 HL·모의 데이터(외부 연결 없음).
   거래: A(끝남, 한줄평가 있음) · B(끝남, 긴 한줄평가 78자 → 말줄임) · OPEN(진행 중, 비어 있음)
   1440: 표 '종목 / 셋업' 다음 '한줄평가' 열 · 빈 칸 안내 · 말줄임+title · 칸 클릭 → 상세 안 열림·그 자리 입력 · Enter 저장 · Esc 취소 · 포커스 아웃 저장 ·
         입력 중 renderAll/renderRecords 와도 글자 유지(미뤘다 한 번) · 한글 조합 중 Enter 무시 → 확정 뒤 Enter 저장 · 행(진입일 칸) 클릭은 상세 열림 ·
         상세 매매일지 '한줄평가' 칸 같은 값 → 상세에서 고치면 표도 · 새로고침 뒤 유지 · 저장 안 하고 새로고침해도 되살림 · CSV '한줄평가' 칸
   390: 카드 안 한 줄 · 탭 → 상세 안 열림·그 자리 입력 · Enter 저장 · 상세 칸 보임 · 가로 넘침 없음
   ?v135=0: 열·칸·CSV 칸 없음(예전 8열), 저장된 oneLine 그대로 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='candleSnapshot'){const r=b.req,M={'1m':6e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5},iv=M[r.interval]||9e5;out=[];let p=100;
    for(let t=Math.ceil(r.startTime/iv)*iv;t<=r.endTime&&out.length<3000;t+=iv){const o2=p,c=p+Math.sin(t/iv/7)*0.8;out.push({t,T:t+iv-1,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.4),l:String(Math.min(o2,c)-0.4),v:'10',n:5,i:r.interval,s:r.coin});p=c;}}
   else if(b.type==='perpDexs')out=[null];
   else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'102'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];
   else out={};
   await new Promise(r=>setTimeout(r,30));return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const LONG='손절을 너무 늦게 옮겨서 수익을 반납함 — 다음엔 1R 도달 시 본전으로 올리고 절반 익절, 추격 진입 금지 꼭 지키기!!';
const seed=async(LONG)=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const mk=(id,o)=>{const a=Math.floor((now-o.h0*H)/H)*H,b=o.h1==null?null:Math.floor((now-o.h1*H)/H)*H;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,o.px||103)],funding:[],images:[],...(o.x||{})});};
 state.trades=[mk('A',{h0:60,h1:40,px:98,x:{oneLine:'A 기존 평가'}}),mk('B',{h0:58,h1:56,px:104,x:{oneLine:LONG.slice(0,80)}}),mk('OPEN',{h0:20,h1:null})];
 Object.assign(state.settings,{account:10000,v92From:'2026-10-01'});await persist();setPage('records');renderAll();
};
const vis=sel=>{const el=typeof sel==='string'?document.querySelector(sel):sel;return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid&v136=0&v142=0&v143=0';  /* v143: '진입 방식' 열 숨김은 t143 */  /* v142: '손실 유형' 열은 t142. v136: 여러 줄·전체 표시는 t136, 여기선 v135 동작(한 줄·말줄임·80자) */
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const url=base+(mode==='off'?'&v135=0':'');
  const boot=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()}`);};
  await page.goto(url);await boot();
  const E=(f,a)=>page.evaluate(f,a);
  await E(seed,LONG);await page.waitForTimeout(700);
  o.dbg=await E(()=>typeof v135Debug==='function'?(({on,field,max,cols})=>({on,field,max,cols}))(v135Debug()):null);
  const val=id=>E(id=>{const t=state.trades.find(x=>x.id===id);return t?(t.oneLine===undefined?null:t.oneLine):'?';},id);
  const dlg=()=>E(()=>!!$('tradeDialog').open);
  const cellTxt=id=>E(id=>{const el=document.querySelector(`[data-v135-cell="${id}"],[data-v135-card="${id}"]`);return el?el.textContent.trim():null;},id);
  if(!M){
   /* 표 머리·칸 */
   o.T=await E(()=>{const th=[...document.querySelectorAll('.record-desktop thead th')].map(x=>x.textContent.trim());const rows=[...document.querySelectorAll('.record-desktop tbody tr[data-open]')];
    const c=id=>document.querySelector(`[data-v135-cell="${id}"]`);const b=c('B');const thW=(document.querySelector('.record-desktop th.v135-th')||{}).offsetWidth||0;
    return {th,n:rows.length,cells:document.querySelectorAll('[data-v135-cell]').length,ph:c('OPEN')&&c('OPEN').textContent.trim(),phFaded:!!(c('OPEN')&&c('OPEN').querySelector('.v135-ph')),
     a:c('A')&&c('A').textContent.trim(),bEll:!!b&&b.scrollWidth>b.clientWidth+2,bTitle:!!b&&b.textContent.trim().length>40&&b.title.startsWith(b.textContent.trim()),
     wide:thW>=300,status:rows.map(r=>(r.querySelector('td:nth-child(5) .pill')||{}).textContent||'').map(s=>s.trim()).filter(Boolean).length};});
   await page.screenshot({path:path.join(outDir,key+'-table.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   if(mode==='on'){
    /* 칸 클릭 → 상세 안 열림, 그 자리 입력 → Enter 저장 */
    await page.click('[data-v135-cell="OPEN"]');await page.waitForTimeout(300);
    o.C1={dlg:await dlg(),ed:await E(()=>{const i=document.querySelector('input.v135-ed');return !!i&&document.activeElement===i&&!!i.closest('td.v135-td');})};
    await page.keyboard.type('좋은 진입, 계획대로');await page.screenshot({path:path.join(outDir,key+'-editing.png')}).catch(()=>{});
    await page.keyboard.press('Enter');await page.waitForTimeout(300);
    o.C1.v=await val('OPEN');o.C1.cell=await cellTxt('OPEN');o.C1.edGone=await E(()=>!document.querySelector('input.v135-ed'));o.C1.dlg2=await dlg();
    /* Esc 취소 */
    await page.click('[data-v135-cell="A"]');await page.waitForTimeout(200);await page.keyboard.type(' 덧붙임');await page.keyboard.press('Escape');await page.waitForTimeout(200);
    o.Esc={v:await val('A'),cell:await cellTxt('A'),edGone:await E(()=>!document.querySelector('input.v135-ed')),dlg:await dlg()};
    /* 포커스 아웃 저장 */
    await page.click('[data-v135-cell="A"]');await page.waitForTimeout(200);await page.keyboard.press('End');await page.keyboard.type(' (아웃)');
    await page.mouse.click(5,5);await page.waitForTimeout(400);
    o.Blur={v:await val('A'),edGone:await E(()=>!document.querySelector('input.v135-ed'))};
    /* 입력 중 다시 그리기 → 글자 유지 */
    await page.click('[data-v135-cell="OPEN"]');await page.waitForTimeout(200);await page.keyboard.press('End');await page.keyboard.type(' abc');
    await E(()=>{renderAll();renderRecords();});await page.waitForTimeout(100);await page.keyboard.type('def');
    o.Re={conn:await E(()=>{const i=document.querySelector('input.v135-ed');return !!i&&i.isConnected&&document.activeElement===i;}),val:await E(()=>(document.querySelector('input.v135-ed')||{}).value||null)};
    await page.keyboard.press('Enter');await page.waitForTimeout(400);
    o.Re.v=await val('OPEN');o.Re.st=await E(()=>({d:V135.st.deferRender>0,f:V135.st.flushRender>0}));o.Re.cell=await cellTxt('OPEN');
    /* 한글 조합 중 Enter 무시 → 확정 뒤 Enter 저장 */
    await page.click('[data-v135-cell="B"]');await page.waitForTimeout(200);
    await E(()=>{const i=document.querySelector('input.v135-ed');i.value='';});
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'한줄',selectionStart:2,selectionEnd:2});await page.waitForTimeout(100);
    o.Ime={comp:await E(()=>!!(V135.ed&&V135.ed.comp))};
    await E(()=>{const i=document.querySelector('input.v135-ed');i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,bubbles:true,cancelable:true}));});
    await page.waitForTimeout(150);o.Ime.stillOpen=await E(()=>!!document.querySelector('input.v135-ed'));
    await cdp.send('Input.insertText',{text:'한줄'});await page.waitForTimeout(100);await page.keyboard.type(' 평가');await page.keyboard.press('Enter');await page.waitForTimeout(300);
    o.Ime.v=await val('B');o.Ime.n=await E(()=>V135.st.imeEnter>=2);
    /* 행(진입일 칸) 클릭 → 상세 열림 + 상세 칸 같은 값 */
    await page.click('.record-desktop tbody tr[data-open="OPEN"] td:nth-child(3)');await page.waitForTimeout(1500);
    o.Row={dlg:await dlg(),field:await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v135-d]');return ta?{v:ta.value,vis:window.__vis(ta),inJ:!!ta.closest('#v71Card'),afterHead:!!(ta.closest('.v135-f')&&ta.closest('.v135-f').previousElementSibling&&ta.closest('.v135-f').previousElementSibling.classList.contains('v63-head'))}:null;})};
    await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v135-d]');ta&&ta.scrollIntoView({block:'center'});});await page.waitForTimeout(200);
    await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(()=>{});
    /* 상세에서 고침 → Enter */
    await page.click('#tradeDialog textarea[data-v135-d]');await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('상세에서 고친 평가');await page.keyboard.press('Enter');await page.waitForTimeout(300);
    o.Det={v:await val('OPEN'),dlg:await dlg(),nl:await E(()=>/\n/.test(document.querySelector('#tradeDialog textarea[data-v135-d]').value))};
    /* 상세 Esc → 되돌림, 창 안 닫힘 */
    await page.click('#tradeDialog textarea[data-v135-d]');await page.keyboard.type(' xx');await page.keyboard.press('Escape');await page.waitForTimeout(300);
    o.Det.escV=await val('OPEN');o.Det.escDlg=await dlg();
    await E(()=>$('tradeDialog').close());await page.waitForTimeout(1200);
    o.Det.cell=await cellTxt('OPEN');
    /* CSV */
    o.Csv=await E(()=>{let out=null;const b=download;download=(n,c)=>{out=c;};try{exportCSV();}finally{download=b;}const lines=out.replace(/^\uFEFF/,'').split('\n');const h=lines[0].split(',').map(x=>x.replace(/"/g,''));
     return {h3:h.slice(2,4),hasVal:out.includes('"상세에서 고친 평가"')};});
    /* 새로고침 뒤 유지 */
    await page.waitForTimeout(1500);
    await page.reload();await boot();await E(()=>{setPage('records');renderAll();});await page.waitForTimeout(800);
    o.Reload={A:await val('A'),B:await val('B'),OPEN:await val('OPEN'),cell:await cellTxt('OPEN')};
    /* 저장 안 하고(Enter 없이) 새로고침 → 되살림 */
    await page.click('[data-v135-cell="A"]');await page.waitForTimeout(200);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('엔터 안 누름');
    await page.reload();await boot();await page.waitForTimeout(2500);await E(()=>{setPage('records');renderAll();});await page.waitForTimeout(500);
    o.Draft={A:await val('A'),cell:await cellTxt('A')};
    /* 상세 열림 충돌 없음: 칸 클릭 수 동안 상세 0번 */
    o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   }else{
    o.Off=await E(()=>({cells:document.querySelectorAll('[data-v135-cell]').length,A:state.trades.find(x=>x.id==='A').oneLine,detail:null}));
    await E(async()=>{openTrade('A','review');await new Promise(r=>setTimeout(r,1200));});
    o.Off.detail=await E(()=>!!document.querySelector('#tradeDialog textarea[data-v135-d]'));await E(()=>$('tradeDialog').close());
    o.Off.csv=await E(()=>{let out=null;const b=download;download=(n,c)=>{out=c;};try{exportCSV();}finally{download=b;}return out.replace(/^\uFEFF/,'').split('\n')[0].includes('한줄평가');});
    o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   }
  }else{
   /* 390 카드 */
   o.K=await E(()=>{const L=[...document.querySelectorAll('.record-card [data-v135-card]')];return {n:L.length,vis:L.every(x=>window.__vis(x)),ph:(document.querySelector('[data-v135-card="OPEN"]')||{}).textContent,
    bEll:(()=>{const b=document.querySelector('[data-v135-card="B"]');return !!b&&b.scrollWidth>b.clientWidth+2;})(),
    over:[...document.querySelectorAll('.record-card')].some(c=>c.scrollWidth>c.clientWidth+1||c.getBoundingClientRect().right>innerWidth+1)};});
   await page.screenshot({path:path.join(outDir,key+'-cards.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   await page.tap('[data-v135-card="OPEN"]');await page.waitForTimeout(400);
   o.K.ed=await E(()=>{const i=document.querySelector('input.v135-ed'),l=document.querySelector('[data-v135-card="OPEN"]');if(!i||!l)return null;const a=i.getBoundingClientRect(),b=l.getBoundingClientRect();
    return {focus:document.activeElement===i,overlap:Math.abs(a.top+a.height/2-(b.top+b.height/2))<14&&a.left<b.left+10&&a.right>b.right-10,inView:a.right<=innerWidth+1&&a.left>=-1};});
   o.K.dlg=await dlg();
   await page.keyboard.type('모바일 평가');await page.screenshot({path:path.join(outDir,key+'-editing.png')}).catch(()=>{});
   await page.keyboard.press('Enter');await page.waitForTimeout(400);
   o.K.v=await val('OPEN');o.K.cell=await cellTxt('OPEN');o.K.dlg2=await dlg();
   /* 카드 위쪽 탭 → 상세 열림 + 칸 보임 */
   await page.tap('.record-card[data-open="OPEN"] .top');await page.waitForTimeout(1500);
   o.K.open=await dlg();
   o.K.field=await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v135-d]');if(!ta)return null;ta.scrollIntoView({block:'center'});const r=ta.getBoundingClientRect(),d=$('tradeDialog').getBoundingClientRect();return {v:ta.value,vis:window.__vis(ta),fit:r.right<=d.right+1&&r.left>=d.left-1};});
   await page.waitForTimeout(200);await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(()=>{});
   o.K.dlgOver=await E(()=>{const d=$('tradeDialog');const bad=[];d.querySelectorAll('#v71Card *').forEach(e=>{const r=e.getBoundingClientRect(),dr=d.getBoundingClientRect();if(r.width&&r.right>dr.right+1&&window.__vis(e))bad.push(e.className||e.tagName);});return bad.slice(0,5);});
   await E(()=>$('tradeDialog').close());await page.waitForTimeout(500);
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),one([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
