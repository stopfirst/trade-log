/* v37 visual QA (하네스 = shots-v36: real Chromium /tmp/chr + playwright-core, fetch 모의).
   NODE_PATH=/workspace/work/pgtest/node_modules LD_LIBRARY_PATH=/tmp/chr/root/usr/lib/aarch64-linux-gnu node qa/shots-v37.cjs github-pages/index.html screens/v37 v37
   장면: (a) HL 거래 상세 — 복기 탭(텔레그램 줄 + 자동 감지 상자 + 미리 체크) · 관리 탭(미니 차트: 진입·추가·청산·평균 진입·스탑·최초 스탑)
         (b) 대시보드 복기 대기 카드(자동 감지 칩 + 버튼) (c) 거래 목록 '텔레그램으로 복기' 뱃지 — 1440 / 390, 넘침 검사 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');if(b.type==='userFillsByTime'){window.__q=(window.__q||[]);window.__q.push(b.startTime);const base=1792800000000;const all=[1,2,3].map(i=>({coin:'ETH',px:'100',sz:'1',side:'B',time:base+i*1000,dir:'Open Long',closedPnl:'0',hash:'0x'+i,oid:i,crossed:true,fee:'0.01',tid:900+i,feeToken:'USDC',startPosition:'0'}));return J(all.filter(x=>x.time>=b.startTime));}if(b.type==='userFunding')return J([]);if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5}[b.req.interval]||36e5,out=[];let p=100;
   for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<200;t+=iv,i++){const o2=p,c=p+Math.sin(i/2.3)*0.9+(i>40&&i<70?0.25:-0.05);out.push({t,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.5),l:String(Math.min(o2,c)-0.5)});p=c;}return J(out);}return J({},400);}
  return J({message:'not found'},404);};};
const seed=()=>{
 const now=Date.now(),D=Date.parse(new Date(now-86400000).toISOString().slice(0,10)+'T00:00:00Z');
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.12,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=o=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:o.id,at:o.e[0][0],name:o.name,direction:o.dir||'long',date:new Date(o.e[0][0]).toISOString().slice(0,10),stop:o.stop??null,stop0:o.stop0??null,initialRisk:o.R??null,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:o.process||'unreviewed',review:o.review||'',violations:o.viol||[],entries:o.e.map((x,i)=>ev(o.id+'e'+i,...x)),fills:(o.f||[]).map((x,i)=>ev(o.id+'f'+i,...x)),funding:[],images:[],...(o.extra||{})});
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10,limStart:new Date(D).toISOString().slice(0,10),reviewStart:'2026-10-01'});
 state.trades=[
  mk({id:'loss',name:'ETH',e:[[D+3600e3,10,100]],f:[[D+2*3600e3,10,60,'101']],stop:90,stop0:90,R:100,process:'compliant',review:'손절 지킴'}),
  mk({id:'big',name:'xyz:INTC',e:[[D+3*3600e3,30,100],[D+3.6*3600e3,10,101.2]],f:[[D+4.4*3600e3,20,102.1,'102'],[D+5*3600e3,20,101.6,'103']],stop0:null,stop:null,R:300,extra:{chartNotes:[{id:'n1',kind:'note',ts:D+3.3*3600e3,px:101.4,text:'거래량 급증 뒤 눌림에서 추가 진입. 주봉·일봉 약세라 저항선 102.2 돌파 실패하면 비중 절반 줄이기',at:1},{id:'n2',kind:'hline',ts:null,px:102.2,text:'저항',at:2},{id:'n3',kind:'trend',ts:D+3*3600e3,px:99.6,ts2:D+4.4*3600e3,px2:101.4,text:'상승 추세',at:3}]}}),
  mk({id:'tg',name:'BTC',e:[[D+6*3600e3,0.1,100]],f:[[D+7*3600e3,0.1,100.8,'104']],stop:99,stop0:98.5,R:15,process:'violation',viol:['추격','손절 지연'],extra:{quickReview:{ref:'hl:104',decision:'violation',violations:['추격','손절 지연'],answeredAt:new Date(D+7.1*3600e3).toISOString(),appliedAt:Date.now(),source:'telegram'}}})];
 state.trades[0].fills.forEach(f=>f.compliance='compliant');
 setPage('dashboard');renderAll();window.scrollTo(0,0);
};
const chk=()=>{const W=document.documentElement.clientWidth,bad=[];const dlg=document.querySelector('dialog[open]');const scope=dlg||document.body;const box=(dlg||document.documentElement).getBoundingClientRect();
 scope.querySelectorAll('.v37-auto,.v37-auto *,.v37-chart,.v37-chart *,.v38-iv *,.v40-tools *,.v40-pop,.v40-pop *,.v37-tgline,.v37-tgline *,#reviewQueue *,.pill.v37-tg').forEach(el=>{const r=el.getBoundingClientRect();if(!r.width||el.closest('svg')&&el.tagName!=='svg')return;if(r.right>Math.min(W,box.right)+0.5||r.left<Math.max(0,box.left)-0.5)bad.push((el.className.baseVal??el.className)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+Math.round(box.right));});
 return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--font-render-hinting=none']});
 const rep={errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/';
 for(const W of [1440,390]){
 const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);const page=await ctx.newPage();
 page.on('pageerror',e=>rep.errors.push(e.message));
 await page.goto(URL0+'?journal=hyperliquid');await page.waitForTimeout(2200);await page.evaluate(seed);await page.waitForTimeout(200);
 const r={W};await page.waitForTimeout(800);
 await page.evaluate(()=>{const t=clone(state.trades.find(x=>x.id==='loss'));t.id='op';t.fills=[];t.stop=null;t.stop0=null;t.initialRisk=null;delete t.v73Sig;t.sync=state.trades.find(x=>x.sync)?.sync||{exchangePnl:0};state.trades.push(t);renderAll();});
 r.open=await page.evaluate(()=>state.trades.filter(t=>t.market==='HL'&&!calcTrade(t).done&&calcTrade(t).qty>0).map(t=>({id:t.id,name:t.name,dir:t.direction,stop:t.stop,stop0:t.stop0,ir:t.initialRisk})));
 r.sync=await page.evaluate(async()=>{const t=state.trades.find(t=>t.market==='HL'&&!calcTrade(t).done&&calcTrade(t).qty>0);if(!t)return 'no open';
  v32Model=()=>({state:'ok',rows:[{coin:t.name,side:t.direction==='short'?'short':'long',stopPx:t.direction==='short'?999.123456:1.23456789}]});v32Paint();await new Promise(r=>setTimeout(r,600));return {stop:t.stop,tg:t.riskPlan&&t.riskPlan.target,stop0:t.stop0,ir:t.initialRisk,h:(t.stopHistory||[]).at(-1)};});
 await page.evaluate(()=>{const t=state.trades.find(t=>t.market==='HL'&&!calcTrade(t).done&&calcTrade(t).qty>0)||state.trades[0];openTrade(t.id,'review');});await page.waitForTimeout(800);
 r.order=await page.evaluate(()=>[...document.querySelectorAll('#detailBody > *, #detailBody > section > *')].map(e=>e.id||e.className||e.tagName).slice(0,40));
 await page.evaluate(()=>document.querySelector('[data-v63-set="conf"]').click());await page.waitForTimeout(500);
 r.more=await page.evaluate(()=>{const d=document.querySelector('#detailBody > details.v75-more');return d?[...d.children].map(e=>e.tagName+'.'+e.className):'none';});r.lev=await page.evaluate(()=>!!document.querySelector('[name=leverage]'));
 r.order2=await page.evaluate(()=>[...$('detailBody').children].map(e=>e.id||e.className||e.tagName).slice(0,6));
 await page.screenshot({path:process.argv[3]+'/v75-'+W+'.png',fullPage:false});
 r.v77=await page.evaluate(()=>({rpInPos:!!document.querySelector('#v45Pos details.v77-plan #riskPlanPanel'),stopBtn:[...document.querySelectorAll('#v45Pos button')].some(b=>b.textContent.trim()==='스탑 변경'),ed:document.querySelectorAll('#v45Pos .v77-ed').length}));
 await page.click('#v45Pos .v45-tile.tgt');await page.waitForTimeout(100);await page.keyboard.press('Control+A');await page.keyboard.type('150');await page.keyboard.press('Enter');await page.waitForTimeout(700);
 r.v77stop=await page.evaluate(()=>{const t=state.trades.find(x=>x.id===selectedId);return {stop:t.stop,tg:t.riskPlan&&t.riskPlan.target,err:$('riskPlanError')?.textContent||'',tile:document.querySelector('#v45Pos .v45-tile.tgt b')?.textContent};});
 r.hold=await page.evaluate(async()=>{const a=document.querySelector('[data-v71-area="holdNote"]');if(!a)return 'none';const prev=a.closest('label,div')?.previousElementSibling?.textContent||'';a.value='보유 테스트';a.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,400));return {saved:state.trades.find(x=>x.id===selectedId).holdNote,labels:[...document.querySelectorAll('#v71Card [data-v71-area]')].map(x=>x.dataset.v71Area)};});
 r.chip=await page.evaluate(()=>{const b=document.querySelector('[data-v71="pre"]');if(!b)return 'none';const t0=performance.now();b.click();const on=document.querySelector('[data-v71="pre"][data-v71-val="'+b.dataset.v71Val+'"]').className;return {ms:Math.round(performance.now()-t0),on};});
 await page.screenshot({path:process.argv[3]+'/v77-'+W+'.png',fullPage:false});
 r.v91=await page.evaluate(async()=>{const t=state.trades.find(t=>t.id==='big');t.leverage=3;selectedId='big';renderDetail();renderDetail();const c=calcTrade(t);const cell=[...$('detailSummary').children].find(d=>d.querySelector(':scope>span')?.textContent.trim()==='순실현손익');return {txt:cell&&cell.innerText,pnl:c.pnl,totalIn:c.totalIn,n:cell?cell.querySelectorAll('.v91-pos').length:0,err:window.__err||null};});
 await page.evaluate(()=>$('detailSummary').scrollIntoView());await page.waitForTimeout(150);await page.screenshot({path:process.argv[3]+'/s91-'+W+'.png',fullPage:false});
 r.v79=await page.evaluate(async()=>{const big=state.trades.find(t=>t.id==='big');big.stop0=98;big.riskPlan={...(big.riskPlan||{}),target:106};delete big.plan0;delete big.v73Sig;const tg=state.trades.find(t=>t.id==='tg');tg.riskPlan={...(tg.riskPlan||{}),target:103};tg.v63x={v:1,mfeR:5,maeR:0.2};
  renderAll();await new Promise(r=>setTimeout(r,300));document.querySelectorAll('dialog[open]').forEach(d=>d.close());setPage('analysis');renderAll();await new Promise(r=>setTimeout(r,300));/* CI: v91 접힘(details[data-v91]) 펼친 뒤 읽기 */if(typeof V91!=='undefined'){document.querySelectorAll('#page-analysis details[data-v91]').forEach(d=>V91.open.add(d.dataset.v91));renderAll();await new Promise(r=>setTimeout(r,400));}
  const b=$('v71Body');return {plans:state.trades.map(t=>[t.id,t.plan0&&t.plan0.rr,calcTrade(t).R]),t:b&&b.querySelector('.v79-t')?.innerText,dx:b&&b.querySelector('.v79-dx')?.innerText,v:b&&b.querySelector('.v79-verdict')?.innerText,grid:b&&[...b.querySelectorAll('.v71-grid th')].map(x=>x.textContent).filter(x=>x.includes('손익비'))};});
 await page.evaluate(()=>document.querySelector('.v79-t')?.scrollIntoView());await page.waitForTimeout(200);await page.screenshot({path:process.argv[3]+'/v79-'+W+'.png',fullPage:false});


 rep['w'+W]=r;await ctx.close();}
 console.log(JSON.stringify(rep));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
