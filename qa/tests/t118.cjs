/* v118 HL 이체·입출금 반영 (모의 데이터, 가짜 주소 0x1111…·하위계정 0x2222…).
   시계 2026-10-31 12:00 KST = 03:00 UTC → HL 오늘 10-31, 어제 10-30, 그제 10-29.
   모의 원장(userNonFundingLedgerUpdates):
     10-29 10:00 spotTransfer PURR 100개 받음(usdcValue 20)        → 토큰 들어옴 +20
     10-30 05:00 send 나 → 하위계정 'Scalping' 500 USDC(spot→spot)   → 나감 −500
     10-30 06:00 deposit 1000                                        → 들어옴 +1000
     10-30 07:00 send 나 → 나(spot → 무기한) 300                      → 계좌 안 이동(영향 없음)
     10-31 01:00 send 나 → 하위계정 200                               → 나감 −200
     10-31 02:00 withdraw 50 (fee 1)                                  → 나감 −50
   마감: 10-29 29,000 · 10-30 30,000, 현재 29,000 (현물 없음).
   기대: 대시보드 전체 변동 = (29,000 − 30,000) − (−250) = −750 · −2.50% / 캘린더 10-30 전일 대비 = (30,000 − 29,000) − (+500) = +500 · +1.72%
         10-31(오늘) = −1,000 − (−250) = −750 · −2.50%. 페이지 크기 3으로 낮춰 쪽 넘김·중복 제거, 두 번째 받기는 증분(startTime>0), 상세 열림 중 다시 그리기 미룸. */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 const ME='0x1111111111111111111111111111111111111111',SUB='0x2222222222222222222222222222222222222222',T=s=>Date.parse(s);
 const L=[
  {time:T('2026-10-29T10:00:00Z'),hash:'0xa1',delta:{type:'spotTransfer',token:'PURR',amount:'100.0',usdcValue:'20.0',user:'0x3333333333333333333333333333333333333333',destination:ME,fee:'0.0',nativeTokenFee:'0.0',nonce:1,feeToken:''}},
  {time:T('2026-10-30T05:00:00Z'),hash:'0xa2',delta:{type:'send',user:ME,destination:SUB,sourceDex:'spot',destinationDex:'spot',token:'USDC',amount:'500.0',usdcValue:'500.0',fee:'0.0',nativeTokenFee:'0.0',nonce:2,feeToken:''}},
  {time:T('2026-10-30T06:00:00Z'),hash:'0xa3',delta:{type:'deposit',usdc:'1000.0'}},
  {time:T('2026-10-30T07:00:00Z'),hash:'0xa4',delta:{type:'send',user:ME,destination:ME,sourceDex:'spot',destinationDex:'',token:'USDC',amount:'300.0',usdcValue:'300.0',fee:'0.0',nativeTokenFee:'0.0',nonce:3,feeToken:''}},
  {time:T('2026-10-31T01:00:00Z'),hash:'0xa5',delta:{type:'send',user:ME,destination:SUB,sourceDex:'spot',destinationDex:'spot',token:'USDC',amount:'200.0',usdcValue:'200.0',fee:'0.0',nativeTokenFee:'0.0',nonce:4,feeToken:''}},
  {time:T('2026-10-31T02:00:00Z'),hash:'0xa6',delta:{type:'withdraw',usdc:'50.0',nonce:5,fee:'1.0'}},
  {time:T('2026-10-31T02:30:00Z'),hash:'0xa7',delta:{type:'liquidation',liquidatedNtlPos:'1',accountValue:'1',leverageType:'Cross',liquidatedPositions:[]}}];
 window.__q118=[];
 window.fetch=async(u,o={})=>{u=String(u);if(u.startsWith('https://api.hyperliquid.xyz')){const b=JSON.parse(o.body||'{}');
   if(b.type==='userNonFundingLedgerUpdates'){window.__q118.push({s:b.startTime,u:b.user});const P=(window.V118_PAGE||2000);return J(L.filter(x=>x.time>=b.startTime&&(!b.endTime||x.time<=b.endTime)).slice(0,P));}
   if(b.type==='subAccounts')return J([{name:'Scalping',subAccountUser:SUB,master:ME,clearinghouseState:{},spotState:{balances:[]}}]);
   if(b.type==='userFillsByTime'||b.type==='userFunding')return J([]);
   return J({},400);}
  return J({message:'not found'},404);};};
const chk=()=>{const W=document.documentElement.clientWidth,bad=[];
 document.querySelectorAll('#v118Day,#v118Day *,#v17Bal,#v17Bal *,#v12Hero .v27-total,#v12Hero .v27-total *').forEach(el=>{const r=el.getBoundingClientRect();if(!r.width)return;const host=el.closest('.card,.v12-tile')||document.body,hb=host.getBoundingClientRect();if(r.right>Math.min(W,hb.right)+0.5||r.left<Math.max(0,hb.left)-0.5)bad.push(String(el.className||el.id)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+Math.round(hb.right));});
 return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[]};
 const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);
  const A=await ctx.newPage();A.on('pageerror',e=>out.errors.push(e.message));await A.goto(URL0);await A.waitForTimeout(2500);
  const r={};
  r.load=await A.evaluate(async()=>{
   const ME='0x1111111111111111111111111111111111111111';
   v57Addr=()=>ME;V57.spot=null;window.V118_PAGE=3;V118_PAGE=3;
   const today=v17Today(),y=v17AddDays(today,-1),y2=v17AddDays(today,-2);
   v17Cache[calendarMonth]={rows:{[y]:{day:y,value:30000,source:'close',detail:{}},[y2]:{day:y2,value:29000,source:'close',detail:{}}},at:Date.now()};
   v17Current=function(){return {value:29000,note:'현재 BALANCE · 통합 USDC'};};
   /* 앱이 스스로 시작한 받기(열 때)가 끝나길 기다린 뒤 깨끗한 상태로 다시 */
   for(let i=0;i<40&&V118.busy;i++)await new Promise(r=>setTimeout(r,100));
   V118.addr='';V118.at=0;V118.tryAt=0;try{await v104IdbPut('v118:'+ME,null);}catch{}window.__q118=[];
   const ch=await v118Load('qa');const q1=window.__q118.slice();
   const d=v118Debug();
   return {today,y,y2,changed:ch,calls1:q1.map(x=>x.s),events:d.events,moves:d.moves,subs:d.subs,errMsg:d.err||''};});
  r.inc=await A.evaluate(async()=>{window.__q118=[];V118.subsAt=Date.now();await v118Load('qa2');const q=window.__q118.slice();return {calls:q.length,firstStart:q[0]&&q[0].s,positive:!!(q[0]&&q[0].s>0),events:v118Debug().events};});
  r.flow=await A.evaluate(()=>{const f=(a,b)=>{const x=v118Flow(v67Bound(a),b==null?null:v67Bound(b));return x&&{net:+x.net.toFixed(2),usdc:+x.usdc.toFixed(2),tok:+x.tok.toFixed(2),n:x.n};};
   return {d29:f('2026-10-28','2026-10-29'),d30:f('2026-10-29','2026-10-30'),today:f('2026-10-30',null),beforeCov:(()=>{const c=V118.cov;V118.cov={...c,start:Date.parse('2026-10-30T00:00:00Z')};const x=v118Flow(v67Bound('2026-10-28'),v67Bound('2026-10-29'));V118.cov=c;return x;})()};});
  /* 대시보드 */
  r.dash=await A.evaluate(()=>{setPage('dashboard');v12Hero();const hero=$('v12Hero');const tile=[...hero.querySelectorAll('.v12-tile')].find(t=>(t.querySelector(':scope>span')?.firstChild?.textContent||'').trim()==='오늘 실현손익');
   const tot=tile&&tile.querySelector('.v27-total');const m=v27Model(0);
   return {text:tot?tot.textContent.replace(/\s+/g,' ').trim():'',title:tot?tot.getAttribute('title'):'',change:m.total&&+m.total.change.toFixed(2),pct:m.total&&+m.total.pct.toFixed(2),raw:m.total&&m.total.v118&&+m.total.v118.raw.toFixed(2),
    aria:tile?tile.getAttribute('aria-label'):'',limTip:v28BasisTip(v28Denom(v17Today()))};});
  r.dashChk=await A.evaluate(chk);
  await A.screenshot({path:path.join(outDir,'w'+W+'-dash.png')}).catch(e=>{r.shotErr=String(e);});
  /* 캘린더: 어제(이체 있음) · 오늘 · 이체 없는 날 */
  r.cal=await A.evaluate(async()=>{const y=v17AddDays(v17Today(),-1);selectedCalendarDay=y;setPage('calendar');await new Promise(r=>setTimeout(r,300));
   const box=$('v118Day'),bal=$('v17Bal');
   return {has:!!box,text:box?box.textContent.replace(/\s+/g,' ').trim():'',rows:box?[...box.querySelectorAll('.v118-row')].map(li=>[li.querySelector('.v118-t').textContent,li.querySelector('.v118-k').textContent,li.querySelector('.v118-a').textContent,li.className.split(' ')[1]]):[],
    after:!!(box&&bal&&bal.nextElementSibling===box),bal:bal?bal.textContent.replace(/\s+/g,' ').trim():'',diffAttr:bal&&bal.querySelector('.v17-diff')?.dataset.v118||null};});
  r.calChk=await A.evaluate(chk);
  await A.evaluate(()=>{$('v118Day')?.scrollIntoView({block:'center'});});
  await A.screenshot({path:path.join(outDir,'w'+W+'-cal.png')}).catch(e=>{r.shotErr=String(e);});
  r.calToday=await A.evaluate(async()=>{selectedCalendarDay=v17Today();renderCalendar();await new Promise(r=>setTimeout(r,200));const box=$('v118Day'),bal=$('v17Bal');return {n:box?box.dataset.v118N:null,net:box?box.dataset.v118Net:null,bal:bal?bal.textContent.replace(/\s+/g,' ').trim():''};});
  r.calNone=await A.evaluate(async()=>{selectedCalendarDay='2026-10-20';renderCalendar();await new Promise(r=>setTimeout(r,200));return {has:!!$('v118Day')};});
  r.calTok=await A.evaluate(async()=>{selectedCalendarDay='2026-10-29';renderCalendar();await new Promise(r=>setTimeout(r,200));const box=$('v118Day');return box?box.textContent.replace(/\s+/g,' ').trim():'';});
  /* v117 규칙: 상세(대화상자) 열려 있으면 다시 그리기 미룸 */
  r.defer=await A.evaluate(async()=>{setPage('dashboard');let n=0;const b=v12Hero;v12Hero=function(...a){n++;return b.apply(this,a);};const d=$('tradeDialog');let opened=false;try{d.showModal();opened=d.open;}catch{}
   v118Repaint();const during=n,pend=!!V118.rp;try{d.close();}catch{}clearTimeout(V118.rp);V118.rp=0;v118Repaint();const after=n;v12Hero=b;return {opened,during,pend,after};});
  /* ?v118=0 같은 꺼짐: 보정 없음 */
  r.off=await A.evaluate(()=>{V118.on=false;const m=v27Model(0);V118.on=true;return m.total?+m.total.change.toFixed(2):null;});
  out['w'+W]=r;await ctx.close();}
 console.log(JSON.stringify(out));await browser.close();srv.close();})();
