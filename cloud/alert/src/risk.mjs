// alert5 손실한도 판정 v1.5 — 판정 엔진 (순수 함수, I/O 없음). 시장(US/HL)마다 따로 호출합니다.
//
// v1.5: input.periodMode==='realized'(기본, alert5.sql 필요)이면 주·월 한도와 연속 손실일도 앱 v29 limitStatus와 같은 실현손익 기준.
//   주·월 % = 기간(주 = 월요일 시작, 달 = 달력 월 · 경계 = 하루 실현 키: HL UTC 날짜 / US 거래일) 실현손익 합 ÷ 현재 기준액(앱 acctBasis).
//   연속 손실일 = 그날 실현손익 ÷ 그날 직전 마감(→ 현재 기준액) ≤ −streakLossPct. 입출금은 손익이 아니므로 판정에 안 들어감.
//   미실현 포함 자산 변화(v1.4 방식)는 periods.weekEquity/monthEquity와 메시지 '참고' 줄로만. 처음 적용할 때 새 기준으로
//   성립하지 않는 기존 주·월·연속 중단은 해제('clear' rule 'basis-realized', 🔄 1회, 그날 재시작 절반도 없어짐).
//   periodMode가 'equity'(DAY_LIMIT_BASIS=equity 또는 alert5.sql 미설치)이면 v1.4 그대로.
//
// v1.4: 한도 기준일(cfg.riskStart = .env RISK_START_DATE). 기준 시각(HL = 그날 UTC 00:00, US = 그 날짜 ET 거래일 시작 = 직전 거래일 16:00 ET)
//   이전 손익은 하루·주·월 합계와 연속 손실일에서 뺌. 기준일이 든 주·월은 기준 시각의 자산(riskStart.base)에서 시작.
//   기준일 설정 전에 걸린 중단(since 표시 없음)은 처음 적용할 때 해제('clear' 기록). 새 중단 id = …@YYYY-MM-DD. 미설정이면 v1.3 그대로.
//
// v1.3: 하루 한도(input.dayMode==='realized', 기본)는 앱 v28과 같은 기준 — 오늘 실현손익 ÷ 직전 마감(acct_snapshots, 없으면 현재 기준액).
//   HL 하루 = UTC 00:00(KST 09:00) 경계, US = 미국 장 마감 16:00 ET. 분자·분모는 day.mjs가 만들어 input.dayRealized로 넘김.
//   미실현 포함 자산 변화는 메시지·상태에 참고로만(periods.dayEquity, periods.day.ref). 주·월·연속 손실·재시작 규칙은 v1.2 그대로.
//   dayMode가 'equity'(또는 alert3.sql 미설치)이면 아래 v1.2 하루 판정(자산 변화) 그대로.
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

export function ruleLabel(rule,cfg,basis){
 const L=cfg.limits;
 if(basis==='realized'){const r={week:`주간 실현 −${L.week}% (마감 판정)`,'week-intraday':`주간 실현 −${L.week}% 장중 도달`,month:`월간 실현 −${L.month}% (마감 판정)`,'month-intraday':`월간 실현 −${L.month}% 장중 도달`,streak:`${cfg.streakDays}일 연속 실현 손실일`}[rule];if(r)return r;}
 return {day:cfg.dayMode==='realized'?`하루 실현 −${L.day}%`:`하루 −${L.day}%`,week:`주간 −${L.week}% (마감 판정)`,'week-intraday':`주간 −${L.week}% 장중 도달`,month:`월간 −${L.month}% (마감 판정)`,'month-intraday':`월간 −${L.month}% 장중 도달`,streak:`${cfg.streakDays}일 연속 손실일`,manual:'수동 중단'}[rule]||rule;
}
const md=d=>d?d.slice(5).replace('-','/'):'';
export function dayLabel(key,market){return market==='HL'?md(key)+' UTC':md(key)+'('+'일월화수목금토'[new Date(key+'T00:00:00Z').getUTCDay()]+')';}
/** '전일 마감 $X' / 'MM/DD 마감 $X' / '현재 기준액 $X' (앱 v28BasisText) */
export function basisText(d,market){if(!d)return '';if(d.mode==='close')return (d.expected?'전일 마감 ':md(d.key)+' 마감 ')+usd(d.value,market);return '현재 기준액 '+usd(d.value,market);}
export function emptyState(market){return {v:1,market,days:{},stops:[],sent:{},lastObs:null,peaks:{},streakResetAfter:null};}
export function flowSum(flows,a,b){let s=0;for(const f of flows||[])if(f.at>a&&f.at<=b)s+=Number(f.amount)||0;return round(s);}
const activeAt=(stops,t)=>stops.filter(s=>!s.cleared&&s.from<=t&&t<s.until);

function periodStart(st,cal,today,mode,fallbackStart,rs){
 if(rs){
  if(today<rs.day)return null; // 기준일 전 = 판정 안 함
  if(cal.periodKey(today,mode)===cal.periodKey(rs.day,mode)&&cal.dayStart(cal.firstOf(today,mode))<rs.at-1000){
   const b=st.riskStart&&st.riskStart.date===rs.date?st.riskStart.base:null;
   return b&&b.equity>0?{equity:b.equity,at:b.at,source:'기준일 '+md(rs.date)+' · '+b.source,day:rs.day,cut:true}:null;
  }
 }
 const first=cal.firstOf(today,mode),rec=st.days[first];
 if(rec&&rec.startEquity>0)return {equity:rec.startEquity,at:rec.startAt,source:rec.startSource,day:first};
 const fb=fallbackStart?fallbackStart(first,mode):null;
 if(fb&&fb.equity>0)return {equity:fb.equity,at:fb.at??cal.dayStart(first),source:fb.source,day:first};
 // 기간 중 가장 이른 기록(설치가 기간 중간이면 근사)
 const keys=Object.keys(st.days).filter(d=>cal.periodKey(d,mode)===cal.periodKey(today,mode)&&st.days[d].startEquity>0).sort();
 if(keys.length){const r=st.days[keys[0]];return {equity:r.startEquity,at:r.startAt,source:'partial:'+keys[0],day:keys[0]};}
 return null;
}
function measure(st,cal,today,mode,eq,flows,fallbackStart,limit,rs=null){
 const ps=periodStart(st,cal,today,mode,fallbackStart,rs);if(!ps)return {mode,key:cal.periodKey(today,mode),startEquity:null,pnl:null,pct:null,limit,...(rs&&today<rs.day?{beforeStart:true}:{})};
 const fl=flowSum(flows,ps.at,eq.t),pnl=round(eq.value-ps.equity-fl),pct=round(pnl/ps.equity*100,4);
 return {mode,key:cal.periodKey(today,mode),startEquity:ps.equity,startAt:ps.at,startSource:ps.source,startDay:ps.day,flows:fl,pnl,pct,limit,ratio:limit>0?Math.max(0,-pct)/limit:null,adj:round(eq.value-fl),...(ps.cut?{cut:rs.date}:{})};
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
 const st=structuredClone(prev||emptyState(market));st.market=market;const prevObs=st.lastObs;
 const messages=[],events=[],refs=input.eventRefs||new Set();
 const flows=(input.flows||[]).filter(f=>Number.isFinite(f.at)&&Number.isFinite(Number(f.amount)));
 const fills=(input.fills||[]).filter(f=>Number.isFinite(f.t));
 const eq=input.equity&&input.equity.value>0&&Number.isFinite(input.equity.t)?input.equity:null;
 const today=cal.dayOf(now);
 const prMode=input.periodMode==='realized',PR=prMode?input.periodRealized||null:null;
 // v1.4 한도 기준일 ---------------------------------------------------------------------------------
 const rs=cfg.riskStart&&cfg.riskStart.date?cfg.riskStart:null,before=!!rs&&now<rs.at;
 const sid=id=>rs?id+'@'+rs.date:id,ck=k=>k+(rs?'@'+rs.date:'');
 const clearedNow=[];
 if(rs){
  if(!st.riskStart||st.riskStart.date!==rs.date)st.riskStart={date:rs.date,day:rs.day,at:rs.at,appliedAt:now,base:null};
  const from=cal.dayStart(rs.day);
  for(const s of st.stops){if(s.cleared||s.since===rs.date||!(s.until>=from))continue;s.cleared=now;s.clearedBy='risk-start:'+rs.date;clearedNow.push(s);
   events.push({ref:`clear:${s.id}:start:${rs.date}`,kind:'clear',rule:'risk-start',at:now,detail:{stopId:s.id,riskStart:rs.date,label:ruleLabel(s.rule,cfg,s.basis),until:s.until,ended:s.until<=now}});}
  const key=`${market}:riskstart:${rs.date}`;
  if(!st.sent[key]&&!refs.has(key)){st.sent[key]=now;const act=clearedNow.filter(s=>s.until>now);
   messages.push({key,text:`🔄 ${M} 손실 한도 기준일 ${md(rs.date)} — ${untilText(rs.at,market)}부터 다시 셉니다\n하루·주·월 합계와 연속 손실일에서 그 이전 손익은 빼고 판정합니다.`+(act.length?`\n기준일 이전 손실로 걸린 중단 해제: ${act.map(s=>ruleLabel(s.rule,cfg,s.basis)+' (~ '+untilText(s.until,market)+')').join(', ')}`:'')});}
 }
 const addStop=(s,text)=>{s.id=sid(s.id);if(rs)s.since=rs.date;if(st.stops.some(x=>x.id===s.id)||refs.has(s.id))return false;if(!(s.until>now))return false;st.stops.push(s);
  events.push({ref:s.id,kind:'stop',rule:s.rule,at:now,detail:{from:s.from,until:s.until,reason:s.reason,pct:s.pct??null,label:ruleLabel(s.rule,cfg,s.basis)}});messages.push({key:s.id,text});return true;};
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
 // v1.4 기준 시각의 자산(주·월·첫날 하루 시작값): 경계 근처 하루 기록 → 경계 직전 서버 관측 → 마감 잔액/portfolio → (없으면) 첫 관측(근사)
 if(rs&&!before){
  const b=st.riskStart.base;
  if(!b||b.approx){
   let nb=null;const r0=st.days[rs.day];
   if(r0&&r0.startEquity>0&&Math.abs(r0.startAt-rs.at)<=cfg.anchorMaxGapMs)nb={equity:r0.startEquity,at:r0.startAt,source:r0.startSource==='first-seen'?'서버 관측':r0.startSource==='server'?'서버 관측':r0.startSource};
   else if(prevObs&&prevObs.t<=rs.at&&rs.at-prevObs.t<=cfg.anchorMaxGapMs)nb={equity:prevObs.equity,at:prevObs.t,source:'서버 관측'};
   else{const a=input.anchorAt?input.anchorAt(rs.at):null;if(a&&a.equity>0)nb={equity:a.equity,at:a.at??rs.at,source:a.source};}
   if(!nb&&!b&&eq)nb={equity:eq.value,at:eq.t,source:'첫 관측 '+untilText(eq.t,'HL').replace(/^\S+ /,''),approx:true};
   if(nb)st.riskStart.base=nb;
  }
 }
 if(rs)for(const r of finalized){
  if(r.day<rs.day){r.preStart=true;r.loss=false;continue;}
  if(r.day===rs.day&&!r.unknown&&r.startAt<rs.at-cfg.anchorMaxGapMs){const b=st.riskStart.base;
   if(b&&Number.isFinite(r.endEquity)&&b.at<r.endAt){const fl=flowSum(flows,b.at,r.endAt);r.cutFrom=b.at;r.cutPnl=round(r.endEquity-b.equity-fl);r.cutPct=round(r.cutPnl/b.equity*100,4);r.loss=r.trades>0&&r.cutPct<=-cfg.streakLossPct+1e-9;}else{r.loss=false;r.cutUnknown=true;}}
 }
 const rec=st.days[today];
 if(rec){const dayFills=fills.filter(f=>cal.dayOf(f.t)===today);rec.trades=Math.max(rec.trades||0,dayFills.length);rec.entries=Math.max(rec.entries||0,dayFills.filter(f=>f.entry).length);}

 const countable=r=>r.final&&!r.unknown&&r.trades>0&&(!st.streakResetAfter||r.day>st.streakResetAfter)&&(!rs||r.day>rs.day||(r.day===rs.day&&(r.cutPct!==undefined||r.startAt>=rs.at-cfg.anchorMaxGapMs)));
 // 2) 마감 판정(주·월 공식 판정, 연속 손실) — 방금 마감된 "직전 거래일"에 대해서만 --------------------------
 for(const fr of finalized.filter(r=>!prMode&&cal.next(r.day)===today&&!r.unknown)){
  const D=fr.day,endEq={value:fr.endEquity,t:fr.endAt};
  for(const mode of ['week','month']){
   const lim=cfg.limits[mode];if(!(lim>0))continue;
   const m=measure(st,cal,D,mode,endEq,flows,input.fallbackStart,lim,rs);if(m.pct===null||m.pct>-lim+1e-9)continue;
   const sameP=cal.periodKey(cal.next(D),mode)===cal.periodKey(D,mode);
   fr['close_'+mode]=m.pct;
   if(!sameP)continue; // 기간 마지막 거래일 마감 판정 → 남은 거래일 없음
   const s={id:`${market}:${mode}:${m.key}`,rule:mode,from:cal.dayStart(cal.next(D)),until:cal.periodEnd(D,mode),pct:m.pct,reason:`${MODE_LABEL[mode]} ${pctText(m.pct)} (마감 ${cal.label(D)})`,createdAt:now};
   addStop(s,stopText(s,`${MODE_LABEL[mode]} 손실 ${pctText(m.pct)} (${signedUsd(m.pnl,market)}, 시작 ${usd(m.startEquity,market)}${m.cut?' · 기준일 '+md(m.cut)+'부터':''}) · ${MODE_LABEL[mode]} 한도 −${lim}% 마감 판정`));
  }
  // 연속 손실
  if(cfg.streakDays>0){
   const days=Object.values(st.days).filter(r=>countable(r)&&r.day<=D).sort((a,b)=>b.day.localeCompare(a.day));
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
 const periods={};const realized=input.dayMode==='realized';
 if(eq&&rec){
  for(const mode of ['day','week','month']){
   const lim=cfg.limits[mode];const m=measure(st,cal,today,mode,eq,flows,input.fallbackStart,lim,rs);if(before){m.pct=null;m.pnl=null;m.beforeStart=true;}periods[mode]=m;
   if(mode==='day'&&realized){periods.dayEquity=m;delete periods.day;}
   if(mode!=='day'&&prMode){periods[mode+'Equity']=m;delete periods[mode];}
   if(m.pct===null)continue;
   // 정보: 기간 고점 대비 하락폭(입출금 보정 자산 기준)
   const pk=st.peaks[mode];const base=m.startEquity;const pkey=m.key+(m.cut?'@'+m.cut:'');
   const peak=pk&&pk.key===pkey?Math.max(pk.peak,m.adj):Math.max(base,m.adj);
   st.peaks[mode]={key:pkey,peak};m.peak=peak;m.ddPct=round((m.adj-peak)/peak*100,4);
   if(!(lim>0))continue;
   if(mode==='day'&&realized)continue;
   if(mode!=='day'&&prMode)continue; // v1.5: 주·월은 아래 실현손익 기준 // v1.3: 하루 판정은 아래 실현손익 기준
   if(m.pct<=-lim+1e-9){
    if(mode==='day'){const s={id:`${market}:day:${today}`,rule:'day',from:now,until:cal.dayEnd(today),pct:m.pct,reason:`하루 ${pctText(m.pct)} (${cal.label(today)})`,createdAt:now};
     addStop(s,stopText(s,`오늘 손실 ${pctText(m.pct)} (${signedUsd(m.pnl,market)}, 시작 ${usd(m.startEquity,market)}) · 하루 한도 −${lim}% 도달`));}
    else{const s={id:`${market}:${mode}-intraday:${today}`,rule:mode+'-intraday',from:now,until:cal.dayEnd(today),pct:m.pct,reason:`${MODE_LABEL[mode]} ${pctText(m.pct)} 장중 도달 (${cal.label(today)})`,createdAt:now};
     const covered=activeAt(st.stops,now).some(x=>x.rule===mode&&x.until>=s.until);
     if(!covered)addStop(s,stopText(s,`${MODE_LABEL[mode]} 손실 ${pctText(m.pct)} (${signedUsd(m.pnl,market)}, 시작 ${usd(m.startEquity,market)}${m.cut?' · 기준일 '+md(m.cut)+'부터':''}) · ${MODE_LABEL[mode]} 한도 −${lim}% 장중 도달\n오늘 마감 때도 −${lim}% 이하이면 다음 거래일부터 ${mode==='week'?'이번 주':'이번 달'} 끝까지 중단`));}
   }else if(m.ratio!==null){
    const crossed=cfg.warn.filter(th=>m.ratio*100>=th-1e-9&&th<100);
    if(crossed.length){const top=Math.max(...crossed);const keys=crossed.map(th=>`${market}:warn:${mode}:${m.key}${m.cut?'@'+m.cut:''}:${th}`);
     if(keys.some(k=>!st.sent[k])){for(const k of keys)st.sent[k]=now;messages.push({key:keys.at(-1),text:`${top>=80?'⚠️':'🔔'} ${M} ${MODE_LABEL[mode]} ${pctText(m.pct)} (${signedUsd(m.pnl,market)}) · 한도 −${lim}%의 ${Math.floor(m.ratio*100)}%`});}}
   }
  }
  st.lastObs={t:eq.t,equity:eq.value,source:eq.source};
 }
 // 3b) v1.3 하루 한도 = 오늘 실현손익 ÷ 직전 마감(→ 현재 기준액) ------------------------------------------
 if(realized){
  const lim=cfg.limits.day,D=input.dayRealized,den=D?.denom;
  const preK=!!rs&&!!D&&(before||String(D.key)<String(rs.realKey||rs.day));
  if(preK)periods.day={mode:'day',basis:'realized',key:D.key??null,startEquity:null,startSource:null,pnl:null,pct:null,flows:0,limit:lim,ratio:null,ref:null,missing:'before-start'};
  else if(D&&den&&den.value>0&&Number.isFinite(D.pnl)){
   const base=den.value,pnl=round(D.pnl),pct=round(pnl/base*100,4),budget=lim>0?round(base*lim/100):null,ratio=budget>0?Math.max(0,-pnl)/budget:null;
   let ref=null;const qe=periods.dayEquity;
   if(eq&&den.mode==='close'&&Number.isFinite(den.closeAt)){const fl=flowSum(flows,den.closeAt,eq.t),ch=round(eq.value-base-fl);ref={pnl:ch,pct:round(ch/base*100,4),flows:fl,from:'close'};}
   else if(qe&&qe.pct!==null)ref={pnl:qe.pnl,pct:qe.pct,flows:qe.flows,from:'server',startEquity:qe.startEquity};
   const bt=basisText(den,market);
   periods.day={mode:'day',basis:'realized',key:D.key,startEquity:base,startSource:bt,startDay:den.key??null,denomMode:den.mode,denomSource:den.source??null,
    pnl,pct,flows:0,limit:lim,budget,ratio,parts:D.parts||null,source:D.source||null,ref,until:D.until??null};
   const refTxt=ref?`\n참고: 미실현 포함 자산 변화 ${pctText(ref.pct)} (${signedUsd(ref.pnl,market)}${ref.flows?' · 입출금 '+signedUsd(ref.flows,market)+' 제외':''}) — 판정에는 쓰지 않음`:'';
   const partTxt=market==='HL'&&D.parts?` · 체결 ${signedUsd(D.parts.trades,market)} + 펀딩 ${signedUsd(D.parts.funding,market)}`:'';
   const dl=dayLabel(D.key,market);
   if(lim>0&&pnl<0&&pnl<=-budget+1e-9){
    const s={id:`${market}:dayr:${D.key}`,rule:'day',from:now,until:D.until,pct,reason:`하루 실현 ${pctText(pct)} (${dl} · 기준 ${bt})`,createdAt:now};
    addStop(s,stopText(s,`오늘 실현손익 ${pctText(pct)} (${signedUsd(pnl,market)}) · 하루 한도 −${lim}% (${usd(-budget,market)}) 도달\n기준: ${bt}${partTxt}${refTxt}`));
   }else if(ratio!==null){
    const crossed=cfg.warn.filter(th=>ratio*100>=th-1e-9&&th<100);
    if(crossed.length){const top=Math.max(...crossed);const keys=crossed.map(th=>ck(`${market}:warn:dayr:${D.key}`)+`:${th}`);
     if(keys.some(k=>!st.sent[k])){for(const k of keys)st.sent[k]=now;messages.push({key:keys.at(-1),text:`${top>=80?'⚠️':'🔔'} ${M} 하루 실현손익 ${pctText(pct)} (${signedUsd(pnl,market)}) · 한도 −${lim}% (${usd(-budget,market)})의 ${Math.floor(ratio*100)}%\n기준: ${bt}${partTxt}${refTxt}`});}}
   }
  }else periods.day={mode:'day',basis:'realized',key:D?.key??null,startEquity:null,startSource:null,pnl:D&&Number.isFinite(D.pnl)?round(D.pnl):null,pct:null,flows:0,limit:cfg.limits.day,ratio:null,ref:null,missing:D?'denominator':'data'};
 }

 // 3c) v1.5 주·월 한도·연속 손실일 = 실현손익 (앱 v29 limitStatus와 같은 기준) ---------------------------------
 let rStreak=null,clearedBasis=[];
 if(prMode){
  if(!st.rp)st.rp={lastKey:null,days:{},streakResetAfter:null};
  const R=PR,rc=R?.cal,K0=R?.key;
  if(R&&rc&&K0){
   const den=R.basis&&R.basis.value>0?R.basis:null,startKey=rs?String(rs.realKey||rs.day):null,bt=den?basisText(den,market):'';
   const dl=k=>market==='HL'?dayLabel(k,'HL'):cal.label(k);
   for(const d of R.days||[]){if(!(d.key<K0))continue;const dn=d.denom&&d.denom.value>0?d.denom:null,pct=dn?round(d.pnl/dn.value*100,4):null;
    st.rp.days[d.key]={key:d.key,pnl:d.pnl,pct,trades:d.trades||0,denom:dn?dn.value:null,denomMode:dn?.mode??null,loss:(d.trades||0)>0&&pct!==null&&pct<=-cfg.streakLossPct+1e-9,final:true,...(startKey&&d.key<startKey?{preStart:true}:{})};}
   const sumOf=(mode,key)=>{let p=0,n=0;for(const r of R.rows||[]){if(rc.periodKey(r.label,mode)!==rc.periodKey(key,mode)||(startKey&&r.label<startKey))continue;p+=Number(r.pnl)||0;n++;}return {pnl:round(p),n};};
   const rcount=(upto,ignoreReset=false)=>{const ks=Object.values(st.rp.days).filter(r=>r.final&&r.key<=upto&&r.trades>0&&r.pct!==null&&!r.preStart&&(ignoreReset||!st.rp.streakResetAfter||r.key>st.rp.streakResetAfter)).sort((a,b)=>b.key.localeCompare(a.key));let n=0;const list=[];for(const r of ks){if(r.loss){n++;list.push(r);}else break;}return {n,list};};
   const cutOf=mode=>startKey&&rc.periodKey(startKey,mode)===rc.periodKey(K0,mode)&&startKey>rc.firstOf(K0,mode)?rs.date:null;
   const refTxt=ref=>ref&&(ref.pnl||ref.flows)?`\n참고: 미실현 포함 자산 변화 ${pctText(ref.pct)} (${signedUsd(ref.pnl,market)}${ref.flows?' · 입출금 '+signedUsd(ref.flows,market)+' 제외':''}) — 판정에는 쓰지 않음`:'';
   const refOf=mode=>{const q=periods[mode+'Equity'];return q&&q.pct!==null&&Number.isFinite(q.pct)?{pnl:q.pnl,pct:q.pct,flows:q.flows,startEquity:q.startEquity,from:'server'}:null;};
   // a) 실현 키가 바뀐 직후: 직전 키(마감) 주·월 판정 + 연속 손실
   const K=rc.prev(K0);
   if(!before&&st.rp.lastKey&&st.rp.lastKey<K0&&(!startKey||K>=startKey)){
    if(den)for(const mode of ['week','month']){const lim=cfg.limits[mode];if(!(lim>0))continue;const S=sumOf(mode,K),pct=round(S.pnl/den.value*100,4),budget=round(den.value*lim/100);
     if(!(S.pnl<0&&S.pnl<=-budget+1e-9)||rc.periodKey(rc.next(K),mode)!==rc.periodKey(K,mode))continue;
     const s={id:`${market}:${mode}r:${rc.periodKey(K,mode)}`,rule:mode,basis:'realized',from:rc.dayStart(rc.next(K)),until:rc.periodEnd(K,mode),pct,reason:`${MODE_LABEL[mode]} 실현 ${pctText(pct)} (마감 ${dl(K)} · 기준 ${bt})`,createdAt:now};
     addStop(s,stopText(s,`${MODE_LABEL[mode]} 실현손익 ${pctText(pct)} (${signedUsd(S.pnl,market)}) · ${MODE_LABEL[mode]} 한도 −${lim}% (${usd(-budget,market)}) 마감 판정\n기준: ${bt}${cutOf(mode)?' · 기준일 '+md(cutOf(mode))+'부터':''}`));}
    if(cfg.streakDays>0){const c=rcount(K);if(c.n>=cfg.streakDays){let last=rc.next(K);for(let i=1;i<cfg.streakStopDays;i++)last=rc.next(last);
     const s={id:`${market}:streakr:${K}`,rule:'streak',basis:'realized',from:rc.dayStart(rc.next(K)),until:rc.dayEnd(last),reason:`${c.n}일 연속 실현 손실일(각 ≤ −${cfg.streakLossPct}%) · 마지막 ${dl(K)}`,createdAt:now};
     if(cfg.streakStopDays>0){const recent=c.list.map(r=>`${dl(r.key)} ${pctText(r.pct)}`).reverse().join(', ');
      addStop(s,stopText(s,`${c.n}일 연속 실현 손실일 (${recent})\n다음 ${cfg.streakStopDays}거래일(${dl(rc.next(K))}${cfg.streakStopDays>1?'~'+dl(last):''}) 쉬기`));}
     st.rp.streakResetAfter=K;}}
   }
   st.rp.lastKey=K0;
   rStreak=rcount(K).n;
   // b) 이번 주·이번 달 실현 합계
   const P={};
   for(const mode of ['week','month']){const lim=cfg.limits[mode],S=sumOf(mode,K0),ref=refOf(mode),cut=cutOf(mode);
    if(before||!den){P[mode]={mode,basis:'realized',key:rc.periodKey(K0,mode),startEquity:den?.value??null,startSource:bt||null,pnl:before?null:S.pnl,pct:null,flows:0,limit:lim,budget:null,ratio:null,ref,missing:before?'before-start':'denominator',...(before?{beforeStart:true}:{})};continue;}
    const pct=round(S.pnl/den.value*100,4),budget=lim>0?round(den.value*lim/100):null,ratio=budget>0?Math.max(0,-S.pnl)/budget:null;
    P[mode]={mode,basis:'realized',key:rc.periodKey(K0,mode),startEquity:den.value,startSource:bt,startDay:rc.firstOf(K0,mode),denomMode:den.mode,denomSource:den.source??null,pnl:S.pnl,pct,flows:0,limit:lim,budget,ratio,ref,days:S.n,missing:null,...(cut?{cut}:{})};}
   // c) 처음 적용: 새 기준으로 성립하지 않는 기존(자산 변화 기준) 주·월·연속 중단 해제 + 🔄 1회
   if(st.periodBasis!=='realized'&&!before){
    const RULES=['week','week-intraday','month','month-intraday','streak'],c0=rcount(K,true),t0=cal.dayStart(today);
    const holds=s=>{if(s.rule==='streak')return cfg.streakDays>0&&c0.n>=cfg.streakDays;const p=P[s.rule.startsWith('week')?'week':'month'];return !!p&&p.pct!==null&&p.limit>0&&p.pnl<0&&p.pnl<=-p.budget+1e-9;};
    for(const s of st.stops){if(s.cleared||s.basis==='realized'||!RULES.includes(s.rule)||!(s.until>=t0)||holds(s))continue;
     s.cleared=now;s.clearedBy='basis:realized';clearedBasis.push(s);
     events.push({ref:`clear:${s.id}:realized`,kind:'clear',rule:'basis-realized',at:now,detail:{stopId:s.id,label:ruleLabel(s.rule,cfg),until:s.until,ended:s.until<=now,basis:'realized'}});}
    const key=`${market}:basis:realized`;
    if(!st.sent[key]&&!refs.has(key)){st.sent[key]=now;const act=clearedBasis.filter(s=>s.until>now),ended=clearedBasis.filter(s=>s.until<=now);const W=P.week,Mo=P.month;
     messages.push({key,text:`🔄 ${M} 손실 한도 판정 v1.5 — 주·월 한도와 연속 손실일을 실현손익 기준으로 판정합니다(앱과 같은 기준)\n주·월 % = 기간 실현손익 ÷ ${bt||'현재 기준액'} · 입출금은 손실로 잡지 않습니다(미실현 포함 변동은 참고만).`
      +(W&&W.pct!==null?`\n지금: 이번 주 실현 ${pctText(W.pct)} (${signedUsd(W.pnl,market)})`+(Mo&&Mo.pct!==null?` · 이번 달 ${pctText(Mo.pct)} (${signedUsd(Mo.pnl,market)})`:''):'')
      +(act.length?`\n새 기준으로 성립하지 않는 중단 해제: ${act.map(s=>ruleLabel(s.rule,cfg)+' (~ '+untilText(s.until,market)+')').join(', ')}`:'')
      +(ended.length?`\n오늘 재시작 첫날(위험 절반)도 없앱니다: ${ended.map(s=>ruleLabel(s.rule,cfg)).join(', ')}`:'')});}
   }
   st.periodBasis='realized';
   // d) 장중 판정(실현)
   for(const mode of ['week','month']){const x=P[mode],lim=x.limit;if(x.pct===null||!(lim>0))continue;
    if(x.pnl<0&&x.pnl<=-x.budget+1e-9){
     const s={id:`${market}:${mode}r-intraday:${K0}`,rule:mode+'-intraday',basis:'realized',from:now,until:rc.dayEnd(K0),pct:x.pct,reason:`${MODE_LABEL[mode]} 실현 ${pctText(x.pct)} 장중 도달 (${dl(K0)} · 기준 ${bt})`,createdAt:now};
     const covered=activeAt(st.stops,now).some(y=>(y.rule===mode||y.rule===mode+'-intraday')&&y.until>=s.until);
     if(!covered)addStop(s,stopText(s,`${MODE_LABEL[mode]} 실현손익 ${pctText(x.pct)} (${signedUsd(x.pnl,market)}) · ${MODE_LABEL[mode]} 한도 −${lim}% (${usd(-x.budget,market)}) 장중 도달\n기준: ${bt}${x.cut?' · 기준일 '+md(x.cut)+'부터':''}\n오늘 마감 때도 −${lim}% 이하이면 다음 거래일부터 ${mode==='week'?'이번 주':'이번 달'} 끝까지 중단${refTxt(x.ref)}`));
    }else if(x.ratio!==null){
     const crossed=cfg.warn.filter(th=>x.ratio*100>=th-1e-9&&th<100);
     if(crossed.length){const top=Math.max(...crossed);const keys=crossed.map(th=>`${market}:warn:${mode}r:${x.key}${x.cut?'@'+x.cut:''}:${th}`);
      if(keys.some(k=>!st.sent[k])){for(const k of keys)st.sent[k]=now;messages.push({key:keys.at(-1),text:`${top>=80?'⚠️':'🔔'} ${M} ${MODE_LABEL[mode]} 실현손익 ${pctText(x.pct)} (${signedUsd(x.pnl,market)}) · 한도 −${lim}% (${usd(-x.budget,market)})의 ${Math.floor(x.ratio*100)}%\n기준: ${bt}${refTxt(x.ref)}`});}}
    }}
   periods.week=P.week;periods.month=P.month;
  }else{for(const mode of ['week','month'])periods[mode]={mode,basis:'realized',key:null,startEquity:null,startSource:null,pnl:null,pct:null,flows:0,limit:cfg.limits[mode],ratio:null,ref:null,missing:'data'};
   const ks=Object.values(st.rp.days).filter(r=>r.final&&r.trades>0&&r.pct!==null&&!r.preStart&&(!st.rp.streakResetAfter||r.key>st.rp.streakResetAfter)).sort((a,b)=>b.key.localeCompare(a.key));let n=0;for(const r of ks){if(r.loss)n++;else break;}rStreak=n;}
 }else if(st.periodBasis==='realized')st.periodBasis='equity';

 // 4) 중단 중 신규 진입 = 규칙 위반 -------------------------------------------------------------------
 const violations=[];
 for(const f of fills){if(!f.entry)continue;const ref=`${market}:viol:${f.key}`;if(refs.has(ref)||st.sent[ref])continue;
  const hit=activeAt(st.stops,f.t);if(!hit.length)continue;const s=hit.sort((a,b)=>b.until-a.until)[0];
  st.sent[ref]=now;violations.push(f);
  events.push({ref,kind:'violation',rule:s.rule,at:f.t,detail:{symbol:f.symbol,key:f.key,side:f.side,qty:f.qty,price:f.price,t:f.t,stopId:s.id,until:s.until,label:ruleLabel(s.rule,cfg,s.basis),tid:f.tid??null,orderDate:f.orderDate??null,etDate:f.etDate??null}});
  messages.push({key:ref,text:`🚫 ${M} 거래 중단 중 신규 진입 감지 · ${f.symbol} ${f.desc||''} (${untilText(f.t,'HL').replace(/ KST$/,'')} KST)\n사유: ${ruleLabel(s.rule,cfg,s.basis)} · 중단 ~ ${untilText(s.until,market)}\n일지에 '규칙 위반'으로 표시합니다.`});
 }

 // 5) 재시작 첫날(위험 절반) ---------------------------------------------------------------------------
 const live=st.stops.filter(s=>!s.cleared);
 const active=activeAt(live,now);
 let half={active:false,factor:cfg.restartFactor};
 if(!active.length){const ended=live.filter(s=>s.until<=now).sort((a,b)=>b.until-a.until)[0];
  if(ended){const hd=cal.dayOf(ended.until);if(hd===today&&cfg.restartFactor<1){half={active:true,day:today,factor:cfg.restartFactor,afterStop:ended.id,reason:`${ruleLabel(ended.rule,cfg,ended.basis)} 중단이 끝난 뒤 첫 거래일`};
   const key=`${market}:restart:${today}`;if(!st.sent[key]&&!refs.has(key)){st.sent[key]=now;
    const dr=cfg.defaultRisk>0?` · 1회 위험 ${round(cfg.defaultRisk*cfg.restartFactor,4)}% (설정 ${cfg.defaultRisk}%의 ${Math.round(cfg.restartFactor*100)}%)`:` · 1회 위험 ${Math.round(cfg.restartFactor*100)}%로 축소`;
    events.push({ref:key,kind:'restart',rule:ended.rule,at:now,detail:{day:today,factor:cfg.restartFactor,afterStop:ended.id}});
    messages.push({key,text:`✅ ${M} 거래 중단 해제 · 오늘 ${cal.label(today)}은 재시작 첫날${dr}\n앱 포지션 계산기에 절반 위험이 자동 적용됩니다.`});}}}}

 // 6) 정리 + 상태 요약(앱 배너) ----------------------------------------------------------------------
 const cutDay=new Date(now-KEEP_DAYS*86400000).toISOString().slice(0,10);
 for(const d of Object.keys(st.days))if(d<cutDay)delete st.days[d];
 if(st.rp)for(const d of Object.keys(st.rp.days||{}))if(d<cutDay)delete st.rp.days[d];
 st.stops=st.stops.filter(s=>s.until>now-KEEP_DAYS*86400000);
 for(const [k,v] of Object.entries(st.sent))if(v<now-KEEP_DAYS*86400000)delete st.sent[k];
 const shown=live.filter(s=>s.until>now).sort((a,b)=>a.from-b.from).map(s=>({id:s.id,rule:s.rule,label:ruleLabel(s.rule,cfg,s.basis),from:s.from,until:s.until,untilText:untilText(s.until,market),fromText:untilText(s.from,market),active:s.from<=now,reason:s.reason}));
 const streakNow=(()=>{const days=Object.values(st.days).filter(countable).sort((a,b)=>b.day.localeCompare(a.day));let n=0;for(const r of days){if(r.loss)n++;else break;}return n;})(),streakShown=prMode&&rStreak!==null?rStreak:streakNow,pmode=prMode?'realized':'equity';
 const pub=m=>m?{key:m.key,startEquity:m.startEquity,startSource:m.startSource??null,startDay:m.startDay??null,pnl:m.pnl,pct:m.pct,flows:m.flows??0,limit:m.limit??null,ratio:m.ratio??null,ddPct:m.ddPct??null,
  ...(m.cut?{cut:m.cut}:{}),...(m.beforeStart?{beforeStart:true}:{}),
  ...(m.basis==='realized'?{basis:'realized',budget:m.budget??null,denomMode:m.denomMode??null,denomSource:m.denomSource??null,parts:m.parts??null,source:m.source??null,ref:m.ref??null,missing:m.missing??null,...(m.days!==undefined?{days:m.days}:{})}:{})}:null;
 const status={v:1,market,updatedAt:now,today,todayLabel:cal.label(today),
  equity:eq?{value:eq.value,t:eq.t,source:eq.source,stale:!!eq.stale}:null,
  limits:cfg.limits,periods:{day:pub(periods.day),week:pub(periods.week),month:pub(periods.month),...(realized?{dayEquity:pub(periods.dayEquity)}:{}),...(prMode?{weekEquity:pub(periods.weekEquity),monthEquity:pub(periods.monthEquity)}:{})},
  dayBasis:realized?'realized':'equity',periodBasis:pmode,...(clearedBasis.length?{clearedBasis:clearedBasis.map(s=>s.id)}:{}),
  riskStart:rs?{date:rs.date,day:rs.day,at:rs.at,atText:untilText(rs.at,market),before,base:st.riskStart?.base?{equity:st.riskStart.base.equity,at:st.riskStart.base.at,source:st.riskStart.base.source,approx:!!st.riskStart.base.approx}:null,cleared:clearedNow.map(s=>s.id)}:null,
  stops:shown,stopped:active.length>0,halfRisk:half,
  streak:{count:streakShown,basis:pmode,need:cfg.streakDays,lossPct:cfg.streakLossPct,stopDays:cfg.streakStopDays},
  config:{limits:cfg.limits,streakDays:cfg.streakDays,streakLossPct:cfg.streakLossPct,streakStopDays:cfg.streakStopDays,restartFactor:cfg.restartFactor,checkSec:cfg.checkSec,warn:cfg.warn,riskStart:rs?rs.date:null,boundary:market==='US'?'미국 장 마감 16:00 ET(서머타임 자동, NYSE 휴장일 제외)':realized?(pmode==='realized'?'하루·주·월·연속 손실 UTC 00:00(KST 09:00, 주 = 월요일 09:00 KST 시작)':'하루 한도 UTC 00:00(KST 09:00) · 주·월·연속 손실 한국시간 24:00'):'한국시간 24:00(KST 자정)',
   dayRule:realized?'하루 = 오늘 실현손익(수수료·펀딩 포함) ÷ 직전 마감 잔액(없으면 현재 기준액) — 앱과 같은 기준, 미실현은 참고만':'하루 = 계좌 순자산 변화(실현+미실현) − 입출금',
   periodRule:pmode==='realized'?'주·월 = 기간 실현손익 합 ÷ 현재 기준액(앱 acctBasis) · 연속 손실일 = 그날 실현손익 ÷ 직전 마감 ≤ −'+cfg.streakLossPct+'% — 앱과 같은 기준, 입출금 제외, 미실현은 참고만':'주·월·연속 손실 = 계좌 순자산 변화(실현+미실현) − 입출금, 분모 = 기간 시작 자산'},
  note:before?`손실 한도 기준일 ${md(rs.date)} 전 — ${untilText(rs.at,market)}부터 판정합니다`:realized&&periods.day?.missing&&periods.day.missing!=='before-start'?(periods.day.missing==='data'?'오늘 실현손익 데이터를 읽지 못해 하루 한도 판정을 건너뜀':'하루 한도 분모(직전 마감·현재 기준액)가 없어 하루 판정을 건너뜀'):prMode&&!PR?'주·월 실현손익 데이터를 읽지 못해 주·월·연속 손실 판정을 건너뜀':eq?null:'자산 값을 아직 읽지 못했습니다'};
 const changedDays=[...finalized,...(rec?[rec]:[])].map(r=>({...r}));
 return {state:st,messages,events,status,days:changedDays,violations};
}

// 수동 중단 해제(.env 잘못 등). 해제한 id 목록 반환.
export function clearStops(prev,now){const st=structuredClone(prev);const ids=[];for(const s of st.stops)if(!s.cleared&&s.until>now){s.cleared=now;ids.push(s.id);}return {state:st,ids};}
