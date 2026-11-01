/* v96 트레이딩뷰식 거래 복기 차트 QA (모의 봉·체결, 1440/390)
   십자선 라벨·OHLC 범례, 가격축 끌기 = 세로 배율·더블클릭 리셋, 시간축 끌기 = 가로 배율·더블클릭 리셋,
   체결 마커 개수·말풍선, 거래량 켜고 끄기, 가로선 도구 그리기 정상, 터치 길게 누르기 십자선 유지·탭 해제, 넘침·페이지 오류 0, 스크린샷 xh-/chart-<W>.png */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');if(b.type==='userFillsByTime'){window.__q=(window.__q||[]);window.__q.push(b.startTime);const base=1792800000000;const all=[1,2,3].map(i=>({coin:'ETH',px:'100',sz:'1',side:'B',time:base+i*1000,dir:'Open Long',closedPnl:'0',hash:'0x'+i,oid:i,crossed:true,fee:'0.01',tid:900+i,feeToken:'USDC',startPosition:'0'}));return J(all.filter(x=>x.time>=b.startTime));}if(b.type==='userFunding')return J([]);if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5}[b.req.interval]||36e5,out=[];let p=100;
   for(let t=Math.floor(b.req.startTime/iv)*iv,i=0;t<=b.req.endTime&&i<200;t+=iv,i++){const o2=p,c=p+Math.sin(i/2.3)*0.9+(i>40&&i<70?0.25:-0.05);out.push({t,o:String(o2),c:String(c),h:String(Math.max(o2,c)+0.5),l:String(Math.min(o2,c)-0.5),v:String(1000+((i*37)%11)*180)});p=c;}return J(out);}return J({},400);}
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
 await page.evaluate(()=>{try{localStorage.removeItem('tj.v96.vol');}catch{}V96.vol=true;const t=state.trades.find(x=>x.id==='big');t.stop=99.2;t.riskPlan={price:100,qty:30,stop:99.2,target:103.4};});
 await page.evaluate(()=>openTrade('big','manage'));await page.waitForTimeout(3800);
 await page.evaluate(()=>document.querySelector('#v37Chart').scrollIntoView());await page.waitForTimeout(300);
 const r={W};const G=()=>page.evaluate(()=>{const s=document.querySelector('#v37Chart svg.v37-svg');const a=s.getAttribute('data-v40g').split(',').map(Number);return {lo:a[8],hi:a[9],t0:a[6],t1:a[7],L:a[2],T:a[3],pw:a[4],ph:a[5],W:a[0],H:a[1]};});
 const S=()=>page.evaluate(()=>{const b=document.querySelector('#v37Chart svg.v37-svg').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};});
 let g=await G(),s=await S();const k=s.w/g.W,P=(x,y)=>[s.x+x*k,s.y+y*k];
 /* 마커 */
 r.mk=await page.evaluate(()=>({n:document.querySelectorAll('#v37Chart .v96-mk').length,buy:document.querySelectorAll('#v37Chart .v96-mk.buy').length,sell:document.querySelectorAll('#v37Chart .v96-mk.sell').length}));
 r.tags=await page.evaluate(()=>[...document.querySelectorAll('#v37Chart .v96-tag')].map(e=>e.getAttribute('class').replace('v96-tag ','').replace(/^last .*/,'last')).sort());
 r.ticks=await page.evaluate(()=>({p:document.querySelectorAll('#v37Chart .v96-ax').length>4}));
 const mb=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v96-mk.buy .v96-mk-a').getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2};});
 await page.mouse.move(mb.x,mb.y);await page.waitForTimeout(250);
 r.tip=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v96-tip');return e&&!e.hidden?e.textContent:'';});
 /* 십자선 + 범례 */
 let [cx,cy]=P(g.L+g.pw*0.45,g.T+g.ph*0.4);await page.mouse.move(cx,cy,{steps:3});await page.waitForTimeout(200);
 r.xh=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v96-xh');return e?{lines:e.querySelectorAll('.v96-xl').length,px:!!e.dataset.px,tl:/\d\d\/\d\d \d\d:\d\d/.test(e.dataset.tl)}:null;});
 r.leg=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v96-leg');return e?{o:/O\s*[\d.]/.test(e.textContent)&&/H\s*[\d.]/.test(e.textContent)&&/L\s*[\d.]/.test(e.textContent)&&/C\s*[\d.]/.test(e.textContent),pct:/%\)/.test(e.textContent),col:!!e.querySelector('b.up,b.dn')}:null;});
 await page.locator('#v37Chart').screenshot({path:process.argv[3]+'/xh-'+W+'.png'});
 /* 가격축 끌기 → 세로 배율, 더블클릭 → 원래 */
 const g0=await G();let [ax,ay]=P(g.L+g.pw+30,g.T+g.ph*0.4);
 await page.mouse.move(ax,ay);await page.mouse.down();await page.mouse.move(ax,ay+90,{steps:6});await page.mouse.up();await page.waitForTimeout(350);
 const g1=await G();r.yzoom=(g1.hi-g1.lo)>(g0.hi-g0.lo)*1.2;r.ysame=g1.t0===g0.t0&&g1.t1===g0.t1;
 await page.mouse.dblclick(ax,ay);await page.waitForTimeout(350);const g2=await G();r.yreset=Math.abs((g2.hi-g2.lo)-(g0.hi-g0.lo))<1e-9;
 /* 시간축 끌기 → 가로 배율 */
 let [tx,ty]=P(g.L+g.pw*0.5,g.T+g.ph+12);
 await page.mouse.move(tx,ty);await page.mouse.down();await page.mouse.move(tx+80,ty,{steps:6});await page.mouse.up();await page.waitForTimeout(350);
 const g3=await G();r.xzoom=(g3.t1-g3.t0)<(g0.t1-g0.t0)*0.9;r.xright=Math.abs(g3.t1-g0.t1)<1;
 await page.mouse.dblclick(tx,ty);await page.waitForTimeout(350);const g4=await G();r.xreset=g4.t0===g0.t0&&g4.t1===g0.t1;
 /* 거래량 토글 */
 const nv=()=>page.evaluate(()=>document.querySelectorAll('#v37Chart .v96-vol').length);
 r.vol0=(await nv())>10;await page.click('#v37Chart [data-v96vol]');await page.waitForTimeout(250);r.vol1=await nv();r.volLs=await page.evaluate(()=>localStorage.getItem('tj.v96.vol'));
 await page.click('#v37Chart [data-v96vol]');await page.waitForTimeout(250);r.vol2=(await nv())>10;
 r.c1=await page.evaluate(chk);
 /* 기존 도구: 가로선 그리기 */
 const nh=()=>page.evaluate(()=>state.trades.find(x=>x.id==='big').chartNotes.filter(x=>x.kind==='hline').length);const h0=await nh();
 await page.click('#v37Chart [data-v40mode="hline"]');await page.waitForTimeout(250);g=await G();s=await S();
 {const kk=s.w/g.W;await page.mouse.click(s.x+(g.L+g.pw*0.3)*kk,s.y+(g.T+g.ph*0.3)*kk);await page.waitForTimeout(300);await page.mouse.click(s.x+(g.L+g.pw*0.6)*kk,s.y+(g.T+g.ph*0.3)*kk);await page.waitForTimeout(500);}
 r.hline=(await nh())-h0;
 await page.click('#v37Chart [data-v40mode="view"]');await page.waitForTimeout(250);
 /* 터치 길게 누르기 → 십자선 유지 → 한 번 탭 해제 (합성 PointerEvent) */
 r.touch=await page.evaluate(async()=>{const svg=document.querySelector('#v37Chart svg.v37-svg'),b=svg.getBoundingClientRect(),a=svg.getAttribute('data-v40g').split(',').map(Number),k=b.width/a[0];
  const x=b.left+(a[2]+a[4]*0.5)*k,y=b.top+(a[3]+a[5]*0.5)*k,w=ms=>new Promise(r=>setTimeout(r,ms)),ev=(ty,id,xx,yy)=>svg.dispatchEvent(new PointerEvent(ty,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',clientX:xx,clientY:yy,isPrimary:true}));
  const has=()=>!!svg.isConnected&&!!document.querySelector('#v37Chart .v96-xh');
  ev('pointerdown',7,x,y);await w(650);const on=has();ev('pointermove',7,x+30,y-20);await w(80);const lab=document.querySelector('#v37Chart .v96-xh')?.dataset.px||'';ev('pointerup',7,x+30,y-20);await w(120);const kept=has();
  ev('pointerdown',8,x,y);await w(60);ev('pointerup',8,x,y);svg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}));await w(120);
  return {on,moved:!!lab,kept,off:!has(),pop:!!document.querySelector('.v40-pop')};});
 await page.mouse.move(2,2);await page.waitForTimeout(150);
 await page.locator('#v37Chart').screenshot({path:process.argv[3]+'/chart-'+W+'.png'});
 r.c2=await page.evaluate(chk);
 rep['w'+W]=r;await ctx.close();}
 console.log(JSON.stringify(rep));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
