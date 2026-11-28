/* v143 QA — (1) 펀딩비 목록 접기 (2) 진입 방식(t.trigger) 화면에서 숨김. 모의 HL·모의 데이터(외부 연결 없음).
   거래: F1(펀딩 24건, trigger '5분봉 마감') · F2(펀딩 0건) · W(trigger '돌파 순간')
   1440: 상세 포지션 운영 펀딩비 카드 — 기본 접힘(누적·24건·[펼치기], 줄 안 보임) → 펼치기(24줄 보임·촘촘(줄 높이 ≤ 34px)·한 줄에 금액·시각·수정/삭제 버튼) → 새로고침 뒤에도 펼침 유지 → 접기 · 0건 거래는 버튼 없음
         표 '진입 방식' 열 없음(머리·칸) · 한줄평가 열 넓어짐 · 상세 부제목에 방식 없음 · 정정 폼 진입 확인 방식 숨김(폼 안에 남아 값 그대로) → 복기 저장 뒤 trigger 그대로 ·
         새 거래 폼 진입 확인 방식 숨김 · 방식별 성과 옵션 2개 없음 · CSV '트리거' 칸 그대로
   390: 카드에 방식 글자 없음 · 펀딩비 펼친 목록 넘침 없음 · 대화상자 안
   ?v143=0: v142 그대로(열·옵션·폼·펀딩 목록 펼친 채, 버튼 없음) */
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
const seed=async()=>{
 const now=Date.now(),H=36e5;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const base=Math.floor((now-60*H)/H)*H;
 const fund=(n,a)=>Array.from({length:n},(_,i)=>{const d=new Date(a+(i+1)*H).toISOString();return {id:'fd'+i,date:d.slice(0,10),time:d.slice(11,19),amount:-0.04-(i%3)*0.001,memo:'API funding'};});
 const mk=(id,a,b,px,x)=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'눌림',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,px)],funding:[],images:[],...(x||{})});
 state.trades=[
  mk('F1',base,base+30*H,103,{trigger:'5분봉 마감',funding:fund(24,base)}),
  mk('F2',base+31*H,base+33*H,99,{trigger:'1분봉 마감'}),
  mk('W',base+40*H,base+44*H,104,{trigger:'돌파 순간'})];
 Object.assign(state.settings,{account:10000,v92From:'2026-10-01'});await persist();setPage('records');renderAll();
};
const vis=sel=>{const el=typeof sel==='string'?document.querySelector(sel):sel;return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const baseUrl='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const boot=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()}`);};
  await page.goto(baseUrl+(mode==='off'?'&v143=0':''));await boot();
  const E=(f,a)=>page.evaluate(f,a);
  await E(seed);await page.waitForTimeout(800);
  const openManage=async id=>{await E(async id=>{openTrade(id,'manage');await new Promise(r=>setTimeout(r,1200));},id);};
  /* 펀딩비 카드 상태 */
  const F=()=>E(()=>{const body=$('detailBody');const h=[...body.querySelectorAll('h3')].find(x=>x.textContent.includes('펀딩비'));if(!h)return null;
   const rows=[...body.querySelectorAll('.funding-row')];const shown=rows.filter(r=>window.__vis(r));const b=body.querySelector('[data-v143-fund]');const n=body.querySelector('.v143-fn');
   const dr=$('tradeDialog').getBoundingClientRect();
   const hs=shown.map(r=>r.getBoundingClientRect().height);
   const oneLine=shown.slice(0,3).map(r=>{const a=r.querySelector('b').getBoundingClientRect(),t=r.querySelector('small').getBoundingClientRect(),ed=r.querySelector('[data-funding-edit]'),del=r.querySelector('[data-funding-delete]');
     return Math.abs((a.top+a.bottom)/2-(t.top+t.bottom)/2)<8&&!!ed&&!!del&&window.__vis(ed)&&window.__vis(del);});
   return {sum:(body.querySelector('.summary-value')||{}).textContent||'',count:n?n.textContent:null,btn:b?b.textContent.trim():null,exp:b?b.getAttribute('aria-expanded'):null,rows:rows.length,shown:shown.length,
    maxH:hs.length?Math.round(Math.max(...hs)):0,oneLine:oneLine.every(Boolean)&&oneLine.length>0,
    bad:shown.filter(r=>{const q=r.getBoundingClientRect();return q.right>dr.right+1||r.scrollWidth>r.clientWidth+1;}).map((_,i)=>'row'+i).slice(0,3)};});
  o.dbg=await E(()=>typeof v143Debug==='function'?(({on,trigger})=>({on,tableCol:trigger.tableCol,compare:trigger.compare,newFormVisible:trigger.newFormVisible}))(v143Debug()):null);
  /* 표·카드 */
  if(!M){
   o.T=await E(()=>{const th=[...document.querySelectorAll('.record-desktop thead th')].map(x=>x.textContent.trim());const tr=document.querySelector('.record-desktop tbody tr[data-open="F1"]');
    const thOne=document.querySelector('.record-desktop th.v135-th');const tbl=document.querySelector('.record-desktop table');
    return {th,tds:tr?tr.children.length:0,trigText:tr?tr.textContent.includes('5분봉 마감'):null,onePct:thOne&&tbl?Math.round(thOne.getBoundingClientRect().width/tbl.getBoundingClientRect().width*100):null};});
   await page.screenshot({path:path.join(outDir,key+'-table.png')}).catch(e=>{o.shotErr=String(e.message||e);});
  }else{
   o.K=await E(()=>{const c=[...document.querySelectorAll('.record-card')];return {n:c.length,trig:c.some(x=>/5분봉 마감|돌파 순간|1분봉 마감/.test(x.textContent)),
    over:c.some(x=>x.scrollWidth>x.clientWidth+1||x.getBoundingClientRect().right>innerWidth+1)};});
  }
  /* 펀딩비 */
  await openManage('F1');
  o.F0=await F();
  o.sub=await E(()=>$('detailSubtitle').textContent.includes('5분봉 마감'));
  await E(()=>{const h=[...$('detailBody').querySelectorAll('h3')].find(x=>x.textContent.includes('펀딩비'));h&&h.scrollIntoView({block:'start'});});await page.waitForTimeout(200);
  await page.screenshot({path:path.join(outDir,key+'-fund-closed.png')}).catch(()=>{});
  if(mode==='on'){
   await (M?page.tap('[data-v143-fund]'):page.click('[data-v143-fund]'));await page.waitForTimeout(300);
   o.F1=await F();o.F1.dlg=await E(()=>!!$('tradeDialog').open);o.F1.ls=await E(()=>localStorage.getItem('tj-v143-fund'));
   await E(()=>{const h=[...$('detailBody').querySelectorAll('h3')].find(x=>x.textContent.includes('펀딩비'));h&&h.scrollIntoView({block:'start'});});await page.waitForTimeout(200);
   await page.screenshot({path:path.join(outDir,key+'-fund-open.png')}).catch(()=>{});
   /* 다시 그려도(renderDetail) 펼침 유지 */
   await E(()=>{renderDetail();});await page.waitForTimeout(400);o.F2=await F();
   /* 수정 버튼 동작(대화상자 열림) */
   o.Edit=await E(async()=>{const b=$('detailBody').querySelector('[data-funding-edit]');b.click();await new Promise(r=>setTimeout(r,300));const open=!!$('fundingDialog').open;const amt=$('fundingForm').elements.amount.value;$('fundingDialog').close();return {open,amt:Number(amt)<0};});
   await E(()=>$('tradeDialog').close());await page.waitForTimeout(400);
   if(!M){
    /* 새로고침 뒤 펼침 유지 → 접기 */
    await page.reload();await boot();await E(()=>{setPage('records');renderAll();});await page.waitForTimeout(600);await openManage('F1');
    o.R1=await F();
    await page.click('[data-v143-fund]');await page.waitForTimeout(300);o.R2=await F();o.R2.ls=await E(()=>localStorage.getItem('tj-v143-fund'));
    await E(()=>$('tradeDialog').close());await page.waitForTimeout(300);
    /* 0건 거래 */
    await openManage('F2');o.Z=await F();await E(()=>$('tradeDialog').close());await page.waitForTimeout(300);
    /* 상세 정정 폼: 진입 확인 방식 숨김·값 보존 */
    await E(async()=>{openTrade('W','review');await new Promise(r=>setTimeout(r,1200));});
    o.Fix=await E(()=>{const s=document.querySelector('#tradeDialog select[name="trigger"]');const set=document.querySelector('#tradeDialog select[name="setup"]');
     const fold=s&&s.closest('details');if(fold)fold.open=true;
     return {inForm:!!(s&&s.form),vis:!!(s&&window.__vis(s)),val:s?s.value:null,setupVis:!!(set&&window.__vis(set)),label:!!document.querySelector('#tradeDialog').textContent.includes('진입 확인 방식')&&!!(s&&window.__vis(s))};});
    /* 복기 저장(폼 제출) 뒤 trigger 그대로 */
    o.Fix.after=await E(async()=>{const f=$('reviewForm');if(!f)return 'noform';const set=f.elements.setup;if(set){set.value='EP';}
     f.requestSubmit?f.requestSubmit():f.dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,1200));const t=state.trades.find(x=>x.id==='W');return {trigger:t.trigger,setup:t.setup};});
    await E(()=>{try{$('tradeDialog').close();}catch{}});await page.waitForTimeout(300);
    /* 새 거래 폼·분석 옵션·CSV */
    o.New=await E(()=>{const s=$('newTrigger');const lb=s&&s.closest('label');return {exists:!!s,vis:!!(lb&&window.__vis(lb)),val:s?s.value:null,setupVis:!!($('newSetup')&&$('newSetup').closest('label')&&$('newSetup').closest('label').getClientRects().length>=0)};});
    o.Cmp=await E(async()=>{setPage('analysis');renderAll();await new Promise(r=>setTimeout(r,800));const s=$('compareMode');return {opts:[...s.options].map(x=>x.value).filter(v=>v==='trigger'||v==='setupTrigger'),val:s.value,setup:!!s.querySelector('option[value="setup"]')};});
    o.Csv=await E(()=>{let out=null;const b=download;download=(n,c)=>{out=c;};try{exportCSV();}finally{download=b;}const lines=out.replace(/^\uFEFF/,'').split('\n');return {h:lines[0].includes('트리거')||lines[0].includes('진입'),val:out.includes('5분봉 마감')};});
    o.Stored=await E(()=>state.trades.map(t=>t.id+':'+t.trigger).join(','));
   }else{
    /* 390: 펼친 목록 넘침 없음 */
    await openManage('F1');o.F3=await F();
    await E(()=>{const r=$('detailBody').querySelector('.funding-row');r&&r.scrollIntoView({block:'center'});});await page.waitForTimeout(200);
    await page.screenshot({path:path.join(outDir,key+'-fund-rows.png')}).catch(()=>{});
    await E(()=>$('tradeDialog').close());
   }
  }else{
   await E(()=>$('tradeDialog').close());await page.waitForTimeout(300);
   o.Off=await E(()=>{const th=[...document.querySelectorAll('.record-desktop thead th')].map(x=>x.textContent.trim());const s=$('newTrigger');const lb=s&&s.closest('label');
    return {th,newVis:!!(lb&&window.__vis(lb)),opts:[...$('compareMode').options].map(x=>x.value).filter(v=>v==='trigger'||v==='setupTrigger')};});
  }
  o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),one([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
