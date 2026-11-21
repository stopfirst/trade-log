/* v141 QA — 아침 전망 등락률 = 트레이딩뷰(TVC) 종가 기준. 모의 HL·모의 TradingView scanner·모의 CNBC·모의 Binance(window.fetch 모의) — 외부 연결 없음.
   1440 HL(토 10-31 12:00 KST, 기준일 10-30 금):
     · scanner(POST text/plain, 한 번에 12종) 일봉 종가 ÷ 전 일봉 종가 — 값은 11/20 트레이딩뷰 값(SPX -3.70 … GOLD 3537.83/3625.18 -2.41 · SILVER -3.84)
     · SILVER 는 이미 다음 세션(일 18:00 ET 봉) → close[1]/close[2] 로(m t1)
     · DXY 는 소스가 아직 전날 봉 → '아직: DXY' 자리 그대로 → 소스가 바뀌면 10분 뒤 자동 다시 확인 → 채움
     · WTI = CNBC 근월물(altSymbol CLZ26) 5분봉 17:00 ET ÷ 전일 17:00 ET · BTC = Binance UTC 일봉
     · 기록 chg.src 'tv-close' · 캐시 tj-v141-chg · 예전(v140) chg: 글 있는 날은 자동으로 안 바꿈 → [등락률 채우기]로 새로(빈 자리만) · 빈 날은 자동 교체
     · 지난 날짜(최근 2봉 밖): 지수·VIX·MOVE·DXY·US10Y CNBC 대체('대체(CNBC)' 표시), GOLD·SILVER 못 받음
   1440 아침: 05:00 KST '종가는 지수·VIX 05:20 · … 06:05 · BTC 09:02 KST부터' → 05:30 지수만 → 06:15 금·은·DXY·10년물·MOVE·WTI 자동 → BTC 는 09:02 뒤
   390: scanner 실패(HTTP 500) → CNBC 대체 + GOLD·SILVER 못 받음 · 넘침 없음
   1440 ?v141=0: v140 동작(정산가 기준·v140 캐시·scanner 요청 없음) */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{
 const J=(t,s=200)=>new Response(t,{status:s,headers:{'Content-Type':'application/json'}});
 const DATES=['2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'];
 /* CNBC 대체용 날짜별 등락률(%) → 종가 사슬 */
 const P={'.SPX':[0,0.5,-0.4,0.3,1.25,-0.8,-3.70],'.NDX':[0,0.2,0.1,-0.6,0.9,-1.1,-5.61],'.DJI':[0,0.1,0.2,0.3,0.4,0.5,-1.93],'.RUT':[0,1,1,1,-2.5,1,-2.76],
  'SOXX':[0,2,2,2,3.33,2,-10.55],'MAGS':[0,1,1,1,0.75,1,-5.18],'.VIX':[0,3,3,3,-4.4,3,26.20],'.MOVE':[0,1,1,1,2.5,1,10.70],
  '.DXY':[0,0.1,0.1,0.1,0.12,0.1,-0.05],'US10Y':[0,0.5,0.5,0.5,-1.1,0.5,-2.02],'@GC.1':[0,9,9,9,9,9,9],'@SI.1':[0,9,9,9,9,9,9]};
 const close=s=>{const out={};let c=100;DATES.forEach((d,i)=>{c=i?c*(1+P[s][i]/100):100;out[d]=c;});return out;};
 const W={'2026-10-22':80,'2026-10-23':81,'2026-10-26':82,'2026-10-27':83,'2026-10-28':83.83,'2026-10-29':84.437,'2026-10-30':84.828};   /* CLZ26 17:00 ET */
 const etMs=d=>{const [Y,M,D]=d.split('-').map(Number);return Date.UTC(Y,M-1,D,20,0);};
 const S=iso=>Date.parse(iso)/1000;
 /* 트레이딩뷰 scanner: [time, close, close[1], close[2], time[1], time[2], update_mode] */
 const cash=['2026-10-30T13:30:00Z','2026-10-29T13:30:00Z','2026-10-28T13:30:00Z'],fut=['2026-10-29T22:00:00Z','2026-10-28T22:00:00Z','2026-10-27T22:00:00Z'],
  dxy=['2026-10-29T23:00:00Z','2026-10-28T23:00:00Z','2026-10-27T23:00:00Z'],vix=['2026-10-30T07:15:00Z','2026-10-29T07:15:00Z','2026-10-28T07:15:00Z'];
 const TV={'SP:SPX':[cash,[6910.39,7175.83,7323.63]],'NASDAQ:NDX':[cash,[25028.9821,26517.0517,27116.2587]],'DJ:DJI':[cash,[48147.33,49097.06,50198.17]],'TVC:RUT':[cash,[2581.789351,2655.105173,2714.305802]],
  'NASDAQ:SOXX':[cash,[123.4,137.95,141.85]],'CBOE:MAGS':[cash,[61.66,65.03,66.83]],'TVC:VIX':[vix,[35.9,28.43,24.55]],'TVC:MOVE':[cash,[106.3119,96.0435,98.1635]],
  'TVC:DXY':[dxy,[103.84,103.924,103.814]],'TVC:US10Y':[fut,[4.95,5.05,5.07]],'TVC:GOLD':[fut,[3537.83,3625.18,3725.53]],
  'TVC:SILVER':[['2026-11-01T23:00:00Z','2026-10-29T22:00:00Z','2026-10-28T22:00:00Z'],[40.5,41.222,42.8697]]};
 window.__cn={q:0,c:0,b:0,tv:0,urls:[],tvReq:[]};window.__tvFresh=false;
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);
  if(u.startsWith('https://scanner.tradingview.com/')){__cn.urls.push(u);__cn.tv++;await new Promise(r=>setTimeout(r,10));
   let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   __cn.tvReq.push({m:o.method,ct:o.headers&&o.headers['Content-Type'],n:(b.symbols&&b.symbols.tickers||[]).length,cols:(b.columns||[]).join(','),cred:o.credentials});
   if(window.__tvFail)return J('{"error":"x"}',500);
   const data=[];for(const s of (b.symbols&&b.symbols.tickers||[])){let x=TV[s];if(!x)continue;
    if(s==='TVC:DXY'&&!window.__tvFresh)x=[['2026-10-28T23:00:00Z','2026-10-27T23:00:00Z','2026-10-26T23:00:00Z'],[103.924,103.814,103.7]];
    const [t,c]=x;data.push({s,d:[S(t[0]),c[0],c[1],c[2],S(t[1]),S(t[2]),'streaming']});}
   return J(JSON.stringify({totalCount:data.length,data}));}
  if(u.startsWith('https://data-api.binance.vision/')){__cn.urls.push(u);__cn.b++;await new Promise(r=>setTimeout(r,10));
   const st=Number((u.match(/startTime=(\d+)/)||[])[1]),DAY=864e5,cl={'2026-10-25':70000,'2026-10-26':71400,'2026-10-27':70000,'2026-10-28':71000,'2026-10-29':70000,'2026-10-30':68600,'2026-10-31':69000};
   const out=[];for(let i=0;i<2;i++){const t=st+i*DAY,d=new Date(t).toISOString().slice(0,10);if(!cl[d])continue;out.push([t,'1','1','1',String(cl[d]),'1',t+DAY-1,'1',1,'1','1','0']);}
   return J(JSON.stringify(out));}
  if(u.startsWith('https://quote.cnbc.com/')||u.startsWith('https://ts-api.cnbc.com/')){__cn.urls.push(u);
   await new Promise(r=>setTimeout(r,15));
   if(u.startsWith('https://quote.cnbc.com/')){__cn.q++;const syms=decodeURIComponent(u.split('symbols=')[1].split('&')[0]).split('|');const L=[];__cn.qs=(__cn.qs||[]).concat([syms.join('|')]);
    for(const s of syms){
     if(s==='@CL.1')L.push({symbol:s,code:0,last_time:'Sun 2026-11-01 7:47 AM KST (UTC+09:00)',change_pct:'+1.50%',last:'85',previous_day_closing:'84',settlePrice:'84.9',settleDate:'2026-10-30',altSymbol:'CLZ26'});
     else if(P[s]){const p=P[s][6];L.push({symbol:s,code:0,last_time:'2026-10-30',change_pct:(p>0?'+':'')+p.toFixed(2)+'%',last:'1',previous_day_closing:String(close(s)['2026-10-29'])});}}
    return J(JSON.stringify({FormattedQuoteResult:{FormattedQuote:L}}));}
   __cn.c++;const m=u.match(/charts\/(\w+)\.json\?symbol=([^&]+)/),R=m[1],s=decodeURIComponent(m[2]);
   if(R==='5D'){if(s!=='CLZ26')return J(JSON.stringify({barData:{priceBars:[]}}));
    const bars=[],tt=ms=>new Date(ms-4*36e5).toISOString().replace(/\D/g,'').slice(0,14);
    for(const d of DATES.slice(1)){const T=Date.parse(d+'T21:00:00Z');   /* 17:00 EDT */
     bars.push({close:String(W[d]-0.3),tradeTime:tt(T-10*6e4),tradeTimeinMills:T-10*6e4});bars.push({close:String(W[d]),tradeTime:tt(T-3*6e4),tradeTimeinMills:T-3*6e4});bars.push({close:'999',tradeTime:tt(T+65*6e4),tradeTimeinMills:T+65*6e4});}
    return J(JSON.stringify({barData:{priceBars:bars}}));}
   if(!P[s])return J('{}',404);const C=close(s);
   return J(JSON.stringify({barData:{priceBars:DATES.map(d=>({close:String(C[d]),tradeTime:d.replace(/-/g,'')+'000000',tradeTimeinMills:etMs(d)-20*36e5}))}}));}
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
const LINES=()=>{const t=document.querySelector('#page-v137 .v138-ed').innerText;const o={};for(const n of ['SPX','VIX','WTI','GOLD','SILVER','DXY','US10Y','BTC','MOVE']){const m=t.match(new RegExp('- '+n+'\\(([^)]*)\\)'));o[n]=m?m[1]:null;}return o;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const R={tag,errors:[]};
 const port=srv.address().port,url=q=>'http://127.0.0.1:'+port+'/?'+q;
 const run=async([W,mode])=>{const key=mode+W,o={};const M=W<500;
  const ctx=await browser.newContext({viewport:{width:W,height:M?844:900},isMobile:M,hasTouch:M,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await ctx.addInitScript(init);if(M)await ctx.addInitScript(()=>{window.__tvFail=true;});
  const open=async(q,at)=>{const page=await ctx.newPage();if(at)await page.clock.setSystemTime(new Date(at));page.on('pageerror',e=>R.errors.push(key+': '+e.message));page.on('dialog',d=>{R.errors.push(key+' dialog: '+d.message());d.dismiss();});
   await page.goto(url(q));await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};window.__lines=${LINES.toString()};`);return page;};
  const rec=(E,d)=>E(d=>{const r=state.v138Outlook&&state.v138Outlook.all&&state.v138Outlook.all[d];return r?JSON.parse(JSON.stringify(r)):null;},d);
  const stat=E=>E(()=>document.getElementById('v139Chg').textContent);
  if(mode==='off'){
   const page=await open('journal=hyperliquid&v141=0');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1600);
   o.Off={on:await E(()=>v141Debug().on),v140:await E(()=>v140Debug().on),stat:await stat(E),tv:await E(()=>__cn.tv),
    v140key:await E(()=>!!localStorage.getItem('tj-v140-chg:2026-10-30')),v141key:await E(()=>!!localStorage.getItem('tj-v141-chg:2026-10-30')),
    src:await E(()=>{const r=state.v138Outlook.all[v137Test.today()];return r&&r.chg&&r.chg.src;})};
   R[key]=o;await ctx.close();return;}
  if(mode==='am'){   /* 토 05:00 KST(= 금 16:00 EDT): 아직 종가 전 → 05:30 지수만 → 06:15 금·은 등 → BTC 는 09:02 뒤 */
   const p0=await open('journal=hyperliquid','2026-10-30T20:00:00Z');const E0=(f,a)=>p0.evaluate(f,a);
   await E0(()=>{V110.auto=false;setPage('v137');});await p0.waitForTimeout(1200);
   o.Early={stat:await stat(E0),tv:await E0(()=>__cn.tv),lines:await E0(()=>window.__lines())};await p0.close();
   const page=await open('journal=hyperliquid','2026-10-30T20:30:00Z');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1600);
   o.Am={lines:await E(()=>window.__lines()),stat:await stat(E),pend:await E(()=>v141Debug().cache.pend),retry:await E(()=>v141Debug().cache.retryAt),tv:await E(()=>__cn.tv),q:await E(()=>__cn.q),b:await E(()=>__cn.b)};
   await page.clock.fastForward('45:00');await page.waitForTimeout(1500);
   o.Am2={lines:await E(()=>window.__lines()),stat:await stat(E),pend:await E(()=>v141Debug().cache.pend),b:await E(()=>__cn.b),
    chg:await E(async()=>{const r=state.v138Outlook.all[v137Test.today()];return r&&r.chg?{GOLD:r.chg.GOLD,WTI:r.chg.WTI,SPX:r.chg.SPX,BTC:('BTC' in r.chg)}:null;})};
   R[key]=o;await ctx.close();return;}
  if(M){
   const page=await open('journal=hyperliquid');const E=(f,a)=>page.evaluate(f,a);
   await E(()=>{V110.auto=false;setPage('v137');});await page.waitForTimeout(1800);
   o.Mob={lines:await E(()=>window.__lines()),m:await E(()=>v141Debug().cache.m),fb:await E(()=>v141Debug().cache.fb),why:await E(()=>v141Debug().cache.why),stat:await stat(E),qs:await E(()=>__cn.qs)};
   o.Lay=await E(()=>window.__over());
   await page.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
   o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   R[key]=o;await ctx.close();return;}
  /* ===== 1440 토 12:00 KST ===== */
  const hl=await open('journal=hyperliquid');const E=(f,a)=>hl.evaluate(f,a);
  o.Fn=await E(()=>({kind:['SPX','WTI','GOLD','SILVER','DXY','US10Y','BTC','MOVE','VIX','MAGS'].map(n=>v141Test.kind(n)),
   sess:[v141Test.sess(Date.parse('2026-11-19T23:00:00Z')/1000),v141Test.sess(Date.parse('2026-11-20T14:30:00Z')/1000),v141Test.sess(Date.parse('2026-11-20T23:00:00Z')/1000),v141Test.sess(Date.parse('2026-11-20T08:15:00Z')/1000),v141Test.sess(0)],
   ready:['SPX','VIX','GOLD','MOVE','WTI','BTC'].map(n=>new Date(v141Test.readyAt(n,'2026-11-20')).toISOString()),times:[v141Test.times('2026-11-20'),v141Test.times('2026-10-30')]}));
  await E(async()=>{V110.auto=false;state.v138Outlook={all:{
    '2026-10-29':{text:'x',html:'<div>- <b>SPX(+1.00%)</b> : 내 코멘트</div><div>- WTI(±x.xx%) : 유가</div><div>- GOLD(-9.99%) : 예전 숫자</div>',textAt:5,chg:{SPX:1,WTI:0.5,GOLD:-9.99,asOf:'2026-10-28',src:'cnbc-settle',at:5},chgAt:5,updatedAt:5},
    '2026-10-27':{bias:'long',biasAt:5,chg:{SPX:2,WTI:2,asOf:'2026-10-26',src:'cnbc-settle',at:5},chgAt:5,updatedAt:5}}};await persist();setPage('v137');});
  await hl.waitForTimeout(1800);
  const today=await E(()=>v137Test.today());
  o.Pre={lines:await E(()=>window.__lines()),pristine:await E(()=>v139Test.pristine()),stat:await stat(E),
   m:await E(()=>v141Debug().cache.m),px:await E(()=>v141Debug().cache.px),pend:await E(()=>v141Debug().cache.pend),why:await E(()=>v141Debug().cache.why),fb:await E(()=>v141Debug().cache.fb)};
  const r31=await rec(E,today);
  o.Chg={src:r31.chg.src,asOf:r31.chg.asOf,WTI:r31.chg.WTI,GOLD:r31.chg.GOLD,SILVER:r31.chg.SILVER,DXY:('DXY' in r31.chg),US10Y:r31.chg.US10Y,VIX:r31.chg.VIX,MOVE:r31.chg.MOVE,SOXX:r31.chg.SOXX,BTC:r31.chg.BTC,noText:r31.text===undefined,
   v141key:await E(()=>!!localStorage.getItem('tj-v141-chg:2026-10-30')),v140key:await E(()=>!!localStorage.getItem('tj-v140-chg:2026-10-30'))};
  o.Net=await E(()=>({tv:__cn.tv,tvReq:__cn.tvReq,q:__cn.q,qs:__cn.qs,b:__cn.b,charts:__cn.urls.filter(u=>u.includes('ts-api')).map(u=>decodeURIComponent(u.split('/charts/')[1])).sort()}));
  /* 소스가 새 봉으로 바뀌면 10분 뒤 자동 다시 확인 */
  await E(()=>{window.__tvFresh=true;});await hl.clock.fastForward('11:00');await hl.waitForTimeout(1500);
  o.Fresh={lines:await E(()=>window.__lines()),stat:await stat(E),dxy:(await rec(E,today)).chg.DXY,tv:await E(()=>__cn.tv),m:await E(()=>v141Debug().cache.m.DXY),retry:await E(()=>V140.st.retry>=1)};
  /* 예전(v140) 값이 저장된 글 있는 날: 자동으로 안 바꿈 */
  await E(()=>v137Test.go('2026-10-29'));await hl.waitForTimeout(1600);
  const a29=await rec(E,'2026-10-29');
  o.Old={chg:{src:a29.chg.src,SPX:a29.chg.SPX,WTI:a29.chg.WTI},html:a29.html,stat:await stat(E),skip:await E(()=>v141Debug().st.saveSkipOld>=1),recOld:await E(()=>v141Debug().recChg.old),
   why:await E(()=>v141Debug().cache.why),m:await E(()=>v141Debug().cache.m)};
  await hl.click('#page-v137 [data-v139-act="fill"]');await hl.waitForTimeout(1600);
  const b29=await rec(E,'2026-10-29');
  o.Fill={html:b29.html,chg:{src:b29.chg.src,asOf:b29.chg.asOf,SPX:b29.chg.SPX,WTI:b29.chg.WTI,GOLD:('GOLD' in b29.chg),DXY:b29.chg.DXY},stat:await stat(E)};
  /* 예전 값 + 빈 날(10-27): 자동으로 새 기준으로 바꿈(글 없음) */
  await E(()=>v137Test.go('2026-10-27'));await hl.waitForTimeout(1600);
  const r27=await rec(E,'2026-10-27');o.Empty={src:r27.chg.src,asOf:r27.chg.asOf,WTI:r27.chg.WTI,noText:r27.text===undefined,bias:r27.bias,lines:await E(()=>window.__lines())};
  await E(()=>v137Test.go(v137Test.today()));await hl.waitForTimeout(600);
  await hl.screenshot({path:path.join(outDir,key+'-page.png'),fullPage:true}).catch(e=>{o.shotErr=String(e.message||e);});
  o.Lay=await E(()=>window.__over());o.docScroll=await E(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  o.dbg=await E(()=>{const d=v141Debug();return {on:d.on,ver:d.ver,app:d.app,hosts:d.hosts,src:d.rows.map(r=>r.n+':'+r.src).join(' '),ready:d.rows.map(r=>r.n+':'+r.readyKst).join(' ')};});
  /* 새로고침: 캐시로 다시 안 받음 */
  const n0=await E(()=>__cn.urls.length);await hl.reload();await hl.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await hl.evaluate(`window.__vis=${vis.toString()};window.__over=${over.toString()};window.__lines=${LINES.toString()};`);
  await E(()=>{V110.auto=false;setPage('v137');});await hl.waitForTimeout(1600);
  o.Reload={net:await E(()=>__cn.urls.length),gold:await E(()=>window.__lines().GOLD),stat:await stat(E)};
  R[key]=o;await ctx.close();};
 await Promise.all([run([1440,'w']),run([390,'w']),run([1440,'am']),run([1440,'off'])]);
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
