/* v136 QA — 한줄평가 여러 줄 전체 표시(t.oneLine, 500자). 모의 HL·모의 데이터(외부 연결 없음).
   거래: A(여러 줄 3줄) · B(긴 한 줄 ~260자) · OPEN(비어 있음)
   1440: 칸 말줄임 없음·전체 글·줄바꿈 표시(pre-wrap)·행 높이 늘어남 · 칸 클릭 → 상세 안 열림·textarea · Shift+Enter 줄바꿈(자동 높이) · Enter 저장(줄바꿈 보존) · Esc 취소 ·
         포커스 아웃 저장 · 저장 중 잠금에도 Shift+Enter · 입력 중 다시 그리기 글자 유지 · 한글 조합 중 Enter 무시 · 500자 · 상세 칸 같은 값·전체 보임·Shift+Enter·Enter·Esc ·
         CSV 줄바꿈 값 따옴표 한 칸 · 새로고침 뒤 유지
   390: 카드 전체 글·줄바꿈·넘침 없음 · 탭 → 겹친 textarea · Shift+Enter · Enter 저장 · 상세 칸
   ?v136=0: v135 동작(한 줄 input·말줄임), 저장된 여러 줄 글 그대로 */
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

const ML='A 첫 줄 진입 근거 좋았음\n둘째 줄: 손절 늦음\n셋째 줄 — 다음엔 1R에서 본전';
const LONG='손절을 너무 늦게 옮겨서 수익을 반납함 — 다음엔 1R 도달 시 본전으로 올리고 절반 익절, 추격 진입 금지 꼭 지키기!! '.repeat(4).trim();
const seed=async([ML,LONG])=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const mk=(id,o)=>{const a=Math.floor((now-o.h0*H)/H)*H,b=o.h1==null?null:Math.floor((now-o.h1*H)/H)*H;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,o.px||103)],funding:[],images:[],...(o.x||{})});};
 state.trades=[mk('A',{h0:60,h1:40,px:98,x:{oneLine:ML}}),mk('B',{h0:58,h1:56,px:104,x:{oneLine:LONG}}),mk('OPEN',{h0:20,h1:null})];
 Object.assign(state.settings,{account:10000,v92From:'2026-10-01'});await persist();setPage('records');renderAll();
};
const vis=sel=>{const el=typeof sel==='string'?document.querySelector(sel):sel;return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
/* 셀 상태: 전체 글·잘림·줄 수 */
const cellInfo=id=>{const el=document.querySelector(`[data-v135-cell="${id}"],[data-v135-card="${id}"]`);if(!el)return null;const tx=el.querySelector('.v135-tx')||el;const cs=getComputedStyle(tx);
 const lh=parseFloat(cs.lineHeight)||16;const t=state.trades.find(x=>x.id===id);
 return {full:!!t&&tx.textContent===(t.oneLine||''),clip:el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2||tx.scrollWidth>tx.clientWidth+2,
  ws:cs.whiteSpace,ell:cs.textOverflow==='ellipsis'||getComputedStyle(el).textOverflow==='ellipsis',lines:Math.round(tx.getBoundingClientRect().height/lh)};};
const csvParse=s=>{const rows=[];let row=[],f='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'){if(s[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
 else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else f+=c;}row.push(f);rows.push(row);return rows;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const url=base+(mode==='off'?'&v136=0':'');
  const boot=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()};window.__ci=${cellInfo.toString()};`);};
  await page.goto(url);await boot();
  const E=(f,a)=>page.evaluate(f,a);
  await E(seed,[ML,LONG]);await page.waitForTimeout(700);
  o.dbg=await E(()=>typeof v136Debug==='function'?(({on,v135,max,multiLine,clipped})=>({on,v135,max,multiLine,clipped}))(v136Debug()):null);
  const val=id=>E(id=>{const t=state.trades.find(x=>x.id===id);return t?(t.oneLine===undefined?null:t.oneLine):'?';},id);
  const dlg=()=>E(()=>!!$('tradeDialog').open);
  const CI=id=>E(id=>window.__ci(id),id);
  const edInfo=()=>E(()=>{const i=document.querySelector('.v135-ed');if(!i)return null;return {tag:i.tagName,focus:document.activeElement===i,inTd:!!i.closest('td.v135-td'),h:Math.round(i.getBoundingClientRect().height),max:i.maxLength,noScroll:i.scrollHeight<=i.clientHeight+2,val:i.value};});
  if(!M){
   o.T={A:await CI('A'),B:await CI('B'),rowB:await E(()=>Math.round(document.querySelector('.record-desktop tbody tr[data-open="B"]').getBoundingClientRect().height)),
    th:await E(()=>[...document.querySelectorAll('.record-desktop thead th')].map(x=>x.textContent.trim()))};
   await page.screenshot({path:path.join(outDir,key+'-table.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   if(mode==='on'){
    /* 칸 클릭 → textarea, Shift+Enter 줄바꿈, Enter 저장 */
    await page.click('[data-v135-cell="OPEN"]');await page.waitForTimeout(300);
    const e0=await edInfo();o.C1={dlg:await dlg(),tag:e0&&e0.tag,focus:e0&&e0.focus,inTd:e0&&e0.inTd,max:e0&&e0.max};
    await page.keyboard.type('첫 줄');await page.keyboard.press('Shift+Enter');await page.keyboard.type('둘째 줄');await page.keyboard.press('Shift+Enter');await page.keyboard.type('셋째 줄');await page.waitForTimeout(150);
    const e1=await edInfo();o.C1.val=e1&&e1.val;o.C1.grew=!!(e0&&e1&&e1.h>e0.h+20);o.C1.noScroll=!!(e1&&e1.noScroll);o.C1.open=!!e1;
    await page.screenshot({path:path.join(outDir,key+'-editing.png')}).catch(()=>{});
    await page.keyboard.press('Enter');await page.waitForTimeout(300);
    o.C1.v=await val('OPEN');o.C1.edGone=await E(()=>!document.querySelector('.v135-ed'));o.C1.dlg2=await dlg();o.C1.cell=await CI('OPEN');
    /* Esc 취소 */
    await page.click('[data-v135-cell="A"]');await page.waitForTimeout(200);await page.keyboard.type(' 덧붙임');await page.keyboard.press('Escape');await page.waitForTimeout(200);
    o.Esc={v:(await val('A'))===ML,edGone:await E(()=>!document.querySelector('.v135-ed')),dlg:await dlg()};
    /* 포커스 아웃 저장(줄바꿈 추가) */
    await page.click('[data-v135-cell="A"]');await page.waitForTimeout(200);await page.keyboard.press('ControlOrMeta+End');await page.keyboard.press('Shift+Enter');await page.keyboard.type('넷째 줄');
    await page.mouse.click(5,5);await page.waitForTimeout(400);
    o.Blur={v:(await val('A'))===ML+'\n넷째 줄',edGone:await E(()=>!document.querySelector('.v135-ed')),lines:(await CI('A')).lines};
    /* 저장·동기화 중 전역 잠금이어도 Shift+Enter·글자 */
    await page.click('[data-v135-cell="OPEN"]');await page.waitForTimeout(200);await page.keyboard.press('ControlOrMeta+End');
    await E(()=>{publicBusy++;});await page.keyboard.press('Shift+Enter');await page.keyboard.type('잠금 중');
    o.Lock={busy:await E(()=>interactionBusy()),val:(await edInfo()||{}).val};await E(()=>{publicBusy--;});
    /* 입력 중 다시 그리기 → 글자 유지 */
    await page.keyboard.type(' abc');await E(()=>{renderAll();renderRecords();});await page.waitForTimeout(100);await page.keyboard.type('def');
    o.Re={conn:await E(()=>{const i=document.querySelector('.v135-ed');return !!i&&i.isConnected&&document.activeElement===i;})};
    await page.keyboard.press('Enter');await page.waitForTimeout(400);
    o.Re.v=await val('OPEN');o.Re.cell=await CI('OPEN');
    /* 한글 조합 중 Enter 무시 */
    await page.click('[data-v135-cell="B"]');await page.waitForTimeout(200);
    const cdp=await ctx.newCDPSession(page);
    await E(()=>{const i=document.querySelector('.v135-ed');i.value='';});
    await cdp.send('Input.imeSetComposition',{text:'한줄',selectionStart:2,selectionEnd:2});await page.waitForTimeout(100);
    o.Ime={comp:await E(()=>!!(V135.ed&&V135.ed.comp))};
    await E(()=>{const i=document.querySelector('.v135-ed');i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true}));});
    await page.waitForTimeout(150);o.Ime.stillOpen=await E(()=>!!document.querySelector('.v135-ed'));
    await cdp.send('Input.insertText',{text:'한줄'});await page.waitForTimeout(100);await page.keyboard.type(' 평가');await page.keyboard.press('Enter');await page.waitForTimeout(300);
    o.Ime.v=await val('B');
    /* 500자: 입력칸 maxLength 500, 600자 값 → 500자로 저장 */
    await page.click('[data-v135-cell="B"]');await page.waitForTimeout(200);
    await E(()=>{const i=document.querySelector('.v135-ed');i.value='가나다라마바사아자차\n'.repeat(60);i.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.keyboard.press('Enter');await page.waitForTimeout(300);
    o.Max={len:(await val('B')).length,nl:(await val('B')).includes('\n'),cell:await CI('B')};
    await page.screenshot({path:path.join(outDir,key+'-long.png'),fullPage:false}).catch(()=>{});
    /* 행 클릭 → 상세 칸: 같은 값·전체 보임·500·Shift+Enter·Enter·Esc */
    await page.click('.record-desktop tbody tr[data-open="A"] td:nth-child(3)');await page.waitForTimeout(1500);
    await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v136-d]');ta&&ta.scrollIntoView({block:'center'});});await page.waitForTimeout(300);
    o.Det={dlg:await dlg(),f:await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v136-d]');const t=state.trades.find(x=>x.id==='A');return ta?{same:ta.value===t.oneLine,vis:window.__vis(ta),full:ta.scrollHeight<=ta.clientHeight+2,max:ta.maxLength,old:!!document.querySelector('#tradeDialog textarea[data-v135-d]')}:null;})};
    await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(()=>{});
    await page.click('#tradeDialog textarea[data-v136-d]');await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('상세 첫 줄');await page.keyboard.press('Shift+Enter');await page.keyboard.type('상세 둘째 줄');
    o.Det.mid=await E(()=>document.querySelector('#tradeDialog textarea[data-v136-d]').value);
    await page.keyboard.press('Enter');await page.waitForTimeout(400);
    o.Det.v=await val('A');o.Det.dlg2=await dlg();o.Det.full2=await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v136-d]');return ta.scrollHeight<=ta.clientHeight+2;});
    await page.click('#tradeDialog textarea[data-v136-d]');await page.keyboard.type(' xx');await page.keyboard.press('Escape');await page.waitForTimeout(300);
    o.Det.escV=await val('A');o.Det.escDlg=await dlg();
    await E(()=>$('tradeDialog').close());await page.waitForTimeout(1200);
    o.Det.cell=await CI('A');
    /* CSV: 줄바꿈 값이 따옴표 안 한 칸 */
    o.Csv=await E(([src])=>{let out=null;const b=download;download=(n,c)=>{out=c;};try{exportCSV();}finally{download=b;}
     const P=eval('('+src+')');const rows=P(out.replace(/^\uFEFF/,''));const h=rows[0];const ci=h.indexOf('한줄평가');
     const rA=rows.find(r=>r.length===h.length&&r[ci]===state.trades.find(x=>x.id==='A').oneLine);
     return {col:ci,rows:rows.length,same:rows.slice(1).every(r=>r.length===h.length),A:!!rA,quoted:out.includes('"상세 첫 줄\n상세 둘째 줄"')};},[csvParse.toString()]);
    /* 새로고침 뒤 유지 */
    await page.waitForTimeout(1500);
    await page.reload();await boot();await E(()=>{setPage('records');renderAll();});await page.waitForTimeout(800);
    o.Reload={A:await val('A'),OPEN:await val('OPEN'),Blen:(await val('B')).length,cellA:await CI('A'),cellB:await CI('B')};
    o.dbg2=await E(()=>(({multiLine,clipped,max})=>({multiLine,clipped,max}))(v136Debug()));
    await page.screenshot({path:path.join(outDir,key+'-reload.png')}).catch(()=>{});
    o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   }else{
    /* ?v136=0: v135 동작 */
    await page.click('[data-v135-cell="OPEN"]');await page.waitForTimeout(300);
    o.Off={ed:(await edInfo()||{}).tag,max:(await edInfo()||{}).max};await page.keyboard.press('Escape');
    o.Off.A=(await val('A'))===ML;o.Off.detail=null;
    await E(async()=>{openTrade('A','review');await new Promise(r=>setTimeout(r,1200));});
    o.Off.detail=await E(()=>({v135:!!document.querySelector('#tradeDialog textarea[data-v135-d]'),v136:!!document.querySelector('#tradeDialog textarea[data-v136-d]')}));await E(()=>$('tradeDialog').close());
    o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   }
  }else{
   /* 390 카드 */
   o.K={A:await CI('A'),B:await CI('B'),over:await E(()=>[...document.querySelectorAll('.record-card')].some(c=>c.scrollWidth>c.clientWidth+1||c.getBoundingClientRect().right>innerWidth+1))};
   await page.screenshot({path:path.join(outDir,key+'-cards.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
   await page.tap('[data-v135-card="OPEN"]');await page.waitForTimeout(400);
   o.K.ed=await E(()=>{const i=document.querySelector('.v135-ed'),l=document.querySelector('[data-v135-card="OPEN"]');if(!i||!l)return null;const a=i.getBoundingClientRect(),b=l.getBoundingClientRect();
    return {tag:i.tagName,focus:document.activeElement===i,overlap:Math.abs(a.top-b.top)<14&&a.left<b.left+10&&a.right>b.right-10,inView:a.right<=innerWidth+1&&a.left>=-1};});
   o.K.dlg=await dlg();
   await page.keyboard.type('모바일 첫 줄');await page.keyboard.press('Shift+Enter');await page.keyboard.type('모바일 둘째 줄');
   await page.screenshot({path:path.join(outDir,key+'-editing.png')}).catch(()=>{});
   await page.keyboard.press('Enter');await page.waitForTimeout(400);
   o.K.v=await val('OPEN');o.K.cell=await CI('OPEN');o.K.dlg2=await dlg();
   o.K.over2=await E(()=>[...document.querySelectorAll('.record-card')].some(c=>c.scrollWidth>c.clientWidth+1||c.getBoundingClientRect().right>innerWidth+1));
   await page.tap('.record-card[data-open="A"] .top');await page.waitForTimeout(1500);
   o.K.open=await dlg();
   o.K.field=await E(()=>{const ta=document.querySelector('#tradeDialog textarea[data-v136-d]');if(!ta)return null;ta.scrollIntoView({block:'center'});const r=ta.getBoundingClientRect(),d=$('tradeDialog').getBoundingClientRect();const t=state.trades.find(x=>x.id==='A');
    return {same:ta.value===t.oneLine,vis:window.__vis(ta),fit:r.right<=d.right+1&&r.left>=d.left-1,full:ta.scrollHeight<=ta.clientHeight+2};});
   await page.waitForTimeout(200);await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(()=>{});
   o.K.dlgOver=await E(()=>{const d=$('tradeDialog');const bad=[];d.querySelectorAll('#v71Card *').forEach(e=>{const r=e.getBoundingClientRect(),dr=d.getBoundingClientRect();if(r.width&&r.right>dr.right+1&&window.__vis(e))bad.push(e.className||e.tagName);});return bad.slice(0,5);});
   await E(()=>$('tradeDialog').close());await page.waitForTimeout(500);
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),one([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
