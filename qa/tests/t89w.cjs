/* t89: 미보유(기간 중 전량 매도) 현물 페어 포함 확인. v37 visual QA (하네스 = shots-v36: real Chromium /tmp/chr + playwright-core, fetch 모의).
   NODE_PATH=/workspace/work/pgtest/node_modules LD_LIBRARY_PATH=/tmp/chr/root/usr/lib/aarch64-linux-gnu node qa/shots-v37.cjs github-pages/index.html screens/v37 v37
   장면: (a) HL 거래 상세 — 복기 탭(텔레그램 줄 + 자동 감지 상자 + 미리 체크) · 관리 탭(미니 차트: 진입·추가·청산·평균 진입·스탑·최초 스탑)
         (b) 대시보드 복기 대기 카드(자동 감지 칩 + 버튼) (c) 거래 목록 '텔레그램으로 복기' 뱃지 — 1440 / 390, 넘침 검사 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir,tag]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);const dir=path.dirname(htmlPath);
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];if(u.endsWith('/')||u.endsWith('index.html')){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(html);}const f=path.join(dir,path.basename(u));if(fs.existsSync(f)){r.writeHead(200);return r.end(fs.readFileSync(f));}r.writeHead(404);r.end();}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const B=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z');window.__B=B;
 const F=[{coin:'@2',px:'30',sz:'10',side:'B',time:B-5*3600e3,fee:'0.1',feeToken:'USDC',tid:1},
  {coin:'@1',px:'70000',sz:'0.2',side:'B',time:B+60e3,fee:'0.0002',feeToken:'UBTC',tid:2},
  {coin:'@2',px:'45',sz:'10',side:'A',time:B+120e3,fee:'0.2',feeToken:'USDC',tid:3},
  {coin:'ETH',px:'100',sz:'1',side:'B',time:B+180e3,fee:'0.05',feeToken:'USDC',tid:4,dir:'Open Long',closedPnl:'0'},
  {coin:'xyz:INTC',px:'20',sz:'5',side:'B',time:B+200e3,fee:'0.05',feeToken:'USDC',tid:5,dir:'Open Long',closedPnl:'0'},
  {coin:'@1',px:'70000',sz:'0.2',side:'B',time:B+60e3,fee:'0.0002',feeToken:'UBTC',tid:2}];/* 마지막 = 중복 tid */
 const P0={'@1':70000,'@2':40};
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');
  if(b.type==='userFillsByTime'){window.__nf=(window.__nf||0)+1;return J(F.filter(x=>x.time>=b.startTime&&(!b.endTime||x.time<=b.endTime)));}
  if(b.type==='spotMetaAndAssetCtxs')return J([{tokens:[{name:'USDC',index:0},{name:'UBTC',index:1},{name:'HYPE',index:2}],universe:[{name:'@1',tokens:[1,0],index:0},{name:'@2',tokens:[2,0],index:1}]},[{markPx:'71000'},{markPx:'46'}]]);
  if(b.type==='spotClearinghouseState')return J({balances:[]});
  if(b.type==='userFunding')return J([]);
  if(b.type==='candleSnapshot'){const iv={'1m':6e4,'1h':36e5,'1d':864e5}[b.req.interval]||36e5,out=[],p=P0[b.req.coin]||100;for(let t=Math.floor(b.req.startTime/iv)*iv;t<=b.req.endTime;t+=iv)out.push({t,o:String(p),c:String(p),h:String(p),l:String(p)});return J(out);}
  return J({},400);}
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
 const browser=await chromium.launch({args:['--no-sandbox']});
 const out={errors:[]};const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){
 const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);
 const A=await ctx.newPage();A.on('pageerror',e=>out.errors.push(e.message));await A.goto(URL0);await A.waitForTimeout(2500);
 await A.evaluate(seed);const r={W};
 r.res=await A.evaluate(async()=>{v57Addr=()=>'0xabc';const B=window.__B,y=v17AddDays(v17Today(),-1),R={};
  /* (1) 보유 UBTC 1 + 기간 중 HYPE 10 전량 매도 + perp/HIP-3 */
  V57.spot={addr:'0xabc',items:[{coin:'UBTC',pair:'@1',qty:1,px:71000,usd:71000}],usd:71000,miss:false,at:Date.now()};
  V62.v=null;V62.at=0;await v62Load(B);R.start=V62.v&&V62.v.start;R.parts=V62.v&&V62.v.parts.map(p=>p.coin+':'+(+p.q0.toFixed(6))+'@'+p.px0);
  V67.by.clear();V67.fail.clear();V67.want=new Set([y]);V67.sig=null;await v67Load();R.v67=V67.by.get(y);
  R.flow=v88Flow(B,null);R.spotChg=71000-R.start-R.flow;R.hypeOnly=10*(45-40);R.ubtc=1*(71000-70000)-0.0002*70000;
  R.line=(()=>{const d=document.createElement('div');d.innerHTML=v88Line(500,R.start,71000,B,null,'v27-total');return d.textContent;})();
  R.nSpotFills=V89.n;R.cacheFills=V89.f.size;
  /* (2) 보유 현물 0 (전부 판 상태) */
  V57.spot={addr:'0xabc',items:[],usd:0,miss:false,at:Date.now()};
  V62.v=null;V62.at=0;await v62Load(B);R.start0=V62.v&&V62.v.start;
  V67.by.clear();V67.fail.clear();V67.want=new Set([y]);V67.sig=null;await v67Get(y);await v67Load();R.v67_0=V67.by.get(y);
  R.sig0=v67Sig();
  /* (3) 레이아웃: 오늘 실현손익 카드 + 캘린더 상세 분리 줄 */
  setPage('dashboard');renderAll();await new Promise(r=>setTimeout(r,300));
  const hero=$('v12Hero');const tile=hero&&[...hero.querySelectorAll('.v12-tile')].find(t=>(t.querySelector(':scope>span')?.firstChild?.textContent||'').trim()==='오늘 실현손익');R.tile=!!tile;
  if(tile){tile.querySelectorAll('.v27-pct,.v27-total').forEach(e=>e.remove());const sm=tile.querySelector(':scope>small');sm.removeAttribute('data-v89');sm.className='';sm.textContent='매매 −22.80 · 펀딩 −63.54 · 44건 반영';
   const m={mode:'close',main:-0.17,prev:{key:y,value:51000,expected:true,source:'close'},basis:51000,denom:51000,dayPnl:-86.34,total:{change:779.96,pct:1.53,from:51000,cur:51779.96,spot:{start:V62.v.start,now:0,usdcFrom:50600,usdcCur:51779.96,parts:[]}}};
   tile.querySelector(':scope>b').insertAdjacentHTML('afterend',v27HTML(m));tile.classList.add('v27-has');v89Foot(tile);R.tileW=Math.round(tile.getBoundingClientRect().width);R.tileText=[...tile.querySelectorAll('.v89-g')].map(e=>e.innerText.replace(/\s+/g,' '));}
  v17Cache[calendarMonth]={rows:{[y]:{day:y,value:30000,source:'close',detail:{}},[v17AddDays(y,-1)]:{day:v17AddDays(y,-1),value:29000,source:'close',detail:{}}},at:Date.now()};
  v17Current=function(){return {value:30779.96,note:'현재 BALANCE · 통합 USDC'};};
  const cal=document.createElement('div');cal.id='t89cal';cal.style.cssText='width:'+(innerWidth<600?350:420)+'px;position:absolute;left:0;top:0;background:#fff';cal.innerHTML=v17HTML(v17Today());document.body.appendChild(cal);
  R.calText=[...cal.querySelectorAll('.v88-split')].map(e=>e.innerText.replace(/\s+/g,' '));
  const els=[...(tile?tile.querySelectorAll('.v89-g,.v89-g *,.v27-total,.v88-split,:scope>small'):[]),...cal.querySelectorAll('.v89-g,.v89-g *,.v88-split')];
  const box=tile?tile.getBoundingClientRect():null;
  R.trunc=els.filter(e=>{const cs=getComputedStyle(e);return e.scrollWidth>e.clientWidth+1&&cs.overflowX!=='visible'||cs.textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth||tile&&tile.contains(e)&&e.getBoundingClientRect().right>box.right+0.5;}).map(e=>e.className+':'+e.scrollWidth+'/'+e.clientWidth);
  R.ellipsisStyled=els.filter(e=>getComputedStyle(e).textOverflow==='ellipsis').length;R.checked=els.length;
 if(tile){tile.style.width='500px';tile.style.maxWidth='500px';tile.style.flex='0 0 500px';void tile.offsetWidth;const b5=tile.getBoundingClientRect();R.w500=Math.round(b5.width);const e5=[...tile.querySelectorAll('.v89-g,.v89-g *,.v27-total,.v88-split,:scope>small')];
  R.trunc500=e5.filter(e=>{const cs=getComputedStyle(e);return e.scrollWidth>e.clientWidth+1&&cs.overflowX!=='visible'||cs.textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth||e.getBoundingClientRect().right>b5.right+0.5;}).map(e=>e.className+':'+e.scrollWidth+'/'+e.clientWidth);R.text500=[...tile.querySelectorAll('.v89-g')].map(e=>e.innerText.replace(/\s+/g,' '));}

R.fills=window.__nf;R.ver=APP_VER;R.dv=document.documentElement.outerHTML.includes('data-v="v89-spotall"');return R;});
 try{await A.locator('#v12Hero .v89-has').first().screenshot({path:outDir+'/tile500-'+W+'.png'});await A.locator('#t89cal').screenshot({path:outDir+'/cal-'+W+'.png'});}catch(e){r.shotErr=e.message;}
 out['w'+W]=r;await ctx.close();}
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
