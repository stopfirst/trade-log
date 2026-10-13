// alert2 손실한도 판정 v1.2 — 판정 엔진 (순수 함수, I/O 없음). 시장(US/HL)마다 따로 호출합니다.
//
// 손익 기준 = 계좌 순자산(평가금액, 실현+미실현, 수수료·펀딩 포함) 변화 − 입출금·이체(cash flow).
//   pnl(기간) = 현재 자산 − 기간 시작 자산 − 기간 중 입출금 합,  % = pnl / 기간 시작 자산(고정 분모).
// 규칙(기본값, 모두 설정 가능):
//   하루 −3%  : 장중 확인(1–5분) → 도달 즉시 그날 끝까지 신규 진입 중단.
//   주 −6%    : 마감 판정 → 다음 거래일부터 그 주 끝까지 중단. 장중 도달 → 그날 끝까지 즉시 중단.
//   달 −10%   : 같은 방식으로 그 달 끝까지.
//   연속 손실 : 하루 자산 변화 ≤ −0.5%(입출금 제외)인 날만 손실일. 거래 없는 날은 건너뜀(연속을 끊지도 늘리지도 않음).
//               3일 연속 → 다음 1거래일 신규 진입 중단(설정 가능). 발동 후 연속 카운트는 새로 시작.
//   재시작    : 어떤 중단이든 끝난 뒤 첫 거래일은 1회 위험 % 절반(앱 포지션 계산기에 반영).
//   기간 고점 대비 하락폭 : 정보 표시만(중단 아님).
// 주문을 내거나 취소하지 않습니다. 알림 + Supabase 상태(앱 배너) + 위반 기록만.
import {untilText} from './calendar.mjs';

export const MARKET_LABEL={US:'미국주식',HL:'하이퍼리퀴드'};
const MODE_LABEL={day:'하루',week:'주간',month:'월간'};
const KEEP_DAYS=75;
const round=(x,d=6)=>Math.round(x*10**d)/10**d;
export const usd=(x,market='US')=>{const s=Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return market==='HL'?(x<0?'−':'')+s+' USDC':(x<0?'−':'')+'$'+s;};
export const signedUsd=(x,market)=>(x>0?'+':'')+usd(x,market);
export const pctText=x=>(x>0?'+':x<0?'−':'')+Math.abs(x).toFixed(2)+'%';

export function ruleLabel(rule,cfg){
 const L=cfg.limits;
 return {day:`하루 −${L.day}%`,week:`주간 −${L.week}% (마감 판정)`,'week-intraday':`주간 −${L.week}% 장중 도달`,month:`월간 −${L.month}% (마감 판정)`,'month-intraday':`월간 −${L.month}% 장중 도달`,streak:`${cfg.streakDays}일 연속 손실일`,manual:'수동 중단'}[rule]||rule;
}
export function emptyState(market){return {v:1,market,days:{},stops:[],sent:{},lastObs:null,peaks:{},streakResetAfter:null};}
export function flowSum(flows,a,b){let s=0;for(const f of flows||[])if(f.at>a&&f.at<=b)s+=Number(f.amount)||0;return round(s);}
const activeAt=(stops,t)=>stops.filter(s=>!s.cleared&&s.from<=t&&t<s.until);

function periodStart(st,cal,today,mode,fallbackStart){
 const first=cal.firstOf(today,mode),rec=st.days[first];
 if(rec&&rec.startEquity>0)return {equity:rec.startEquity,at:rec.startAt,source:rec.startSource,day:first};
 const fb=fallbackStart?fallbackStart(first,mode):null;
 if(fb&&fb.equity>0)return {equity:fb.equity,at:fb.at??cal.dayStart(first),source:fb.source,day:first};
 // 기간 중 가장 이른 기록(설치가 기간 중간이면 근사)
 const keys=Object.keys(st.days).filter(d=>cal.periodKey(d,mode)===cal.periodKey(today,mode)&&st.days[d].startEquity>0).sort();
 if(keys.length){const r=st.days[keys[0]];return {equity:r.startEquity,at:r.startAt,source:'partial:'+keys[0],day:keys[0]};}
 return null;
}
function measure(st,cal,today,mode,eq,flows,fallbackStart,limit){
 const ps=periodStart(st,cal,today,mode,fallbackStart);if(!ps)return {mode,key:cal.periodKey(today,mode),startEquity:null,pnl:null,pct:null,limit};
 const fl=flowSum(flows,ps.at,eq.t),pnl=round(eq.value-ps.equity-fl),pct=round(pnl/ps.equity*100,4);
 return {mode,key:cal.periodKey(today,mode),startEquity:ps.equity,startAt:ps.at,startSource:ps.source,startDay:ps.day,flows:fl,pnl,pct,limit,ratio:limit>0?Math.max(0,-pct)/limit:null,adj:round(eq.value-fl)};
}

// 하루 레코드 시작 자산 정하기: 경계 직전 관측(≤ maxGap) > fallback(키움 마감 잔액/HL portfolio) > 지금 관측(첫 관측)
function startFor(st,cal,day,eq,fallbackStart,cfg,now){
 const b=cal.dayStart(day);
 if(st.lastObs&&st.lastObs.t<b&&b-st.lastObs.t<=cfg.anchorMaxGapMs)return {equity:st.lastObs.equity,at:st.lastObs.t,source:'server'};
 const fb=fallbackStart?fallbackStart(day,'day'):null;if(fb&&fb.equity>0)return {equity:fb.equity,at:fb.at??b,source:fb.source};
 if(eq&&now>=b)return {equity:eq.value,at:eq.t,source:'first-seen'};
 return null;
}

/**
 * 한 번의 판정.
 * input: {now, cal, cfg, equity:{value,t,source,stale}|null, flows:[{ref,at,amount}], fills:[{key,t,symbol,entry,side,qty,price}],
 *         fallbackStart(day,mode)->{equity,at,source}|null, eventRefs:Set (이미 기록된 이벤트 ref)}
 * return: {state, messages:[{key,text}], events:[{ref,kind,rule,at,detail}], status}
 */
export function step(prev,input){
 const {now,cal,cfg}=input;const market=cal.market;const M=MARKET_LABEL[market];
 const st=structuredClone(prev||emptyState(market));st.market=market;
 const messages=[],events=[],refs=input.eventRefs||new Set();
 const flows=(input.flows||[]).filter(f=>Number.isFinite(f.at)&&Number.isFinite(Number(f.amount)));
 const fills=(input.fills||[]).filter(f=>Number.isFinite(f.t));
 const eq=input.equity&&input.equity.value>0&&Number.isFinite(input.equity.t)?input.equity:null;
 const today=cal.dayOf(now);
 const addStop=(s,text)=>{if(st.stops.some(x=>x.id===s.id)||refs.has(s.id))return false;if(!(s.until>now))return false;st.stops.push(s);
  events.push({ref:s.id,kind:'stop',rule:s.rule,at:now,detail:{from:s.from,until:s.until,reason:s.reason,pct:s.pct??null,label:ruleLabel(s.rule,cfg)}});messages.push({key:s.id,text});return true;};
 const stopText=(s,extra)=>`⛔ ${M} ${extra}\n→ 신규 진입 중단${s.from>now?' ('+untilText(s.from,market)+'부터)':''} ~ ${untilText(s.until,market)}까지\n주문 차단은 하지 않습니다. 앱 상단에 '거래 중단 중'이 표시됩니다.`;

 // 1) 하루 레코드(시작 자산) 만들기 + 직전 거래일 마감 처리 ------------------------------------------
 const finalized=[];
 if(!st.days[today]){
  const s=startFor(st,cal,today,eq,input.fallbackStart,cfg,now);
  if(s){
   st.days[today]={day:today,startEquity:s.equity,startAt:s.at,startSource:s.source,trades:0,entries:0};
   // 직전 기록들 마감
   const prevKeys=Object.keys(st.days).filter(d=>d<today&&!st.days[d].final).sort();
   for(const d of prevKeys){
    const rec=st.days[d];const nd=cal.next(d);
    let end=null;
    if(nd===today)end={equity:s.equity,at:s.at,source:s.source};
    else{const fb=input.fallbackStart?input.fallbackStart(nd,'day'):null;if(fb&&fb.equity>0){end={equity:fb.equity,at:fb.at??cal.dayStart(nd),source:fb.source};if(!st.days[nd])st.days[nd]={day:nd,startEquity:fb.equity,startAt:end.at,startSource:fb.source,trades:0,entries:0};}}
    rec.final=true;rec.finalAt=now;
    if(end&&rec.startEquity>0){const fl=flowSum(flows,rec.startAt,end.at);rec.endEquity=end.equity;rec.endAt=end.at;rec.endSource=end.source;rec.flows=fl;rec.pnl=round(end.equity-rec.startEquity-fl);rec.pct=round(rec.pnl/rec.startEquity*100,4);
     // 경계에서 한참 지난 첫 관측값이면 마감값이 아님 → 표시만 하고 마감 판정·연속 손실에서 제외
     if(end.source==='first-seen'&&end.at-cal.dayStart(nd)>cfg.anchorMaxGapMs){rec.unknown=true;rec.approxEnd=true;}}
    else rec.unknown=true;
    rec.trades=Math.max(rec.trades||0,fills.filter(f=>cal.dayOf(f.t)===d).length);
    rec.loss=!rec.unknown&&rec.trades>0&&rec.pct<=-cfg.streakLossPct+1e-9;
    finalized.push(rec);
   }
   // 중간 날짜를 fallback으로 만든 경우도 마감 대상에 들어가도록 한 번 더
   for(const d of Object.keys(st.days).filter(d=>d<today&&!st.days[d].final).sort()){
    const rec=st.days[d],nd=cal.next(d),nx=st.days[nd];rec.final=true;rec.finalAt=now;
    if(nx&&nx.startEquity>0&&rec.startEquity>0){const fl=flowSum(flows,rec.startAt,nx.startAt);Object.assign(rec,{endEquity:nx.startEquity,endAt:nx.startAt,endSource:nx.startSource,flows:fl,pnl:round(nx.startEquity-rec.startEquity-fl)});rec.pct=round(rec.pnl/rec.startEquity*100,4);}else rec.unknown=true;
    rec.trades=Math.max(rec.trades||0,fills.filter(f=>cal.dayOf(f.t)===d).length);rec.loss=!rec.unknown&&rec.trades>0&&rec.pct<=-cfg.streakLossPct+1e-9;finalized.push(rec);
   }
  }
 }
 const rec=st.days[today];
 if(rec){const dayFills=fills.filter(f=>cal.dayOf(f.t)===today);rec.trades=Math.max(rec.trades||0,dayFills.length);rec.entries=Math.max(rec.entries||0,dayFills.filter(f=>f.entry).length);}

 // 2) 마감 판정(주·월 공식 판정, 연속 손실) — 방금 마감된 "직전 거래일"에 대해서만 --------------------------
 for(const fr of finalized.filter(r=>cal.next(r.day)===today&&!r.unknown)){
  const D=fr.day,endEq={value:fr.endEquity,t:fr.endAt};
  for(const mode of ['week','month']){
   const lim=cfg.limits[mode];if(!(lim>0))continue;
   const m=measure(st,cal,D,mode,endEq,flows,input.fallbackStart,lim);if(m.pct===null||m.pct>-lim+1e-9)continue;
   const sameP=cal.periodKey(cal.next(D),mode)===cal.periodKey(D,mode);
   fr['close_'+mode]=m.pct;
   if(!sameP)continue; // 기간 마지막 거래일 마감 판정 → 남은 거래일 없음
   const s={id:`${market}:${mode}:${m.key}`,rule:mode,from:cal.dayStart(cal.next(D)),until:cal.periodEnd(D,mode),pct:m.pct,reason:`${MODE_LABEL[mode]} ${pctText(m.pct)} (마감 ${cal.label(D)})`,createdAt:now};
   addStop(s,stopText(s,`${MODE_LABEL[mode]} 손실 ${pctText(m.pct)} (${signedUsd(m.pnl,market)}, 시작 ${usd(m.startEquity,market)}) · ${MODE_LABEL[mode]} 한도 −${lim}% 마감 판정`));
  }
  // 연속 손실
  if(cfg.streakDays>0){
   const days=Object.values(st.days).filter(r=>r.final&&!r.unknown&&r.trades>0&&r.day<=D&&(!st.streakResetAfter||r.day>st.streakResetAfter)).sort((a,b)=>b.day.localeCompare(a.day));
   let n=0;for(const r of days){if(r.loss)n++;else break;}
   fr.streak=n;
   if(n>=cfg.streakDays){
    let last=cal.next(D);for(let i=1;i<cfg.streakStopDays;i++)last=cal.next(last);
    const s={id:`${market}:streak:${D}`,rule:'streak',from:cal.dayStart(cal.next(D)),until:cal.dayEnd(last),reason:`${n}일 연속 손실일(각 ≤ −${cfg.streakLossPct}%) · 마지막 ${cal.label(D)}`,createdAt:now};
    if(cfg.streakStopDays>0){const recent=days.slice(0,n).map(r=>`${cal.label(r.day)} ${pctText(r.pct)}`).reverse().join(', ');
     addStop(s,stopText(s,`${n}일 연속 손실일 (${recent})\n다음 ${cfg.streakStopDays}거래일(${cal.label(cal.next(D))}${cfg.streakStopDays>1?'~'+cal.label(last):''}) 쉬기`));}
    st.streakResetAfter=D;
   }
  }
 }

 // 3) 장중 판정 -------------------------------------------------------------------------------------
 const periods={};
 if(eq&&rec){
  for(const mode of ['day','week','month']){
   const lim=cfg.limits[mode];const m=measure(st,cal,today,mode,eq,flows,input.fallbackStart,lim);periods[mode]=m;
   if(m.pct===null)continue;
   // 정보: 기간 고점 대비 하락폭(입출금 보정 자산 기준)
   const pk=st.peaks[mode];const base=m.startEquity;
   const peak=pk&&pk.key===m.key?Math.max(pk.peak,m.adj):Math.max(base,m.adj);
   st.peaks[mode]={key:m.key,peak};m.peak=peak;m.ddPct=round((m.adj-peak)/peak*100,4);
   if(!(lim>0))continue;
   if(m.pct<=-lim+1e-9){
    if(mode==='day'){const s={id:`${market}:day:${today}`,rule:'day',from:now,until:cal.dayEnd(today),pct:m.pct,reason:`하루 ${pctText(m.pct)} (${cal.label(today)})`,createdAt:now};
     addStop(s,stopText(s,`오늘 손실 ${pctText(m.pct)} (${signedUsd(m.pnl,market)}, 시작 ${usd(m.startEquity,market)}) · 하루 한도 −${lim}% 도달`));}
    else{const s={id:`${market}:${mode}-intraday:${today}`,rule:mode+'-intraday',from:now,until:cal.dayEnd(today),pct:m.pct,reason:`${MODE_LABEL[mode]} ${pctText(m.pct)} 장중 도달 (${cal.label(today)})`,createdAt:now};
     const covered=activeAt(st.stops,now).some(x=>x.rule===mode&&x.until>=s.until);
     if(!covered)addStop(s,stopText(s,`${MODE_LABEL[mode]} 손실 ${pctText(m.pct)} (${signedUsd(m.pnl,market)}, 시작 ${usd(m.startEquity,market)}) · ${MODE_LABEL[mode]} 한도 −${lim}% 장중 도달\n오늘 마감 때도 −${lim}% 이하이면 다음 거래일부터 ${mode==='week'?'이번 주':'이번 달'} 끝까지 중단`));}
   }else if(m.ratio!==null){
    const crossed=cfg.warn.filter(th=>m.ratio*100>=th-1e-9&&th<100);
    if(crossed.length){const top=Math.max(...crossed);const keys=crossed.map(th=>`${market}:warn:${mode}:${m.key}:${th}`);
     if(keys.some(k=>!st.sent[k])){for(const k of keys)st.sent[k]=now;messages.push({key:keys.at(-1),text:`${top>=80?'⚠️':'🔔'} ${M} ${MODE_LABEL[mode]} ${pctText(m.pct)} (${signedUsd(m.pnl,market)}) · 한도 −${lim}%의 ${Math.floor(m.ratio*100)}%`});}}
   }
  }
  st.lastObs={t:eq.t,equity:eq.value,source:eq.source};
 }

 // 4) 중단 중 신규 진입 = 규칙 위반 -------------------------------------------------------------------
 const violations=[];
 for(const f of fills){if(!f.entry)continue;const ref=`${market}:viol:${f.key}`;if(refs.has(ref)||st.sent[ref])continue;
  const hit=activeAt(st.stops,f.t);if(!hit.length)continue;const s=hit.sort((a,b)=>b.until-a.until)[0];
  st.sent[ref]=now;violations.push(f);
  events.push({ref,kind:'violation',rule:s.rule,at:f.t,detail:{symbol:f.symbol,key:f.key,side:f.side,qty:f.qty,price:f.price,t:f.t,stopId:s.id,until:s.until,label:ruleLabel(s.rule,cfg),tid:f.tid??null,orderDate:f.orderDate??null,etDate:f.etDate??null}});
  messages.push({key:ref,text:`🚫 ${M} 거래 중단 중 신규 진입 감지 · ${f.symbol} ${f.desc||''} (${untilText(f.t,'HL').replace(/ KST$/,'')} KST)\n사유: ${ruleLabel(s.rule,cfg)} · 중단 ~ ${untilText(s.until,market)}\n일지에 '규칙 위반'으로 표시합니다.`});
 }

 // 5) 재시작 첫날(위험 절반) ---------------------------------------------------------------------------
 const live=st.stops.filter(s=>!s.cleared);
 const active=activeAt(live,now);
 let half={active:false,factor:cfg.restartFactor};
 if(!active.length){const ended=live.filter(s=>s.until<=now).sort((a,b)=>b.until-a.until)[0];
  if(ended){const hd=cal.dayOf(ended.until);if(hd===today&&cfg.restartFactor<1){half={active:true,day:today,factor:cfg.restartFactor,afterStop:ended.id,reason:`${ruleLabel(ended.rule,cfg)} 중단이 끝난 뒤 첫 거래일`};
   const key=`${market}:restart:${today}`;if(!st.sent[key]&&!refs.has(key)){st.sent[key]=now;
    const dr=cfg.defaultRisk>0?` · 1회 위험 ${round(cfg.defaultRisk*cfg.restartFactor,4)}% (설정 ${cfg.defaultRisk}%의 ${Math.round(cfg.restartFactor*100)}%)`:` · 1회 위험 ${Math.round(cfg.restartFactor*100)}%로 축소`;
    events.push({ref:key,kind:'restart',rule:ended.rule,at:now,detail:{day:today,factor:cfg.restartFactor,afterStop:ended.id}});
    messages.push({key,text:`✅ ${M} 거래 중단 해제 · 오늘 ${cal.label(today)}은 재시작 첫날${dr}\n앱 포지션 계산기에 절반 위험이 자동 적용됩니다.`});}}}}

 // 6) 정리 + 상태 요약(앱 배너) ----------------------------------------------------------------------
 const cutDay=new Date(now-KEEP_DAYS*86400000).toISOString().slice(0,10);
 for(const d of Object.keys(st.days))if(d<cutDay)delete st.days[d];
 st.stops=st.stops.filter(s=>s.until>now-KEEP_DAYS*86400000);
 for(const [k,v] of Object.entries(st.sent))if(v<now-KEEP_DAYS*86400000)delete st.sent[k];
 const shown=live.filter(s=>s.until>now).sort((a,b)=>a.from-b.from).map(s=>({id:s.id,rule:s.rule,label:ruleLabel(s.rule,cfg),from:s.from,until:s.until,untilText:untilText(s.until,market),fromText:untilText(s.from,market),active:s.from<=now,reason:s.reason}));
 const streakNow=(()=>{const days=Object.values(st.days).filter(r=>r.final&&!r.unknown&&r.trades>0&&(!st.streakResetAfter||r.day>st.streakResetAfter)).sort((a,b)=>b.day.localeCompare(a.day));let n=0;for(const r of days){if(r.loss)n++;else break;}return n;})();
 const pub=m=>m?{key:m.key,startEquity:m.startEquity,startSource:m.startSource??null,startDay:m.startDay??null,pnl:m.pnl,pct:m.pct,flows:m.flows??0,limit:m.limit??null,ratio:m.ratio??null,ddPct:m.ddPct??null}:null;
 const status={v:1,market,updatedAt:now,today,todayLabel:cal.label(today),
  equity:eq?{value:eq.value,t:eq.t,source:eq.source,stale:!!eq.stale}:null,
  limits:cfg.limits,periods:{day:pub(periods.day),week:pub(periods.week),month:pub(periods.month)},
  stops:shown,stopped:active.length>0,halfRisk:half,
  streak:{count:streakNow,need:cfg.streakDays,lossPct:cfg.streakLossPct,stopDays:cfg.streakStopDays},
  config:{limits:cfg.limits,streakDays:cfg.streakDays,streakLossPct:cfg.streakLossPct,streakStopDays:cfg.streakStopDays,restartFactor:cfg.restartFactor,checkSec:cfg.checkSec,warn:cfg.warn,boundary:market==='US'?'미국 장 마감 16:00 ET(서머타임 자동, NYSE 휴장일 제외)':'한국시간 24:00(KST 자정)'},
  note:eq?null:'자산 값을 아직 읽지 못했습니다'};
 const changedDays=[...finalized,...(rec?[rec]:[])].map(r=>({...r}));
 return {state:st,messages,events,status,days:changedDays,violations};
}

// 수동 중단 해제(.env 잘못 등). 해제한 id 목록 반환.
export function clearStops(prev,now){const st=structuredClone(prev);const ids=[];for(const s of st.stops)if(!s.cleared&&s.until>now){s.cleared=now;ids.push(s.id);}return {state:st,ids};}
