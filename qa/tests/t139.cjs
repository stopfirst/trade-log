/* v139 QA — 아침 전망 자동 양식 + 등락률 자동 반영. 모의 HL·모의 CNBC(quote.cnbc.com·ts-api.cnbc.com 은 window.fetch 모의가 답함) — 외부 연결 없음.
   1440 HL: 빈 날 자동 양식(저장 안 된 보기·값 채움·못 받은 종목 (±x.xx%)·굵게) · 기록 chg 저장(asOf·src) · 하루 1회 캐시(다시 안 받음, 새로고침 뒤에도) ·
     바이어스 칩 → 바이어스 줄(미리 채움·쓴 글·다른 말이면 그대로) · 입력하면 양식+글 저장 · 기존 글 자동 변경 없음 · [등락률 채우기] 자리만(코멘트·커서 보존) ·
     [양식 넣기] 새 양식(빈 날 미리 채움 → 저장, 글 있으면 커서 위치에 덧붙임) · 7일 넘은 날은 자동으로 안 받음 · IME 조합 중 채우기 미룸 · 기준일 계산(주말·휴장일) · 형식 검사
   390: 소스 실패(500) → 앱 오류 없음·자리 그대로·못 받음 표시 · 넘침 없음
   1440 ?v139=0: v138 동작(빈 편집기·옛 양식·CNBC 요청 없음) · chg 데이터 보관 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 /* 모의 시세: 날짜별 등락률(%) → 종가 사슬(10-22 = 100) */
 const DATES=['2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'];
 const P={'.SPX':[0,0.5,-0.4,0.3,1.25,-0.8,-3.70],'.NDX':[0,0.2,0.1,-0.6,0.9,-1.1,-5.61],'.DJI':[0,0.1,0.2,0.3,0.4,0.5,-1.93],'.RUT':[0,1,1,1,-2.5,1,-2.76],
  'SOXX':[0,2,2,2,3.33,2,-10.55],'MAGS':[0,1,1,1,0.75,1,-5.18],'.VIX':[0,3,3,3,-4.4,3,26.20],'.MOVE':[0,1,1,1,2.5,1,10.70],
  '@CL.1':[0,1,1,1,0.6,1,1.43],'.DXY':[0,0.1,0.1,0.1,0.12,0.1,-0.05],'US10Y':[0,0.5,0.5,0.5,-1.1,0.5,-2.02],'BTC.CM=':[0,2,2,2,3.1,2,-4.29],'@GC.1':[0,1,1,1,0.4,1,-3.98],'@SI.1':[0,1,1,1,0.9,1,-7.39]};
 const close=s=>{const out={};let c=100;DATES.forEach((d,i)=>{c=i?c*(1+P[s][i]/100):100;out[d]=c;});return out;};
 const etMs=d=>{const [Y,M,D]=d.split('-').map(Number);return Date.UTC(Y,M-1,D,20,0);};   /* 10월(EDT) 16:00 ET = 20:00 UTC */
 window.__cn={q:0,c:0,urls:[]};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://quote.cnbc.com/')||u.startsWith('https://ts-api.cnbc.com/')){__cn.urls.push(u);
   if(o&&o.headers&&Object.keys(o.headers).length)__cn.hdr=(__cn.hdr||0)+1;
   await new Promise(r=>setTimeout(r,15));if(window.__cnFail)return J('{"err":1}',500);
   if(u.startsWith('https://quote.cnbc.com/')){__cn.q++;const syms=decodeURIComponent(u.split('symbols=')[1].split('&')[0]).split('|');
    return J(JSON.stringify({FormattedQuoteResult:{FormattedQuote:syms.filter(s=>s!=='.MOVE'&&P[s]).map(s=>{const p=P[s][6];return {symbol:s,code:0,last_time:'2026-10-30',change_pct:(p>0?'+':'')+p.toFixed(2)+'%',last:'1'};})}}));}
   __cn.c++;const m=u.match(/charts\/(\w+)\.json\?symbol=([^&]+)/),R=m[1],s=decodeURIComponent(m[2]);if(!P[s])return J('{}',404);const C=close(s);
   if(R==='5D'){if(s==='.DXY')return J('{"err":1}',500);const bars=[];for(const d of DATES.slice(2)){const t=etMs(d);bars.push({close:String(C[d]*0.999),tradeTime:d.replace(/-/g,'')+'155500',tradeTimeinMills:t-5*6e4});bars.push({close:String(C[d]),tradeTime:d.replace(/-/g,'')+'160000',tradeTimeinMills:t});bars.push({close:String(C[d]*1.02),tradeTime:d.replace(/-/g,'')+'190000',tradeTimeinMills:t+3*36e5});}
    return J(JSON.stringify({barData:{priceBars:bars}}));}
   const k=((s==='.MOVE'||s==='@SI.1')?DATES.slice(0,6):DATES);const f=(s==='@CL.1'||s==='.DXY'||s==='US10Y'||s==='BTC.CM='||s==='@SI.1')?1.003:1;   /* 일봉은 일부러 일정 배율(등락률 같음) · 어느 경로인지는 캐시 m 으로 확인 */
   return J(JSON.stringify({barData:{priceBars:k.map(d=>({close:String(C[d]*f),tradeTime:d.replace(/-/g,'')+'000000',tradeTimeinMills:etMs(d)-20*36e5}))}}));}
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='perpDexs')out=[null];else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'102'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(b.type==='candleSnapshot')out=[];else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];else out={};
   await new Promise(r=>setTimeout(r,20));return J(JSON.stringify(out));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const vis=el=>{if(typeof el==='string')el=document.querySelector(el);return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
const over=()=>{const pg=document.getElementById('page-v137');const bad=[];pg.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.right>innerWidth+1||r.left<-1)&&window.__vis(e)&&!e.closest('.v137-days'))bad.push(String(e.className||e.tagName).slice(0,40));});return bad.slice(0,6);};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const port=srv.address().port,url=q=>'http://127.0.0.1:'+port+'/?'+q;
 const run=async([W,mode])=>{const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);if(M)await ctx.addInitScript(()=>{window.__cnFail=true;});
  const open=async q=>{const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));page.on('dialog',d=>{R.errors.push(key+' dialog: '+d.message());d.dismiss();});
   await page.goto(url(q));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};`);return page;};
  const ED='#page-v137 .v138-ed';
  const rec=(E,d)=>E(d=>{const r=state.v138Outlook&&state.v138Outlook.all&&state.v138Outlook.all[d];return r?JSON.parse(JSON.stringify(r)):null;},d);
  if(mode==='off'){
   const page=await open('journal=hyperliquid&v139=0');const E=(f,a)=>page.evaluate(f,a);
   await E(async()=>{V110.auto=false;state.v138Outlook={all:{'2026-10-29':{text:'옛 글',html:'<div>옛 글</div>',textAt:5,chg:{SPX:-1.5,asOf:'2026-10-28',src:'cnbc',at:5},chgAt:5,updatedAt:5}}};await persist();setPage('v137');});
   await page.waitForTimeout(1200);
   o.Off={on:await E(()=>v139Debug().on),v138:await E(()=>v138Debug().on),empty:await E(()=>document.querySelector('#page-v137 .v138-ed').classList.contains('is-empty')),
    btn:await E(()=>!!document.querySelector('#page-v137 [data-v139-act]')),chgLine:await E(()=>!!document.getElementById('v139Chg')),net:await E(()=>__cn.urls.length)};
   await page.click('#page-v137 [data-v137-act="tpl"]');await page.waitForTimeout(1100);
   o.Off.tpl=await E(()=>{const r=state.v138Outlook.all[v137Test.today()];return !!r&&r.text===V137_TPL;});o.Off.kept=await E(()=>state.v138Outlook.all['2026-10-29'].chg.SPX);
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  if(M){
   const page=await open('journal=hyperliquid');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1500);
   o.Fail={pre:await E(()=>v139Test.pristine()),ph:await E(()=>(document.querySelector('#page-v137 .v138-ed').innerText.match(/±x\.xx%/g)||[]).length),
    miss:await E(()=>{const m=document.querySelector('#v139Chg .v139-miss');return m?m.textContent:'';}),saved:await E(()=>{const r=state.v138Outlook&&state.v138Outlook.all[v137Test.today()];return r?Object.keys(r).sort():null;}),
    net:await E(()=>__cn.urls.length>0)};
   o.Lay=await E(()=>window.__over());
   o.Tools=await E(()=>{const t=document.querySelector('#page-v137 .v137-tools');const r=t.getBoundingClientRect();const b=t.querySelector('[data-v139-act]');const br=b.getBoundingClientRect();return {in:r.right<=innerWidth+1,btn:br.right<=innerWidth+1&&window.__vis(b)};});
   await page.tap(ED);await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type(' 모바일');await page.waitForTimeout(1200);
   o.Typ=await E(()=>{const r=state.v138Outlook.all[v137Test.today()];return {start:r.text.startsWith('1. 지수\n- SPX(±x.xx%) :'),end:r.text.endsWith('모바일')};});
   await page.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  /* ===== 1440 ===== */
  const hl=await open('journal=hyperliquid');const E=(f,a)=>hl.evaluate(f,a);
  o.AsOf=await E(()=>({sat:v139Test.asOf('2026-10-31'),mon:v139Test.asOf('2026-11-02'),tue:v139Test.asOf('2026-10-27'),thx:v139Test.asOf('2026-11-27'),ny:v139Test.asOf('2026-01-02'),
   ready:v139Test.ready('2026-10-30'),notYet:v139Test.ready('2026-10-31'),et:new Date(v139Test.etMs('2026-11-20',16,0)).toISOString(),etS:new Date(v139Test.etMs('2026-07-01',16,0)).toISOString()}));
  await E(async()=>{V110.auto=false;state.v138Outlook={all:{'2026-10-29':{text:'x',html:'<div>- <b>SPX(±x.xx%)</b> : 내 코멘트</div><div>- NDX(…) : 둘째</div><div>- MOVE(±x.xx%) : 무브</div><div>- 바이어스 :</div><div>기존 글 끝</div>',textAt:5,updatedAt:5},
    '2026-10-28':{text:'x',html:'<div>- 바이어스 : 내 생각</div>',textAt:5,updatedAt:5}}};await persist();setPage('v137');});
  await hl.waitForTimeout(1600);
  const today=await E(()=>v137Test.today());
  o.Pre=await E(()=>{const ed=document.querySelector('#page-v137 .v138-ed'),h=ed.innerHTML,t=ed.innerText;
   return {pristine:v139Test.pristine(),spx:h.includes('<b>SPX(-3.70%)</b> :'),hdr:(h.match(/<b>\d\. [^<]+<\/b>/g)||[]).length,move:h.includes('<b>MOVE(±x.xx%)</b>'),
    lines:t.split('\n').filter(Boolean).slice(0,3),wti:t.includes('WTI(+1.43%)'),gold:t.includes('GOLD(-3.98%)'),us10y:t.includes('US10Y(-2.02%)'),btc:t.includes('BTC(-4.29%)'),silver:t.includes('SILVER(-7.39%)'),dxy:t.includes('DXY(-0.05%)'),
    vix:t.includes('VIX(+26.20%)'),soxx:t.includes('SOXX(-10.55%)'),mm:t.includes('MMFD(5일선) :')&&t.includes('MMTH(200일선) :'),plan:t.includes('5. 매매계획 및 총평'),bias:t.includes('- 바이어스 :'),
    empty:ed.classList.contains('is-empty')};});
  const r31=await rec(E,today);
  o.Chg={asOf:r31&&r31.chg&&r31.chg.asOf,src:r31&&r31.chg&&r31.chg.src,spx:r31&&r31.chg&&r31.chg.SPX,n:r31&&r31.chg?Object.keys(r31.chg).filter(k=>/^[A-Z0-9]+$/.test(k)).length:0,move:r31&&r31.chg&&('MOVE' in r31.chg),
   noText:!!r31&&r31.text===undefined&&r31.html===undefined,written:await E(()=>v137Written()),
   m:await E(()=>{const c=JSON.parse(localStorage.getItem(v139Test.cacheKey('2026-10-30')));return {SPX:c.m.SPX,WTI:c.m.WTI,GOLD:c.m.GOLD,BTC:c.m.BTC,US10Y:c.m.US10Y,SILVER:c.m.SILVER,DXY:c.m.DXY,move:c.why.MOVE};}),
   stat:await E(()=>document.getElementById('v139Chg').textContent),hdr:await E(()=>__cn.hdr||0)};
  o.Net={first:await E(()=>({q:__cn.q,c:__cn.c}))};
  await E(()=>v139Test.ensure(v137Test.today(),{}));await E(()=>v139Test.ensure(v137Test.today(),{force:true}));o.Net.again=await E(()=>({q:__cn.q,c:__cn.c}));
  /* 바이어스 칩: 미리 채운 양식 → 바이어스 줄만 바뀌고 저장 안 됨 */
  await hl.click('#page-v137 [data-v137-bias="short"]');await hl.waitForTimeout(700);
  o.Bias={pre:await E(()=>document.querySelector('#page-v137 .v138-ed').innerText.includes('- 바이어스 : 숏 우세')),still:await E(()=>v139Test.pristine()),noText:(await rec(E,today)).text===undefined,bias:(await rec(E,today)).bias};
  /* 입력: SPX 줄 끝에 코멘트 → 양식+글 저장(굵게 유지) */
  await E(()=>{const ed=document.querySelector('#page-v137 .v138-ed');const line=[...ed.querySelectorAll('div')].find(x=>x.textContent.startsWith('- SPX('));const r=document.createRange();r.selectNodeContents(line);r.collapse(false);ed.focus();const s=getSelection();s.removeAllRanges();s.addRange(r);});
  await hl.keyboard.type(' 반등 실패');await hl.waitForTimeout(1300);
  let rr=await rec(E,today);
  o.Typ={line:rr.text.split('\n')[1],bold:/<b>SPX\(-3\.70%\)<\/b> : 반등 실패/.test(rr.html||''),biasLine:rr.text.includes('- 바이어스 : 숏 우세'),pristine:await E(()=>v139Test.pristine()),
   head:rr.text.split('\n')[0],plan:rr.text.includes('5. 매매계획 및 총평\n- 바이어스 : 숏 우세\n-')};
  /* 바이어스 칩: 쓴 글의 바이어스 줄(세 값 중 하나) → 바뀜 · 저장 */
  await hl.click('#page-v137 [data-v137-bias="long"]');await hl.waitForTimeout(1300);rr=await rec(E,today);
  o.Bias2={text:rr.text.includes('- 바이어스 : 롱 우세')&&!rr.text.includes('숏 우세'),keep:rr.text.includes('- SPX(-3.70%) : 반등 실패')};
  /* 기존 글(10-29): 자동 변경 없음 → [등락률 채우기]는 자리만, 커서 보존 */
  await E(()=>v137Test.go('2026-10-29'));await hl.waitForTimeout(1500);
  const r29a=await rec(E,'2026-10-29');
  o.Exist={same:r29a.html==='<div>- <b>SPX(±x.xx%)</b> : 내 코멘트</div><div>- NDX(…) : 둘째</div><div>- MOVE(±x.xx%) : 무브</div><div>- 바이어스 :</div><div>기존 글 끝</div>',pristine:await E(()=>v139Test.pristine()),
   chg:r29a.chg?r29a.chg.asOf:null,dom:await E(()=>document.querySelector('#page-v137 .v138-ed').innerText.includes('SPX(±x.xx%)'))};
  await E(()=>{const ed=document.querySelector('#page-v137 .v138-ed');ed.focus();const tw=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);let n;while((n=tw.nextNode())){if(n.data.includes('기존 글 끝')){const r=document.createRange();r.setStart(n,2);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);break;}}});
  await hl.click('#page-v137 [data-v139-act="fill"]');await hl.waitForTimeout(1500);
  const r29=await rec(E,'2026-10-29');
  o.Fill={text:r29.text,html:r29.html,caret:await E(()=>{const s=getSelection();return {node:s.anchorNode&&s.anchorNode.data,off:s.anchorOffset,focus:document.activeElement===document.querySelector('#page-v137 .v138-ed')};}),
   chg:r29.chg&&{asOf:r29.chg.asOf,SPX:r29.chg.SPX,NDX:r29.chg.NDX,MOVE:r29.chg.MOVE},stat:await E(()=>document.getElementById('v139Chg').textContent)};
  /* 바이어스 줄: 다른 말이면 안 바꿈 */
  await E(()=>v137Test.go('2026-10-28'));await hl.waitForTimeout(900);await hl.click('#page-v137 [data-v137-bias="neutral"]');await hl.waitForTimeout(1300);
  o.Bias3=(await rec(E,'2026-10-28')).html;
  /* [양식 넣기]: 빈 날 미리 채움 → 새 양식 저장 */
  await E(()=>v137Test.go('2026-10-27'));await hl.waitForTimeout(1500);
  o.Tpl={pre:await E(()=>v139Test.pristine()),spx:await E(()=>document.querySelector('#page-v137 .v138-ed').innerText.includes('SPX(-0.40%)'))};
  await hl.click('#page-v137 [data-v137-act="tpl"]');await hl.waitForTimeout(1300);
  const r27=await rec(E,'2026-10-27');
  o.Tpl.saved=r27.text===await E(()=>v139Test.tplText('2026-10-27'));o.Tpl.bold=(r27.html.match(/<b>/g)||[]).length;o.Tpl.first=r27.text.split('\n').slice(0,3);o.Tpl.once=(r27.text.match(/1\. 지수/g)||[]).length;
  o.Tpl.last=r27.text.split('\n').slice(-3);
  /* 글 있는 날: 커서(끝)에 덧붙임 */
  await hl.click(ED);await hl.keyboard.press('ControlOrMeta+End');await hl.keyboard.type('끝');await hl.waitForTimeout(900);await hl.click('#page-v137 [data-v137-act="tpl"]');await hl.waitForTimeout(1300);
  const r27b=await rec(E,'2026-10-27');o.Tpl.append=(r27b.text.match(/1\. 지수/g)||[]).length===2&&r27b.text.includes('끝\n\n1. 지수\n- SPX(-0.40%) :');
  /* 7일 넘은 빈 날: 자동으로 안 받음, 자리 그대로 */
  const n0=await E(()=>__cn.urls.length);await E(()=>v137Test.go('2026-10-20'));await hl.waitForTimeout(1200);
  o.Old={net:(await E(()=>__cn.urls.length))-n0,ph:await E(()=>(document.querySelector('#page-v137 .v138-ed').innerText.match(/±x\.xx%/g)||[]).length),pre:await E(()=>v139Test.pristine()),
   stat:await E(()=>document.getElementById('v139Chg').textContent),rec:await rec(E,'2026-10-20')};
  /* IME 조합 중 [등락률 채우기] → 미룸(글 그대로) */
  await E(()=>v137Test.go('2026-10-29'));await hl.waitForTimeout(800);
  await hl.click(ED);await hl.keyboard.press('ControlOrMeta+End');const cdp=await ctx.newCDPSession(hl);
  await cdp.send('Input.imeSetComposition',{text:'한',selectionStart:1,selectionEnd:1});await hl.waitForTimeout(80);
  const ime0=await E(()=>V139.st.imeDefer);await hl.click('#page-v137 [data-v139-act="fill"]');await hl.waitForTimeout(400);
  o.Ime={comp:await E(()=>V137.comp),defer:(await E(()=>V139.st.imeDefer))>ime0};
  await cdp.send('Input.insertText',{text:'한글'});await hl.waitForTimeout(1300);o.Ime.done=(await rec(E,'2026-10-29')).text.endsWith('한글');
  /* 함수 */
  o.Fn=await E(()=>({rep:v139Test.replaceHtml('<div>- <b>SPX(±x.xx%)</b> : a (SPX 6800)</div><div>NDX(...) b · RUT(-1.00%) c · XSPX(…)</div>',{SPX:-3.7,NDX:1.234,RUT:5}),
   bias:v139Test.biasHtml('<div>- <b>바이어스</b> : 중립</div><div>- 바이어스 : 내 말</div>','롱 우세'),fmt:[v139Test.fmt(0),v139Test.fmt(1.5),v139Test.fmt(-0.004)],
   chk:(()=>{const t=x=>{try{return v139Test.check(x);}catch(e){return String(e.message).slice(0,30);}};return {ok:t({all:{'2026-10-31':{chg:{SPX:-3.7,asOf:'2026-10-30',src:'cnbc',at:1}}}}),bad:t({all:{'2026-10-31':{chg:{SPX:'x'}}}})!==true,bad2:t({all:{'2026-10-31':{chg:{'<x>':1}}}})!==true};})()}));
  o.dbg=await E(()=>{const d=v139Debug();return {on:d.on,syms:d.syms.length,hosts:d.hosts};});
  /* 새로고침: 캐시로 다시 안 받음 · 값 그대로 */
  await E(()=>v137Test.go(v137Test.today()));await hl.waitForTimeout(500);
  await hl.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
  o.Lay=await E(()=>window.__over());o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  await hl.reload();await hl.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await hl.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};`);
  await E(()=>{V110.auto=false;setPage('v137');});await hl.waitForTimeout(1800);
  o.Reload={net:await E(()=>__cn.urls.length),today:await E(()=>document.querySelector('#page-v137 .v138-ed').innerText.includes('반등 실패')),chg:(await rec(E,today)).chg.SPX,
   stat:await E(()=>document.getElementById('v139Chg').textContent)};
  R[key]=o;await ctx.close();};
 await Promise.all([run([1440,'on']),run([390,'on']),run([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
