// alert3 손실한도 판정 v1.3 — 일일 손실 한도의 분자·분모 (순수 함수, I/O 없음). 앱 v28과 같은 기준:
//  분자 = 오늘 실현손익
//    HL : UTC 날짜(00:00 UTC = 09:00 KST 경계)의 무기한 체결 Σ(closedPnl − fee) + 펀딩 Σ(delta.usdc)
//         (앱 원장: 진입 수수료는 진입일, 청산 = 수량×(가격−평균단가)−수수료, 펀딩은 정산일 — HL closedPnl과 같은 값)
//         데이터 = 서버가 읽는 HL 공개 API + Supabase hl_fills/hl_funding(앱이 읽는 수집 테이블)를 tid·(time,coin)로 합침.
//    US : 키움 일별 실현손익 ust21640 reportedTotal(kw_snapshots, 앱 KJ 일별 기록과 같은 값).
//         서버 거래일 D(미국 장 마감 16:00 ET 경계)의 값 = 키움 조회일 D(한국 날짜 라벨) 행.
//  분모 = acct_snapshots 직전 마감(키 < 오늘 키, 7일 이내, 값 > 0; 마지막 키 값이 0 이하이면 폴백 — 앱 v28PrevBefore와 동일)
//         HL 키 = UTC 날짜, US 키 = detail.etDate(없으면 captured_at의 미국 동부 날짜, 그것도 없으면 day − 1).
//         없으면 앱 acctBasis()와 같은 현재 기준액: HL BALANCE / US 키움 주식 평가 + USD 예수금 → 앱 설정 계좌 기준액.
//  한도 금액 = 분모 × 하루 한도 %, 도달 = 실현손익 ≤ −한도 금액.
import {addDays,etDate,etWall} from './calendar.mjs';
const DAY=86400000;
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null;};
const r6=x=>Math.round(x*1e6)/1e6;
const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export const utcDate=ms=>new Date(ms).toISOString().slice(0,10);
export const utcStart=d=>Date.parse(d+'T00:00:00Z');

// ---- HL ----------------------------------------------------------------------------------
const PERP_DIRS=['Open Long','Open Short','Close Long','Close Short','Long > Short','Short > Long']; // 앱 HLCloud normalizeFill과 같음
export function hlPerpFill(f){return !!f&&typeof f.coin==='string'&&!f.coin.startsWith('@')&&!f.coin.includes('/')&&PERP_DIRS.includes(f.dir)&&f.feeToken==='USDC'&&num(f.closedPnl)!==null&&num(f.fee)!==null&&num(f.time)!==null;}
/** API 원본 체결 + Supabase hl_fills 행 → tid 기준 하나로 */
export function mergeHlFills(...lists){const m=new Map();for(const l of lists)for(const f of l||[]){if(!f)continue;const k=f.tid!=null?'t:'+String(f.tid):'h:'+f.hash+':'+f.time;if(!m.has(k))m.set(k,f);}return [...m.values()];}
/** API userFunding({time,delta:{coin,usdc}}) + Supabase hl_funding({time,coin,usdc}) → (time,coin) 기준 하나로 */
export function mergeHlFunding(...lists){const m=new Map();for(const l of lists)for(const f of l||[]){if(!f)continue;const coin=f.coin??f.delta?.coin,usdc=f.usdc??f.delta?.usdc,t=num(f.time);if(t===null||typeof coin!=='string')continue;const k=t+':'+coin;if(!m.has(k))m.set(k,{time:t,coin,usdc:String(usdc)});}return [...m.values()];}
export function hlDayRealized(fills,funding,key){
 const from=utcStart(key),until=from+DAY;let trades=0,fees=0,n=0,fund=0,fn=0;
 for(const f of fills||[]){if(!hlPerpFill(f))continue;const t=num(f.time);if(t<from||t>=until)continue;trades+=num(f.closedPnl)-num(f.fee);fees+=num(f.fee);n++;}
 for(const f of funding||[]){const t=num(f.time),a=num(f.usdc);if(t===null||a===null||t<from||t>=until)continue;fund+=a;fn++;}
 return {key,from,until,pnl:r6(trades+fund),parts:{trades:r6(trades),funding:r6(fund),fees:r6(fees),fills:n,fundingCount:fn},source:'HL 체결 Σ(closedPnl−fee) + 펀딩 (UTC '+key.slice(5).replace('-','/')+')'};
}

// ---- US ----------------------------------------------------------------------------------
export function usDayRealized(kwDays,day,{from=null,until=null}={}){
 const d=(kwDays||[]).filter(x=>x&&x.date===day).sort((a,b)=>(num(b.as_of)||0)-(num(a.as_of)||0))[0];
 const total=d?num(d.total):null;
 return {key:day,from,until,pnl:total===null?0:r6(total),parts:{rows:d?num(d.count)??0:0,asOf:d?num(d.as_of):null,reported:total!==null},source:d&&total!==null?'키움 일별 실현손익 ust21640 ('+day.slice(5).replace('-','/')+')':'키움 일별 실현손익 없음 → 0'};
}

// ---- 분모 ---------------------------------------------------------------------------------
export function snapKey(r,market){
 if(market==='HL')return r.day;
 if(dateOK(r.etDate))return r.etDate;
 const ms=num(r.captured_at);if(ms&&ms>0)return etDate(ms);
 return dateOK(r.day)?addDays(r.day,-1):null;
}
/** acct rows(risk_day_data.acct) → {key: {key,day,value,source,capturedAt}} (앱 v17Load: source close|approx, US는 같은 키면 day가 늦은 것) */
export function closeRows(acct,market){
 const mk=market==='HL'?'hl':'us',out={};
 for(const r of acct||[]){if(!r||r.market!==mk||!dateOK(r.day)||!['close','approx'].includes(r.source))continue;const v=num(r.value);if(v===null)continue;
  const k=snapKey(r,market);if(!dateOK(k))continue;const old=out[k];if(!old||r.day>old.day)out[k]={key:k,day:r.day,value:v,source:r.source,capturedAt:num(r.captured_at)};}
 return out;
}
export function expectedPrev(k,market){if(market==='HL')return addDays(k,-1);let d=addDays(k,-1);while([0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))d=addDays(d,-1);return d;}
export function closeAt(key,market){if(market==='HL')return utcStart(addDays(key,1));try{return etWall(key,16);}catch{return utcStart(addDays(key,1));}}
/** 앱 v28PrevBefore(k0) */
export function prevClose(rows,k0,market){
 if(!dateOK(k0))return null;const min=addDays(k0,-7);
 const keys=Object.keys(rows||{}).filter(k=>k<k0&&k>=min).sort();if(!keys.length)return null;
 const key=keys.at(-1),r=rows[key],v=num(r?.value);if(!(v>0))return null;
 return {key,value:v,source:r.source,expected:key===expectedPrev(k0,market),closeAt:closeAt(key,market)};
}
/** 앱 v28Denom(): 직전 마감 → 현재 기준액(HL BALANCE / US 키움 총액) → 앱 설정 기준액 */
export function dayDenom({acct,k0,market,current=null,manual=null}){
 const p=prevClose(closeRows(acct,market),k0,market);
 if(p)return {value:p.value,mode:'close',key:p.key,expected:p.expected,source:p.source,closeAt:p.closeAt};
 const c=num(current);if(c>0)return {value:c,mode:'basis',key:null,source:market==='HL'?'HL BALANCE':'키움 주식 평가 + USD 예수금'};
 const m=num(manual);if(m>0)return {value:m,mode:'basis',key:null,source:'앱 설정 계좌 기준액'};
 return null;
}
