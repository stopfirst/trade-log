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
 const report={tag,errors:[],scenes:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/';
 const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);const page=await ctx.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(URL0+'?journal=hyperliquid');await page.waitForTimeout(2200);await page.evaluate(seed);await page.waitForTimeout(200);
 report.scenes.push({pullBtn:await page.evaluate(()=>{const b=$('v52Pull');return b&&!b.hidden&&getComputedStyle(b).display!=='none'?b.getBoundingClientRect().width:0;})});
 await page.screenshot({path:outDir+'/'+tag+'-header.png',clip:{x:0,y:0,width:1440,height:200}});
 report.scenes.push({direct:await page.evaluate(async()=>{const c=HLCloud.emptyCache('x','0x'+'a'.repeat(40));c.fills.push({coin:'ETH',px:'100',sz:'1',side:'B',time:1792800001000,tid:901});const n=await v52Direct(c,'fills');const n2=await v52Direct(c,'fills');return {n,n2,len:c.fills.length,starts:window.__q,cursor:c.fillCursor};})});
 report.scenes.push({click:await page.evaluate(async()=>{let called=0,dir;const o=hlcSync;hlcSync=async m=>{called++;dir=V52.direct;};await v52Pull();hlcSync=o;return {called,dir,after:V52.direct,label:$('v52Pull').textContent};})});
 await page.evaluate(()=>openTrade('big','manage'));await page.waitForTimeout(1200);
 await page.evaluate(()=>document.querySelector('#v37Chart').scrollIntoView());await page.waitForTimeout(200);
 const R=()=>page.evaluate(()=>state.trades.find(x=>x.id==='big').chartNotes.filter(x=>x.kind==='rect').map(x=>[x.ts,x.px,x.ts2,x.px2]));
 await page.click('[data-v40mode="rect"]');await page.waitForTimeout(200);
 const bb=await page.evaluate(()=>{const r=document.querySelector('#v37Chart svg.v37-svg').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};});
 await page.mouse.click(bb.x+bb.w*.3,bb.y+bb.h*.3);await page.waitForTimeout(250);await page.mouse.move(bb.x+bb.w*.45,bb.y+bb.h*.55,{steps:4});await page.waitForTimeout(150);
 report.scenes.push({prev:await page.evaluate(()=>!!document.querySelector('.v61-prev')),hint:await page.evaluate(()=>document.querySelector('.v40-hint')?.textContent)});
 await page.locator('#v37Chart').screenshot({path:outDir+'/'+tag+'-rect-prev.png'});
 await page.mouse.click(bb.x+bb.w*.45,bb.y+bb.h*.55);await page.waitForTimeout(500);const r1=await R();report.scenes.push({made:r1,mode:await page.evaluate(()=>V40.mode)});
 await page.click('[data-v40mode="view"]');await page.waitForTimeout(200);
 let h=await page.evaluate(()=>{const e=document.querySelector('[data-v61h="br"]').getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2};});
 await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+120,h.y+40,{steps:6});await page.mouse.up();await page.waitForTimeout(500);const r2=await R();
 h=await page.evaluate(()=>{const e=document.querySelector('.v61-box').getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2};});
 await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x-80,h.y-30,{steps:6});await page.mouse.up();await page.waitForTimeout(500);const r3=await R();
 report.scenes.push({resize:r2,move:r3,popAfterDrag:await page.evaluate(()=>!!document.querySelector('.v40-pop'))});
 await page.locator('#v37Chart').screenshot({path:outDir+'/'+tag+'-rect.png'});
 h=await page.evaluate(()=>{const e=document.querySelector('.v61-box').getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2};});
 await page.mouse.click(h.x,h.y);await page.waitForTimeout(400);report.scenes.push({pop:await page.evaluate(()=>[...document.querySelectorAll('.v40-pop button')].map(b=>b.textContent))});
 console.log(JSON.stringify(report.scenes.slice(-4)));await page.evaluate(()=>{const b=[...document.querySelectorAll('.v40-pop button')].find(b=>/삭제/.test(b.textContent));b&&b.click();});await page.waitForTimeout(500);report.scenes.push({afterDel:await R(),others:await page.evaluate(()=>state.trades.find(x=>x.id==='big').chartNotes.length)});
 await page.evaluate(()=>{V40.mode='view';const t=state.trades.find(x=>x.id==='big');v37ChartMount(t);});await page.waitForTimeout(300);
 const T=()=>page.evaluate(()=>{const x=state.trades.find(x=>x.id==='big').chartNotes.find(x=>x.kind==='trend');return [x.ts,x.px,x.ts2,x.px2];});const t0=await T();
 for(const e of ['b','a']){const h=await page.evaluate(e=>{const c=document.querySelector('[data-v61t="'+e+'"]');if(!c)return null;const r=c.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},e);if(!h){report.scenes.push({noHandle:e});continue;}
  await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+60,h.y-50,{steps:6});await page.mouse.up();await page.waitForTimeout(500);}
 report.scenes.push({trend:{before:t0,after:await T(),pop:await page.evaluate(()=>!!document.querySelector('.v40-pop'))}});
 await page.locator('#v37Chart').screenshot({path:outDir+'/'+tag+'-trend.png'});
console.log(JSON.stringify(report.scenes.slice(-2))); try{const h=await page.evaluate(()=>{const c=document.querySelector('.v61-rc, [data-v40id] .v40-tl');const L=document.querySelector('[data-v61t]').closest('[data-v40id]').querySelectorAll('line')[1].getBoundingClientRect();return {x:L.left+L.width/2,y:L.top+L.height/2};});await page.mouse.click(h.x,h.y);await page.waitForTimeout(400);report.scenes.push({trendPop:await page.evaluate(()=>document.querySelector('.v40-pop')?.textContent?.slice(0,40))});}catch(e){report.scenes.push({trendPop:'skip: '+e.message.slice(0,60)});}
 console.log(JSON.stringify(report));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
