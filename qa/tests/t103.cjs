/* v103 QA: 차트 그리기 도구가 그림 하나를 완성하거나 취소하면 '보기'로 돌아감(도구별), 그리는 도중은 유지,
   그린 것 저장 유지(state·저장본 v83Read), 기존 그림 끌기·편집은 모드를 바꾸지 않음. 하네스 = t81(모의 HL·봉). */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');if(b.type==='userFillsByTime'){window.__q=(window.__q||[]);window.__q.push(b.startTime);const base=1792800000000;const all=[1,2,3].map(i=>({coin:'ETH',px:'100',sz:'1',side:'B',time:base+i*1000,dir:'Open Long',closedPnl:'0',hash:'0x'+i,oid:i,crossed:true,fee:'0.01',tid:900+i,feeToken:'USDC',startPosition:'0'}));return J(all.filter(x=>x.time>=b.startTime));}if(b.type==='userFunding')return J([]);if(b.type==='candleSnapshot'&&!window.__c429){window.__c429=1;return new Response('{}',{status:429});}if(b.type==='candleSnapshot'){const iv={'1m':6e4,'3m':18e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5}[b.req.interval]||36e5,out=[];let p=100;
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
 await page.evaluate(()=>openTrade('big','manage'));await page.waitForTimeout(3800);
 await page.evaluate(()=>{const t=state.trades.find(x=>x.id==='big');t.chartNotes=[];v32St={at:Date.now(),orders:[],failed:[]};v32Kick=async()=>{};v32Model=()=>({state:'ok',rows:[]});V40.mode='view';V40.pend=null;v37ChartMount(t);document.querySelector('#v37Chart').scrollIntoView();});await page.waitForTimeout(300);
 const S=await page.evaluate(()=>{const b=document.querySelector('#v37Chart svg.v37-svg').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};});
 const at=(a,b)=>[S.x+S.w*a,S.y+S.h*b];
 const click=async(a,b,o)=>{const [x,y]=at(a,b);await page.mouse.click(x,y,o);await page.waitForTimeout(280);};
 const tool=async k=>{await page.evaluate(k=>document.querySelector(`#v37Chart [data-v40mode="${k}"]`).click(),k);await page.waitForTimeout(250);};
 const st=()=>page.evaluate(()=>{const t=state.trades.find(x=>x.id==='big');const on=[...document.querySelectorAll('#v37Chart .v40-tb.on')].map(b=>b.dataset.v40mode);
  return {mode:V40.mode,pend:!!V40.pend,on:on.join(','),n:(t.chartNotes||[]).length,kinds:(t.chartNotes||[]).map(x=>x.kind)};});
 const r={W},seq=[];
 const step=async(name,fn)=>{const before=await st();await fn();const s=await st();seq.push(name);r[name]={mode:s.mode,on:s.on,pend:s.pend,added:s.n-before.n};};
 // 메모: 저장 → 보기
 await step('note',async()=>{await tool('note');await click(.3,.35);await page.keyboard.type('v103 메모');await page.keyboard.press('Enter');await page.waitForTimeout(500);});
 // 메모: Esc 취소 → 보기, 추가 없음
 await step('noteEsc',async()=>{await tool('note');await click(.7,.12);await page.keyboard.press('Escape');await page.waitForTimeout(400);});
 // 메모: 빈 글로 저장 → 보기
 await step('noteEmpty',async()=>{await tool('note');await click(.72,.22);await page.click('.v40-pop [data-v40b="ok"]');await page.waitForTimeout(400);});
 // 메모 입력창 열린 채 다른 도구 선택 → 그 도구 유지(되돌리지 않음)
 await step('noteSwitch',async()=>{await tool('note');await click(.7,.55);await tool('trend');await page.waitForTimeout(200);});
 // 추세선: 첫 점 유지 → 둘째 점에서 보기
 await click(.2,.7);r.trendMid=await st();
 await step('trend',async()=>{await click(.5,.3);await page.waitForTimeout(300);});
 // 추세선 첫 점 뒤 Esc → 보기, 저장 없음
 await step('trendEsc',async()=>{await tool('trend');await click(.25,.6);await page.keyboard.press('Escape');await page.waitForTimeout(300);});
 if(W===1440){
 // 가로선(2점)
 await tool('hline');await click(.15,.5);r.hlineMid=await st();
 await step('hline',async()=>{await click(.45,.5);await page.waitForTimeout(300);});
 // 직사각형
 await tool('rect');await click(.55,.2);r.rectMid=await st();
 await step('rect',async()=>{await click(.7,.4);await page.waitForTimeout(300);});
 // 지그재그: 꼭짓점 추가 중 유지 → 오른쪽 클릭 완성 → 보기
 await tool('zz');await click(.1,.8);await click(.2,.6);await click(.3,.75);r.zzMid=await st();
 await step('zz',async()=>{await click(.4,.55,{button:'right'});await page.waitForTimeout(400);});
 // 지그재그: Enter 완성
 await step('zzEnter',async()=>{await tool('zz');await click(.75,.92);await click(.85,.78);await page.keyboard.press('Enter');await page.waitForTimeout(400);});
 // 지그재그: [그만] → 보기, 저장 없음 / 한 점 취소는 유지
 await tool('zz');await click(.8,.62);await click(.9,.52);await page.evaluate(()=>document.querySelector('#v37Chart [data-v65act="undo"]').click());await page.waitForTimeout(200);r.zzUndo=await st();
 await step('zzStop',async()=>{await page.evaluate(()=>document.querySelector('#v37Chart [data-v65act="cancel"]').click());await page.waitForTimeout(300);});
 // 곡선: 둘째 점까지 유지 → 셋째 클릭에 보기
 await tool('cv');await click(.6,.93);await click(.88,.86);r.cvMid=await st();
 r.cvAt=await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.tagName+'.'+(e.className.baseVal??e.className)+' in svg:'+!!e.closest('svg.v37-svg')):null;},at(.75,.7));r.cvPend=await page.evaluate(()=>JSON.stringify(V40.pend));
 await step('cv',async()=>{await click(.75,.7);await page.waitForTimeout(400);});
 // 곡선 Esc
 await step('cvEsc',async()=>{await tool('cv');await click(.85,.12);r.cvEscPend=await page.evaluate(()=>!!V40.pend);await page.keyboard.press('Escape');await page.waitForTimeout(300);});
 // 손익비 롱(자동 생성 또는 가격 누르기)
 await step('rrl',async()=>{await tool('rrl');await page.waitForTimeout(300);if(await page.evaluate(()=>V40.mode==='rrl'))await click(.6,.5);await page.waitForTimeout(400);});
 // 손익비 숏
 await step('rrs',async()=>{await tool('rrs');await page.waitForTimeout(300);if(await page.evaluate(()=>V40.mode==='rrs'))await click(.35,.45);await page.waitForTimeout(400);});
 // 기존 그림 끌기: 메모 도구 상태에서 메모를 끌어 옮김 → 메모 도구 유지, 항목 수 그대로, 위치 바뀜
 await tool('note');
 const np=()=>page.evaluate(()=>{const x=state.trades.find(t=>t.id==='big').chartNotes.find(y=>y.kind==='note');return x&&[x.ts,x.px];});
 const p0=await np();
 const nb=await page.evaluate(()=>{const e=document.querySelector('#v37Chart .v40-nt[data-v40id]');if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};});
 if(nb){await page.mouse.move(nb.x,nb.y);await page.mouse.down();await page.mouse.move(nb.x+40,nb.y+30,{steps:8});await page.mouse.up();await page.waitForTimeout(600);}
 const s1=await st();r.dragNote={found:!!nb,moved:JSON.stringify(p0)!==JSON.stringify(await np()),mode:s1.mode,n:s1.n};
 // 기존 지그재그 꼭짓점 끌기(보기) → 보기 유지, 항목 수 그대로
 await tool('view');
 const zp=()=>page.evaluate(()=>{const x=state.trades.find(t=>t.id==='big').chartNotes.find(y=>y.kind==='zz');return x&&JSON.stringify(x.pts);});
 const z0=await zp();
 const h=await page.evaluate(()=>{const e=document.querySelector('[data-v65v="1"]');if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};});
 if(h){await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+20,h.y-35,{steps:6});await page.mouse.up();await page.waitForTimeout(600);}
 const s2=await st();r.dragZz={found:!!h,moved:z0!==await zp(),mode:s2.mode,n:s2.n};
 }
 // 저장 유지: state와 저장본(v83Read) 같은 그림
 await page.waitForTimeout(800);
 r.final=(await st()).kinds.slice().sort();
 r.stored=await page.evaluate(async()=>{const s=await v83Read();const t=s&&(s.trades||[]).find(x=>x.id==='big');return t?(t.chartNotes||[]).map(x=>x.kind).sort():null;});
 r.dbg=await page.evaluate(()=>window.v103Debug&&window.v103Debug());
 r.dialogOpen=await page.evaluate(()=>!!document.querySelector('dialog[open] #v37Chart'));r.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
 await page.locator('#v37Chart').screenshot({path:process.argv[3]+'/t103-'+W+'.png'});
 rep['w'+W]=r;await ctx.close();}
 // ===== 셋업 '빗각': 선택지 노출 → 칩·복기 폼으로 저장 → 새로고침 뒤 유지 → 셋업별 분석 집계 =====
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);await ctx.addInitScript('window.__seed='+JSON.stringify(seed.toString()));const page=await ctx.newPage();
 page.on('pageerror',e=>rep.errors.push(e.message));const ready=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.waitForTimeout(700);};
 await page.goto(URL0+'?journal=hyperliquid');await ready();await page.evaluate(async()=>{(0,eval)('('+window.__seed+')')();await persist();});await page.waitForTimeout(500);
 const sx={};
 sx.options=await page.evaluate(()=>OPTIONS.setup.slice());
 sx.newSetup=await page.evaluate(()=>{const e=$('newSetup');return e?[...e.options].map(o=>o.value).includes('빗각'):null;});
 sx.filter=await page.evaluate(()=>{const e=$('recordSetup');return e?[...e.options].map(o=>o.value).includes('빗각'):null;});
 // 칩(v63)으로 고르기
 await page.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();openTrade('loss','review');});await page.waitForTimeout(1500);
 sx.chip=await page.evaluate(()=>!!document.querySelector('#tradeDialog [data-v63-set="setup"][data-v63-val="빗각"]'));
 sx.select=await page.evaluate(()=>{const e=document.querySelector('#tradeDialog #reviewForm select[name="setup"]');return e?[...e.options].map(o=>o.value).includes('빗각'):null;});
 await page.evaluate(()=>document.querySelector('#tradeDialog [data-v63-set="setup"][data-v63-val="빗각"]').click());await page.waitForTimeout(2500);
 // 복기 폼 셋업 select로 고르고 '복기 저장'
 await page.evaluate(()=>{const d=$('tradeDialog');if(d.open)d.close();openTrade('tg','review');});await page.waitForTimeout(1500);
 await page.evaluate(()=>{const f=document.querySelector('#tradeDialog #reviewForm');const sel=f.querySelector('select[name="setup"]');sel.value='빗각';sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));f.querySelector('button[type="submit"]').click();});
 await page.waitForTimeout(2500);
 sx.before=await page.evaluate(()=>state.trades.filter(t=>t.setup==='빗각').map(t=>t.id).sort());
 await page.reload();await ready();await page.waitForTimeout(800);
 sx.after=await page.evaluate(()=>state.trades.filter(t=>t.setup==='빗각').map(t=>t.id).sort());
 sx.stored=await page.evaluate(async()=>{const s=await v83Read();return (s.trades||[]).filter(t=>t.setup==='빗각').map(t=>t.id).sort();});
 sx.others=await page.evaluate(()=>state.trades.filter(t=>t.setup!=='빗각').map(t=>t.id+':'+t.setup).sort());
 // 분석 '방식별 성과 · 셋업'에 빗각 줄
 sx.analysis=await page.evaluate(async()=>{setPage('analysis');renderAll();await new Promise(r=>setTimeout(r,600));const m=$('compareMode');if(m){m.value='setup';m.dispatchEvent(new Event('change',{bubbles:true}));}await new Promise(r=>setTimeout(r,600));const c=m&&m.closest('.card');return c?/빗각/.test(c.textContent):null;});
 rep.setup=sx;await ctx.close();}
 // ===== 손익비 상자 → 최초 손절·목표·1R·계획 손익비 (HL SL 없이 끝난 숏, 사례: ETH 숏 손절 2315.5·진입 2310.5·목표 2298.8·수량 3.6052) =====
 {const ctx=await browser.newContext({viewport:{width:1440,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);const page=await ctx.newPage();
 page.on('pageerror',e=>rep.errors.push(e.message));const ready=async()=>{await page.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await page.waitForTimeout(700);};
 await page.goto(URL0+'?journal=hyperliquid');await ready();
 await page.evaluate(async()=>{const now=Date.now(),D=Date.parse(new Date(now-86400000).toISOString().slice(0,10)+'T00:00:00Z');
  const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.1,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
  const box=(id,sl,at)=>({id,kind:'rr',side:'short',ts:D+3600e3,ts2:D+3*3600e3,px:2310.5,sl,tp:2298.8,text:'',at});
  const mk=(id,x)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:D+3600e3,name:'ETH',direction:'short',date:new Date(D).toISOString().slice(0,10),stop:null,stop0:null,initialRisk:null,riskR:1,setup:'미분류',leverage:25,marginMode:'cross',process:'unreviewed',review:'',violations:[],
   entries:[ev(id+'e0',D+3600e3,3.6052,2310.5,id+'1')],fills:[ev(id+'f0',D+2*3600e3,3.6052,2299,id+'2')],funding:[],images:[],chartNotes:[box('b0',2330,500),box('b1',2315.5,1000)],...x});
  state.trades=[mk('es',{}),mk('eu',{stop0:2320,stop:2320,initialRisk:34.25,riskPlan:{price:2310.5,qty:3.6052,stop:2320,target:2290,risk:34.25}}),
   mk('eh',{stop0:2316,stop:2316,stop0Auto:true,stop0AutoVal:2316,stopHistory:[{at:1,from:null,to:2316,src:'hl'}]})];
  await persist();setPage('dashboard');renderAll();});
 await page.waitForTimeout(500);
 const T=id=>page.evaluate(id=>{const t=state.trades.find(x=>x.id===id),c=calcTrade(t),k=(v92Checks(t).find(x=>x.k==='rr')||{});return {stop0:t.stop0,src:t.stop0Src||null,stop:t.stop,target:n(t.riskPlan&&t.riskPlan.target),r1:n(t.initialRisk)>0?Number(n(t.initialRisk).toFixed(4)):null,plan:t.plan0?n(t.plan0.rr):null,
   R:Number.isFinite(c.R)?Number(c.R.toFixed(3)):null,planRR:v71PlanRR(t),rrOk:!!k.ok};},id);
 const rr={};
 rr.pre=await T('es');
 await page.evaluate(()=>openTrade('es','review'));await page.waitForTimeout(2200);
 rr.open=await T('es');
 rr.text=await page.evaluate(()=>{const d=$('tradeDialog').textContent;return {noPlan:/최초 손절 목표가 있어야/.test(d),r1:/1R/.test(d)};});
 // 상자 끌기(SL 2316.5) = v43Up과 같은 순서: v40Save → v43Apply
 const drag=sl=>page.evaluate(async sl=>{const t=state.trades.find(x=>x.id==='es');const x={...t.chartNotes.find(y=>y.id==='b1'),sl,at:Date.now()};await v40Save(t,l=>l.map(y=>y.id===x.id?x:y),'');const cur=state.trades.find(y=>y.id==='es');await v43Apply(cur,x);},sl);
 await drag(2316.5);await page.waitForTimeout(1500);rr.drag=await T('es');
 // 최초 손절을 손으로 고침 → 그 뒤 상자를 끌어도 안 따라감
 await page.evaluate(async()=>{const t=state.trades.find(x=>x.id==='es');t.stop0=2318;touch(t);await persist();});
 await drag(2317);await page.waitForTimeout(1500);rr.manual=await T('es');
 // 사용자 입력 / HL 출처는 그대로
 await page.evaluate(()=>{$('tradeDialog').close();openTrade('eu','review');});await page.waitForTimeout(1500);rr.user=await T('eu');
 await page.evaluate(()=>{$('tradeDialog').close();openTrade('eh','review');});await page.waitForTimeout(1500);rr.hl=await T('eh');
 await page.reload();await ready();await page.waitForTimeout(600);
 rr.reload={es:await T('es'),eu:await T('eu'),eh:await T('eh')};
 rr.dbg=await page.evaluate(()=>window.v103Debug&&window.v103Debug());
 rep.rr=rr;await ctx.close();}
 console.log(JSON.stringify(rep));await browser.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
