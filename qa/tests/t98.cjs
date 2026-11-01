/* v98 보유 비중(v22) HL 전체 계좌 기준 QA (모의 데이터만).
   USDC 1,000 + 현물 UBTC 평가 500 = 전체 1,500. 포지션: ETH 롱 규모 2,000·증거금 200·진입 1,990·청산 1,500 / BTC 숏 0.01 규모 1,000·증거금 100·진입 100,000·청산 108,000.
   ok(1440·390): 가운데 '전체 계좌' 1,500.00 '현물 포함' · ETH 13.3% · BTC 6.7% · 현물 33.3%(500) · 여유 46.7%(700) · 부제 '÷ 전체 계좌(현물 포함)'
     · 청산 칩 ETH 32.67%, 전부 강제청산 38% · 규모 탭 ETH 133.3% · 현물 33.3% · 총 노출 2.00배
   pending: 현물 미계산 → 'BALANCE (USDC)' 1,000.00 '현물 계산 중' · ETH 20% · 여유 70% · 현물 행 없음 · 청산 ETH 49% · 하단 '현물 계산 중'
   fail: 현물 조회 실패 → 같은 USDC 기준 + '현물 계산 중'
   US: 카드에 v98 표시 없음 · 넘침 0 · 페이지 오류 0 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const A='0x'+'1'.repeat(40);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}
   if(b.type==='spotClearinghouseState')throw new Error('qa spot down');if(b.type==='spotMetaAndAssetCtxs')return J([{universe:[],tokens:[]},[]]);return J([]);}
  return J({message:'not found'},404);};};
const setup=async(A)=>{hlcStatus={...(hlcStatus||{}),address:A};const acct=state.sync?.hyperliquid?.account||'acc';
 v4LatestAccountBalance={version:1,source:'hyperliquid',account:acct,currency:'USDC',equity:'1000',asOf:Date.now(),fetchedAt:Date.now(),scope:'통합 USDC 거래잔고',components:[{venue:'Unified',dex:null,amount:'1000',asOf:Date.now()}],nonUsdcAssets:[],excludedDexs:[],fresh:true};
 const list=[{assetPositions:[{position:{coin:'ETH',szi:'1',positionValue:'2000',marginUsed:'200',leverage:{type:'cross',value:10},unrealizedPnl:'5',entryPx:'1990',liquidationPx:'1500'}},
  {position:{coin:'BTC',szi:'-0.01',positionValue:'1000',marginUsed:'100',leverage:{type:'isolated',value:10},unrealizedPnl:'-2',entryPx:'100000',liquidationPx:'108000'}}]}];
 v22SetHL(list);v23SetPos(list);if(state.settings.v22Alloc)delete state.settings.v22Alloc;return true;};
const read=()=>{const c=document.getElementById('v22Alloc');if(!c)return {card:false};const q=s=>c.querySelector(s);const T=s=>(q(s)?.textContent||'').trim();
 const rows={};for(const b of c.querySelectorAll('[data-v22-pct]'))rows[b.dataset.v22Pct]=[b.textContent.trim(),(c.querySelector(`[data-v22-amt="${b.dataset.v22Pct}"]`)?.textContent||'').trim()];
 const W=document.documentElement.clientWidth,bad=[];for(const x of [c,...c.querySelectorAll('*')]){if(x.closest('svg')&&x.tagName!=='svg')continue;const r=x.getBoundingClientRect();if(!r.width)continue;if(r.right>W+0.5||r.left<-0.5)bad.push((x.className.baseVal??x.className)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+W);}
 const eth=c.querySelector('[data-v23-badge="ETH"]');
 return {card:true,center:[T('.v22-center span'),T('#v22Total'),T('.v22-center small')],meta:T('#v22Meta'),note:T('#v98Note'),rows,spotRow:!!c.querySelector('[data-v22-pct="spot"]'),spotSub:[...c.querySelectorAll('.v22-name small, .v22-bar-l small')].map(s=>s.textContent).find(s=>s.startsWith('현물'))||'',
  freeSub:[...c.querySelectorAll('small')].map(s=>s.textContent).find(s=>s.startsWith('USDC −'))||'',liqTotal:T('#v23TotalPct'),liqNote:T('.v23-total-note').slice(0,60),ethLiq:eth?Math.round(+eth.dataset.v23Pct*100)/100:null,ethBadge:eth?eth.textContent:'',
  expo:T('#v22Exposure'),expoSub:(q('.v22-expo small')?.textContent||''),bad,docScroll:document.documentElement.scrollWidth>W+1};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const R={tag,errors:[]};const base='http://127.0.0.1:'+srv.address().port+'/';
 for(const W of [1440,390]){const key='HL'+W;
  const ctx=await browser.newContext({viewport:{width:W,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul',bypassCSP:true});await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push(key+': '+e.message));
  await page.goto(base+'?journal=hyperliquid');await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.waitForTimeout(300);
  await page.evaluate(setup,A);const o={};
  const scene=async(nm,fn,arg)=>{await page.evaluate(fn,arg);await page.evaluate(()=>{setPage('dashboard');renderAll();});await page.waitForTimeout(200);o[nm]=await page.evaluate(read);};
  await scene('ok',A=>{V57.busy=false;V57.err=null;V57.spot={addr:A.toLowerCase(),items:[{coin:'UBTC',pair:'@142',qty:0.01,px:50000,usd:500}],usd:500,miss:0,at:Date.now()};V57.at=Date.now();},A);
  await page.evaluate(()=>document.getElementById('v22Alloc').scrollIntoView());await page.screenshot({path:path.join(outDir,key+'-ok.png')}).catch(e=>o.shotErr=e.message);
  await page.evaluate(()=>v22SetMode('notional'));await page.waitForTimeout(250);o.notional=await page.evaluate(read);
  await page.evaluate(()=>document.getElementById('v22Alloc').scrollIntoView());await page.screenshot({path:path.join(outDir,key+'-notional.png')}).catch(e=>o.shotErr=e.message);
  await page.evaluate(()=>v22SetMode('margin'));await page.waitForTimeout(250);
  await scene('pending',()=>{V57.spot=null;V57.err=null;V57.busy=true;});
  await page.evaluate(()=>document.getElementById('v22Alloc').scrollIntoView());await page.screenshot({path:path.join(outDir,key+'-pending.png')}).catch(e=>o.shotErr=e.message);
  await scene('fail',async()=>{V57.busy=false;V57.spot=null;V57.err=null;V57.at=0;await v57Spot(true);});
  o.failErr=await page.evaluate(()=>!!V57.err);
  R[key]=o;await ctx.close();}
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul',bypassCSP:true});await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>R.errors.push('US: '+e.message));
  await page.goto(base+'?journal=us');await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.evaluate(()=>{setPage('dashboard');renderAll();});await page.waitForTimeout(200);
  R.US=await page.evaluate(()=>{const c=document.getElementById('v22Alloc');return {card:!!c,v98:!!(c&&c.querySelector('#v98Note,#v98Center,[data-v22-pct="spot"]')),spotWord:!!(c&&/현물/.test(c.textContent))};});await ctx.close();}
 console.log(JSON.stringify(R));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
