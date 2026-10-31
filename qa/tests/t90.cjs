/* t90: 추매/피라미딩 기록. 하네스 = t89(real Chromium + playwright-core, fetch 모의).
   NODE_PATH=/workspace/work/pgtest/node_modules LD_LIBRARY_PATH=/tmp/chr/root/usr/lib/aarch64-linux-gnu node qa/t90.cjs github-pages/index.html screens/v90 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');
  if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'4h':144e5,'1d':864e5}[b.req.interval]||36e5,out=[];for(let t=Math.floor(b.req.startTime/iv)*iv;t<=b.req.endTime;t+=iv){const p=101+3*Math.sin(t/7e6);out.push({t,o:String(p),c:String(p+.3),h:String(p+1),l:String(p-1)});}return J(out);}
  if(b.type==='spotClearinghouseState')return J({balances:[]});
  if(b.type==='spotMetaAndAssetCtxs')return J([{tokens:[],universe:[]},[]]);
  return J([]);}
  return J({message:'not found'},404);};};
const seed=(us)=>{
 const D=Date.parse(new Date(Date.now()-86400000).toISOString().slice(0,10)+'T00:00:00Z');
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();const o={id,date:d.slice(0,10),time:d.slice(11,19),shares:sh,price:px,fee:0.12,seq:ts/1000};if(!us){o.timestamp=ts;if(fill){o.fillId=fill;o.sourceKey='hyperliquid:abc:'+fill;}}return o;};
 const mk=o=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:o.id,at:o.e[0][0],name:o.name,direction:'long',date:new Date(o.e[0][0]).toISOString().slice(0,10),stop:o.stop??null,stop0:o.stop0??null,initialRisk:o.R??null,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'unreviewed',review:'',violations:[],entries:o.e.map((x,i)=>ev(o.id+'e'+i,...x)),fills:(o.f||[]).map((x,i)=>ev(o.id+'f'+i,...x)),funding:[],images:[],...(o.extra||{})});
 const H=3600e3;
 Object.assign(state.settings,{account:10000});
 state.trades=[
  /* 최초 진입 100×1 + 20초 뒤 100.2×1(분할) · 추매1 수익 중 103×1 + 30초 뒤 103.2×1 · 추매2 손실 중 99×2 · 청산 104×6. 최초 손절 97, D+2.5h 스탑 98 */
  mk({id:'pyr',name:us?'AAPL':'BTC',e:[[D+H,1,100,'1'],[D+H+20e3,1,100.2,'2'],[D+2*H,1,103,'3'],[D+2*H+30e3,1,103.2,'4'],[D+3*H,2,99,'5']],f:[[D+5*H,6,104,'9']],stop:98,stop0:97,R:null,
   extra:{stopHistory:[{at:D+2.5*H,from:97,to:98}]}}),
  /* 추매 없는 기존 거래(수동 1R 50 · v73Sig 이미 맞춤) */
  mk({id:'plain',name:us?'MSFT':'ETH',e:[[D+H,10,100,'11'],[D+H+5e3,10,100,'12']],f:[[D+4*H,20,102,'19']],stop:98,stop0:98,R:50})];
 state.trades[1].v73Sig=v73Risk(state.trades[1]).sig; /* 수동 1R 50 (자동 40과 다름) 유지 확인 */
 setPage('dashboard');renderAll();
};
const chk=()=>{const out=[];for(const el of document.querySelectorAll('#v90Card,#v90Card *,#v90Notes,#v90Notes *')){const cs=getComputedStyle(el),r=el.getBoundingClientRect();if(!r.width)continue;
 const p=document.querySelector('#tradeDialog').getBoundingClientRect();
 if(cs.textOverflow==='ellipsis'&&el.scrollWidth>el.clientWidth||(cs.overflowX==='hidden'&&el.scrollWidth>el.clientWidth+1)||r.right>p.right+0.5)out.push((el.className||el.tagName)+':'+el.scrollWidth+'/'+el.clientWidth+' r'+Math.round(r.right)+'/'+Math.round(p.right));}return out;};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 const out={errors:[]};
 for(const [mkt,q] of [['HL','hyperliquid'],['US','us']])for(const W of [1440,390]){
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);
  const A=await ctx.newPage();A.on('pageerror',e=>out.errors.push(mkt+W+': '+e.message));const URL0='http://127.0.0.1:'+srv.address().port+'/?journal='+q;
  await A.goto(URL0);await A.waitForTimeout(2000);
  await A.evaluate(seed,mkt==='US');
  const r=await A.evaluate(async us=>{const R={};
   const plain0=JSON.stringify(state.trades.find(t=>t.id==='plain'));
   await new Promise(r=>setTimeout(r,400));
   const t=state.trades.find(x=>x.id==='pyr');R.R1=t.initialRisk;R.v73exp=Number(((604.4/6-97)*6).toPrecision(10));
   R.adds=v90Adds(t).map(a=>({no:a.no,tag:a.tag,px:+a.px.toFixed(4),q:a.q,nFill:a.nFill,avg1:+a.avg1.toFixed(4),q1:a.q1,stop:a.stop&&a.stop.v,addRisk:+a.addRisk.toFixed(4),totRisk:+a.totRisk.toFixed(4),addR:+a.addR.toFixed(4),totR:+a.totR.toFixed(4),unreal:+a.unreal.toFixed(4)}));
   openTrade('pyr','review');await new Promise(r=>setTimeout(r,900));
   R.card=!!$('v90Card');R.cardText=[...document.querySelectorAll('#v90Card .v90-it')].map(e=>e.innerText.replace(/\s+/g,' '));
   R.notes=document.querySelectorAll('#v90Notes textarea').length;R.inJournal=!!$('v71Card')?.contains($('v90Notes'));
   R.chartMarks=[...document.querySelectorAll('#v37Chart .v90-lab')].map(e=>e.textContent+':'+e.getAttribute('class'));
   const ta=document.querySelector('#v90Notes textarea');if(ta){ta.value='돌파 확인 후 1차 추매';ta.dispatchEvent(new Event('change',{bubbles:true}));}
   await new Promise(r=>setTimeout(r,1200));R.saved=state.trades.find(x=>x.id==='pyr').pyrNotes;
   $('tradeDialog').close();openTrade('plain','review');await new Promise(r=>setTimeout(r,600));R.plainCard=!!$('v90Card')||!!$('v90Notes');
   const p1=state.trades.find(x=>x.id==='plain');R.plainR=p1.initialRisk;{const a=JSON.parse(plain0),b=JSON.parse(JSON.stringify(p1));R.plainDiff=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>k!=='updatedAt'&&k!=='v63x'&&JSON.stringify(a[k])!==JSON.stringify(b[k]));}R.plainSame=!R.plainDiff.length; /* v63x = 기존 v63 MFE/MAE 캐시(상세 열 때 HL 청산 거래에 채움, v89도 같음) 제외 */
   R.plainMarks=document.querySelectorAll('#v37Chart .v90-lab').length;R.ver=APP_VER;R.dv=document.documentElement.outerHTML.includes('data-v="v90-addon"');
   $('tradeDialog').close();openTrade('pyr','review');await new Promise(r=>setTimeout(r,600));return R;},mkt==='US');
  r.trunc=await A.evaluate(chk);
  try{await A.locator('#v90Card').screenshot({path:`${outDir}/card-${mkt}-${W}.png`});await A.locator('#v90Notes').screenshot({path:`${outDir}/notes-${mkt}-${W}.png`});if(mkt==='HL')await A.locator('#v37Chart').screenshot({path:`${outDir}/chart-${W}.png`});}catch(e){r.shotErr=e.message.slice(0,120);}
  /* 재로드 → 사유 유지 */
  await A.reload();await A.waitForTimeout(2500);
  r.reload=await A.evaluate(async()=>{const t=state.trades.find(x=>x.id==='pyr');if(!t)return 'no trade';openTrade('pyr','review');await new Promise(r=>setTimeout(r,700));return {notes:t.pyrNotes,ta:document.querySelector('#v90Notes textarea')?.value};});
  out[mkt+W]=r;await ctx.close();}
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
