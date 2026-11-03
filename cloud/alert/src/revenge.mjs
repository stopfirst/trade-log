// trade-alert 2.11.0 (alert15) — 복수매매 차단 알림. 손실 한도 판정과 무관(판정 코드·상태를 읽지도 바꾸지도 않음).
//  정의(앱 v99와 같게): 기준 시각 = 손실 청산 체결 시각 → 다음 진입 체결 시각. 손실 = 그 거래(포지션 0→0 구간) 누적 실현손익
//   (HL: Σ(closedPnl − fee) + 구간 펀딩 = quick.mjs detectCloses, US: 키움 일별 종목별 실현손익 ust21640 pl_amt(수수료·세금 뺀 값)) < 0.
//  새 진입 = 포지션이 0에서 새로 열리거나 방향이 바뀌는 체결(같은 포지션에 추가 매수는 새 진입 아님). 시장(HL·US)별로 따로 봄.
//  하루 = HL UTC 00:00(KST 09:00) · US 미국 장 마감 16:00 ET 경계(손실 한도와 같은 날짜).
//  규칙
//   1) cooldown : 진입 전 마지막 손실 청산 체결 → 이번 진입 체결 ≤ REVENGE_COOLDOWN_MIN(기본 15)분(경계 포함, 앱 v99와 같음) → '[복수매매 의심]'
//   2) switch   : US, 같은 날(ET 거래일) 손절(손실 청산)한 종목들 중 진입 종목과 다른 종목이 있으면 → 별도 메시지 + [미리 정한 가격] [강해 보여서] 버튼
//   3) streak   : 같은 날 손실 청산 DAILY_LOSS_STREAK_MAX(기본 3)회(앱 v99와 같이 연속이 아니라 횟수) → '오늘은 여기까지' 1회, 그날 이후 진입마다 위반 경고
//   4) risk_up  : 손실 직후(쿨다운 안, 또는 같은 날 그 손실 청산 뒤 첫 진입) 진입의 위험이 직전 손실 거래보다 큼 → 강한 경고
//                 위험 = 스탑 기준 위험 금액(HL 열린 스탑 주문, 진입·직전 거래 둘 다 있을 때) · 없으면 명목 금액(최대 |포지션| × 가격)
//  같은 진입(포지션)은 한 번만, 재시작 뒤 재발송 없음(state2.json rv.sent에 보내기 전에 저장).
const MIN=60000,HOUR=3600000,DAY=86400000;
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null;};
const EPS=1e-9;
const near=(a,b)=>Math.abs(a-b)<=EPS*Math.max(1,Math.abs(a),Math.abs(b));
const isPerp=c=>typeof c==='string'&&!c.startsWith('@')&&!c.includes('/');
const r2=x=>Math.round(x*100)/100,r6=x=>Math.round(x*1e6)/1e6;

// ---- 설정 ---------------------------------------------------------------------------------
export function revengeConfig(env){
 const errors=[];
 const flag=(k,d)=>{const v=String(env[k]??'').trim().toLowerCase();if(!v)return d;if(['1','true','yes','on','켬'].includes(v))return true;if(['0','false','no','off','끔'].includes(v))return false;errors.push(`${k} (1 = 켬, 0 = 끔)`);return d;};
 const int=(k,d,min,max)=>{const v=String(env[k]??'').trim();if(!v)return d;const x=Number(v);if(!Number.isInteger(x)||x<min||x>max){errors.push(`${k} (${min}–${max} 정수)`);return d;}return x;};
 return {enabled:flag('REVENGE_ALERT',true),cooldownMin:int('REVENGE_COOLDOWN_MIN',15,0,240),streakMax:int('DAILY_LOSS_STREAK_MAX',3,0,20),
  usSwitch:flag('REVENGE_US_SWITCH',true),riskUp:flag('REVENGE_RISK_UP',true),minLoss:(()=>{const v=String(env.REVENGE_MIN_LOSS_USD??'').trim();if(!v)return 0;const x=Number(v);if(!Number.isFinite(x)||x<0||x>100000){errors.push('REVENGE_MIN_LOSS_USD (0–100000, 0 = 모든 손실)');return 0;}return x;})(),maxAgeMs:6*HOUR,errors};
}

// ---- HL: 원시 체결 → 포지션 구간(진입·청산) -----------------------------------------------------
/** 같은 종목 체결을 (time, tid) + 같은 시각 startPosition 사슬 순서로(quick.mjs detectCloses와 같은 순서) */
export function orderCoin(list){
 list.sort((a,b)=>a.t-b.t||(a.tid.length-b.tid.length)||(a.tid<b.tid?-1:a.tid>b.tid?1:0));
 const ordered=[];let pos=null;
 for(let i=0;i<list.length;){let j=i;while(j<list.length&&list[j].t===list[i].t)j++;const rest=list.slice(i,j);
  while(rest.length){let k=pos===null?-1:rest.findIndex(x=>near(x.st,pos));if(k<0)k=rest.findIndex(x=>!rest.some(o=>o!==x&&near(o.st+o.signed,x.st)));if(k<0)k=0;
   const x=rest.splice(k,1)[0];ordered.push(x);pos=x.st+x.signed;}
  i=j;}
 return ordered;
}
/** HL 무기한 체결 → 구간 목록. 구간 = 포지션이 0(또는 방향 전환)에서 열려 0(또는 다음 전환)까지.
 *  {market:'HL',symbol,dir,openTime,openKey(진입 체결 tid),openTid,closed,closeTime,closeKey,closeTid,maxNotional,avgEntry,pos,fills}
 *  조회 범위 밖에서 시작한 구간(첫 체결의 startPosition ≠ 0)은 openTime=null(진입 판단 안 함, 청산 손익은 detectCloses 값). */
export function hlSegments(rawFills){
 const by=new Map();
 for(const f of rawFills||[]){if(!f||!isPerp(f.coin))continue;const t=num(f.time),sz=num(f.sz),st=num(f.startPosition),px=num(f.px);if(!t||!(sz>0)||st===null||f.tid===undefined||f.tid===null)continue;
  if(!by.has(f.coin))by.set(f.coin,[]);by.get(f.coin).push({f,t,sz,st,px:px||0,signed:(f.side==='B'?1:-1)*sz,tid:String(f.tid),oid:f.oid??null});}
 const out=[];
 for(const [coin,list] of by){
  let seg=null;
  const open=(x,size,partial)=>({market:'HL',symbol:coin,dir:size>0?'long':'short',openTime:partial?null:x.t,openKey:partial?null:'hl:'+x.tid,openTid:partial?null:x.tid,openOid:partial?null:x.oid,
   closed:false,closeTime:null,closeKey:null,closeTid:null,maxNotional:0,cost:0,qty:0,pos:0,fills:0});
  const add=(s,x,end,openQty)=>{s.fills++;s.pos=end;if(openQty>0){s.cost+=openQty*x.px;s.qty+=openQty;}s.maxNotional=Math.max(s.maxNotional,Math.abs(end)*x.px);};
  for(const x of orderCoin(list)){
   const end=x.st+x.signed,scale=Math.max(1,Math.abs(x.st),x.sz),zs=Math.abs(x.st)<=EPS*scale,ze=Math.abs(end)<=EPS*scale;
   if(zs){if(ze)continue;seg=open(x,end,false);out.push(seg);add(seg,x,end,Math.abs(end));continue;}
   if(!seg){seg=open(x,x.st,true);out.push(seg);seg.maxNotional=Math.abs(x.st)*x.px;}
   const flip=!ze&&Math.sign(end)!==Math.sign(x.st);
   const grow=!flip&&Math.abs(end)>Math.abs(x.st)+EPS*scale;
   add(seg,x,ze||flip?0:end,grow?Math.abs(end)-Math.abs(x.st):0);
   if(ze||flip){seg.closed=true;seg.closeTime=x.t;seg.closeKey='hl:'+x.tid;seg.closeTid=x.tid;seg.pos=0;
    if(flip){seg=open(x,end,false);out.push(seg);add(seg,x,end,Math.abs(end));}else seg=null;}
  }
 }
 for(const s of out){s.avgEntry=s.qty>0?s.cost/s.qty:null;s.maxNotional=r2(s.maxNotional);delete s.cost;}
 return out.sort((a,b)=>(a.openTime??a.closeTime??0)-(b.openTime??b.closeTime??0));
}
/** HL 열린 스탑 주문(frontendOpenOrders) → 종목별 스탑 위험 금액 = |평균 진입 − 트리거| × |포지션| (열린 구간만) */
export function hlStopRisks(segments,openOrders){
 const out={};
 const stops=(Array.isArray(openOrders)?openOrders:[]).filter(o=>o&&o.isTrigger&&/stop/i.test(String(o.orderType||''))&&num(o.triggerPx)>0);
 for(const s of segments){if(s.closed||!s.openTime||!(Math.abs(s.pos)>0)||!(s.avgEntry>0))continue;
  const mine=stops.filter(o=>o.coin===s.symbol&&(s.dir==='long'?o.side==='A':o.side==='B'));if(!mine.length)continue;
  // 가장 가까운(위험이 가장 작은) 스탑 = 실제로 먼저 걸리는 스탑
  const risk=Math.min(...mine.map(o=>Math.abs(s.avgEntry-num(o.triggerPx))*Math.abs(s.pos)));
  if(Number.isFinite(risk))out[segKey(s)]=r2(risk);}
 return out;
}
export const segKey=s=>`${s.market}:${s.symbol}:${s.openTime}`;

/** HL 구간 + 청산 손익(detectCloses) → 공통 이벤트 */
export function hlEvents(rawFills,closesByTid,stopRisk={}){
 const segs=hlSegments(rawFills);
 const closes=[],entries=[];
 for(const s of segs){
  const k=segKey(s);
  if(s.openTime)entries.push({market:'HL',key:s.openKey,seg:k,symbol:s.symbol,dir:s.dir,time:s.openTime,notional:s.maxNotional,stopRisk:stopRisk[k]??null,tid:s.openTid,closed:s.closed});
  if(s.closed){const c=closesByTid.get(s.closeTid);if(!c)continue;closes.push({market:'HL',key:s.closeKey,seg:k,symbol:s.symbol,dir:s.dir,time:s.closeTime,pnl:c.pnl,partial:!s.openTime||c.partial,notional:s.maxNotional,stopRisk:stopRisk[k]??null,tid:s.closeTid,estimated:false});}
 }
 return {closes,entries};
}

// ---- US: 키움 주문(체결 수량·평균가) + 일별 종목별 실현손익 → 포지션 구간 ---------------------------
/** fills = sources.usFills(orders) (시간순), positions = 최신 스냅샷 보유 [{symbol,quantity}], realized = [{date(한국 조회일),symbol,quantity,averageBuyPrice,averageSellPrice,reportedNet,commission,tax}]
 *  시작 보유 = 지금 보유 − 기간 순매수(음수면 0). 매도 손익 = 그 조회일·종목 실현 행(같은 날 매도가 이 구간뿐이면 pl_amt 그대로, 아니면 수량 비례)
 *  실현 행이 없거나 수량이 모자라면 평균단가 추정(구간이 기간 안에서 0부터 시작했을 때만) · 그것도 안 되면 손익 모름(판단 안 함). */
export function usEvents(fills,positions,realized){
 const bySym=new Map();for(const f of fills||[]){const s=String(f.symbol||'').toUpperCase();if(!s)continue;if(!bySym.has(s))bySym.set(s,[]);bySym.get(s).push(f);}
 const held=new Map();for(const p of positions||[]){const s=String(p?.symbol||'').toUpperCase(),q=num(p?.quantity);if(s&&q!==null)held.set(s,(held.get(s)||0)+q);}
 const rz=new Map();for(const r of realized||[]){const s=String(r?.symbol||'').toUpperCase();if(!s||!r.date)continue;rz.set(r.date+'|'+s,{q:num(r.quantity)||0,avgBuy:num(r.averageBuyPrice),net:num(r.reportedNet),fee:(num(r.commission)||0)+(num(r.tax)||0)});}
 // 같은 조회일·종목의 매도 수량 합(실현 행과 대조)
 const soldBy=new Map();for(const f of fills||[])if(!f.entry){const k=f.orderDate+'|'+String(f.symbol||'').toUpperCase();soldBy.set(k,(soldBy.get(k)||0)+f.qty);}
 const closes=[],entries=[];
 for(const [sym,list] of bySym){
  list.sort((a,b)=>a.t-b.t);
  const net=list.reduce((a,f)=>a+(f.entry?f.qty:-f.qty),0);let pos=Math.max(0,(held.get(sym)||0)-net);
  let seg=pos>0?{openTime:null,cost:null,qty:pos,maxNotional:0,sells:[],key:null}:null;
  for(const f of list){
   if(f.entry){
    if(!(pos>EPS)){seg={openTime:f.t,key:'us:'+f.key,orderKey:f.key,orderDate:f.orderDate,cost:0,qty:0,maxNotional:0,sells:[]};
     entries.push({market:'US',key:seg.key,seg:`US:${sym}:${f.t}`,symbol:sym,dir:'long',time:f.t,notional:0,stopRisk:null,orderKey:f.key,orderDate:f.orderDate,_seg:seg});}
    pos+=f.qty;if(seg.cost!==null){seg.cost+=f.qty*(f.price||0);seg.qty+=f.qty;}seg.maxNotional=Math.max(seg.maxNotional,pos*(f.price||0));
   }else{
    if(!seg)seg={openTime:null,cost:null,qty:0,maxNotional:0,sells:[],key:null};
    seg.maxNotional=Math.max(seg.maxNotional,pos*(f.price||0));
    seg.sells.push(f);pos=Math.max(0,pos-f.qty);
    if(!(pos>EPS)){
     // 구간 손익
     let pnl=0,known=true,est=false;
     const dates=[...new Set(seg.sells.map(s=>s.orderDate+'|'+sym))];
     for(const dk of dates){const mine=seg.sells.filter(s=>s.orderDate+'|'+sym===dk),mq=mine.reduce((a,s)=>a+s.qty,0),row=rz.get(dk),all=soldBy.get(dk)||mq;
      if(row&&row.net!==null&&row.q+EPS>=all){
       if(near(mq,all))pnl+=row.net;
       else if(row.avgBuy!==null)pnl+=mine.reduce((a,s)=>a+s.qty*((s.price||0)-row.avgBuy),0)-row.fee*mq/(row.q||mq);
       else pnl+=row.net*mq/(row.q||mq);
      }else if(seg.cost!==null&&seg.qty>0){const avg=seg.cost/seg.qty;pnl+=mine.reduce((a,s)=>a+s.qty*((s.price||0)-avg),0);est=true;}
      else known=false;}
     const ent=entries.find(e=>e._seg===seg);if(ent){ent.notional=r2(seg.maxNotional);ent.closed=true;}
     if(known)closes.push({market:'US',key:'us:'+f.key,seg:seg.openTime?`US:${sym}:${seg.openTime}`:`US:${sym}:null`,symbol:sym,dir:'long',time:f.t,pnl:r2(pnl),partial:!seg.openTime,notional:r2(seg.maxNotional),stopRisk:null,orderKey:f.key,orderDate:f.orderDate,estimated:est});
     seg=null;
    }
   }
  }
  if(seg){const ent=entries.find(e=>e._seg===seg);if(ent)ent.notional=r2(seg.maxNotional);}
 }
 for(const e of entries)delete e._seg;
 return {closes:closes.sort((a,b)=>a.time-b.time),entries:entries.sort((a,b)=>a.time-b.time)};
}

// ---- 판정(순수) -----------------------------------------------------------------------------
/** closes·entries(한 시장) → 진입별 판정 + '오늘은 여기까지'(그날 손실 청산 N회 도달) 목록.
 *  dayOf(ms) = 그 시장의 하루 키. cfg = revengeConfig. */
export function judge({closes,entries},cfg,dayOf){
 // 앱 v99 v99Build와 같은 판정: L = 진입 전 마지막 '손실' 청산(이익 청산은 건너뜀), 쿨다운은 경계 포함(≤ N분),
 // 갈아타기 = 같은 날 손실 청산 중 진입 종목과 다른 종목이 있으면, N회 = 같은 날 진입 전 손실 청산 수 ≥ N(연속 아님),
 // 위험 증가 = (쿨다운 안 또는 같은 날 L 뒤 첫 진입) & 위험 > L의 위험.
 const minL=Number(cfg.minLoss)||0,loss=c=>c.pnl<-minL; // 기본 0 = 실현손익 < 0이면 손실(앱과 같음)
 closes=[...closes].sort((a,b)=>a.time-b.time);
 const losses=closes.filter(loss),cool=cfg.cooldownMin*MIN;
 // 하루별 손실 청산 N회 도달 시각 → '오늘은 여기까지'
 const stops=[],byDay=new Map();
 for(const c of losses){const d=dayOf(c.time);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(c);}
 if(cfg.streakMax>0)for(const [d,list] of byDay)if(list.length>=cfg.streakMax){const c=list[cfg.streakMax-1];stops.push({day:d,at:c.time,market:c.market,losses:list.slice(0,cfg.streakMax),close:c});}
 const out=[];const ents=[...entries].sort((a,b)=>a.time-b.time);
 for(const e of ents){
  const prior=losses.filter(c=>c.time<=e.time&&c.seg!==e.seg);
  const L=prior.at(-1)||null,d=dayOf(e.time),today=prior.filter(c=>dayOf(c.time)===d);
  const kinds=[];const info={day:d};
  const gap=L?e.time-L.time:null;
  const within=!!L&&cfg.cooldownMin>0&&gap<=cool;
  if(within)kinds.push('cooldown');
  if(e.market==='US'&&cfg.usSwitch){const sw=today.filter(c=>c.symbol!==e.symbol);if(sw.length){kinds.push('switch');info.switchFrom=sw.at(-1);info.switchSymbols=[...new Set(sw.map(c=>c.symbol))];}}
  if(cfg.streakMax>0&&today.length>=cfg.streakMax){kinds.push('streak');info.streakLosses=today.length;}
  if(cfg.riskUp&&L){
   const next=dayOf(L.time)===d&&!ents.some(o=>o!==e&&o.seg!==L.seg&&o.time>=L.time&&o.time<e.time);
   if(within||next){const stop=e.stopRisk>0&&L.stopRisk>0;
    const a=stop?e.stopRisk:e.notional,b=stop?L.stopRisk:L.notional;
    if(a>0&&b>0&&a>b*(1+1e-9)){kinds.push('risk_up');info.risk={basis:stop?'stop':'notional',now:a,prev:b,ratio:a/b};}}
  }
  if(kinds.length)out.push({entry:e,kinds,last:L,minutes:gap!==null?gap/MIN:null,...info});
 }
 return {alerts:out,stops};
}

// ---- 메시지 -------------------------------------------------------------------------------
const HEAD={US:'🇺🇸 미국주식',HL:'🟦 하이퍼리퀴드'};
const usd=x=>(x>0?'+':x<0?'−':'')+'$'+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=x=>'$'+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:x>=1000?0:2,maximumFractionDigits:x>=1000?0:2});
export const kst=ms=>{const d=new Date(ms+9*HOUR).toISOString();return d.slice(5,7)+'/'+d.slice(8,10)+' '+d.slice(11,16);};
const md=d=>String(d).slice(5).replace('-','/');
const DIRK={long:'롱',short:'숏'};
const side=e=>e.market==='US'?'매수':DIRK[e.dir]+' 진입';
const closeWord=c=>c.market==='US'?'매도':DIRK[c.dir];
const dayLabel=(m,d)=>m==='HL'?`UTC ${md(d)}`:`미국 ${md(d)} 거래일`;
export function resetText(m,d,cal){if(m==='HL'){const t=Date.parse(d+'T00:00:00Z')+DAY;return kst(t)+' KST';}try{return kst(cal.dayEnd(d))+' KST(미국 장 마감)';}catch{return '다음 거래일';}}
const riskLine=r=>`${r.basis==='stop'?'스탑 기준 위험':'명목 금액'} ${money(r.now)} > 직전 손실 거래 ${money(r.prev)} (×${r.ratio.toFixed(2)})`;
export function entryText(a,cfg,cal){
 const e=a.entry,c=a.last,k=a.kinds,cool=k.includes('cooldown'),st=k.includes('streak'),ru=k.includes('risk_up');
 const title=cool?(ru?'🚨🔥 [복수매매 의심 · 위험 증가]':'🚨 [복수매매 의심]'):st?(ru?'⛔🔥 [오늘은 여기까지 위반 · 위험 증가]':'⛔ [오늘은 여기까지 위반]'):'🔥 [손실 뒤 위험 증가]';
 const L=[`${title} ${HEAD[e.market]} · ${e.symbol} ${side(e)}`,''];
 if(c)L.push(`직전 ${c.pnl<0?'손실':'청산'}: ${c.symbol} ${closeWord(c)} ${usd(c.pnl)}${c.estimated?'(추정)':''} · 청산 ${kst(c.time)} KST`);
 L.push(`진입: ${kst(e.time)} KST${c?` · 경과 ${a.minutes<1?'1분 미만':Math.floor(a.minutes)+'분'}`:''}${cool?` (쿨다운 ${cfg.cooldownMin}분 안)`:''}`);
 if(st)L.push(`⛔ 오늘(${dayLabel(e.market,a.day)}) 손실 청산 ${a.streakLosses}회 뒤 진입 — 오늘은 여기까지 규칙 위반 · 리셋 ${resetText(e.market,a.day,cal)}`);
 if(ru){L.push('',`🔥 ${riskLine(a.risk)}`,'   잃은 걸 한 번에 되찾으려는 크기입니다. 지금 크기를 줄이거나 정리하세요.');}
 else if(cool)L.push('','손실 직후 감정이 남아 있을 때의 진입입니다. 계획에 있던 자리가 아니면 정리하고 쉬세요.');
 else if(st)L.push('','오늘은 더 진입하지 않기로 한 날입니다.');
 return L.join('\n');
}
export function stopText(s,cal){
 const L=[`🛑 [오늘은 여기까지] ${HEAD[s.market]} · 오늘 손실 청산 ${s.losses.length}회`,''];
 L.push(`오늘(${dayLabel(s.market,s.day)}): `+s.losses.map(c=>`${c.symbol} ${usd(c.pnl)}`).join(' · '));
 const sum=s.losses.reduce((a,c)=>a+c.pnl,0);L.push(`합계: ${usd(sum)} · 마지막 청산 ${kst(s.at)} KST`);
 L.push('',`오늘 남은 진입은 모두 규칙 위반으로 경고합니다. 리셋: ${resetText(s.market,s.day,cal)}`);
 return L.join('\n');
}
export const WHY={p:{code:'plan',label:'미리 정한 가격'},s:{code:'strong',label:'강해 보여서'}};
/** US 손절 후 다른 종목 진입 — 버튼 메시지 */
export function switchView(it){
 const f=it.from;
 const L=[`🔁 [손절 후 종목 갈아타기] ${HEAD.US} · ${it.symbol} 매수`,'',`오늘(${dayLabel('US',it.day)}) 손절: ${f.symbol} ${usd(f.pnl)}${f.estimated?'(추정)':''} · ${kst(f.time)} KST`,`진입: ${kst(it.time)} KST`];
 const kb=[];
 if(it.why){const w=Object.values(WHY).find(x=>x.code===it.why);L.push('',`기록: ${w?.label||it.why}`+(it.why==='strong'?' — 10월에 반복된 패턴(손절 뒤 \'강해 보여서\' 갈아타기)입니다. 계획에 없던 진입이면 정리를 검토하세요.':' — 계획대로라면 스탑을 지키세요.'));
  if(it.saved===false)L.push('저장 재시도 중 — 다음 확인 때 다시 저장합니다.');}
 else{L.push('','이 진입, 왜 들어갔나요?');kb.push([{text:WHY.p.label,callback_data:`rv|${it.id}|p`},{text:WHY.s.label,callback_data:`rv|${it.id}|s`}]);}
 return {text:L.join('\n'),reply_markup:{inline_keyboard:kb}};
}

// ---- 짧은 id(callback_data ≤ 64바이트) ---------------------------------------------------------
export function shortId(ref){let h1=0x811c9dc5,h2=0x01000193;for(let i=0;i<ref.length;i++){const c=ref.charCodeAt(i);h1=Math.imul(h1^c,16777619)>>>0;h2=Math.imul(h2+c,2246822519)>>>0;}return (h1.toString(36)+h2.toString(36)).slice(0,12);}

// ---- 서버 기록(alert15.sql revenge_push) 항목 ---------------------------------------------------
export function alertItem(a,{now}){
 const e=a.entry,c=a.last;
 return {ref:'rv:'+e.key,market:e.market==='US'?'us':'hl',kinds:a.kinds,symbol:e.symbol,direction:e.dir,entry_key:e.market==='HL'?String(e.tid):String(e.orderKey),entry_date:e.orderDate||null,entry_at:e.time,
  prev_symbol:c?.symbol??null,prev_key:c?(c.market==='HL'?String(c.tid):String(c.orderKey)):null,prev_pnl:c?r2(c.pnl):null,prev_close_at:c?.time??null,minutes:a.minutes!==null&&a.minutes!==undefined?Math.round(a.minutes*10)/10:null,
  day:a.day,detail:{risk:a.risk||null,streakLosses:a.streakLosses||null,switchFrom:a.switchFrom?{symbol:a.switchFrom.symbol,pnl:r2(a.switchFrom.pnl),at:a.switchFrom.time,symbols:a.switchSymbols||[a.switchFrom.symbol]}:null,estimated:!!c?.estimated,notional:e.notional||null,stopRisk:e.stopRisk||null},sent_at:now};
}
export function stopItem(s,{now}){return {ref:`rv:stop:${s.market==='US'?'us':'hl'}:${s.day}`,market:s.market==='US'?'us':'hl',kinds:['stop_day'],symbol:s.close.symbol,direction:s.close.dir,entry_key:null,entry_date:null,entry_at:null,
 prev_symbol:s.close.symbol,prev_key:s.close.market==='HL'?String(s.close.tid):String(s.close.orderKey),prev_pnl:r2(s.close.pnl),prev_close_at:s.at,minutes:null,day:s.day,
 detail:{losses:s.losses.map(c=>({symbol:c.symbol,pnl:r2(c.pnl),at:c.time}))},sent_at:now};}

// ---- 서비스 안 처리기 ------------------------------------------------------------------------
export class Revenge{
 /** d: {cfg, tg, rpc, token, chat, log, now, state:()=>S, save:()=>Promise, cal:{US,HL}} */
 constructor(d){Object.assign(this,d);this.sql='unknown';this.sqlAt=0;this.warned={};}
 get S(){const S=this.state();if(!S.rv||typeof S.rv!=='object')S.rv={since:this.now(),sent:{},items:{},pending:[],outbox:[],stopRisk:{}};
  const R=S.rv;R.sent=R.sent||{};R.items=R.items||{};R.pending=R.pending||[];R.outbox=R.outbox||[];R.stopRisk=R.stopRisk||{};if(!R.since)R.since=this.now();return R;}
 warnOnce(k,m){if(this.warned[k])return;this.warned[k]=1;this.log('WARN',m);}
 dayOf(m){return m==='HL'?ms=>new Date(ms).toISOString().slice(0,10):ms=>this.cal.US.dayOf(ms);}
 /** HL 스탑 위험 기록(열린 구간마다 최대값 유지) */
 noteStops(map){const R=this.S;for(const [k,v] of Object.entries(map||{}))if(v>0)R.stopRisk[k]=Math.max(R.stopRisk[k]||0,v);}
 /** check() 끝에서 호출. inputs = {HL:{closes,entries}, US:{closes,entries}} (없는 시장은 생략) */
 async afterCheck(inputs,t=this.now()){
  const R=this.S,cfg=this.cfg;let n=0;
  for(const [k,v] of Object.entries(R.sent))if(v<t-14*DAY)delete R.sent[k];
  for(const [k,it] of Object.entries(R.items))if(t-(it.time||0)>7*DAY)delete R.items[k];
  const keepSegs=new Set();for(const m of Object.keys(inputs||{}))for(const e of inputs[m]?.entries||[])keepSegs.add(e.seg);
  for(const k of Object.keys(R.stopRisk))if(!keepSegs.has(k)){const tt=Number(k.split(':').at(-1));if(!(tt>t-3*DAY))delete R.stopRisk[k];}
  await this.flushOutbox(t);await this.flushPending();
  const fresh=x=>x>=R.since&&t-x<=cfg.maxAgeMs;
  for(const m of ['HL','US']){const inp=inputs?.[m];if(!inp)continue;
   const j=judge(inp,cfg,this.dayOf(m));
   for(const s of j.stops){const key=`stop:${m}:${s.day}`;if(R.sent[key]||!fresh(s.at))continue;R.sent[key]=t;await this.save();
    await this.sendText(key,stopText(s,this.cal.US),t);R.pending.push(stopItem(s,{now:t}));n++;
    this.log('INFO',`오늘은 여기까지: ${m} ${s.day} 손실 청산 ${s.losses.length}회`);}
   for(const a of j.alerts){const e=a.entry;if(!fresh(e.time))continue;
    const main=a.kinds.filter(x=>x!=='switch'),key='entry:'+e.key,skey='switch:'+e.key;
    if(main.length&&!R.sent[key]){R.sent[key]=t;await this.save();await this.sendText(key,entryText({...a,kinds:main},cfg,this.cal.US),t);n++;
     this.log('INFO',`복수매매 경고: ${m} ${e.symbol} ${main.join(',')}`);}
    if(a.kinds.includes('switch')&&!R.sent[skey]){R.sent[skey]=t;await this.save();n++;
     const id=shortId('rv:'+e.key),it={id,ref:'rv:'+e.key,symbol:e.symbol,time:e.time,day:a.day,from:{symbol:a.switchFrom.symbol,pnl:a.switchFrom.pnl,time:a.switchFrom.time,estimated:!!a.switchFrom.estimated},why:null,saved:null,msgId:null};
     R.items[id]=it;
     try{const msg=await this.tg.api('sendMessage',{chat_id:this.chat,...switchView(it),disable_web_page_preview:true});it.msgId=msg?.message_id??null;}
     catch(e2){R.outbox.push({key:skey,at:t,id});this.log('ERROR','갈아타기 질문 전송 실패(다음 확인 때 다시): '+String(e2.message||e2).slice(0,80));}
     this.log('INFO',`손절 후 갈아타기: US ${a.switchFrom.symbol} → ${e.symbol}`);}
    if((main.length||a.kinds.includes('switch'))&&!R.pending.some(p=>p.ref==='rv:'+e.key)&&!R.sent['rec:'+e.key]){R.sent['rec:'+e.key]=t;R.pending.push(alertItem(a,{now:t}));}
   }
  }
  if(n)await this.save();
  await this.flushPending();
  return n;
 }
 async sendText(key,text,t){try{await this.tg.send(text);}catch(e){this.S.outbox.push({key,at:t,text});this.log('ERROR','복수매매 알림 전송 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}}
 async flushOutbox(t){const R=this.S;if(!R.outbox.length)return;const keep=[];
  for(const o of R.outbox){if(t-o.at>2*HOUR)continue;
   try{if(o.text)await this.tg.send(o.text);else{const it=R.items[o.id];if(it){const msg=await this.tg.api('sendMessage',{chat_id:this.chat,...switchView(it),disable_web_page_preview:true});it.msgId=msg?.message_id??null;}}}
   catch{keep.push(o);}}
  R.outbox=keep;await this.save();}
 async probe(){const t=this.now();if(this.sql==='ok'||(this.sql==='missing'&&t-this.sqlAt<HOUR))return this.sql==='ok';
  try{await this.rpc.call('revenge_push',{p_token:this.token,p_payload:{items:[]}});if(this.sql!=='ok')this.log('INFO','alert15.sql 확인 → 복수매매 경고·버튼 답을 Supabase revenge_alerts에 기록합니다.');this.sql='ok';}
  catch(e){const c=String(e.message||e);if(/ALERT15_SQL_NOT_INSTALLED/.test(c)){this.sql='missing';this.warnOnce('sql','alert15.sql이 아직 없습니다 → 복수매매 경고는 텔레그램으로만 보내고 기록은 이 서버에만 둡니다(설치하면 밀린 기록을 올림).');}
   else this.log('WARN','복수매매 기록 저장소 확인 실패: '+c.slice(0,80));}
  this.sqlAt=t;return this.sql==='ok';}
 async flushPending(){const R=this.S;if(!R.pending.length)return;if(!(await this.probe())){R.pending=R.pending.slice(-200);return;}
  const batch=R.pending.slice(0,50),strip=({answerOnly,...x})=>x;
  try{await this.rpc.call('revenge_push',{p_token:this.token,p_payload:{items:batch.filter(x=>!x.answerOnly),answers:batch.filter(x=>x.answerOnly).map(strip)}});R.pending=R.pending.slice(batch.length);await this.save();}
  catch(e){this.log('WARN','복수매매 기록 저장 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}}
 async answer(cq,text){try{await this.tg.api('answerCallbackQuery',{callback_query_id:cq.id,...(text?{text}:{})});}catch{}}
 /** 버튼 응답(callback_data 'rv|<id>|p|s') */
 async handle(cq){
  const chat=String(cq?.message?.chat?.id??'');
  if(chat!==String(this.chat)){await this.answer(cq,'이 대화방에서는 사용할 수 없습니다');return 'ignored';}
  const m=/^rv\|([a-z0-9]{1,16})\|(p|s)$/.exec(String(cq.data||''));const it=m&&this.S.items[m[1]];
  if(!it){await this.answer(cq,'지난 질문입니다');return 'unknown';}
  if(it.why){await this.answer(cq,'이미 기록했습니다');return 'done';}
  if(cq.message?.message_id!=null)it.msgId=cq.message.message_id;
  const w=WHY[m[2]];it.why=w.code;it.whyAt=this.now();it.saved=false;
  const item={ref:it.ref,market:'us',why:w.code,why_label:w.label,why_at:it.whyAt};
  let toast='기록했습니다: '+w.label;
  if(await this.probe()){try{await this.rpc.call('revenge_push',{p_token:this.token,p_payload:{items:[],answers:[item]}});it.saved=true;}catch(e){toast='저장 재시도 예정';this.log('WARN','갈아타기 답 저장 실패: '+String(e.message||e).slice(0,80));}}
  else{it.saved=true;it.localOnly=true;} // alert15.sql 없음: 이 서버(state2.json)에만 — 설치되면 아래 대기열로 올라감
  if(!it.saved||it.localOnly)this.S.pending.push({...item,answerOnly:true});
  await this.answer(cq,toast);
  if(it.msgId!=null){try{await this.tg.api('editMessageText',{chat_id:this.chat,message_id:it.msgId,...switchView(it),disable_web_page_preview:true});}catch(e){if(!/not modified/i.test(String(e.message||e)))this.log('WARN','갈아타기 메시지 수정 실패: '+String(e.message||e).slice(0,80));}}
  await this.save();return m[2];
 }
}

// ---- 드라이런 출력 ---------------------------------------------------------------------------
export function dryReport(results,cfg,cal,{from,to}){
 const L=[`복수매매 드라이런 (보내지 않음 · 저장 안 함) · ${from} ~ ${to} · 쿨다운 ${cfg.cooldownMin}분 · 하루 손실 ${cfg.streakMax?cfg.streakMax+'회':'끔'} · US 갈아타기 ${cfg.usSwitch?'켬':'끔'} · 위험 증가 ${cfg.riskUp?'켬':'끔'}`];
 const cnt={cooldown:0,switch:0,streak:0,risk_up:0,stop_day:0};
 for(const r of results){
  L.push('',`${HEAD[r.market]} · 청산 ${r.closes} (손실 ${r.losses}) · 새 진입 ${r.entries}${r.note?' · '+r.note:''}`);
  for(const s of r.stops){cnt.stop_day++;L.push(`  🛑 ${s.day} 손실 청산 ${s.losses.length}회 도달 ${kst(s.at)} KST: `+s.losses.map(c=>`${c.symbol} ${usd(c.pnl)}`).join(' · '));}
  for(const a of r.alerts){for(const k of a.kinds)cnt[k]++;const e=a.entry,c=a.last;
   L.push(`  ${kst(e.time)} KST ${e.symbol} ${side(e)} ← [${a.kinds.map(k=>({cooldown:'쿨다운',switch:'갈아타기',streak:'손실 N회 뒤',risk_up:'위험 증가'})[k]).join('·')}]`+(c?` 직전 ${c.symbol} ${usd(c.pnl)}${c.estimated?'(추정)':''} ${a.minutes<1?'<1':Math.floor(a.minutes)}분 전`:'')+(a.risk?` · ${a.risk.basis==='stop'?'스탑위험':'명목'} ${money(a.risk.now)} vs ${money(a.risk.prev)}`:''));}
  if(!r.alerts.length&&!r.stops.length)L.push('  (해당 없음)');
  r.msgs=r.alerts.filter(a=>a.kinds.some(k=>k!=='switch')).length+r.alerts.filter(a=>a.kinds.includes('switch')).length+r.stops.length;
 }
 L.push('',`보냈을 텔레그램 메시지: ${results.reduce((a,r)=>a+r.msgs,0)}건 (`+results.map(r=>`${r.market} ${r.msgs}`).join(' · ')+`) · 경고 대상 진입 ${results.reduce((a,r)=>a+r.alerts.length,0)}건${cfg.minLoss>0?` · 손실 기준 −$${cfg.minLoss} 초과만`:''}`);
 L.push(`종류별(한 진입에 여러 개 가능): 쿨다운 ${cnt.cooldown} · 갈아타기 ${cnt.switch} · 손실 N회 뒤 진입 ${cnt.streak} · 위험 증가 ${cnt.risk_up} · 오늘은 여기까지 ${cnt.stop_day}일`);
 return {text:L.join('\n'),counts:cnt};
}
export {r6};
