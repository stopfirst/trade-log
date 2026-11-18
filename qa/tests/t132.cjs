/* v132 QA — 거래 상세 매매일지 간략화(마틴 루크 방식). 모의 HL·모의 데이터(외부 연결 없음).
   거래(BTC):
   OLD   끝난 거래 · 옛 글칸(진입 근거·스탑 이유·보유 중 생각·청산 이유·사후 평가 메모·사후 메모)·칩(감정·등급·TF·가격 반응·셋업·확신도)
         → 진입/청산 코멘트 글상자에 제목 붙여 미리 채움 + '예전 칸' 안내, 고치지 않으면 저장 안 함(초점·닫기 뒤에도), 고치면 그 글로 저장, 옛 칸 그대로
   NEW   끝난 거래 · 일지 없음 → 청산 코멘트 입력 저장, 피할 수 있던 실수 예 → 다시 누르면 해제(null) → 아니오(false)
   OPEN  진행 중 · 일지 없음 → 일지 빈 칸 = '진입 코멘트 없음'만
   SAVED 끝난 거래 · 진입·청산 코멘트 저장됨 · 피할 수 있던 실수 예 → 빈 칸 없음, 통계 1건
   (H) 숨김: 진입 전 체크·옛 글칸·감정·사후 등급·셋업/확신도/컨디션 칩·사후 메모·분류 접힘 안 보임 / 계획 준수·위반·채점·손익비 보임. 숨긴 칩 값(셋업·확신도 등) 그대로.
   (S) 통계: 핵심 지표·주간 리뷰에 '피할 수 있던 실수 n건' 한 줄, 주간 '셋업 미분류' 신호 없음. 새로고침 뒤 값 유지. 390 넘침 없음.
   (O) ?v132=0: 예전 화면(옛 글칸·진입 전 체크 보임, 새 글상자 없음), 새 칸 값은 저장본에 남음, 일지 빈 칸 예전 기준. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   if(b.type==='candleSnapshot')out=[];
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
const seed=async()=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const mk=(id,o)=>{const a=Math.floor((now-o.h0*H)/H)*H,b=o.h1==null?null:Math.floor((now-o.h1*H)/H)*H;
  return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,o.px||103)],funding:[],images:[],...(o.x||{})});};
 state.trades=[
  mk('OLD',{h0:72,h1:48,x:{entryNote:'인사이드데이 돌파',stopNote:'전일 저가 아래',holdNote:'흔들림',exitNote:'목표 도달\n둘째 줄',postEval:'좋음',review:'반복',emo:{pre:['차분'],mid:[],post:[]},grade:'A',react:true,tfIn:'1h',tfOut:'1h',setup:'EP',conf:4}}),
  mk('NEW',{h0:60,h1:40,px:98}),
  mk('OPEN',{h0:30,h1:null}),
  mk('SAVED',{h0:50,h1:30,px:97,x:{entryComment:'추격 매수',exitComment:'손절 늦음',avoidable:true}})];
 Object.assign(state.settings,{account:10000,v92From:'2026-10-01'});await persist();setPage('records');renderAll();
};
const vis=sel=>{const el=document.querySelector(sel);return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const base='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};
  const ctx=await browser.newContext({viewport:{width:W,height:W<500?844:900},isMobile:W<500,hasTouch:W<500,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+(mode==='off'?'&v132=0':''));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  const E=(f,a)=>page.evaluate(f,a);
  await page.evaluate(`window.__vis=${vis.toString()}`);
  await E(seed);await page.waitForTimeout(600);
  o.dbgOn=await E(()=>typeof v132Debug==='function'?v132Debug().on:null);
  const open=async id=>{await E(async id=>{if($('tradeDialog').open)$('tradeDialog').close();openTrade(id,'review');await new Promise(r=>setTimeout(r,600));},id);};
  await open('OLD');
  o.H=await E(()=>{const v=window.__vis,q=s=>document.querySelector(s);const ta=k=>q(`#tradeDialog textarea[data-v132="${k}"]`);
   return {card:!!q('#v132J'),eVal:ta('entryComment')?ta('entryComment').value:null,xVal:ta('exitComment')?ta('exitComment').value:null,eOld:v('[data-v132-old="entryComment"]'),xOld:v('[data-v132-old="exitComment"]'),
    v92:v('#v92Box'),oldArea:v('#tradeDialog textarea[data-v71-area="entryNote"]'),stopArea:v('#tradeDialog textarea[data-v71-area="stopNote"]'),emo:v('#v71Card .v85-emo'),grade:v('#v71Card > .v63-row'),
    setup:v('#v63Card .v63-row'),review:v('#reviewForm textarea[name="review"]'),fold:v('#reviewForm [name="setup"]'),
    rr:v('#v71Card .v71-rr'),score:v('#v63Card .v63-items'),process:v('#reviewForm [name="process"]'),viol:v('#reviewForm [name="violation"]'),avBtns:document.querySelectorAll('[data-v132-av]').length,
    head:(q('#v71Card .v63-head')||{}).textContent||''};});
  /* 고치지 않고 초점·닫기 → 저장 안 함 */
  await page.click('#tradeDialog textarea[data-v132="entryComment"]');await page.waitForTimeout(200);
  await E(()=>{$('tradeDialog').close();});await page.waitForTimeout(1300);  /* 초점이 글상자에 있는 채로 닫기 → v101Now가 v101Area 호출 → 미리 채운 글 그대로면 저장 안 함 */
  o.noEdit=await E(()=>{const t=state.trades.find(x=>x.id==='OLD');return {has:'entryComment' in t,hasX:'exitComment' in t,skip:V132.st.preSkip>0};});
  /* 고치면 그 글로 저장(옛 칸 그대로) */
  await open('OLD');
  await page.click('#tradeDialog textarea[data-v132="entryComment"]');await page.keyboard.press('Control+End');await page.keyboard.type(' 추격 아님',{delay:15});
  await E(()=>document.activeElement.blur());await page.waitForTimeout(1500);
  o.edit=await E(()=>{const t=state.trades.find(x=>x.id==='OLD');return {ec:t.entryComment,en:t.entryNote,sn:t.stopNote,xc:'exitComment' in t,oldHidden:!window.__vis('[data-v132-old="entryComment"]')};});
  /* NEW: 청산 코멘트 + 피할 수 있던 실수 */
  await open('NEW');
  o.newPre=await E(()=>({e:document.querySelector('#tradeDialog textarea[data-v132="entryComment"]').value,old:!!document.querySelector('[data-v132-old]')}));
  await page.click('#tradeDialog textarea[data-v132="exitComment"]');await page.keyboard.type('두 번째 갭업 연장에서 매도',{delay:15});await page.keyboard.press('Enter');await page.keyboard.type('잘함',{delay:15});
  await E(()=>document.activeElement.blur());await page.waitForTimeout(400);
  const av=async v=>{await page.click(`#tradeDialog [data-v132-av="${v}"]`);await page.waitForTimeout(250);return E(()=>{const t=state.trades.find(x=>x.id==='NEW');return {v:t.avoidable===undefined?'u':t.avoidable,on:[...document.querySelectorAll('[data-v132-av].on')].map(b=>b.dataset.v132Av)};});};
  o.av1=await av('1');o.av2=await av('1');o.av3=await av('0');o.av4=await av('1');
  await page.waitForTimeout(1200);
  o.newSaved=await E(()=>{const t=state.trades.find(x=>x.id==='NEW');return {xc:t.exitComment,av:t.avoidable};});
  o.h390=await E(()=>{const d=$('tradeDialog'),ta=document.querySelector('#tradeDialog textarea[data-v132="exitComment"]');const r=ta.getBoundingClientRect(),dr=d.getBoundingClientRect();return {inside:r.right<=dr.right+1&&r.left>=dr.left-1,h:Math.round(r.height)};});
  await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  await E(()=>$('tradeDialog').close());await page.waitForTimeout(500);
  /* 판정·통계 */
  o.S=await E(()=>{const rows=v92Rows().map(x=>({id:x.t.id,miss:x.g.map(g=>g.miss)}));const st=v71StatsHTML(),wk=v63WeekHTML(v63ThisWeek());
   const t=state.trades.find(x=>x.id==='OLD');
   let bad=null;try{validatePayloadShape({trades:[{id:'z',avoidable:'yes'}]});bad='통과';}catch(e){bad=String(e.message).includes('avoidable');}
   return {gaps:rows,stats:st.includes('피할 수 있던 실수 2건 / 전체 청산 3건'),statsDone:st.includes('진입·청산 코멘트 모두 적은 거래'),week:/피할 수 있던 실수 \d+건 \/ 이 주 청산 \d+건/.test(wk),weekSetupSig:wk.includes('셋업 미분류'),
    kept:{setup:t.setup,conf:t.conf,tfIn:t.tfIn,react:t.react,grade:t.grade,emo:(t.emo.pre||[]).join(),review:t.review,postEval:t.postEval,exitNote:t.exitNote},
    reviewed:v111Reviewed({exitComment:'x'}),user:v110UserField('entryComment')&&v110UserField('avoidable'),shape:bad};});
  o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  /* 새로고침 뒤 */
  await page.reload();await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.waitForTimeout(500);
  o.C=await E(()=>{const g=id=>state.trades.find(x=>x.id===id);return {oldEc:g('OLD').entryComment,oldEn:g('OLD').entryNote,newXc:g('NEW').exitComment,newAv:g('NEW').avoidable,savedAv:g('SAVED').avoidable};});
  R[key]=o;await ctx.close();};
 const off=async()=>{const key='off1440',o={};
  const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+'&v132=0');await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});
  await page.evaluate(`window.__vis=${vis.toString()}`);const E=(f,a)=>page.evaluate(f,a);
  await E(seed);await page.waitForTimeout(600);
  o.dbgOn=await E(()=>v132Debug().on);
  o.H=await E(async()=>{openTrade('SAVED','review');await new Promise(r=>setTimeout(r,600));const v=window.__vis;
   return {card:!!document.querySelector('#v132J'),v92:v('#v92Box'),oldArea:v('#tradeDialog textarea[data-v71-area="entryNote"]'),review:v('#reviewForm textarea[name="review"]'),setup:v('#v63Card .v63-row')};});
  o.S=await E(async()=>{$('tradeDialog').close();await persist();const t=state.trades.find(x=>x.id==='SAVED');const rows=v92Rows().map(x=>({id:x.t.id,miss:x.g.map(g=>g.miss)}));
   return {ec:t.entryComment,xc:t.exitComment,av:t.avoidable,gapNew:rows.some(r=>r.miss.some(m=>m.includes('코멘트'))),gapOld:rows.some(r=>r.miss.includes('진입 근거 없음'))};});
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),off()]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
