/* v129 QA — 일간 복기 작성 카드: 점수 버튼 그대로 + 큰 글상자 하나(모의 데이터, 가짜 주소 없음 · 네트워크 모의). 시계 2026-10-31(토) 12:00 KST → HL 오늘 10-31, 이번 주 10-26~11-01.
   PC 1440 · 모바일 390(isMobile·hasTouch) 각각:
   (A) 빈 날(10-31): 작성 카드 안 글상자 1개(예전 한 줄 칸·네 칸 없음)·12줄·자리표시·점수 버튼 5개·안내 문구, 높이 ≥ 12줄, 넘침 없음
   (B) 한글 IME(CDP imeSetComposition → insertText) + Enter 로 긴 글 입력 — 입력하는 동안 0.12초마다 persist()·renderAll()(저장·동기화 잠금·다시 그리기 흉내) → 글자·줄바꿈 누락 없음,
       입력 중 미저장 글 localStorage 기록 → 칸 벗어나면 저장(text) · 미저장 글 지움 · 날짜 탭 '작성됨' · 긴 글 붙이면 높이 늘어남(안쪽 스크롤 없음)
   (C) 옛 칸 데이터 날(10-30): 제목 붙여 합친 글 미리 채움·안내 보임 → 점수만 바꿈 = score만 저장(text 안 생김·옛 칸 그대로)
       → 다른 기기가 memo를 바꾼 상태에서 글 고쳐 저장 = text만 얹힘(옛 칸·원격 memo 그대로) → 다시 열면 text 우선·안내 숨김
   (D) 저장 안 한 글(10-29) → 새로고침 → 되살림 안내·글 그대로 → 저장
   (E) 동기화 병합(v110MergeState, v112 날짜·칸별, v119 PC 우선): 모바일(이 기기)·PC 둘 다 text 고침 → PC 글 · 반대 기기 → 이 기기(PC) 글 · 한쪽 text·다른 쪽 score → 둘 다 · 옛 칸 보존 · 충돌 이름 '복기 글'
       + JSON 백업·가져오기: v21dClean/v21dMerge text 유지 · 형식 검사(text 숫자 → 오류) · 주간 요약 복사에 text 첫 줄
   (F) 지난 기록 보관함(v126 보기): 보관된 날 text가 같은 글상자에 보이고, 보관함에서 고친 글은 보관함에 저장
   (G) ?v129=0 = 예전 다섯 칸 폼 · 예전 폼 저장이 text를 지우지 않음 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'}]};break;
    case 'perpDexs':out=[null];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};break;
    case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];break;
    default:out=[];}
   return J(out);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}send(){}close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;};
const chk=()=>{const W=document.documentElement.clientWidth,bad=[];const card=document.getElementById('v21dWrite');if(!card)return {docScroll:document.documentElement.scrollWidth>W+1,bad:['no card']};
 const cb=card.getBoundingClientRect();for(const el of [card,...card.querySelectorAll('*')]){if(el.closest('[hidden]')||el.classList.contains('v129-sr'))continue;const r=el.getBoundingClientRect();if(!r.width)continue;
  if(r.right>Math.min(W,el===card?W:cb.right)+0.5||r.left<Math.max(0,el===card?0:cb.left)-0.5)bad.push(String(el.className||el.id||el.tagName).slice(0,30)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+Math.round(cb.right));}
 return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
const OLD={score:3,mood:'잠 부족, 손실 뒤 조급함',good:'손절 지킴\n분할 익절',mistakes:'',tomorrow:'손실 청산 뒤 15분 쉬기',memo:'CPI 발표',done:false,updatedAt:Date.parse('2026-10-30T15:00:00Z')};
const OLD_TXT='감정·컨디션: 잠 부족, 손실 뒤 조급함\n\n잘한 점:\n손절 지킴\n분할 익절\n\n내일 집중할 것: 손실 청산 뒤 15분 쉬기\n\n메모: CPI 발표';
const LINE1='오늘은 손절을 잘 지켰다. 진입 근거가 약한 자리는 넘겼다.',LINE2='내일은 진입 전에 체크리스트를 먼저 보고, 손실 뒤에는 쉰다!';
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[]};
 const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const ready=async p=>{await p.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await p.waitForTimeout(600);};
 const openDay=(p,day)=>p.evaluate(async d=>{setPage('weekly');await new Promise(r=>setTimeout(r,300));if(v21dSel!==d)v21dPick(d,{scroll:false});else v21dRenderWrite(true);await new Promise(r=>setTimeout(r,200));const ta=document.querySelector('#v21dWrite textarea');if(ta)ta.scrollIntoView({block:'center'});return v21dSel;},day);
 const rec=(p,day)=>p.evaluate(d=>{const r=((state.dailyReviews||{}).hl||{})[d];return r?JSON.parse(JSON.stringify(r)):null;},day);
 for(const W of [1440,390]){const w='w'+W,r={};out[w]=r;
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});await ctx.addInitScript(init);
  let A=await ctx.newPage();const hook=p=>{p.on('pageerror',e=>out.errors.push(w+' '+e.message));p.on('dialog',d=>{out.errors.push(w+' dialog '+d.message());d.dismiss();});};hook(A);
  await A.goto(URL0);await ready(A);
  /* 시드: 옛 칸 데이터(10-30) */
  await A.evaluate(async O=>{state.dailyReviews={hl:{'2026-10-30':O}};await persist();},OLD);
  /* (A) 빈 날 */
  r.sel=await openDay(A,'2026-10-31');
  r.A=await A.evaluate(()=>{const c=$('v21dWrite'),ta=c.querySelectorAll('textarea'),t=ta[0];const lh=parseFloat(getComputedStyle(t).lineHeight)||20;
   return {title:c.querySelector('h2').textContent,ta:ta.length,inputs:c.querySelectorAll('input').length,rows:t.rows,ph:t.placeholder,val:t.value,scores:c.querySelectorAll('[data-v21d-score]').length,
    note:[...c.querySelectorAll('.v18-note')].map(e=>e.textContent).join(' | '),oldHidden:$('v129Old').hidden,minLines:Math.round((t.getBoundingClientRect().height-24)/lh),
    wFull:Math.abs(t.getBoundingClientRect().width-c.querySelector('.v129-field').getBoundingClientRect().width)<2,badge:$('v21dDoneBadge').textContent,dbg:v129Debug().on};});
  r.Achk=await A.evaluate(chk);
  try{await A.screenshot({path:path.join(outDir,w+'-empty.png'),fullPage:false});}catch(e){r.shotErr=String(e.message||e);}
  /* (B) 한글 IME + Enter, 입력 중 저장·다시 그리기 반복 */
  const cdp=await ctx.newCDPSession(A);
  await A.click('#v21dWrite textarea');
  await A.evaluate(()=>{window.__noise=setInterval(()=>{try{persist();renderAll();}catch(e){}},120);});
  const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const typeKo=async s=>{for(const ch of s){const c=ch.charCodeAt(0);if(c>=0xAC00&&c<=0xD7A3){const jamo=CHO[Math.floor((c-0xAC00)/588)];
     await cdp.send('Input.imeSetComposition',{text:jamo,selectionStart:1,selectionEnd:1});await cdp.send('Input.imeSetComposition',{text:ch,selectionStart:1,selectionEnd:1});await cdp.send('Input.insertText',{text:ch});}
    else await cdp.send('Input.insertText',{text:ch});}};
  await typeKo(LINE1);await A.keyboard.press('Enter');await typeKo(LINE2);
  /* 잠금이 확실히 걸린 동안(publicBusy) 한글·Enter·붙여넣기 */
  await A.evaluate(()=>{publicBusy++;});
  await A.keyboard.press('Enter');await typeKo('잠금 중 입력');await A.keyboard.press('Enter');await cdp.send('Input.insertText',{text:'ok'});
  r.Block=await A.evaluate(()=>{const v=interactionBusy();publicBusy--;return v;});
  r.Bbusy=await A.evaluate(()=>({lock:V129.st.lockPass,enter:V129.st.enterPass,skip:V129.st.renderSkip}));
  await A.evaluate(()=>{clearInterval(window.__noise);});await A.waitForTimeout(400);
  r.B=await A.evaluate(()=>{const t=document.querySelector('#v21dWrite textarea');let d=null;try{d=JSON.parse(localStorage.getItem(v129DK('2026-10-31')));}catch{}return {val:t.value,same:document.activeElement===t,dirty:v21dDirty,draft:d&&d.text};});
  r.Bexp=LINE1+'\n'+LINE2+'\n잠금 중 입력\nok';
  /* 칸 벗어남 → 저장 */
  await A.evaluate(()=>{document.activeElement.blur();});await A.waitForTimeout(900);
  r.Bsaved=await rec(A,'2026-10-31');
  r.Bafter=await A.evaluate(()=>({draft:localStorage.getItem(v129DK('2026-10-31')),dirty:v21dDirty,tab:(document.querySelector('[data-v21d-day="2026-10-31"] .v21d-dot')||{}).className||'',badge:$('v21dDoneBadge').textContent,state:$('v21dSaveState').textContent}));
  /* 긴 글 붙이기 → 높이 늘어남, 안쪽 스크롤 없음 */
  await A.click('#v21dWrite textarea');await A.keyboard.press('End');await A.keyboard.press('Control+End');
  const LONG=Array.from({length:30},(_,i)=>'\n'+(i+1)+'. 긴 복기 줄 — 진입·청산·감정을 길게 적어 봅니다 abcdefghijklmnopqrstuvwxyz').join('');
  await cdp.send('Input.insertText',{text:LONG});await A.waitForTimeout(300);
  r.Bgrow=await A.evaluate(()=>{const t=document.querySelector('#v21dWrite textarea');const R=t.getBoundingClientRect();return {h:Math.round(R.height),sh:t.scrollHeight,ch:t.clientHeight,inner:t.scrollHeight>t.clientHeight+2,len:t.value.length};});
  r.Bgchk=await A.evaluate(chk);
  await A.click('#v21dWrite [data-v21d-save]');await A.waitForTimeout(700);
  r.Blong=await A.evaluate(()=>{const x=((state.dailyReviews||{}).hl||{})['2026-10-31'];return x?x.text.length:0;});
  r.BlongExp=(LINE1+'\n'+LINE2+'\n잠금 중 입력\nok'+LONG).length;
  try{await A.screenshot({path:path.join(outDir,w+'-long.png'),fullPage:false});}catch(e){r.shotErr=String(e.message||e);}
  /* (C) 옛 칸 데이터 날 */
  await openDay(A,'2026-10-30');
  r.C=await A.evaluate(()=>{const t=document.querySelector('#v21dWrite textarea');return {val:t.value,oldVis:!$('v129Old').hidden,score:(document.querySelector('#v21dWrite [data-v21d-score].active')||{}).textContent||null,ta:document.querySelectorAll('#v21dWrite textarea').length};});
  r.Cexp=OLD_TXT;
  await A.click('#v21dWrite [data-v21d-score="4"]');await A.waitForTimeout(700);
  r.Cscore=await rec(A,'2026-10-30');
  /* 다른 기기가 memo를 바꿈(이미 받은 상태) → 이 폼에서 글 고쳐 저장 */
  await A.evaluate(()=>{const x=state.dailyReviews.hl['2026-10-30'];state.dailyReviews.hl['2026-10-30']={...x,memo:'원격 메모',updatedAt:x.updatedAt+1};});
  await A.click('#v21dWrite textarea');await A.keyboard.press('Control+End');await typeKo('\n추가 메모');
  await A.click('#v21dWrite [data-v21d-save]');await A.waitForTimeout(700);
  r.Ctext=await rec(A,'2026-10-30');r.CtextExp=OLD_TXT+'\n추가 메모';
  await openDay(A,'2026-10-31');await openDay(A,'2026-10-30');
  r.Creopen=await A.evaluate(()=>({val:document.querySelector('#v21dWrite textarea').value,oldVis:!$('v129Old').hidden}));
  r.Cchk=await A.evaluate(chk);
  try{await A.screenshot({path:path.join(outDir,w+'-old.png'),fullPage:false});}catch(e){r.shotErr=String(e.message||e);}
  /* (D) 저장 안 한 글 → 새로고침 → 되살림 */
  await openDay(A,'2026-10-29');await A.click('#v21dWrite textarea');await typeKo('저장 전 글');await A.waitForTimeout(150);
  await A.evaluate(()=>{window.onbeforeunload=null;});
  await A.reload();await ready(A);await openDay(A,'2026-10-29');
  r.D=await A.evaluate(()=>({val:document.querySelector('#v21dWrite textarea').value,note:$('v129Draft').hidden?'':$('v129Draft').textContent,rec:!!(((state.dailyReviews||{}).hl||{})['2026-10-29']),dirty:v21dDirty}));
  await A.click('#v21dWrite [data-v21d-save]');await A.waitForTimeout(700);
  r.Dsaved=await A.evaluate(()=>({text:((((state.dailyReviews||{}).hl||{})['2026-10-29'])||{}).text,draft:localStorage.getItem(v129DK('2026-10-29'))}));
  /* 새로고침 뒤에도 저장값 유지(10-31 긴 글, 10-30 옛 칸) */
  r.Dkeep=await A.evaluate(()=>{const h=(state.dailyReviews||{}).hl||{};return {t31:(h['2026-10-31']||{}).text?h['2026-10-31'].text.length:0,mood30:(h['2026-10-30']||{}).mood,memo30:(h['2026-10-30']||{}).memo};});
  /* (E) 동기화 병합 · 백업 */
  r.E=await A.evaluate(()=>{const D='2026-10-20',P='dailyReviews.hl.'+D;const mk=(rv,T)=>({format:FORMAT,currency:CURRENCY,v:5,trades:[],settings:{},updatedAt:rv.updatedAt||1,dailyReviews:{hl:{[D]:rv}},...(T?{v119T:{[P]:T}}:{})});
   const base={score:3,mood:'기분',good:'잘함',mistakes:'',tomorrow:'',memo:'',done:false,doneAt:null,updatedAt:10,text:'처음 글'};
   const res={};const was=V119.devOv;
   try{V119.devOv='mobile';let x=v110MergeState(mk(base),mk({...base,text:'폰 글',updatedAt:30}),mk({...base,text:'PC 글',updatedAt:20},'pc'),{src:'cloud'});
    res.pcWins={text:x.state.dailyReviews.hl[D].text,mood:x.state.dailyReviews.hl[D].mood,conf:x.conflicts.map(c=>c.field),label:x.conflicts.length?v110Label(x.conflicts[0].field):'',rule:x.conflicts.length?x.conflicts[0].rule:''};
    V119.devOv='pc';x=v110MergeState(mk(base),mk({...base,text:'PC 글',updatedAt:20}),mk({...base,text:'폰 글',updatedAt:30},'mobile'),{src:'cloud'});
    res.mineWins={text:x.state.dailyReviews.hl[D].text};
    x=v110MergeState(mk(base),mk({...base,text:'고친 글',updatedAt:20}),mk({...base,score:5,updatedAt:30},'mobile'),{src:'cloud'});
    res.both={text:x.state.dailyReviews.hl[D].text,score:x.state.dailyReviews.hl[D].score,conf:x.conflicts.length};
    const old={...base};delete old.text;
    x=v110MergeState(mk(old),mk({...old,text:'새 글',updatedAt:20}),mk({...old,updatedAt:10}),{src:'cloud'});
    res.add={text:x.state.dailyReviews.hl[D].text,mood:x.state.dailyReviews.hl[D].mood,good:x.state.dailyReviews.hl[D].good,conf:x.conflicts.length};
    x=v110MergeState(null,mk({...old,text:'새 글',updatedAt:20}),mk({...old,updatedAt:10}),{src:'cloud'});
    res.noBase={text:x.state.dailyReviews.hl[D].text,mood:x.state.dailyReviews.hl[D].mood};
   }finally{V119.devOv=was;}
   /* 백업·가져오기 */
   const cl=v21dClean({hl:{[D]:{...base}}});res.clean=cl.hl[D].text;
   const mg=v21dMerge({hl:{[D]:{...base,updatedAt:1}}},{hl:{[D]:{...base,text:'가져온 글',updatedAt:2}}});res.merge=mg.hl[D].text;
   let bad='';try{validatePayloadShape({format:FORMAT,currency:CURRENCY,trades:[],dailyReviews:{hl:{[D]:{text:5}}}});}catch(e){bad=e.message;}res.badShape=bad;
   let ok='';try{validatePayloadShape({format:FORMAT,currency:CURRENCY,trades:[],dailyReviews:{hl:{[D]:{text:'글'}}}});ok='ok';}catch(e){ok=e.message;}res.okShape=ok;
   res.exportHas=JSON.stringify(state).includes('저장 전 글');
   try{res.summary=v18SummaryText(v18Wk);}catch(e){res.summary='ERR '+e.message;}
   return res;});
  /* (F) 지난 기록 보관함 보기 */
  r.F=await A.evaluate(async()=>{state.v126Archive={epoch:'qa129',cutoff:Date.parse('2026-10-29T00:00:00Z'),createdAt:Date.now(),counts:{trades:0},state:{trades:[],dailyReviews:{hl:{'2026-10-28':{score:2,mood:'',good:'',mistakes:'',tomorrow:'',memo:'',done:true,doneAt:1,updatedAt:5,text:'보관함 글'}}},weeklyReviews:{},reviews:{},v121Scalp:{}},conflicts:[]};
   const okOpen=await v126ViewOpen('arc',0);setPage('weekly');await new Promise(r=>setTimeout(r,300));v21dPick('2026-10-28',{scroll:false});await new Promise(r=>setTimeout(r,200));
   const t=document.querySelector('#v21dWrite textarea');const val=t?t.value:null;const badge=$('v21dDoneBadge')?$('v21dDoneBadge').textContent:'';
   t.focus();t.value=val+' · 보관함에서 고침';t.dispatchEvent(new Event('input',{bubbles:true}));await v21dSave();
   const inView=((state.dailyReviews||{}).hl||{})['2026-10-28'];await v126ViewClose();
   const arc=((((state.v126Archive||{}).state||{}).dailyReviews||{}).hl||{})['2026-10-28']||{};const active=!!(((state.dailyReviews||{}).hl||{})['2026-10-28']);
   delete state.v126Archive;await persist();
   return {okOpen,val,badge,inView:inView&&inView.text,arc:arc.text,active};});
  /* (G) ?v129=0 예전 폼 */
  const B=await ctx.newPage();hook(B);await B.goto(URL0+'&v129=0');await ready(B);
  await openDay(B,'2026-10-30');
  r.G=await B.evaluate(()=>{const c=$('v21dWrite');return {on:v129Debug().on,ta:c.querySelectorAll('textarea').length,big:c.querySelectorAll('textarea[data-v129]').length,inputs:c.querySelectorAll('input[data-v21d-field="mood"]').length,
   mood:(c.querySelector('[data-v21d-field="mood"]')||{}).value,memo:(c.querySelector('[data-v21d-field="memo"]')||{}).value};});
  await B.evaluate(async()=>{const m=document.querySelector('#v21dWrite [data-v21d-field="mood"]');m.value='예전 폼에서 고침';m.dispatchEvent(new Event('input',{bubbles:true}));await v21dSave();});
  r.Gsaved=await rec(B,'2026-10-30');
  r.Gchk=await B.evaluate(chk);
  await B.close();
  await ctx.close();}
 console.log(JSON.stringify(out));await browser.close();srv.close();
})().catch(e=>{console.error(e);console.log(JSON.stringify({errors:['FATAL '+(e&&e.message||e)]}));process.exit(1);});
