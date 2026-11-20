/* v137 QA — '아침 전망' 페이지 시험판. 모의 HL·모의 Supabase(REST·Storage) — 외부 연결 없음.
   1440(로그인·CSP 그대로): 메뉴 위치·2열(글 왼쪽, 이미지 오른쪽 sticky) · 어제 채점 줄(칩 → 저장) · 한줄평·바이어스·글 그 자리 입력·자동 저장·상태 ·
     양식 넣기(덮어쓰기 없음) · 확신도·무효 조건(더 보기) · 다음날 채점 칩·이유 · IME 조합 중 Enter 무시 · 저장 중 잠금에도 입력 · 입력 중 다시 그리기 글자·커서 유지 ·
     이미지 붙여넣기(페이지·글상자 포커스 중 이미지만 가로채기, 글자 붙여넣기는 통과)·파일 선택·2000px 축소 webp·라벨·순서·삭제(인라인 확인)·라이트박스(좌우·Esc) ·
     TradingView 링크(네트워크 막힘 → 링크 카드 / s3 응답 → 미리보기) · Storage 버킷 없음 → '클라우드 대기'·기기 보관 → 버킷 생김 → 올라감(경로 uid/날짜/uuid.webp)·
     다른 기기(기기 blob 없음) → signed URL 로 내려받아 표시 · payload 에 base64 없음 · 백업 형식 검사 · 동기화 병합(칸별) · 새 출발 보관 대상 아님 ·
     전날 글 복사(빈 날만·채점·이미지 제외) · 새로고침 뒤 유지 · 미저장 글 되살림
   390: 한 열(이미지 글 아래)·넘침 없음·하단 메뉴 7개 · 입력·저장 · 이미지 붙여넣기 · 라이트박스
   ?v137=0: 메뉴·페이지 없음, 저장된 전망 데이터 그대로 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http'),zlib=require('zlib');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
/* 테스트 PNG(단색) */
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return b=>{let c=0xffffffff;for(const x of b)c=t[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};})();
const chunk=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(CRC(td));return Buffer.concat([l,td,c]);};
const mkPng=(w,h,rgb)=>{const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=rgb[0];raw[o+1]=(rgb[1]+y)&255;raw[o+2]=rgb[2];}}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;ih[10]=0;ih[11]=0;ih[12]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);};
const PNG_FILE=mkPng(2600,1300,[30,120,200]),PNG_TV=mkPng(320,200,[200,60,60]),PNG_DL=mkPng(400,240,[40,160,90]);
const PRJ='https://qa137.supabase.co',UID='11111111-2222-3333-4444-555555555555';
const init=([dl])=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const DL=Uint8Array.from(atob(dl),c=>c.charCodeAt(0));
 window.__st={mode:'nobucket',up:[],sign:0,get:0,del:0,restBody:[]};
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);const m=(o&&o.method)||'GET';
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='perpDexs')out=[null];else if(b.type==='meta')out={universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]};
   else if(b.type==='metaAndAssetCtxs')out=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40}]},[{markPx:'102'}]];
   else if(b.type==='spotMetaAndAssetCtxs')out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];
   else if(b.type==='candleSnapshot')out=[];else if(/user|Fills|Funding|OpenOrders/.test(b.type||''))out=[];else out={};
   await new Promise(r=>setTimeout(r,20));return J(JSON.stringify(out));}
  if(u.includes('/storage/v1/object/sign/outlook-images/')){
   if(m==='POST'){__st.sign++;if(__st.mode!=='ok')return J('{"statusCode":"404","error":"not_found","message":"Object not found"}',400);
    const p=u.split('/storage/v1/object/sign/outlook-images/')[1];return J(JSON.stringify({signedURL:'/object/sign/outlook-images/'+p+'?token=qa'}));}
   __st.get++;return new Response(DL,{status:200,headers:{'Content-Type':'image/png'}});}
  if(u.includes('/storage/v1/object/outlook-images/')){const p=decodeURIComponent(u.split('/storage/v1/object/outlook-images/')[1]);
   if(m==='DELETE'){__st.del++;return J('[]');}
   if(__st.mode==='nobucket')return J('{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}',400);
   if(__st.mode==='rls')return J('{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}',400);
   const h=o.headers||{};__st.up.push({path:p,type:h['Content-Type'],upsert:h['x-upsert'],auth:h.Authorization,size:o.body&&o.body.size});return J(JSON.stringify({Key:'outlook-images/'+p}));}
  if(u.includes('.supabase.co/')){if(typeof o.body==='string')__st.restBody.push(o.body.slice(0,200000));return J('[]');}
  return J('{"message":"nf"}',404);};
};
const seed=async([PRJ,UID,login])=>{
 V110.auto=false;
 state.v137Outlook={us:{'2026-10-29':{line:'중립 · 박스권',bias:'neutral',text:'10/29 글',grade:'part',gradeWhy:'반만 맞음',updatedAt:1},
  '2026-10-30':{line:'숏 우세, 반등 실패',bias:'short',text:'1. 지수\nSPX: -1.2%\nNDX: -1.8%',conf:3,inval:'SPX 6800 회복',updatedAt:2}}};
 Object.assign(state.settings,{account:10000});await persist();
 if(login){cloudConfig={url:PRJ,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:PRJ,user:{id:UID,email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};}
 if(window.V137on)setPage('v137');};
const vis=el=>{if(typeof el==='string')el=document.querySelector(el);return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init,[PNG_DL.toString('base64')]);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  page.on('console',m=>{const t=m.text();if(m.type()==='error'&&/Content Security Policy|Refused to/.test(t)&&/img-src|connect-src|worker-src|tradingview|supabase|blob:/.test(t))R.errors.push(key+' CSP: '+t.slice(0,160));});
  const boot=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()};`);};
  const E=(f,a)=>page.evaluate(f,a);
  await page.goto(base+(mode==='off'?'&v137=0':''));await boot();
  const rec=d=>E(d=>{const r=state.v137Outlook&&state.v137Outlook.us&&state.v137Outlook.us[d];return r?JSON.parse(JSON.stringify(r)):null;},d);
  const ta='#page-v137 textarea.v137-text',line='#page-v137 input[data-v137-f="line"]';
  if(mode==='off'){
   await E(seed,[PRJ,UID,false]);await page.waitForTimeout(400);
   o.Off={nav:await E(()=>!!document.querySelector('.nav [data-page="v137"]')),page:await E(()=>!!document.getElementById('page-v137')),on:await E(()=>v137Debug().on),
    title:await E(()=>$('pageTitle').textContent)};
   await page.reload();await boot();await page.waitForTimeout(500);
   o.Off.kept=await E(()=>!!(state.v137Outlook&&state.v137Outlook.us&&state.v137Outlook.us['2026-10-30']&&state.v137Outlook.us['2026-10-30'].text.startsWith('1. 지수')));
   await E(()=>setPage('weekly'));o.Off.weekly=await E(()=>!document.getElementById('page-weekly').hidden);
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  const login=!M;
  await E(seed,[PRJ,UID,login]);await page.waitForTimeout(700);
  /* 메뉴·화면 */
  o.Nav=await E(()=>{const bs=[...document.querySelectorAll('.nav button')];const i=bs.findIndex(b=>b.dataset.page==='v137');const b=bs[i];const s=b&&b.querySelector('span');const r=b&&b.getBoundingClientRect();
   return {after:bs[i-1]&&bs[i-1].dataset.page,label:s&&s.textContent,active:!!b&&b.classList.contains('active'),n:bs.length,vis:window.__vis(b),clip:!!s&&s.scrollWidth>s.clientWidth+1,inView:!!r&&r.right<=innerWidth+1&&r.left>=-1,title:$('pageTitle').textContent};});
  o.Lay=await E(()=>{const m=document.querySelector('#page-v137 .v137-main'),s=document.querySelector('#page-v137 .v137-side');const a=m.getBoundingClientRect(),b=s.getBoundingClientRect();
   return {side:b.left>a.right-1&&Math.abs(b.top-a.top)<4,below:b.top>=a.bottom-1,sticky:getComputedStyle(s).position,fs:parseFloat(getComputedStyle(document.querySelector('#page-v137 textarea.v137-text')).fontSize),date:document.getElementById('v137Date').value};});
  o.Yd={row:await E(()=>{const r=document.querySelector('#page-v137 .v137-yday');return r?{d:r.dataset.v137Yd,vis:window.__vis(r),chips:r.querySelectorAll('[data-v137-ydg]').length}:null;})};
  await page.screenshot({path:path.join(outDir,key+'-empty.png'),fullPage:!M}).catch(e=>{o.shotErr=String(e.message||e);});
  if(!M){
   /* 어제 채점 줄: 칩 → 저장 */
   await page.click('#page-v137 .v137-yday [data-v137-ydg="hit"]');await page.waitForTimeout(500);
   o.Yd.grade=(await rec('2026-10-30')).grade;o.Yd.done=await E(()=>{const r=document.querySelector('#page-v137 .v137-yday');return r?r.classList.contains('done'):null;});
   o.Yd.text=(await rec('2026-10-30')).text.startsWith('1. 지수');
   /* 한줄평·바이어스·글 */
   await page.click(line);await page.keyboard.type('Long bias 유지');
   await page.click('#page-v137 [data-v137-bias="long"]');await page.waitForTimeout(500);
   await page.click(ta);await page.keyboard.type('기존 메모 첫 줄');await page.keyboard.press('Enter');await page.keyboard.type('SPX 6850');
   o.Typ={mid:await E(()=>V137.saveSt)};await page.waitForTimeout(1200);
   let r=await rec('2026-10-31');o.Typ.line=r&&r.line;o.Typ.bias=r&&r.bias;o.Typ.text=r&&r.text;o.Typ.st=await E(()=>document.getElementById('v137Save').textContent);
   o.Typ.grew=await E(()=>{const t=document.querySelector('#page-v137 textarea.v137-text');return t.scrollHeight<=t.clientHeight+4;});
   /* 양식 넣기: 기존 글 뒤(커서 위치)에 추가 — 덮어쓰기 없음 */
   await page.click(ta);await page.keyboard.press('ControlOrMeta+End');await page.click('#page-v137 [data-v137-act="tpl"]');await page.waitForTimeout(1100);
   r=await rec('2026-10-31');o.Tpl={keep:r.text.startsWith('기존 메모 첫 줄\nSPX 6850'),has:r.text.includes('1. 지수\nSPX:\nNDX:')&&r.text.includes('4. 마켓브레스\nMMFD:')&&r.text.endsWith('5. 매매계획\n'),
    sep:r.text.includes('SPX 6850\n\n1. 지수'),focus:await E(()=>document.activeElement===document.querySelector('#page-v137 textarea.v137-text'))};
   /* 더 보기: 확신도·무효 조건 */
   await page.click('#page-v137 details.v137-more summary');await page.click('#page-v137 [data-v137-conf="4"]');await page.waitForTimeout(400);
   await page.click('#page-v137 input[data-v137-f="inval"]');await page.keyboard.type('NDX 25000 회복');await page.keyboard.press('Enter');await page.waitForTimeout(500);
   r=await rec('2026-10-31');o.More={conf:r.conf,inval:r.inval,sum:await E(()=>document.getElementById('v137MoreSum').textContent),blur:await E(()=>document.activeElement.tagName)};
   /* 다음날 채점 칩·이유 */
   await page.click('#page-v137 #v137Grade [data-v137-grade="miss"]');await page.waitForTimeout(400);
   await page.click('#page-v137 input[data-v137-f="gradeWhy"]');await page.keyboard.type('갭 상승');await page.waitForTimeout(1000);
   r=await rec('2026-10-31');o.Grade={g:r.grade,why:r.gradeWhy};
   /* IME: 조합 중 Enter 는 저장·나가기 안 함 */
   await page.click(line);await page.keyboard.press('ControlOrMeta+End');const cdp=await ctx.newCDPSession(page);
   await cdp.send('Input.imeSetComposition',{text:'숏',selectionStart:1,selectionEnd:1});await page.waitForTimeout(80);
   o.Ime={comp:await E(()=>V137.comp)};
   await E(()=>{const i=document.querySelector('#page-v137 input[data-v137-f="line"]');i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true}));});
   await page.waitForTimeout(900);o.Ime.focus=await E(()=>document.activeElement&&document.activeElement.dataset.v137F);o.Ime.saved=(await rec('2026-10-31')).line;
   await cdp.send('Input.insertText',{text:'숏'});await page.waitForTimeout(80);o.Ime.comp2=await E(()=>V137.comp);
   await page.keyboard.press('Enter');await page.waitForTimeout(500);o.Ime.v=(await rec('2026-10-31')).line;o.Ime.blur=await E(()=>document.activeElement.tagName);o.Ime.n=await E(()=>V137.st.imeEnter);
   /* 저장 중 전역 잠금에도 입력 · 입력 중 다시 그리기에도 글자·커서 유지 */
   await page.click(ta);await page.keyboard.press('ControlOrMeta+End');await E(()=>{publicBusy++;});await page.keyboard.type('잠금중');
   o.Lock={busy:await E(()=>interactionBusy()),has:await E(()=>document.querySelector('#page-v137 textarea.v137-text').value.endsWith('잠금중'))};await E(()=>{publicBusy--;});
   await page.keyboard.type('abc');await E(()=>{renderAll();v137Soft(true);});await page.keyboard.type('def');
   o.Re={focus:await E(()=>document.activeElement===document.querySelector('#page-v137 textarea.v137-text')),end:await E(()=>{const t=document.querySelector('#page-v137 textarea.v137-text');return t.value.endsWith('잠금중abcdef')&&t.selectionStart===t.value.length;})};
   await page.waitForTimeout(1100);o.Re.saved=(await rec('2026-10-31')).text.endsWith('잠금중abcdef');
   /* 이미지: 페이지에 붙여넣기(포커스 없음) — 2600×1300 PNG → 2000px webp, 버킷 없음 → 클라우드 대기 */
   await page.mouse.click(W-20,880);
   const pasteImg=async(sel,w,h)=>E(async([sel,w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#3a7';g.fillRect(0,0,w,h);g.fillStyle='#fff';g.fillRect(10,10,w/3,h/3);
    const b=await new Promise(r=>c.toBlob(r,'image/png'));const f=new File([b],'shot.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);
    const t=sel?document.querySelector(sel):document.body;if(sel)t.focus();const before=sel?t.value:null;const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});t.dispatchEvent(ev);return {prevented:ev.defaultPrevented,same:sel?t.value===before:null};},[sel,w,h]);
   o.Img={p1:await pasteImg(null,2600,1300)};await page.waitForTimeout(1800);
   o.Img.p2=await pasteImg('#page-v137 textarea.v137-text',800,500);await page.waitForTimeout(1500);
   o.Img.txt=await E(()=>{const t=document.querySelector('#page-v137 textarea.v137-text');const dt=new DataTransfer();dt.setData('text/plain','그냥 글자');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});t.dispatchEvent(ev);return ev.defaultPrevented;});
   await page.setInputFiles('#v137File',{name:'chart.png',mimeType:'image/png',buffer:PNG_FILE});await page.waitForTimeout(1800);
   r=await rec('2026-10-31');const ids=Object.entries(r.imgs||{}).sort((a,b)=>a[1].ord-b[1].ord).map(x=>x[0]);
   o.Img.n=ids.length;o.Img.kinds=Object.values(r.imgs).map(x=>x.kind).join(',');
   o.Img.idb=await E(async()=>(await v137Test.idb()).map(x=>({w:x.w,h:x.h,type:x.type,up:x.up})).sort((a,b)=>b.w-a.w));
   o.Img.thumbs=await E(()=>[...document.querySelectorAll('#v137Imgs .v137-thumb img')].filter(i=>i.src.startsWith('blob:')&&i.naturalWidth>0).length);
   o.Img.wait=await E(()=>[...document.querySelectorAll('#v137Imgs .v137-ist')].map(x=>x.textContent.split(' · ')[0]));
   o.Img.cloudLine=await E(()=>document.getElementById('v137Cloud').textContent);o.Img.cerr=await E(()=>v137Debug().cloud.err);
   o.Img.noB64=await E(()=>!/data:image|base64/.test(JSON.stringify(state))&&v137Debug().payloadBase64===false);o.Img.chars=await E(()=>v137Debug().payloadChars);
   o.Img.paths=Object.values(r.imgs).map(x=>x.path||'').join('');
   await page.screenshot({path:path.join(outDir,key+'-images.png'),fullPage:true}).catch(()=>{});
   /* 라벨 · 순서 · 삭제(인라인 확인) */
   await page.fill(`#v137Imgs [data-v137-lab="${ids[0]}"]`,'NDX 일봉');await page.keyboard.press('Enter');await page.waitForTimeout(500);
   r=await rec('2026-10-31');o.Lab=r.imgs[ids[0]].label;
   await page.click(`#v137Imgs [data-v137-im="${ids[0]}"] [data-v137-act="down"]`);await page.waitForTimeout(500);
   r=await rec('2026-10-31');o.Ord=Object.entries(r.imgs).sort((a,b)=>a[1].ord-b[1].ord).map(x=>x[0]).indexOf(ids[0]);
   o.OrdDom=await E(id=>[...document.querySelectorAll('#v137Imgs [data-v137-im]')].map(x=>x.dataset.v137Im).indexOf(id),ids[0]);
   await page.click(`#v137Imgs [data-v137-im="${ids[2]}"] [data-v137-act="del"]`);await page.waitForTimeout(200);
   o.Del={ask:await E(()=>!!document.querySelector('#v137Imgs .v137-delq'))};
   await page.click('#v137Imgs [data-v137-act="delno"]');await page.waitForTimeout(200);o.Del.keep=Object.keys((await rec('2026-10-31')).imgs).length;
   await page.click(`#v137Imgs [data-v137-im="${ids[2]}"] [data-v137-act="del"]`);await page.waitForTimeout(150);await page.click('#v137Imgs [data-v137-act="delyes"]');await page.waitForTimeout(600);
   r=await rec('2026-10-31');o.Del.n=Object.keys(r.imgs).length;o.Del.gone=!r.imgs[ids[2]];o.Del.idb=(await E(()=>v137Test.idb())).length;
   /* TradingView: 네트워크 막힘 → 링크 카드 */
   await page.click('#page-v137 input[data-v137-tv]');await page.keyboard.type('https://www.tradingview.com/x/AbCdEf12/');await page.keyboard.press('Enter');await page.waitForTimeout(1500);
   r=await rec('2026-10-31');const tv1=Object.entries(r.imgs).find(x=>x[1].kind==='tv');
   o.Tv={tv:tv1&&tv1[1].tv,card:await E(id=>{const li=document.querySelector(`#v137Imgs [data-v137-im="${id}"]`);const a=li&&li.querySelector('a.v137-tvcard');return a?{href:a.getAttribute('href'),vis:window.__vis(a)}:null;},tv1&&tv1[0]),
    st:await E(id=>{const li=document.querySelector(`#v137Imgs [data-v137-im="${id}"]`);return li&&li.querySelector('.v137-ist').textContent;},tv1&&tv1[0]),input:await E(()=>document.querySelector('#page-v137 input[data-v137-tv]').value)};
   /* TradingView: s3 응답 → 미리보기(붙여넣기로) */
   let s3url='';await ctx.route(/s3\.tradingview\.com/,rt=>{s3url=rt.request().url();rt.fulfill({status:200,contentType:'image/png',body:PNG_TV});});
   await E(()=>{const dt=new DataTransfer();dt.setData('text/plain','봐 https://www.tradingview.com/x/Zx9yW8vU/ ');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});document.body.dispatchEvent(ev);});
   await page.waitForTimeout(1500);r=await rec('2026-10-31');const tv2=Object.entries(r.imgs).find(x=>x[1].kind==='tv'&&x[1].tv.includes('Zx9yW8vU'));
   o.Tv.ok=await E(id=>{const im=document.querySelector(`#v137Imgs [data-v137-im="${id}"] img[data-v137-tvimg]`);return im?{nw:im.naturalWidth,src:im.getAttribute('src')}:null;},tv2&&tv2[0]);o.Tv.s3=s3url;
   /* 라이트박스 */
   await page.click(`#v137Imgs [data-v137-im="${ids[0]}"] .v137-thumb`);await page.waitForTimeout(400);
   const lbi=()=>E(()=>{const l=document.getElementById('v137Lb');if(!l||l.hidden)return null;const im=l.querySelector('img');return {txt:l.querySelector('.v137-lbbar span').textContent,blob:im.src.startsWith('blob:'),nw:im.naturalWidth,fit:im.getBoundingClientRect().right<=innerWidth+1};});
   o.Lb={a:await lbi()};await page.screenshot({path:path.join(outDir,key+'-lightbox.png')}).catch(()=>{});
   await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);o.Lb.b=await lbi();await page.keyboard.press('ArrowLeft');await page.waitForTimeout(200);o.Lb.c=await lbi();
   await page.keyboard.press('Escape');await page.waitForTimeout(200);o.Lb.closed=(await lbi())===null;
   /* Storage 권한 오류 → 문구, 버킷 생김 → 올라감 */
   await E(()=>{__st.mode='rls';});await E(()=>v137Test.pump());o.Up={rls:await E(()=>v137Debug().cloud.err)};
   await E(()=>{__st.mode='ok';});o.Up.res=await E(()=>v137Test.pump());await page.waitForTimeout(500);
   r=await rec('2026-10-31');const imgs=Object.entries(r.imgs).filter(x=>x[1].kind==='img');
   o.Up.cloud=imgs.map(x=>x[1].cloud);o.Up.path=imgs.every(([id,x])=>x.path===`${'11111111-2222-3333-4444-555555555555'}/2026-10-31/${id}.webp`);
   o.Up.mock=await E(()=>__st.up.map(x=>({type:x.type,upsert:x.upsert,auth:x.auth,big:x.size>100})));
   o.Up.st=await E(()=>[...document.querySelectorAll('#v137Imgs .v137-ist')].map(x=>x.textContent));o.Up.line=await E(()=>document.getElementById('v137Cloud').textContent);
   o.Up.idb=await E(async()=>(await v137Test.idb()).map(x=>x.up));
   /* 다른 기기(기기 blob 없음): signed URL 로 내려받아 표시 */
   await E(id=>v137Test.dropLocal(id),ids[0]);await E(()=>v137Soft(true));await page.waitForTimeout(1500);
   o.Dl={sign:await E(()=>__st.sign),get:await E(()=>__st.get),shown:await E(id=>{const im=document.querySelector(`#v137Imgs [data-v137-im="${id}"] img`);return !!im&&im.src.startsWith('blob:')&&im.naturalWidth===400;},ids[0]),
    idb:await E(async id=>{const a=await v137Test.idb();const x=a.find(y=>y.id===id);return x?{remote:x.remote,up:x.up}:null;},ids[0])};
   /* 백업 형식 검사 · 동기화 병합 · 새 출발 */
   o.Chk=await E(()=>{const t=o=>{try{return v137Test.check(o);}catch(e){return String(e.message).slice(0,40);}};
    let vp='';try{validatePayloadShape({trades:[],v137Outlook:{us:{'2026-10-31':{text:'x',imgs:{a:{kind:'img',path:'data:image/png;base64,AAAA'}}}}}});vp='통과';}catch(e){vp=String(e.message).slice(0,30);}
    return {ok:t(state.v137Outlook),b64:t({us:{'2026-10-31':{text:'data:image/png;base64,AAAA'}}})!==true,bad:t({us:{'2026/10/31':{}}})!==true,vp};});
   o.Merge=await E(()=>{const b={trades:[],settings:{},updatedAt:1,v137Outlook:{us:{'2026-10-31':{line:'L0',text:'T0',updatedAt:1,imgs:{a:{kind:'img',label:'',ord:0,at:1},b:{kind:'img',label:'',ord:1,at:1}}}}}};
    const m=JSON.parse(JSON.stringify(b)),x=JSON.parse(JSON.stringify(b));m.updatedAt=2;x.updatedAt=3;
    m.v137Outlook.us['2026-10-31'].text='T-pc';m.v137Outlook.us['2026-10-31'].updatedAt=5;m.v137Outlook.us['2026-10-31'].imgs.a.label='PC 라벨';
    x.v137Outlook.us['2026-10-31'].line='L-mobile';x.v137Outlook.us['2026-10-31'].updatedAt=6;delete x.v137Outlook.us['2026-10-31'].imgs.b;x.v137Outlook.us['2026-11-01']={line:'새 날',updatedAt:7};
    const r=v110MergeState(b,m,x,{src:'cloud'}).v137Outlook||(v110MergeState(b,m,x,{src:'cloud'}).state||{}).v137Outlook;const d=r&&r.us['2026-10-31'];
    return d?{text:d.text,line:d.line,label:d.imgs&&d.imgs.a&&d.imgs.a.label,bGone:!(d.imgs&&d.imgs.b),nd:!!r.us['2026-11-01'],at:d.updatedAt}:String(JSON.stringify(r)).slice(0,100);});
   o.Fresh={maps:await E(()=>typeof V126_MAPS!=='undefined'&&!V126_MAPS.includes('v137Outlook')),label:await E(()=>V110_LABEL.v137Outlook),user:await E(()=>v110UserField('v137Outlook.us.2026-10-31.text'))};
   /* 전날 글 복사(빈 날만, 채점·이미지 제외) */
   await page.click('#page-v137 [data-v137-step="1"]');await page.waitForTimeout(500);
   o.Copy={date:await E(()=>document.getElementById('v137Date').value),en:await E(()=>!document.querySelector('#page-v137 [data-v137-act="copy"]').disabled),yd:await E(()=>!!document.querySelector('#page-v137 .v137-yday'))};
   await page.click('#page-v137 [data-v137-act="copy"]');await page.waitForTimeout(800);
   const r31=await rec('2026-10-31'),r1=await rec('2026-11-01');
   o.Copy.same=!!r1&&r1.text===r31.text&&r1.line===r31.line&&r1.bias===r31.bias&&r1.conf===r31.conf&&r1.inval===r31.inval;o.Copy.noGrade=!!r1&&!r1.grade&&!r1.gradeWhy&&!r1.imgs;
   o.Copy.ui=await E(()=>document.querySelector('#page-v137 textarea.v137-text').value.startsWith('기존 메모 첫 줄'));o.Copy.dis=await E(()=>document.querySelector('#page-v137 [data-v137-act="copy"]').disabled);
   /* 날짜 목록·이동 */
   o.Days=await E(()=>[...document.querySelectorAll('#v137Days [data-v137-go]')].map(b=>b.dataset.v137Go));
   await page.click('#v137Days [data-v137-go="2026-10-30"]');await page.waitForTimeout(400);
   o.Days2={date:await E(()=>document.getElementById('v137Date').value),line:await E(()=>document.querySelector('#page-v137 input[data-v137-f="line"]').value),grade:await E(()=>document.querySelector('#v137Grade .on')&&document.querySelector('#v137Grade .on').dataset.v137Grade)};
   await E(()=>v137Test.go(v137Test.today()));await page.waitForTimeout(500);
   /* 미저장 글: 입력 직후 새로고침 → 되살림 */
   await page.click(ta);await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type(' 새로고침직전');
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   await page.reload();await boot();
   await E(([P,U])=>{V110.auto=false;cloudConfig={url:P,key:'sb_publishable_'+'x'.repeat(20)};cloudSession={project:P,user:{id:U,email:'qa@example.com'},access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+36000};__st.mode='ok';},[PRJ,UID]);
   await page.waitForTimeout(1500);await E(()=>setPage('v137'));await page.waitForTimeout(1500);
   r=await rec('2026-10-31');
   o.Reload={line:r.line,bias:r.bias,conf:r.conf,inval:r.inval,grade:r.grade,why:r.gradeWhy,draft:r.text.endsWith('잠금중abcdef 새로고침직전'),imgs:Object.keys(r.imgs).length,lab:r.imgs[ids[0]]&&r.imgs[ids[0]].label,
    ui:await E(()=>document.querySelector('#page-v137 textarea.v137-text').value.endsWith('새로고침직전')),thumbs:await E(()=>[...document.querySelectorAll('#v137Imgs .v137-thumb img')].filter(i=>i.src.startsWith('blob:')).length),
    y30:(await rec('2026-10-30')).grade};
   await page.screenshot({path:path.join(outDir,key+'-reload.png'),fullPage:true}).catch(()=>{});
   o.dbg=await E(()=>{const d=v137Debug();return {on:d.on,page:d.page,written:d.written,b64:d.payloadBase64,imgs:d.imgs,logged:d.cloud.logged};});
  }else{
   /* 390 */
   o.Lay2=await E(()=>{const pg=document.getElementById('page-v137');const bad=[];pg.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.right>innerWidth+1||r.left<-1)&&window.__vis(e)&&!e.closest('.v137-days'))bad.push(e.className||e.tagName);});return bad.slice(0,6);});
   await page.tap(line);await page.keyboard.type('모바일 한줄');await page.tap('#page-v137 [data-v137-bias="short"]');await page.waitForTimeout(300);
   await page.tap(ta);await page.keyboard.type('모바일 글');await page.waitForTimeout(1200);
   const r=await rec('2026-10-31');o.Typ={line:r&&r.line,bias:r&&r.bias,text:r&&r.text};
   await E(async()=>{const c=document.createElement('canvas');c.width=1600;c.height=900;const g=c.getContext('2d');g.fillStyle='#38a';g.fillRect(0,0,1600,900);const b=await new Promise(r=>c.toBlob(r,'image/png'));
    const dt=new DataTransfer();dt.items.add(new File([b],'m.png',{type:'image/png'}));document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
   await page.waitForTimeout(1800);
   o.Img={n:Object.keys((await rec('2026-10-31')).imgs||{}).length,fit:await E(()=>{const li=document.querySelector('#v137Imgs .v137-im');if(!li)return null;const r=li.getBoundingClientRect(),m=document.querySelector('#page-v137 .v137-main').getBoundingClientRect();return {in:r.right<=innerWidth+1&&r.left>=-1,below:r.top>m.bottom};}),
    wait:await E(()=>document.querySelector('#v137Imgs .v137-ist').textContent)};
   o.Lay2b=await E(()=>{const pg=document.getElementById('page-v137');const bad=[];pg.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.right>innerWidth+1||r.left<-1)&&window.__vis(e)&&!e.closest('.v137-days'))bad.push(e.className||e.tagName);});return bad.slice(0,6);});
   await page.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
   await page.tap('#v137Imgs .v137-thumb');await page.waitForTimeout(400);
   o.Lb=await E(()=>{const l=document.getElementById('v137Lb');if(!l||l.hidden)return null;const im=l.querySelector('img'),r=im.getBoundingClientRect();return {fit:r.right<=innerWidth+1&&r.left>=-1&&r.width>200,close:window.__vis(l.querySelector('[data-v137-lb="close"]'))};});
   await page.screenshot({path:path.join(outDir,key+'-lightbox.png')}).catch(()=>{});
   await page.tap('#v137Lb [data-v137-lb="close"]');await page.waitForTimeout(200);o.Lb.closed=await E(()=>document.getElementById('v137Lb').hidden);
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),one([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
