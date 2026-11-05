/* v122 단타 판정 수정 — 실데이터 형태 재현(모의 데이터, 가짜 주소 0x1111…). 시계 2026-10-31 12:00 KST = 03:00 UTC → HL 오늘 10-31.
   (1) 앱 수집 경로 그대로: HL 원시 체결(userFillsByTime 모양, xyz: HIP-3 종목, 같은 ms 부분 체결, 같은 종목 여러 왕복, Long > Short 뒤집기, 펀딩)
       → HLCloud.buildSnapshot → JournalSync.applySnapshot → normaliseTrade (hlcSync와 같은 순서). 수수료 0.
       SPCX#1 00:10:00(10+5, 같은 ms)→00:12:08 2.13분 단타 · SPCX#2 00:20→00:25(4)→00:30:29(6) 10.48분 단타 · TSLA 00:40→01:40 60분 스윙(01:00 펀딩 −0.5)
       GOOGL#1 01:50→01:56:43 −10 단타 · GOOGL#2 01:58→02:05 단타(손실 1분 뒤 진입 = 복수매매 의심 예외) · SOXL 롱 02:10→02:20 10분, 뒤집은 숏 02:20→02:28 8분 = 단타 2건
   (2) 수동 거래(시각 문자열, timestamp 없음): M2 ETH 왕복 2번(00:00→00:20, 01:30→01:50 = 가장 긴 20분, 전체 110분) → v122 단타(v121은 110분 스윙)
       M40 BTC 왕복 2번(00:00→00:40, 01:00→01:05) → 가장 긴 40분 스윙 · MNT SOL 날짜만(시각 없음) → 판정 안 함(v121과 같음, 회귀 확인)
   기대: 10-31 단타 7건(SPCX 2·GOOGL 2·SOXL 2·M2), 캘린더 날짜 클릭 → 카드 7건, v118 이체·입출금(10-31 send) 늦게 그려져도 카드가 그 아래,
         카드를 지워도 v118 다시 그리기에서 되살림, v121Debug('2026-10-31') 거래별 이유·버전, M2 배지 '왕복 2번'. PC 1440 · 모바일 390 */
const {chromium}=require('../lib/pw.cjs');const fs=require('fs'),path=require('path'),http=require('http');
const [,,htmlPath,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const html=fs.readFileSync(htmlPath);
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const ADDR='0x1111111111111111111111111111111111111111';
const T=s=>Date.parse('2026-10-31T'+s+'Z');
let tid=900000;const F=(coin,time,side,sz,px,start,dir)=>({coin,px:String(px),sz:String(sz),side,time,startPosition:String(start),dir,closedPnl:'0',hash:'0x'+'0'.repeat(64),oid:++tid+5000000,crossed:true,fee:'0',tid:++tid,feeToken:'USDC'});
const FILLS=[
 F('xyz:SPCX',T('00:10:00.000'),'B',10,100,0,'Open Long'),F('xyz:SPCX',T('00:10:00.000'),'B',5,100,10,'Open Long'),F('xyz:SPCX',T('00:12:08.000'),'A',15,101,15,'Close Long'),
 F('xyz:SPCX',T('00:20:00.000'),'B',10,100,0,'Open Long'),F('xyz:SPCX',T('00:25:00.000'),'A',4,103,10,'Close Long'),F('xyz:SPCX',T('00:30:29.000'),'A',6,103,6,'Close Long'),
 F('xyz:TSLA',T('00:40:00.000'),'B',10,100,0,'Open Long'),F('xyz:TSLA',T('01:40:00.000'),'A',10,100.5,10,'Close Long'),
 F('xyz:GOOGL',T('01:50:00.000'),'B',10,100,0,'Open Long'),F('xyz:GOOGL',T('01:56:43.000'),'A',10,99,10,'Close Long'),
 F('xyz:GOOGL',T('01:58:00.000'),'B',10,99,0,'Open Long'),F('xyz:GOOGL',T('02:05:00.000'),'A',10,100,10,'Close Long'),
 F('xyz:SOXL',T('02:10:00.000'),'B',5,100,0,'Open Long'),F('xyz:SOXL',T('02:20:00.000'),'A',10,101,5,'Long > Short'),F('xyz:SOXL',T('02:28:00.000'),'B',5,100.5,-5,'Close Short')];
const FUND=[{time:T('01:00:00.000'),hash:'0x'+'0'.repeat(64),delta:{type:'funding',coin:'xyz:TSLA',usdc:'-0.5',szi:'10',fundingRate:'0.00005',nSamples:null}}];
const LEDGER=[{time:T('01:02:00.000'),hash:'0x'+'1'.repeat(64),delta:{type:'send',user:ADDR,destination:'0x2222222222222222222222222222222222222222',token:'USDC',amount:'25',usdcValue:'25',fee:'0',nativeTokenFee:'0',nonce:1}}];
const init=(LED)=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out=[];
   switch(b.type){
    case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;
    case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'}]};break;
    case 'perpDexs':out=[null];break;
    case 'userNonFundingLedgerUpdates':out=(window.__qaLedger?LED:[]).filter(x=>x.time>=(b.startTime||0));break;
    case 'subAccounts':out=[];break;
    default:out=[];}
   return J(out);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}send(){}close(){this.readyState=3;setTimeout(()=>this.onclose&&this.onclose({code:1000}),0);}}
 FakeWS.CONNECTING=0;FakeWS.OPEN=1;FakeWS.CLOSING=2;FakeWS.CLOSED=3;window.WebSocket=FakeWS;};
const seed=async({fills,fund,addr})=>{const account=await HLCloud.accountId(addr);
 const snap=HLCloud.buildSnapshot(JournalSync,{account,fills,funding:fund,previous:null});
 const res=JournalSync.applySnapshot(state,snap);const next=res.state;next.trades=next.trades.map(normaliseTrade);Object.assign(state,next);
 const ev=(id,date,time,px)=>({id,date,time,shares:1,price:px,fee:0});
 const man=(id,name,E,X)=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:Date.parse('2026-10-31T00:00:00Z'),name,direction:'long',date:'2026-10-31',stop:null,stop0:null,initialRisk:null,riskR:1,setup:'미분류',leverage:2,marginMode:'cross',process:'unreviewed',review:'',violations:[],
  entries:E.map((x,i)=>ev(id+'e'+i,'2026-10-31',x[0],x[1])),fills:X.map((x,i)=>ev(id+'f'+i,'2026-10-31',x[0],x[1])),funding:[],images:[]});
 state.trades.push(man('M2','ETH',[['00:00:00',100],['01:30:00',100]],[['00:20:00',101],['01:50:00',101]]),
  man('M40','BTC',[['00:00:00',100],['01:00:00',100]],[['00:40:00',101],['01:05:00',101]]),
  man('MNT','SOL',[['',100]],[['',101]]));
 state.settings.v92From='2026-10-25';
 const lab={};for(const t of state.trades){if(!t.sync)continue;const e=t.entries[0];lab[t.id]=t.name.replace('xyz:','')+'@'+new Date(e.timestamp).toISOString().slice(11,16)+(t.direction==='short'?'S':'');}
 window.__lab=lab;V121.memo=null;renderAll();return {q:snap.quarantine.length,n:state.trades.length};};
const chk=(sel)=>{const W=document.documentElement.clientWidth,bad=[];
 document.querySelectorAll(sel).forEach(el=>{const r=el.getBoundingClientRect();if(!r.width||el.closest('[hidden]'))return;const host=el.closest('.card,.v121-cal')||document.body,hb=host.getBoundingClientRect();if(r.right>Math.min(W,hb.right)+0.5||r.left<Math.max(0,hb.left)-0.5)bad.push(String(el.className||el.id||el.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+'/'+Math.round(hb.right));});
 return {docScroll:document.documentElement.scrollWidth>W+1,bad};};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const out={errors:[]};
 const URL0='http://127.0.0.1:'+srv.address().port+'/?journal=hyperliquid';
 for(const W of [1440,390]){const w='w'+W,r={};out[w]=r;
  const ctx=await browser.newContext({viewport:{width:W,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul',...(W<500?{isMobile:true,hasTouch:true}:{})});await ctx.addInitScript(init,LEDGER);
  const A=await ctx.newPage();A.on('pageerror',e=>out.errors.push(w+' '+e.message));A.on('dialog',d=>{out.errors.push(w+' dialog '+d.message());d.dismiss();});
  await A.goto(URL0);await A.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await A.waitForTimeout(800);
  r.seed=await A.evaluate(seed,{fills:FILLS,fund:FUND,addr:ADDR});await A.waitForTimeout(200);
  r.dbg=await A.evaluate(()=>{const L=window.__lab,d0=v121Debug('2026-10-31'),d={...d0,trades:Array.isArray(d0.trades)?d0.trades:[],scalpDays:d0.scalpDays||{}},nm=id=>L[id]||id;
   return {ver:typeof d.ver==='string'&&/^v\d+/.test(d.ver),dataV:typeof d.dataV==='string'&&d.dataV.length>0,day:d.day,
    scalps:d.trades.filter(x=>x.scalp).map(x=>nm(x.id)).sort(),skip:d.trades.filter(x=>x.skip).map(x=>nm(x.id)).sort(),
    hold:Object.fromEntries(d.trades.map(x=>[nm(x.id),x.holdMin])),segs:Object.fromEntries(d.trades.filter(x=>x.segs>1).map(x=>[nm(x.id),x.segs])),
    span:Object.fromEntries(d.trades.filter(x=>x.segs>1).map(x=>[nm(x.id),x.spanMin])),
    why:Object.fromEntries(d.trades.filter(x=>['M2','M40','MNT'].includes(x.id)||/^(TSLA|GOOGL@01:58)/.test(nm(x.id))).map(x=>[nm(x.id),x.why])),
    days:d.scalpDays['2026-10-31'],legacy:d.scalps.filter(x=>x.day==='2026-10-31').map(x=>nm(x.id)).sort(),hasTrades:Array.isArray(d0.trades)};});
  /* 캘린더: 메뉴 → 날짜 클릭 (사용자 경로) */
  await A.evaluate(()=>{const b=document.querySelector('[data-page="calendar"]');b&&b.click();});await A.waitForTimeout(500);
  await A.evaluate(()=>{document.querySelector('[data-calendar-day="2026-10-31"]').click();});await A.waitForTimeout(400);
  const calState=()=>A.evaluate(()=>{const c=$('v121Cal'),host=$('calendarDayDetail');const kids=host?[...host.children].map(e=>e.id).filter(Boolean):[];
   return {has:!!c,inDetail:!!(c&&host&&host.contains(c)),n:c?c.querySelector('[data-v121-k="n"]').textContent:null,net:c?c.querySelector('[data-v121-k="net"]').textContent:null,
    exc:c?c.querySelectorAll('.v121-exc li').length:null,order:kids.filter(k=>['v17Bal','v118Day','v121Cal'].includes(k))};});
  r.cal=await calState();
  /* v118 이체·입출금이 늦게 도착 → 상자 아래 카드 */
  await A.evaluate(async()=>{window.__qaLedger=true;hlcStatus={address:'0x1111111111111111111111111111111111111111'};V118.busy=false;V118.at=0;V118.tryAt=0;await v118Load('calendar');});await A.waitForTimeout(300);
  r.cal118=await calState();
  /* 카드가 사라진 상태에서 v118 다시 그리기 → 되살림 */
  await A.evaluate(()=>{const c=$('v121Cal');if(c)c.remove();v118Repaint();});await A.waitForTimeout(200);
  r.calFix=await calState();r.calFixN=await A.evaluate(()=>typeof V122!=='undefined'&&V122.n.calFix>0);
  r.calChk=await A.evaluate(chk,'#v121Cal,#v121Cal *,#v118Day,#v118Day *');
  await A.screenshot({path:path.join(outDir,'t122-'+w+'-cal.png'),fullPage:false}).catch(e=>out.errors.push(w+' shot '+e.message));
  /* 배지 툴팁(여러 왕복) */
  r.badge=await A.evaluate(()=>{const t=state.trades.find(x=>x.id==='M2');const h=tickerHTML(t);const m=/title="([^"]*)"/.exec(h.slice(h.indexOf('v121-b')-20));return m?m[1].replace(/&[^;]+;/g,''):'';});
  await ctx.close();}
 out.done=true;console.log(JSON.stringify(out));await browser.close();srv.close();
})().catch(e=>{console.log(JSON.stringify({fatal:String(e&&e.stack||e)}));process.exit(1);});
