// alert2: 원천 데이터 → 판정 엔진 입력 변환 (순수 함수).
//  US(키움): 자산 = 주식 평가금액(ust21070 reportedSecuritiesValue) + USD 예수금(ust21160 summary.cash.usd)
//            = 앱 ACCOUNT BASIS, 장 마감 잔액(acct_snapshots)과 같은 정의. 시각 = 스냅샷 asOf.
//            주문 시각 = 주문일(한국 날짜) + reportedTime(한국시간)으로 해석.
//            입출금: 키움 API에 입출금 내역이 없어 "추정" — 연속 스냅샷 사이
//            예수금 변화 + 체결 매수대금 − 체결 매도대금 = 매매로 설명되지 않는 현금 변화.
//            |값| ≥ US_FLOW_MIN_USD(기본 $50)이면 입출금(환전·배당 포함)으로 보고 손익에서 제외.
//            그보다 작은 차이(수수료·반올림)는 손익에 그대로 둡니다.
//  HL: 자산 = BALANCE(앱과 같은 hl-balance.cjs 계산). 체결 = userFillsByTime(무기한만), 입출금 = userNonFundingLedgerUpdates.
import {addDays,kstWall} from './calendar.mjs';
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null;};

export function usEquity(latest,nowMs,staleMin=20){
 const s=latest?.summary,c=s?.cash;if(!s||s.currency!=='USD'||!c||c.apiId!=='ust21160'||c.currency!=='USD'||c.krwIncluded!==false)return null;
 const sec=num(s.reportedSecuritiesValue),cash=num(c.usd),t=num(latest.as_of);
 if(sec===null||sec<0||cash===null||!t)return null;
 const value=Math.round((sec+cash)*100)/100;if(!(value>0))return null;
 return {value,t,source:'키움 스냅샷',sec,cash,stale:nowMs-t>staleMin*60000};
}
export function orderTime(o){
 const d=o.orderDate,tm=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(o.time||''));
 if(typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&tm)return kstWall(d,Number(tm[1]),Number(tm[2]))+Number(tm[3]||0)*1000;
 return num(o.asOf);
}
const isBuy=s=>/매수|buy/i.test(String(s||'')),isSell=s=>/매도|sell/i.test(String(s||''));
export function usFills(orders){
 const out=[];const seen=new Set();
 for(const o of orders||[]){const qty=num(o.qty),price=num(o.price);if(!(qty>0)||!o.key||seen.has(o.key))continue;seen.add(o.key);
  const t=orderTime(o);if(!t)continue;const buy=isBuy(o.side);if(!buy&&!isSell(o.side))continue;
  out.push({key:String(o.key),t,symbol:String(o.symbol||''),entry:buy,side:buy?'buy':'sell',qty,price,orderDate:o.orderDate,desc:`${buy?'매수':'매도'} ${qty}주${price?' @ '+price:''}`});}
 return out.sort((a,b)=>a.t-b.t);
}
// 주문별 체결 수량 맵 (같은 key가 여러 날짜 행에 있으면 최대값)
export function filledMap(orders){const m={};for(const o of orders||[]){const q=num(o.qty),p=num(o.price);if(!o.key||!(q>0))continue;const k=String(o.key);if(!m[k]||q>m[k].q)m[k]={q,p:p||0,buy:isBuy(o.side),sell:isSell(o.side)};}return m;}
/** 직전 관측(prev: {asOf,cash,fills}) → 지금 관측. return {flow|null, obs} */
export function usImpliedFlow(prev,latest,orders,minUsd=50){
 const s=latest?.summary,c=s?.cash,asOf=num(latest?.as_of),cash=num(c?.usd);
 const fills=filledMap(orders);
 if(!asOf||cash===null)return {flow:null,obs:prev||null};
 const obs={asOf,cash,fills};
 if(!prev||!(asOf>prev.asOf))return {flow:null,obs:prev&&asOf<=prev.asOf?prev:obs};
 let buy=0,sell=0;
 for(const [k,f] of Object.entries(fills)){const before=prev.fills?.[k]?.q||0;const dq=f.q-before;if(dq<=0)continue;if(f.buy)buy+=dq*f.p;else if(f.sell)sell+=dq*f.p;}
 const F=Math.round(((cash-prev.cash)+buy-sell)*100)/100;
 const flow=Math.abs(F)>=minUsd?{ref:'us-implied:'+asOf,at:asOf,amount:F,kind:F>0?'입금 추정':'출금 추정',source:'us-implied',note:`예수금 ${(cash-prev.cash).toFixed(2)} · 매수 ${buy.toFixed(2)} · 매도 ${sell.toFixed(2)}`}:null;
 return {flow,obs};
}
// 키움 장 마감 잔액(acct_snapshots 'us', detail.etDate = 미국 마감일) → 거래일 시작 자산 fallback
export function usFallback(rows,cal){
 const byEt=new Map();for(const r of rows||[]){const v=num(r.value);if(!(v>0)||r.source!=='close')continue;const et=typeof r.etDate==='string'?r.etDate:null;if(et)byEt.set(et,{equity:v,at:num(r.captured_at)||null});}
 return day=>{const p=cal.prev(day);const r=byEt.get(p);return r?{equity:r.equity,at:r.at??cal.dayEnd(p),source:'키움 마감 잔액 '+p}:null;};
}

// ---- Hyperliquid ------------------------------------------------------------------------------
const isPerpCoin=c=>typeof c==='string'&&!c.startsWith('@')&&!c.includes('/');
export function hlFills(raw){
 const out=[];for(const f of raw||[]){if(!isPerpCoin(f?.coin))continue;const t=num(f.time),sz=num(f.sz),start=num(f.startPosition),px=num(f.px);if(!t||!(sz>0)||start===null)continue;
  const signed=(f.side==='B'?1:-1)*sz,end=start+signed;
  const entry=Math.abs(end)>Math.abs(start)+1e-12||(Math.sign(end)!==Math.sign(start)&&end!==0); // 신규·추가·방향 전환
  const dir=String(f.dir||'');const long=end>0||(end===0&&start<0);
  out.push({key:'hl:'+(f.tid??(f.hash+':'+t)),tid:f.tid??null,t,symbol:f.coin,entry,side:f.side==='B'?'buy':'sell',qty:sz,price:px,desc:`${dir||(f.side==='B'?'Buy':'Sell')} ${sz} @ ${px}`,long});}
 return out.sort((a,b)=>a.t-b.t);
}
// 비펀딩 원장 → 입출금·이체(BALANCE 밖으로 나가거나 들어온 USDC). 계정 안 이동(spot↔perp)은 0.
export function hlFlows(updates,address){
 const me=String(address||'').toLowerCase();const out=[];
 for(const u of updates||[]){const d=u?.delta||{},t=num(u?.time);if(!t||!d.type)continue;let a=0;const usdc=num(d.usdc)??0;
  const from=String(d.user||'').toLowerCase(),to=String(d.destination||'').toLowerCase();
  const dirSign=()=>from===me&&to!==me?-1:to===me&&from!==me?1:0;
  switch(d.type){
   case 'deposit':a=usdc;break;
   case 'withdraw':a=-(usdc+(num(d.fee)||0));break;
   case 'internalTransfer':case 'subAccountTransfer':{const s=dirSign();a=s*usdc-(s<0?(num(d.fee)||0):0);break;}
   case 'spotTransfer':case 'send':{if(String(d.token||'USDC')!=='USDC')break;const s=dirSign();a=s*(num(d.usdcValue)??num(d.amount)??0)-(s<0?(num(d.fee)||0):0);break;}
   case 'vaultDeposit':a=-usdc;break;
   case 'vaultWithdraw':a=num(d.netWithdrawnUsd)??usdc;break;
   case 'vaultCreate':a=-(usdc+(num(d.fee)||0));break;
   case 'rewardsClaim':a=num(d.amount)??0;break;
   default:a=0; // accountClassTransfer(spot↔perp), liquidation 등은 손익/내부 이동
  }
  if(Math.abs(a)>1e-9)out.push({ref:'hl-ledger:'+(u.hash||'')+':'+t+':'+d.type,at:t,amount:Math.round(a*1e6)/1e6,kind:d.type,source:'hl-ledger'});
 }
 return out;
}
// HL portfolio accountValueHistory로 시작 자산 근사(설치 이전 기간). BALANCE와의 차이는 최신점 기준 상수 보정.
export function hlPortfolioFallback(portfolio,cal,eqNow){
 const pts=[];for(const w of Array.isArray(portfolio)?portfolio:[]){if(!Array.isArray(w)||!['day','week','month','allTime'].includes(w[0]))continue;for(const p of w[1]?.accountValueHistory||[]){const t=num(p?.[0]),v=num(p?.[1]);if(t&&v!==null)pts.push([t,v]);}}
 pts.sort((a,b)=>a[0]-b[0]);if(!pts.length)return ()=>null;
 const latest=pts.at(-1),offset=eqNow&&eqNow.value>0?eqNow.value-latest[1]:0;
 return day=>{const ref=cal.dayStart(day);let best=null;for(const p of pts){const g=Math.abs(p[0]-ref);if(!best||g<best.g)best={p,g};}
  if(!best||best.g>6*3600000)return null;const v=best.p[1]+offset;return v>0?{equity:Math.round(v*100)/100,at:ref,source:'HL portfolio 근사'}:null;};
}
export function chainFallback(...fns){return (day,mode)=>{for(const f of fns){const r=f&&f(day,mode);if(r)return r;}return null;};}
export {addDays};
// v1.4 한도 기준 시각(ms)의 HL 자산 근사: portfolio accountValueHistory에서 가장 가까운 점(≤ maxGap), BALANCE와의 차이는 최신점 기준 상수 보정.
export function hlPortfolioAt(portfolio,ms,eqNow,maxGapMs=2*3600000){
 const pts=[];for(const w of Array.isArray(portfolio)?portfolio:[]){if(!Array.isArray(w)||!['day','week','month','allTime'].includes(w[0]))continue;for(const p of w[1]?.accountValueHistory||[]){const t=num(p?.[0]),v=num(p?.[1]);if(t&&v!==null)pts.push([t,v]);}}
 if(!pts.length)return null;pts.sort((a,b)=>a[0]-b[0]);const latest=pts.at(-1),offset=eqNow&&eqNow.value>0?eqNow.value-latest[1]:0;
 let best=null;for(const p of pts){const g=Math.abs(p[0]-ms);if(!best||g<best.g)best={p,g};}
 if(!best||best.g>maxGapMs)return null;const v=best.p[1]+offset;return v>0?{equity:Math.round(v*100)/100,at:best.p[0],source:'HL portfolio 근사'}:null;
}
