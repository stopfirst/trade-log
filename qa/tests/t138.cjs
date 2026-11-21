/* (v139: 옛 양식·빈 편집기 전제라 &v139=0 으로 실행) v138 QA — 아침 전망 하나로 합치기 + 서식(굵게·밑줄·글자 크기). 모의 HL·모의 Supabase(REST) — 외부 연결 없음.
   1440 HL(로그인): v137 → v138 이전(HL 기기 v137 + 다른 일지(US) 클라우드 행 v137 → 겹치는 날짜 칸별·진 쪽 글 덧붙임·이미지 합집합·원본 보관·멱등) ·
     같은 브라우저에서 US 일지를 열면 같은 글(기기 공용 사본) · US 에서 고치면 HL 에 반영(BroadcastChannel) · 지운 이미지 안 되살아남 ·
     서식: 선택 → B·U·크기(메뉴) · 선택 없이 B → 이어 쓰는 글자 · 도구줄 상태 · Ctrl+B/Ctrl+U · Ctrl+Z · 저장 html/평문 · 새로고침 뒤 유지 ·
     sanitize(script·onerror·style·javascript: 제거, 저장·다른 일지 사본 받기 모두) · 붙여넣기 평문 · IME 조합 중 서식·저장 안 함 · 양식 넣기(번호줄 굵게·덮어쓰기 없음) ·
     전날 글 복사(서식 포함) · 동기화 병합(일지 안 칸별) · 다른 일지와 동시 수정 PC 우선·충돌 보관 · 백업 형식 검사 · 넘침 없음
   390: 도구줄 넘침 없음 · 탭으로 B·크기 · 입력 저장
   1440 ?v138=0: v137 동작(일지별 v137Outlook·textarea) · v138 데이터 그대로 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const PRJ='https://qa138.supabase.co',UID='11111111-2222-3333-4444-555555555555';
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 window.__st={sel:[],rows:{}};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='perpDexs')out=[null];else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'102'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(b.type==='candleSnapshot')out=[];else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];else out={};
   await new Promise(r=>setTimeout(r,20));return J(JSON.stringify(out));}
  if(u.includes('/rest/v1/journal_cloud?select=revision,o:payload')){const sc=(u.match(/scope=eq\.(\w+)/)||[])[1];__st.sel.push({scope:sc,sel:decodeURIComponent(u.split('select=')[1].split('&')[0])});
   const r=__st.rows[sc];return J(JSON.stringify(r?[r]:[]));}
  if(u.includes('.supabase.co/'))return J('[]');
  return J('{"message":"nf"}',404);};
};
const login=([P,U])=>{V110.auto=false;cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:U,email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};};
const vis=el=>{if(typeof el==='string')el=document.querySelector(el);return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
const over=()=>{const pg=document.getElementById('page-v137');const bad=[];pg.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.right>innerWidth+1||r.left<-1)&&window.__vis(e)&&!e.closest('.v137-days'))bad.push(String(e.className||e.tagName).slice(0,40));});return bad.slice(0,6);};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const port=srv.address().port,url=q=>'http://127.0.0.1:'+port+'/?'+q;
 const run=async([W,mode])=>{const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const open=async q=>{const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));page.on('dialog',d=>{R.errors.push(key+' dialog: '+d.message());d.dismiss();});
   await page.goto(url(q));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};`);return page;};
  const ED='#page-v137 .v138-ed';
  if(mode==='off'){
   const page=await open('journal=hyperliquid&v138=0');const E=(f,a)=>page.evaluate(f,a);
   await E(async()=>{V110.auto=false;state.v137Outlook={us:{'2026-10-30':{line:'v137 원본',text:'원본 글',updatedAt:2}}};state.v138Outlook={all:{'2026-10-30':{line:'v138 공용',text:'공용 글',html:'<div><b>공용</b> 글</div>',textAt:9,lineAt:9,updatedAt:9}}};await persist();setPage('v137');});
   await page.waitForTimeout(800);
   o.Off={on:await E(()=>v138Debug().on),ta:await E(()=>!!document.querySelector('#page-v137 textarea.v137-text')),ed:await E(()=>!!document.querySelector('#page-v137 .v138-ed')),foot:await E(()=>document.querySelector('#page-v137 .v137-foot').textContent.includes('저장 위치'))};
   await E(()=>v137Test.go('2026-10-30'));await page.waitForTimeout(400);
   o.Off.line=await E(()=>document.querySelector('#page-v137 input[data-v137-f="line"]').value);o.Off.kept=await E(()=>state.v138Outlook.all['2026-10-30'].html);
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  if(M){
   const page=await open('journal=hyperliquid&v139=0');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(900);
   o.Bar=await E(()=>{const b=document.querySelector('#page-v137 .v138-fmt');const r=b.getBoundingClientRect();return {vis:window.__vis(b),in:r.right<=innerWidth+1&&r.left>=-1,h:Math.round(r.height),btn:[...b.querySelectorAll('.v138-fb')].map(x=>window.__vis(x)).every(Boolean),hint:window.__vis(b.querySelector('.v138-hint'))};});
   o.Lay=await E(()=>window.__over());
   await page.tap(ED);await page.keyboard.type('모바일 ');await page.tap('#page-v137 [data-v138-cmd="b"]');await page.keyboard.type('굵게');
   await page.tap('#page-v137 [data-v138-cmd="szmenu"]');await page.waitForTimeout(150);
   o.Menu=await E(()=>{const m=document.querySelector('#page-v137 .v138-szm');const r=m.getBoundingClientRect();return {open:!m.hidden,in:r.right<=innerWidth+1&&r.left>=-1&&r.bottom<=document.documentElement.scrollHeight};});
   await page.tap('#page-v137 [data-v138-size="xl"]');await page.keyboard.type('큰');await page.waitForTimeout(1200);
   o.Typ=await E(()=>{const r=state.v138Outlook&&state.v138Outlook.all[v137Test.today()];return r?{text:r.text,b:/<b>[^<]*굵게/.test(r.html||''),xl:/data-size="xl"[^>]*>[^<]*큰|data-size="xl"><b>큰|<b>[^<]*<span data-size="xl">큰/.test(r.html||''),html:r.html}:null;});
   o.Lay2=await E(()=>window.__over());
   await page.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  /* ===== 1440 ===== */
  const hl=await open('journal=hyperliquid&v139=0');const E=(f,a)=>hl.evaluate(f,a);
  await E(login,[PRJ,UID]);
  /* HL 기기 v137(10-29 HL만, 10-30 양쪽 · HL 이 오래됨) + US 클라우드 행 v137(10-30 더 새로움, 10-28 US만) */
  await E(async()=>{state.v137Outlook={us:{'2026-10-29':{line:'HL만',bias:'neutral',text:'10/29 HL 글',updatedAt:1000},
    '2026-10-30':{line:'HL 한줄',bias:'short',text:'HL 10/30 글',conf:3,grade:'hit',updatedAt:2000,imgs:{'aaaa-1':{kind:'img',label:'HL 차트',ord:0,at:1500,w:10,h:10,ext:'webp',path:'11111111-2222-3333-4444-555555555555/2026-10-30/aaaa-1.webp',cloud:1}}}}};
   __st.rows.US={revision:7,o:null,s7:{us:{'2026-10-30':{line:'US 한줄',bias:'long',text:'US 10/30 글',updatedAt:5000,imgs:{'uuuu-1':{kind:'tv',tv:'https://www.tradingview.com/x/AbCdEf12/',label:'',ord:0,at:4000}}},
    '2026-10-28':{line:'US만',text:'10/28 US 글',updatedAt:900}}},t:{}};
   await persist();setPage('v137');});
  await hl.waitForTimeout(1500);
  const recH=d=>E(d=>{const r=state.v138Outlook&&state.v138Outlook.all&&state.v138Outlook.all[d];return r?JSON.parse(JSON.stringify(r)):null;},d);
  let r30=await recH('2026-10-30');
  o.Mig={dates:await E(()=>Object.keys(state.v138Outlook.all).sort()),sel:await E(()=>__st.sel.length&&__st.sel[0]),
   d30:r30&&{line:r30.line,bias:r30.bias,conf:r30.conf,grade:r30.grade,text:r30.text,imgs:Object.keys(r30.imgs||{}).sort()},
   d28:(await recH('2026-10-28')).text,d29:(await recH('2026-10-29')).line,kept:await E(()=>JSON.stringify(state.v137Outlook.us['2026-10-30']).includes('HL 10/30 글')&&!!state.v137Outlook.us['2026-10-29']),
   foot:await E(()=>document.querySelector('#page-v137 .v137-foot').textContent)};
  const j1=await E(()=>JSON.stringify(state.v138Outlook));
  o.Mig.again=[await E(()=>v138Test.pull({cloud:true})),await E(()=>v138Test.pull({cloud:true}))];
  o.Mig.idem=(await E(()=>JSON.stringify(state.v138Outlook)))===j1;o.Mig.appendOnce=(r30.text.match(/일지에서 합침/g)||[]).length;
  /* 화면: 10-30 */
  await E(()=>v137Test.go('2026-10-30'));await hl.waitForTimeout(500);
  o.Show={ed:await E(()=>document.querySelector('#page-v137 .v138-ed').innerText.includes('US 10/30 글')),line:await E(()=>document.querySelector('#page-v137 input[data-v137-f="line"]').value),
   thumbs:await E(()=>document.querySelectorAll('#v137Imgs [data-v137-im]').length)};
  /* ===== 같은 브라우저 US 일지: 같은 글 ===== */
  const us=await open('journal=us&v139=0');const U=(f,a)=>us.evaluate(f,a);
  await U(login,[PRJ,UID]);await U(()=>{setPage('v137');});await us.waitForTimeout(1500);await U(()=>v137Test.go('2026-10-30'));await us.waitForTimeout(500);
  o.Us={same:await U(()=>JSON.stringify(state.v138Outlook.all['2026-10-30'].text))===JSON.stringify(r30.text),ed:await U(()=>document.querySelector('#page-v137 .v138-ed').innerText.includes('HL 일지에서 합침')),
   dates:await U(()=>Object.keys(state.v138Outlook.all).sort()),line:await U(()=>document.querySelector('#page-v137 input[data-v137-f="line"]').value),
   foot:await U(()=>document.querySelector('#page-v137 .v137-foot').textContent.includes('저장 위치')),sel:await U(()=>__st.sel.map(x=>x.scope).join(','))};
  /* US 에서 고침 → HL 에 반영(기기 공용 사본 + 알림) */
  await us.click('#page-v137 input[data-v137-f="line"]');await us.keyboard.press('ControlOrMeta+a');await us.keyboard.type('US에서 고친 한줄');await us.keyboard.press('Enter');
  await us.click(`#v137Imgs [data-v137-im="aaaa-1"] [data-v137-act="del"]`);await us.waitForTimeout(150);await us.click('#v137Imgs [data-v137-act="delyes"]');await us.waitForTimeout(1500);
  await E(()=>v138Test.pull({cloud:false}));await hl.waitForTimeout(500);
  r30=await recH('2026-10-30');
  o.Back={line:r30.line,img:Object.keys(r30.imgs||{}),gone:Object.keys(r30.gone||{}),ui:await E(()=>document.querySelector('#page-v137 input[data-v137-f="line"]').value),bc:await E(()=>V138.dev.bc>0||V138.dev.get>0)};
  await E(()=>v138Test.pull({cloud:true}));o.Back.noRes=!(await recH('2026-10-30')).imgs||!(await recH('2026-10-30')).imgs['aaaa-1'];
  await us.close();
  /* ===== 서식(오늘 10-31) ===== */
  await E(()=>v137Test.go(v137Test.today()));await hl.waitForTimeout(400);
  o.Fmt={empty:await E(()=>document.querySelector('#page-v137 .v138-ed').classList.contains('is-empty')),fs:await E(()=>parseFloat(getComputedStyle(document.querySelector('#page-v137 .v138-ed')).fontSize))};
  await hl.click(ED);await hl.keyboard.type('기본 굵게 밑줄 크게');
  const selWord=w=>E(w=>{const ed=document.querySelector('#page-v137 .v138-ed');const tw=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);let n;while((n=tw.nextNode())){const i=n.data.indexOf(w);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+w.length);const s=getSelection();s.removeAllRanges();s.addRange(r);return true;}}return false;},w);
  const tb=()=>E(()=>({b:document.querySelector('#page-v137 [data-v138-cmd="b"]').getAttribute('aria-pressed'),u:document.querySelector('#page-v137 [data-v138-cmd="u"]').getAttribute('aria-pressed'),sz:document.querySelector('#page-v137 .v138-szl').textContent}));
  await selWord('굵게');await hl.click('#page-v137 [data-v138-cmd="b"]');
  await selWord('밑줄');await hl.keyboard.press('Control+KeyU');
  await selWord('크게');await hl.click('#page-v137 [data-v138-cmd="szmenu"]');o.Fmt.menu=await E(()=>!document.querySelector('#page-v137 .v138-szm').hidden);await hl.click('#page-v137 [data-v138-size="l"]');
  o.Fmt.menuClosed=await E(()=>document.querySelector('#page-v137 .v138-szm').hidden);o.Fmt.focus=await E(()=>document.activeElement===document.querySelector('#page-v137 .v138-ed'));
  await selWord('굵게');await E(()=>{const s=getSelection();s.collapseToStart();const r=s.getRangeAt(0);r.setStart(r.startContainer,1);r.collapse(true);s.removeAllRanges();s.addRange(r);});await hl.waitForTimeout(80);o.Fmt.tbB=await tb();
  await selWord('크게');await E(()=>{const s=getSelection();const r=s.getRangeAt(0);r.setStart(r.startContainer,1);r.collapse(true);s.removeAllRanges();s.addRange(r);});await hl.waitForTimeout(80);o.Fmt.tbL=await tb();
  await selWord('기본');await E(()=>{const s=getSelection();s.collapseToStart();});await hl.waitForTimeout(80);o.Fmt.tbN=await tb();
  /* 선택 없이 B → 이어 쓰는 글자 굵게, Ctrl+B 로 끔 */
  await hl.keyboard.press('ControlOrMeta+End');await hl.keyboard.press('Control+KeyB');await hl.keyboard.type(' 이어서');await hl.keyboard.press('Control+KeyB');await hl.keyboard.type(' 보통');
  await hl.waitForTimeout(1200);let r31=await recH(v137TestToday=await E(()=>v137Test.today()));
  o.Fmt.saved={b:/<b>굵게<\/b>/.test(r31.html),u:/<u>밑줄<\/u>/.test(r31.html),l:/<span data-size="l">크게/.test(r31.html),cont:/<b> 이어서<\/b> 보통/.test(r31.html)||/<b>\s?이어서<\/b>\s?보통/.test(r31.html),text:r31.text,noFont:!/<font/.test(r31.html)};
  /* Ctrl+Z */
  await hl.keyboard.type('Z');await hl.keyboard.press('ControlOrMeta+z');await hl.waitForTimeout(80);o.Fmt.undo=await E(()=>!document.querySelector('#page-v137 .v138-ed').innerText.includes('보통Z'));
  await hl.waitForTimeout(1000);
  /* 붙여넣기: 서식 있는 글 → 평문 */
  o.Paste=await E(()=>{const ed=document.querySelector('#page-v137 .v138-ed');ed.focus();const s=getSelection(),r=document.createRange();r.selectNodeContents(ed);r.collapse(false);s.removeAllRanges();s.addRange(r);
   const dt=new DataTransfer();dt.setData('text/html','<b style="color:red" onclick="window.__xss=1">빨강</b><img src=x onerror="window.__xss=1">');dt.setData('text/plain','붙인줄1\n붙인줄2');
   const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});ed.dispatchEvent(ev);return {prevented:ev.defaultPrevented,red:ed.innerHTML.includes('color'),img:!!ed.querySelector('img'),has:ed.innerText.includes('붙인줄1')&&ed.innerText.includes('붙인줄2')};});
  await hl.waitForTimeout(1100);r31=await recH(v137TestToday);o.Paste.saved=r31.text.includes('붙인줄1\n붙인줄2')&&!/<img|style=/.test(r31.html);
  /* sanitize: 저장 · 다른 일지 사본 · 화면 */
  o.San={fn:await E(()=>v138Test.san('<b onclick="window.__xss=1">a</b><script>window.__xss=1</script><img src=x onerror="window.__xss=1"><span style="color:red" data-size="xl">b</span><font size="5">c</font><i>d</i><a href="javascript:window.__xss=1">e</a><div style="x">f</div><iframe src="x"></iframe><strong>g</strong>'))};
  await E(async()=>{await v137Set({html:'<div>위험<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b style="font-size:90px" onmouseover="window.__xss=3">굵</b></div>'},'2026-10-27');});
  o.San.saved=(await recH('2026-10-27')).html;
  await E(async()=>{await v138DevTx('readwrite',s=>s.put({o:{'2026-10-26':{text:'x',html:'<div>남의<img src=x onerror="window.__xss=4"><svg onload="window.__xss=5"></svg><u>밑줄</u></div>',textAt:3,updatedAt:3}},s7:null,t:{},at:Date.now(),scope:'US',user:'11111111-2222-3333-4444-555555555555'},v138DevKey('US')));});
  await E(()=>v138Test.pull({cloud:false}));o.San.recv=(await recH('2026-10-26')).html;
  await E(()=>v137Test.go('2026-10-26'));await hl.waitForTimeout(500);o.San.dom=await E(()=>document.querySelector('#page-v137 .v138-ed').innerHTML);o.San.xss=await E(()=>window.__xss||0);
  await E(()=>v137Test.go(v137Test.today()));await hl.waitForTimeout(400);
  /* IME: 조합 중 Ctrl+B 무시·저장 안 함, 다시 그리기에도 글자 유지 */
  await hl.click(ED);await hl.keyboard.press('ControlOrMeta+End');const cdp=await ctx.newCDPSession(hl);
  const st0=await E(()=>V137.st.save);
  await cdp.send('Input.imeSetComposition',{text:'한',selectionStart:1,selectionEnd:1});await hl.waitForTimeout(80);
  o.Ime={comp:await E(()=>V137.comp)};await hl.keyboard.press('Control+KeyB');await E(()=>{renderAll();v137Soft(true);});await hl.waitForTimeout(900);
  o.Ime.block=await E(()=>V138.st.imeBlock>0);o.Ime.noSave=(await E(()=>V137.st.save))===st0;o.Ime.b=await E(()=>document.querySelector('#page-v137 [data-v138-cmd="b"]').getAttribute('aria-pressed'));
  await cdp.send('Input.insertText',{text:'한글'});await hl.waitForTimeout(1200);o.Ime.done=(await recH(v137TestToday)).text.endsWith('한글');o.Ime.focus=await E(()=>document.activeElement===document.querySelector('#page-v137 .v138-ed'));
  /* 양식 넣기: 글 끝(커서)에 빈 줄 띄워, 번호줄 굵게 */
  await hl.keyboard.press('ControlOrMeta+End');await hl.click('#page-v137 [data-v137-act="tpl"]');await hl.waitForTimeout(1100);r31=await recH(v137TestToday);
  o.Tpl={keep:r31.text.startsWith('기본 굵게 밑줄 크게 이어서 보통'),sep:/한글\n\n1\. 지수\nSPX:\nNDX:/.test(r31.text),end:r31.text.endsWith('5. 매매계획\n'),bold:/<b>1\. 지수<\/b>/.test(r31.html)&&/<b>5\. 매매계획<\/b>/.test(r31.html),fmtKept:/<b>굵게<\/b>/.test(r31.html)};
  await hl.keyboard.press('ControlOrMeta+z');await hl.waitForTimeout(1100);o.Tpl.undo=!(await recH(v137TestToday)).text.includes('4. 마켓브레스');
  /* 빈 날 양식 · 전날 글 복사(서식 포함) */
  await E(()=>v137Test.go('2026-11-02'));await hl.waitForTimeout(400);await hl.click('#page-v137 [data-v137-act="tpl"]');await hl.waitForTimeout(1100);
  const r2=await recH('2026-11-02');o.Tpl.empty={text:r2.text===await E(()=>V137_TPL),bold:(r2.html.match(/<b>\d\. /g)||[]).length};
  await E(()=>v137Test.go('2026-11-01'));await hl.waitForTimeout(400);
  o.Copy={en:await E(()=>!document.querySelector('#page-v137 [data-v137-act="copy"]').disabled)};
  await hl.click('#page-v137 [data-v137-act="copy"]');await hl.waitForTimeout(900);
  const r1=await recH('2026-11-01');r31=await recH(v137TestToday);
  o.Copy.same=!!r1&&r1.html===r31.html&&r1.text===r31.text;o.Copy.ui=await E(()=>!!document.querySelector('#page-v137 .v138-ed b'));
  /* 새로고침 뒤 유지 */
  await hl.reload();await hl.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await hl.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};`);
  await E(login,[PRJ,UID]);await E(()=>setPage('v137'));await hl.waitForTimeout(1200);
  o.Reload=await E(()=>{const ed=document.querySelector('#page-v137 .v138-ed');return {b:!!ed.querySelector('b'),u:!!ed.querySelector('u'),l:!!ed.querySelector('span[data-size="l"]'),txt:ed.innerText.includes('기본 굵게 밑줄 크게')};});
  /* 일지 안 동기화 병합(칸별) · 다른 일지와 동시 수정(PC 우선 + 충돌 보관) */
  o.Merge=await E(()=>{const base={trades:[],settings:{},updatedAt:1,v138Outlook:{all:{'2026-10-31':{line:'L0',text:'T0',html:'<div>T0</div>',updatedAt:1,imgs:{a:{kind:'img',ord:0,at:1},b:{kind:'img',ord:1,at:1}}}}}};
   const m=JSON.parse(JSON.stringify(base)),x=JSON.parse(JSON.stringify(base));m.updatedAt=2;x.updatedAt=3;
   const md=m.v138Outlook.all['2026-10-31'],xd=x.v138Outlook.all['2026-10-31'];md.html='<div><b>T-pc</b></div>';md.text='T-pc';md.textAt=5;md.updatedAt=5;
   xd.line='L-mobile';xd.lineAt=6;xd.updatedAt=6;delete xd.imgs.b;xd.gone={b:1};
   const r=v110MergeState(base,m,x,{src:'cloud'});const s=r.state||r;const d=s.v138Outlook.all['2026-10-31'];return {html:d.html,text:d.text,line:d.line,bGone:!d.imgs.b,gone:d.gone,conf:(r.conflicts||[]).length};});
  o.Cross=await E(()=>{const M={'2026-10-31':{text:'내 글',textAt:200,line:'같음',lineAt:50,updatedAt:200}},O={'2026-10-31':{text:'남 글',textAt:300,line:'같음',lineAt:60,updatedAt:300}};
   const a=v138Test.join(M,[{o:O,t:{'v138Outlook.all.2026-10-31':'mobile'}}],{lastX:100,myDev:'pc',pref:'pc'});
   const b=v138Test.join(M,[{o:O,t:{'v138Outlook.all.2026-10-31':'pc'}}],{lastX:100,myDev:'mobile',pref:'pc'});
   const c=v138Test.join(M,[{o:O,t:{}}],{lastX:0,myDev:'pc',pref:'pc'});
   return {pcKeep:a.all['2026-10-31'].text,pcConf:a.conf.map(x=>[x.f,x.rule,x.keptSide,x.lost&&x.lost.text]),bump:a.all['2026-10-31'].textAt>300,
    otherPc:b.all['2026-10-31'].text,otherConf:b.conf.map(x=>[x.rule,x.keptSide,x.lost&&x.lost.text]),seq:c.all['2026-10-31'].text,seqConf:c.conf.length};});
  /* 다른 일지 동시 수정 → 충돌 목록·진 값으로 바꾸기 */
  o.Res=await E(async()=>{localStorage.setItem(v138Test.lastKey(),'1000');const d='2026-10-25';await v137Set({line:'이 기기 값'},d);
   await v138DevTx('readwrite',s=>s.put({o:{[d]:{line:'다른 일지 값',lineAt:Date.now()+5000,updatedAt:Date.now()+5000}},s7:null,t:{['v138Outlook.all.'+d]:'pc'},at:Date.now(),scope:'US',user:'11111111-2222-3333-4444-555555555555'},v138DevKey('US')));
   localStorage.setItem('tj-v119-dev','mobile');await v138Test.pull({cloud:false});localStorage.removeItem('tj-v119-dev');
   const c=(state.v110Conflicts||[]).find(x=>String(x.field)==='v138Outlook.all.'+d+'.line');const now1=state.v138Outlook.all[d].line;
   if(c)await v110Resolve(c.id,true);return {now1,conf:!!c&&{kept:c.kept,lost:c.lost,rule:c.rule,label:v110Label(c.field)},after:state.v138Outlook.all[d].line,atBump:state.v138Outlook.all[d].lineAt>Date.now()-60000};});
  o.Chk=await E(()=>{const t=x=>{try{return v138Test.check(x);}catch(e){return String(e.message).slice(0,40);}};
   return {ok:t(state.v138Outlook),b64:t({all:{'2026-10-31':{text:'x data:image/png;base64,AAAA'}}})!==true,html:t({all:{'2026-10-31':{html:5}}})!==true,dataWord:t({all:{'2026-10-31':{text:'data: 시작해도 됨'}}})};});
  o.dbg=await E(()=>{const d=v138Debug();return {on:d.on,journal:d.journal,other:d.other,v137Kept:d.v137Kept,b64:d.payloadBase64,logged:d.cloud.logged};});
  o.Lay=await E(()=>window.__over());o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  await E(()=>v137Test.go(v137Test.today()));await hl.waitForTimeout(400);
  await hl.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
  await hl.click('#page-v137 [data-v138-cmd="szmenu"]');await hl.waitForTimeout(150);await hl.screenshot({path:path.join(outDir,key+'-menu.png')}).catch(()=>{});
  R[key]=o;await ctx.close();};
 let v137TestToday;
 await Promise.all([run([1440,'on']),run([390,'on']),run([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
