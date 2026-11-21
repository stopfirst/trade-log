/* v140 QA — 아침 전망 등락률 = 전일 종가(정산가) 기준. 모의 HL·모의 CNBC·모의 Binance(window.fetch 모의) — 외부 연결 없음.
   1440 HL(토 10-31 12:00 KST, 기준일 10-30 금):
     · 선물 WTI = quote settlePrice(settleDate=D) ÷ 그 월물(altSymbol CLZ26) 일봉 직전 정산가 — 대표 월물(@CL.1) 일봉·5분봉 안 씀
     · GOLD 정산 전(settleDate 가 전날) → '아직: GOLD(정산 전)' + 자리 그대로 → 소스가 정산되면 10분 뒤 자동 다시 확인 → 채움(16:00 ET 대체 없음)
     · SILVER = quote 에 정산가 없음 → 월물 일봉 D ÷ 직전
     · DXY = quote 가 이미 다음 세션(월요일) → previous_day_closing(= D 종가) ÷ 일봉 직전 봉 · US10Y = quote 세션 D → change_pct
     · BTC = Binance UTC 일봉 D ÷ D-1 · 현물은 v139 그대로(quote change_pct)
     · 기록 chg.src 'cnbc-settle' · 캐시 tj-v140-chg · 예전(v139) chg: 글 있는 날은 자동으로 안 바꿈('저장값은 예전 기준') → [등락률 채우기]로 새로(글 속 숫자는 그대로, 빈 자리만) · 빈 날은 자동 교체
   1440 아침 07:00 KST: BTC 'UTC 일봉 마감 전(09:02 KST~)' → 09:02 뒤 자동 다시 확인 → 채움
   390: Binance 실패 → CNBC BTC.CM= 5분봉 00:00 UTC 로 대신 · 넘침 없음
   1440 ?v140=0: v139 동작(16:00 ET·v139 캐시·Binance 요청 없음) */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const DATES=['2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'];
 /* 날짜별 등락률(%) → 종가 사슬(10-22 = 100). 월물 사슬(CLZ26 등)은 정산가 */
 const P={'.SPX':[0,0.5,-0.4,0.3,1.25,-0.8,-3.70],'.NDX':[0,0.2,0.1,-0.6,0.9,-1.1,-5.61],'.DJI':[0,0.1,0.2,0.3,0.4,0.5,-1.93],'.RUT':[0,1,1,1,-2.5,1,-2.76],
  'SOXX':[0,2,2,2,3.33,2,-10.55],'MAGS':[0,1,1,1,0.75,1,-5.18],'.VIX':[0,3,3,3,-4.4,3,26.20],'.MOVE':[0,1,1,1,2.5,1,10.70],
  'CLZ26':[0,1,1,1,0.6,1,1.00],'GCZ26':[0,1,1,1,0.4,1,-2.50],'SIZ26':[0,1,1,1,0.9,1,-2.00],'.DXY':[0,0.1,0.1,0.1,0.12,0.1,0.96],'US10Y':[0,0.5,0.5,0.5,-1.1,0.5,-2.02],
  '@CL.1':[0,9,9,9,9,9,9],'@GC.1':[0,9,9,9,9,9,9],'@SI.1':[0,9,9,9,9,9,9],'BTC.CM=':[0,9,9,9,9,9,9]};
 const close=s=>{const out={};let c=100;DATES.forEach((d,i)=>{c=i?c*(1+P[s][i]/100):100;out[d]=c;});return out;};
 const etMs=d=>{const [Y,M,D]=d.split('-').map(Number);return Date.UTC(Y,M-1,D,20,0);};
 window.__cn={q:0,c:0,b:0,urls:[]};window.__settled=false;
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://data-api.binance.vision/')){__cn.urls.push(u);__cn.b++;await new Promise(r=>setTimeout(r,10));if(window.__bnFail)return J('{"code":-1}',500);
   const st=Number((u.match(/startTime=(\d+)/)||[])[1]),DAY=864e5,cl={'2026-10-25':70000,'2026-10-26':71400,'2026-10-27':70000,'2026-10-28':71000,'2026-10-29':70000,'2026-10-30':68600,'2026-10-31':69000};
   const out=[];for(let i=0;i<2;i++){const t=st+i*DAY,d=new Date(t).toISOString().slice(0,10);if(!cl[d])continue;out.push([t,'1','1','1',String(cl[d]),'1',t+DAY-1,'1',1,'1','1','0']);}
   return J(JSON.stringify(out));}
  if(u.startsWith('https://quote.cnbc.com/')||u.startsWith('https://ts-api.cnbc.com/')){__cn.urls.push(u);
   if(o&&o.headers&&Object.keys(o.headers).length)__cn.hdr=(__cn.hdr||0)+1;
   await new Promise(r=>setTimeout(r,15));if(window.__cnFail)return J('{"err":1}',500);
   if(u.startsWith('https://quote.cnbc.com/')){__cn.q++;const syms=decodeURIComponent(u.split('symbols=')[1].split('&')[0]).split('|');const L=[];
    for(const s of syms){if(s==='.MOVE')continue;
     if(s==='@CL.1'){const C=close('CLZ26');L.push({symbol:s,code:0,last_time:'2026-10-31T18:47:00.000-0400',change_pct:'+1.50%',last:String(C['2026-10-29']*1.015),previous_day_closing:String(C['2026-10-29']),settlePrice:String(C['2026-10-30']),settleDate:'2026-10-30',altSymbol:'CLZ26'});}
     else if(s==='@GC.1'){const C=close('GCZ26');L.push(window.__settled?{symbol:s,code:0,last_time:'2026-10-30T18:00:00.000-0400',change_pct:'-2.40%',last:'1',previous_day_closing:String(C['2026-10-29']),settlePrice:String(C['2026-10-30']),settleDate:'2026-10-30',altSymbol:'GCZ26'}
       :{symbol:s,code:0,last_time:'2026-10-30T16:20:00.000-0400',change_pct:'-2.40%',last:'1',previous_day_closing:String(C['2026-10-28']),settlePrice:String(C['2026-10-29']),settleDate:'2026-10-29',altSymbol:'GCZ26'});}
     else if(s==='@SI.1')L.push({symbol:s,code:0,last_time:'2026-10-30T17:00:00.000-0400',change_pct:'-1.00%',last:'24.6',previous_day_closing:'25',altSymbol:'SIZ26'});
     else if(s==='.DXY')L.push({symbol:s,code:0,last_time:'2026-11-02',change_pct:'+0.30%',last:'105.3',previous_day_closing:String(close('.DXY')['2026-10-30'])});
     else if(s==='US10Y')L.push({symbol:s,code:0,last_time:'2026-10-30T17:00:00.000-0400',change_pct:'-2.019%',last:'4.95%',previous_day_closing:'5.052%'});
     else if(P[s]){const p=P[s][6];L.push({symbol:s,code:0,last_time:'2026-10-30',change_pct:(p>0?'+':'')+p.toFixed(2)+'%',last:'1'});}}
    return J(JSON.stringify({FormattedQuoteResult:{FormattedQuote:L}}));}
   __cn.c++;const m=u.match(/charts\/(\w+)\.json\?symbol=([^&]+)/),R=m[1],s=decodeURIComponent(m[2]);if(!P[s])return J('{}',404);const C=close(s);
   if(R==='5D'){if(s!=='BTC.CM=')return J(JSON.stringify({barData:{priceBars:[]}}));
    const T=[Date.UTC(2026,9,30,0,0),Date.UTC(2026,9,31,0,0)],px=[100,97],bars=[],tt=ms=>new Date(ms-4*36e5).toISOString().replace(/\D/g,'').slice(0,14);
    T.forEach((t,i)=>{bars.push({close:String(px[i]*1.01),tradeTime:tt(t-5*6e4),tradeTimeinMills:t-5*6e4});bars.push({close:String(px[i]),tradeTime:tt(t),tradeTimeinMills:t});bars.push({close:'999',tradeTime:tt(t+5*6e4),tradeTimeinMills:t+5*6e4});});
    return J(JSON.stringify({barData:{priceBars:bars}}));}
   let k=DATES;if(s==='.MOVE')k=DATES.slice(0,6);if(s==='CLZ26'||s==='.DXY')k=DATES.slice(0,6);if(s==='GCZ26'&&!window.__settled)k=DATES.slice(0,6);
   const f=s==='.DXY'?{'2026-10-30':0.999}:{};   /* DXY 그날 일봉(있다면)은 중간값 — 안 씀 */
   return J(JSON.stringify({barData:{priceBars:k.map(d=>({close:String(C[d]*(f[d]||1)),tradeTime:d.replace(/-/g,'')+'000000',tradeTimeinMills:etMs(d)-20*36e5}))}}));}
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
const LINES=()=>{const t=document.querySelector('#page-v137 .v138-ed').innerText;const o={};for(const n of ['SPX','WTI','GOLD','SILVER','DXY','US10Y','BTC','MOVE']){const m=t.match(new RegExp('- '+n+'\\(([^)]*)\\)'));o[n]=m?m[1]:null;}return o;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const port=srv.address().port,url=q=>'http://127.0.0.1:'+port+'/?'+q;
 const run=async([W,mode])=>{const key=mode+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);if(M)await ctx.addInitScript(()=>{window.__bnFail=true;});
  const open=async(q,at)=>{const page=await ctx.newPage();if(at)await page.clock.setSystemTime(new Date(at));page.on('pageerror',e=>R.errors.push(key+': '+e.message));page.on('dialog',d=>{R.errors.push(key+' dialog: '+d.message());d.dismiss();});
   await page.goto(url(q));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};window.__lines=${LINES.toString()};`);return page;};
  const rec=(E,d)=>E(d=>{const r=state.v138Outlook&&state.v138Outlook.all&&state.v138Outlook.all[d];return r?JSON.parse(JSON.stringify(r)):null;},d);
  const stat=E=>E(()=>document.getElementById('v139Chg').textContent);
  if(mode==='off'){
   const page=await open('journal=hyperliquid&v140=0');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1600);
   o.Off={on:await E(()=>v140Debug().on),v139:await E(()=>v139Debug().on),stat:await stat(E),bn:await E(()=>__cn.b),
    v139key:await E(()=>!!localStorage.getItem('tj-v139-chg:2026-10-30')),v140key:await E(()=>!!localStorage.getItem('tj-v140-chg:2026-10-30')),
    src:await E(()=>{const r=state.v138Outlook.all[v137Test.today()];return r&&r.chg&&r.chg.src;}),five:await E(()=>__cn.urls.some(u=>u.includes('/5D.json')))};
   R[key]=o;await ctx.close();return;}
  if(mode==='am'){   /* 토 07:00 KST: 기준일 10-30 은 받을 수 있음, BTC UTC 일봉(10-30)은 09:00 KST 마감 전 */
   const page=await open('journal=hyperliquid','2026-10-30T22:00:00Z');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1600);
   o.Am={lines:await E(()=>window.__lines()),stat:await stat(E),bn:await E(()=>__cn.b),pend:await E(()=>v140Debug().cache.pend),retry:await E(()=>v140Debug().cache.retryAt),
    ready:await E(()=>new Date(v140Test.readyAt('BTC','2026-10-30')).toISOString())};
   await page.clock.fastForward('02:10:00');await page.waitForTimeout(1500);
   o.Am2={lines:await E(()=>window.__lines()),stat:await stat(E),bn:await E(()=>__cn.b),retry:await E(()=>v140Debug().st.retry>=1),m:await E(()=>v140Debug().cache.m.BTC),
    chg:(await rec(E,await E(()=>v137Test.today()))).chg.BTC};
   R[key]=o;await ctx.close();return;}
  if(M){
   const page=await open('journal=hyperliquid');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1800);
   o.Mob={lines:await E(()=>window.__lines()),m:await E(()=>v140Debug().cache.m.BTC),fb:await E(()=>v140Debug().st.btcFallback),stat:await stat(E)};
   o.Lay=await E(()=>window.__over());
   await page.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  /* ===== 1440 토 12:00 KST ===== */
  const hl=await open('journal=hyperliquid');const E=(f,a)=>hl.evaluate(f,a);
  o.Fn=await E(()=>({kind:['SPX','WTI','GOLD','SILVER','DXY','US10Y','BTC','MOVE','VIX'].map(n=>v140Test.kind(n)),
   sess:[v140Test.sess({last_time:'2026-11-20T17:05:00.000-0500'}),v140Test.sess({last_time:'2026-11-20T18:30:00.000-0500'}),v140Test.sess({last_time:'2026-10-30'}),v140Test.sess({last_time:'2026-11-21T10:00:00.000-0500'}),v140Test.sess({last_time:'x'})],
   ready:['WTI','DXY','BTC'].map(n=>new Date(v140Test.readyAt(n,'2026-11-20')).toISOString()),nextT:[v140Test.nextT('2026-11-25'),v140Test.nextT('2026-10-30')]}));
  await E(async()=>{V110.auto=false;state.v138Outlook={all:{
    '2026-10-29':{text:'x',html:'<div>- <b>SPX(+1.00%)</b> : 내 코멘트</div><div>- WTI(±x.xx%) : 유가</div><div>- GOLD(-9.99%) : 예전 숫자</div>',textAt:5,chg:{SPX:1,WTI:0.5,GOLD:-9.99,asOf:'2026-10-28',src:'cnbc',at:5},chgAt:5,updatedAt:5},
    '2026-10-27':{bias:'long',biasAt:5,chg:{SPX:2,WTI:2,asOf:'2026-10-26',src:'cnbc',at:5},chgAt:5,updatedAt:5}}};await persist();setPage('v137');});
  await hl.waitForTimeout(1800);
  const today=await E(()=>v137Test.today());
  o.Pre={lines:await E(()=>window.__lines()),pristine:await E(()=>v139Test.pristine()),stat:await stat(E),
   m:await E(()=>v140Debug().cache.m),px:await E(()=>v140Debug().cache.px),pend:await E(()=>v140Debug().cache.pend),why:await E(()=>v140Debug().cache.why)};
  const r31=await rec(E,today);
  o.Chg={src:r31.chg.src,asOf:r31.chg.asOf,WTI:r31.chg.WTI,GOLD:('GOLD' in r31.chg),BTC:r31.chg.BTC,DXY:r31.chg.DXY,US10Y:r31.chg.US10Y,SILVER:r31.chg.SILVER,noText:r31.text===undefined,
   v140key:await E(()=>!!localStorage.getItem('tj-v140-chg:2026-10-30')),v139key:await E(()=>!!localStorage.getItem('tj-v139-chg:2026-10-30'))};
  o.Net=await E(()=>({q:__cn.q,b:__cn.b,c:__cn.c,charts:__cn.urls.filter(u=>u.includes('ts-api')).map(u=>decodeURIComponent(u.split('/charts/')[1])).sort(),five:__cn.urls.some(u=>u.includes('/5D.json')),hdr:__cn.hdr||0}));
  /* 정산되면 10분 뒤 자동 다시 확인 */
  await E(()=>{window.__settled=true;});await hl.clock.fastForward('11:00');await hl.waitForTimeout(1500);
  o.Settle={lines:await E(()=>window.__lines()),stat:await stat(E),gold:(await rec(E,today)).chg.GOLD,retry:await E(()=>v140Debug().st.retry>=1),q:await E(()=>__cn.q),m:await E(()=>v140Debug().cache.m.GOLD)};
  /* 예전(v139) 값이 저장된 글 있는 날: 자동으로 안 바꿈 */
  await E(()=>v137Test.go('2026-10-29'));await hl.waitForTimeout(1600);
  const a29=await rec(E,'2026-10-29');
  o.Old={chg:{src:a29.chg.src,SPX:a29.chg.SPX,WTI:a29.chg.WTI},html:a29.html,stat:await stat(E),skip:await E(()=>v140Debug().st.saveSkipOld>=1),recOld:await E(()=>v140Debug().recChg.old)};
  await hl.click('#page-v137 [data-v139-act="fill"]');await hl.waitForTimeout(1600);
  const b29=await rec(E,'2026-10-29');
  o.Fill={html:b29.html,chg:{src:b29.chg.src,asOf:b29.chg.asOf,SPX:b29.chg.SPX,WTI:b29.chg.WTI,GOLD:b29.chg.GOLD},stat:await stat(E)};
  /* 예전 값 + 빈 날(10-27): 자동으로 새 기준으로 바꿈(글 없음) */
  await E(()=>v137Test.go('2026-10-27'));await hl.waitForTimeout(1600);
  const r27=await rec(E,'2026-10-27');o.Empty={src:r27.chg.src,asOf:r27.chg.asOf,WTI:r27.chg.WTI,noText:r27.text===undefined,bias:r27.bias,lines:await E(()=>window.__lines())};
  await E(()=>v137Test.go(v137Test.today()));await hl.waitForTimeout(600);
  await hl.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
  o.Lay=await E(()=>window.__over());o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  o.dbg=await E(()=>{const d=v140Debug();return {on:d.on,hosts:d.hosts,basis:d.rows.map(r=>r.n+':'+r.basis).join(' ')};});
  /* 새로고침: 캐시로 다시 안 받음 */
  const n0=await E(()=>__cn.urls.length);await hl.reload();await hl.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await hl.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};window.__lines=${LINES.toString()};`);
  await E(()=>{V110.auto=false;setPage('v137');});await hl.waitForTimeout(1600);
  o.Reload={net:await E(()=>__cn.urls.length),gold:await E(()=>window.__lines().GOLD),stat:await stat(E)};
  R[key]=o;await ctx.close();};
 await Promise.all([run([1440,'w']),run([390,'w']),run([1440,'am']),run([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
