/* v142 QA — 손실 유형(거래 객체 lossType A~F). 모의 HL·모의 데이터(외부 연결 없음).
   거래: L1(손실 -2.2R) · L2(L1 청산 5분 뒤 진입한 손실 = 복수매매 의심 → E 제안, 단타) · L3(손실 -3.2R) · L4(손실 -4.2R) · W(이익) · OPEN(보유 중)
   1440: 표 '순손익' 다음 '손실 유형' 열 · 손실 거래만 칩 · E 제안 표시(값은 비어 있음) · 칩 클릭 → 상세 안 열림·그 자리 반영·다시 누르면 해제 ·
         상세 매매일지('피할 수 있던 실수' 다음) 6칸·안내 문구·클릭 반영·표와 같은 값 · 이익 거래 상세엔 없음 ·
         주간 복기 표(유형별 횟수·R 합·미분류·쓸데없는 R 비율·다음 주 과제 후보) · CSV 칸 · 새로고침 유지 · 형식 검사 · 일지 빈 칸·복기 필요 판정 불변
   390: 카드 칩·탭 반영(상세 안 열림)·넘침 없음 · 상세 1열·대화상자 안
   ?v142=0: 열·칩·상세·주간 표·CSV 칸 없음, 저장된 lossType 그대로 */
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
const seed=async(off)=>{
 const now=Date.now(),H=36e5,MIN=6e4;
 const ev=(id,ts,sh,px)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000};};
 const base=Math.floor((now-60*H)/H)*H;
 const mk=(id,a,b,px,x)=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:a,name:'BTC',direction:'long',date:new Date(a).toISOString().slice(0,10),stop:95,stop0:99,initialRisk:1,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',a,1,100)],fills:b==null?[]:[ev(id+'f0',b,1,px)],funding:[],images:[],...(x||{})});
 state.trades=[
  mk('L1',base,base+2*H,98,off?{lossType:'B'}:{}),
  mk('L2',base+2*H+5*MIN,base+2*H+15*MIN,99),
  mk('L3',base+10*H,base+14*H,97),
  mk('L4',base+20*H,base+24*H,96),
  mk('W',base+30*H,base+34*H,104),
  mk('OPEN',base+40*H,null,0)];
 Object.assign(state.settings,{account:10000,v92From:'2026-10-01'});await persist();setPage('records');renderAll();
};
const vis=sel=>{const el=typeof sel==='string'?document.querySelector(sel):sel;return !!(el&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&(el.offsetWidth||el.offsetHeight));};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const baseUrl='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid&v143=0';  /* v143: '진입 방식' 열 숨김은 t143 — 여기선 v142 열 구성 그대로 */
 const one=async([W,mode])=>{
  const key=(mode==='on'?'w':'off')+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  const boot=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()}`);};
  await page.goto(baseUrl+(mode==='off'?'&v142=0':''));await boot();
  const E=(f,a)=>page.evaluate(f,a);
  await E(seed,mode==='off');await page.waitForTimeout(800);
  const val=id=>E(id=>{const t=state.trades.find(x=>x.id===id);return t?(t.lossType===undefined?'undef':t.lossType):'?';},id);
  const dlg=()=>E(()=>!!$('tradeDialog').open);
  const box=(id,w)=>E(([id,w])=>{const el=document.querySelector(`#recordList [data-v142-box="${id}"][data-v142-w="${w}"]`);if(!el)return null;
   return {on:[...el.querySelectorAll('[data-v142-lt].on')].map(x=>x.dataset.v142Lt),sug:[...el.querySelectorAll('[data-v142-lt].sug')].map(x=>x.dataset.v142Lt),n:el.querySelectorAll('[data-v142-lt]').length,st:(el.querySelector('.v142-st')||{}).textContent||''};},[id,w]);
  o.dbg=await E(()=>typeof v142Debug==='function'?(({on,field,types,losses,lossUnclassified,suggestE})=>({on,field,types,losses,lossUnclassified,suggestE}))(v142Debug()):null);
  if(mode==='on'&&!M){
   o.T=await E(()=>{const th=[...document.querySelectorAll('.record-desktop thead th')].map(x=>x.textContent.trim());
    return {th,rows:[...document.querySelectorAll('.record-desktop tbody tr[data-open]')].length,cells:[...document.querySelectorAll('#recordList [data-v142-w="row"]')].map(x=>x.dataset.v142Box).sort(),
     titleA:((document.querySelector('#recordList [data-v142-box="L1"] [data-v142-lt="A"]')||{}).title||'').includes('좋은 손실'),
     over:[...document.querySelectorAll('.record-desktop td.v142-td')].some(td=>td.scrollWidth>td.clientWidth+1)};});
   o.L2a=await box('L2','row');o.L2v=await val('L2');
   const gaps0=await E(()=>state.trades.map(t=>t.id+':'+v92Gaps(t).length+':'+(typeof v111NeedReview==='function'?v111NeedReview(t):'-')).join(','));
   await page.screenshot({path:path.join(outDir,key+'-table.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   /* 표 칩: 상세 안 열림·그 자리 반영·다시 누르면 해제 */
   await page.click('#recordList [data-v142-box="L1"] [data-v142-lt="C"]');await page.waitForTimeout(250);
   o.P1={dlg:await dlg(),v:await val('L1'),box:await box('L1','row')};
   await page.click('#recordList [data-v142-box="L1"] [data-v142-lt="C"]');await page.waitForTimeout(250);
   o.P2={v:await val('L1'),box:await box('L1','row')};
   await page.click('#recordList [data-v142-box="L1"] [data-v142-lt="B"]');await page.waitForTimeout(250);
   await page.click('#recordList [data-v142-box="L2"] [data-v142-lt="E"]');await page.waitForTimeout(250);
   o.P3={L1:await val('L1'),L2:await val('L2'),L2box:await box('L2','row'),dlg:await dlg()};
   /* 상세 L3 */
   await E(async()=>{openTrade('L3','review');await new Promise(r=>setTimeout(r,1200));});
   o.D=await E(()=>{const d=document.querySelector('#v142D');if(!d)return null;const av=document.querySelector('#tradeDialog .v132-av');
    const r=d.getBoundingClientRect(),dr=$('tradeDialog').getBoundingClientRect();const opts=[...d.querySelectorAll('.v142-o')];
    return {vis:window.__vis(d),afterAv:!!(av&&(av.compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING)),inJ:!!d.closest('#v71Card'),n:opts.length,labels:opts.map(x=>x.querySelector('b').textContent+' '+x.querySelector('.v142-nm').textContent.trim()),
     hint:d.textContent.includes('헷갈리면 아래쪽(E/F 쪽)'),crit:opts.every(x=>(x.querySelector('small')||{}).textContent.length>4),cols:getComputedStyle(d.querySelector('.v142-g')).gridTemplateColumns.split(' ').length,
     efLast:opts.slice(-2).every(x=>x.getBoundingClientRect().top>=opts[0].getBoundingClientRect().top+20),fit:r.right<=dr.right+1&&r.left>=dr.left-1};});
   await E(()=>{const d=document.querySelector('#v142D');d&&d.scrollIntoView({block:'center'});});await page.waitForTimeout(200);
   await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(()=>{});
   await page.click('#v142D [data-v142-lt="D"]');await page.waitForTimeout(250);
   o.D.v1=await val('L3');o.D.on1=await E(()=>[...document.querySelectorAll('#v142D .v142-o.on')].map(x=>x.dataset.v142Lt));o.D.dlg=await dlg();
   await page.click('#v142D [data-v142-lt="D"]');await page.waitForTimeout(250);o.D.v2=await val('L3');
   await page.click('#v142D [data-v142-lt="F"]');await page.waitForTimeout(250);o.D.v3=await val('L3');
   await E(()=>$('tradeDialog').close());await page.waitForTimeout(800);
   o.D.cell=await box('L3','row');
   /* 이익 거래 상세: 없음 */
   await E(async()=>{openTrade('W','review');await new Promise(r=>setTimeout(r,1000));});o.Wd=await E(()=>!!document.querySelector('#v142D'));await E(()=>$('tradeDialog').close());await page.waitForTimeout(500);
   /* L4 = A(계획된 손실) */
   await page.click('#recordList [data-v142-box="L4"] [data-v142-lt="A"]');await page.waitForTimeout(500);
   o.All={L1:await val('L1'),L2:await val('L2'),L3:await val('L3'),L4:await val('L4'),W:await val('W'),OPEN:await val('OPEN')};
   o.Gaps=(await E(()=>state.trades.map(t=>t.id+':'+v92Gaps(t).length+':'+(typeof v111NeedReview==='function'?v111NeedReview(t):'-')).join(',')))===gaps0;
   /* 주간 복기 */
   await E(()=>{setPage('weekly');renderAll();});await page.waitForTimeout(1200);
   o.Wk=await E(()=>{const w=document.querySelector('#v63WeekBody #v142Week');if(!w)return null;const rows=[...w.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.replace(/\s+/g,' ').trim()));
    return {vis:window.__vis(w),rows,top:[...w.querySelectorAll('tr.v142-top')].map(tr=>tr.children[0].textContent.trim()),ratio:(w.querySelector('.v142-ratio b')||{}).textContent,task:(w.querySelector('.v142-tl')||{}).textContent,
     over:(()=>{const c=w.closest('.card').getBoundingClientRect();return [...w.querySelectorAll('*')].some(e=>{const q=e.getBoundingClientRect();return q.width&&(q.right>c.right+1||q.left<c.left-1);});})()};});
   o.WkDbg=await E(()=>v142Debug().week);
   await E(()=>{const w=document.querySelector('#v142Week');w&&w.scrollIntoView({block:'center'});});await page.waitForTimeout(200);
   await page.screenshot({path:path.join(outDir,key+'-week.png')}).catch(()=>{});
   /* CSV */
   o.Csv=await E(()=>{let out=null;const b=download;download=(n,c)=>{out=c;};try{exportCSV();}finally{download=b;}const lines=out.replace(/^\uFEFF/,'').split('\n');const h=lines[0].split(',').map(x=>x.replace(/"/g,''));
    const i=h.indexOf('손실 유형');return {after:h[i-1],i:i>0,vals:lines.slice(1).map(l=>l.split(',').map(x=>x.replace(/"/g,''))[i]).filter(Boolean).sort()};});
   /* 형식 검사 */
   o.Shape=await E(()=>{const r=[];for(const v of ['Z',5,'C',null]){try{validatePayloadShape({trades:[{...state.trades[0],lossType:v}]});r.push('ok');}catch(e){r.push(/lossType/.test(e.message)?'err':'other:'+e.message.slice(0,40));}}return r;});
   /* 새로고침 */
   await page.waitForTimeout(1200);await page.reload();await boot();await E(()=>{setPage('records');renderAll();});await page.waitForTimeout(800);
   o.Reload={L1:await val('L1'),L2:await val('L2'),L3:await val('L3'),L4:await val('L4'),L1box:await box('L1','row')};
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }else if(mode==='on'&&M){
   o.K=await E(()=>{const L=[...document.querySelectorAll('.record-card [data-v142-w="card"]')];return {ids:L.map(x=>x.dataset.v142Box).sort(),vis:L.every(x=>window.__vis(x)),
    over:[...document.querySelectorAll('.record-card')].some(c=>c.scrollWidth>c.clientWidth+1||c.getBoundingClientRect().right>innerWidth+1),
    chipOut:L.some(x=>[...x.querySelectorAll('[data-v142-lt]')].some(c=>c.getBoundingClientRect().right>x.getBoundingClientRect().right+1))};});
   o.K.sug=(await box('L2','card')||{}).sug;
   await E(()=>{const el=document.querySelector('.record-card [data-v142-box="L3"]');el&&el.scrollIntoView({block:'center'});});await page.waitForTimeout(200);
   await page.screenshot({path:path.join(outDir,key+'-cards.png')}).catch(e=>{o.shotErr=String(e.message||e);});
   await page.tap('.record-card [data-v142-box="L3"] [data-v142-lt="F"]');await page.waitForTimeout(400);
   o.K.v=await val('L3');o.K.dlg=await dlg();o.K.box=await box('L3','card');
   await page.tap('.record-card [data-v142-box="L3"] [data-v142-lt="F"]');await page.waitForTimeout(400);o.K.v2=await val('L3');
   await E(async()=>{openTrade('L2','review');await new Promise(r=>setTimeout(r,1200));});
   o.K.d=await E(()=>{const d=document.querySelector('#v142D');if(!d)return null;d.scrollIntoView({block:'center'});const r=d.getBoundingClientRect(),dr=$('tradeDialog').getBoundingClientRect();
    return {vis:window.__vis(d),cols:getComputedStyle(d.querySelector('.v142-g')).gridTemplateColumns.split(' ').length,fit:r.right<=dr.right+1&&r.left>=dr.left-1,sugLine:!!d.querySelector('.v142-sgl'),
     bad:[...d.querySelectorAll('*')].filter(e=>{const q=e.getBoundingClientRect();return q.width&&q.right>dr.right+1;}).map(e=>e.className||e.tagName).slice(0,5)};});
   await page.waitForTimeout(200);await page.screenshot({path:path.join(outDir,key+'-detail.png')}).catch(()=>{});
   await page.tap('#v142D [data-v142-lt="E"]');await page.waitForTimeout(300);o.K.dv=await val('L2');
   await E(()=>$('tradeDialog').close());await page.waitForTimeout(500);
   await E(()=>{setPage('weekly');renderAll();});await page.waitForTimeout(1000);
   o.K.wk=await E(()=>{const w=document.querySelector('#v63WeekBody #v142Week');if(!w)return null;w.scrollIntoView({block:'center'});const c=w.closest('.card').getBoundingClientRect();
    return {vis:window.__vis(w),rows:[...w.querySelectorAll('tbody tr')].filter(r=>window.__vis(r)).length,over:[...w.querySelectorAll('*')].some(e=>{const q=e.getBoundingClientRect();return q.width&&(q.right>Math.min(c.right,innerWidth)+1||q.left<c.left-1);})};});
   await page.waitForTimeout(200);await page.screenshot({path:path.join(outDir,key+'-week.png')}).catch(()=>{});
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }else{
   o.Off=await E(()=>({th:[...document.querySelectorAll('.record-desktop thead th')].map(x=>x.textContent.trim()).includes('손실 유형'),cells:document.querySelectorAll('[data-v142-box]').length,L1:state.trades.find(x=>x.id==='L1').lossType}));
   await E(async()=>{openTrade('L3','review');await new Promise(r=>setTimeout(r,1000));});o.Off.detail=await E(()=>!!document.querySelector('#v142D'));await E(()=>$('tradeDialog').close());
   o.Off.csv=await E(()=>{let out=null;const b=download;download=(n,c)=>{out=c;};try{exportCSV();}finally{download=b;}return out.replace(/^\uFEFF/,'').split('\n')[0].includes('손실 유형');});
   await E(()=>{setPage('weekly');renderAll();});await page.waitForTimeout(800);o.Off.week=await E(()=>!!document.querySelector('#v142Week'));
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  }
  R[key]=o;await ctx.close();};
 await Promise.all([one([1440,'on']),one([390,'on']),one([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
