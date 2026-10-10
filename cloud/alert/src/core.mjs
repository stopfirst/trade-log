// trade-alert core: pure calculations and alert rules (no I/O). Same period rules as the app:
//  * periodKey: day = date, week = Monday of that date, month = YYYY-MM (app periodKey()).
//  * US "today" = Korean date (Asia/Seoul) when Kiwoom auto-records exist (app kjToday()),
//    otherwise the US Eastern date (app marketNow()). HL "today" = UTC date.
//  * Limits: settings.limD/limW/limM are % of the account basis (app limitStatus()):
//    budget = basis * limit / 100, hit when sum <= -budget. Only entries dated <= today count.
//  * US ledger (app KJ.effectiveLedger): a date that has a Kiwoom daily report uses the broker
//    total; manual records on that date are ignored. Other dates use manual records.
//  * HL ledger: collector fills sum(closedPnl - fee) + funding (delta.usdc) per UTC date,
//    plus manual HL trades of the journal. Without the collector, the saved journal only.

export const MARKET_LABEL={US:'미국주식',HL:'하이퍼리퀴드'};
export const MODE_LABEL={day:'오늘',week:'이번 주',month:'이번 달'};
export const LIMIT_LABEL={day:'하루 한도',week:'주 한도',month:'월 한도'};
const MODES=[['limD','day'],['limW','week'],['limM','month']];

export const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};
export function zonedParts(ms,timeZone){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return {weekday:p.weekday,date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export const kstDate=ms=>zonedParts(ms,'Asia/Seoul').date;
export const etDate=ms=>zonedParts(ms,'America/New_York').date;
export const utcDate=ms=>new Date(ms).toISOString().slice(0,10);
export function periodKey(date,mode){if(mode==='month')return date.slice(0,7);if(mode==='day')return date;const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const timeOK=s=>!s||/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s);
function sortEvents(a,b){return String(a.date).localeCompare(String(b.date))||String(a.time||'00:00:00').localeCompare(String(b.time||'00:00:00'))||((num(a.seq)??a.fallback??0)-(num(b.seq)??b.fallback??0));}

// Port of the app's calcTrade() ledger part (average cost; exit = qty*(price-avg)*sign - fee;
// entry fee on the entry date; HL funding while a position is open). Invalid trade -> no ledger.
export function tradeLedger(t){
 const sign=t.direction==='short'?-1:1,ledger=[];let qty=0,avg=0,pnl=0,totalIn=0,sold=0,valid=true,lastExit=null;
 const events=[...(t.entries||[]).map((r,i)=>({...r,kind:'entry',fallback:i})),...(t.fills||[]).map((r,i)=>({...r,kind:'fill',fallback:10000+i})),...(t.market==='HL'?(t.funding||[]).map((r,i)=>({...r,kind:'funding',fallback:20000+i})):[])].sort(sortEvents);
 for(const e of events){
  if(e.kind==='funding'){const a=num(e.amount);if(a===null||!dateOK(e.date)||!timeOK(e.time)||!(qty>0)){valid=false;continue;}pnl+=a;ledger.push({date:e.date,time:e.time||'',usd:a,kind:'funding'});continue;}
  const q=num(e.shares),p=num(e.price),fee=num(e.fee)||0;
  if(!(q>0)||!(p>0)||(fee<0&&!e.sourceKey)||!dateOK(e.date)||!timeOK(e.time)){valid=false;continue;}
  if(e.kind==='entry'){avg=(avg*qty+p*q)/(qty+q);qty+=q;totalIn+=q;pnl-=fee;if(fee)ledger.push({date:e.date,time:e.time||'',usd:-fee,kind:'entry'});}
  else{if(q-qty>Number.EPSILON*Math.max(1,q,qty,totalIn)*64){valid=false;continue;}const gain=q*(p-avg)*sign-fee;pnl+=gain;const row={date:e.date,time:e.time||'',usd:gain,kind:'fill'};ledger.push(row);lastExit=row;qty-=q;sold++;if(Math.abs(qty)<=Number.EPSILON*Math.max(1,q,totalIn)*64){qty=0;avg=0;}}
 }
 // Closed exchange trades: the app books the exact cash flow on the last exit (closedCashflow).
 if(valid&&qty===0&&t.sync?.positionStatus==='CLOSED'&&t.sync?.pnlBasis==='fill-cashflow-v1'&&t.sync?.historyComplete&&lastExit){
  let cash=0,fees=0,fund=0,q2=0;const s=sign;
  for(const [rows,side] of [[t.entries||[],1],[t.fills||[],-1]])for(const e of rows){const q=num(e.sharesText??e.shares),p=num(e.priceText??e.price);q2+=side*q;cash-=side*q*p*s;fees+=num(e.feeText??e.fee)||0;}
  for(const f of t.funding||[])fund+=num(f.amountText??f.amount)||0;
  if(Math.abs(q2)<1e-9){const exact=cash-fees+fund;lastExit.usd+=exact-pnl;pnl=exact;}
 }
 const done=valid&&totalIn>0&&qty===0;
 return {valid,ledger:valid?ledger:[],done,pnl:valid?pnl:null,lastDate:lastExit?.date||null,lastTime:lastExit?.time||''};
}
const isBroker=t=>t?.sync?.source==='kiwoom'&&t?.market!=='HL'&&['day','holding','retired'].includes(t?.sync?.journalKind);

// ---- build per-market models from alert_status() data ---------------------------------
// journal: the (possibly cached) alert_journal() object of that market.
export function buildUS(data,journal,cfg={}){
 const kw=data?.us?.kw||{};const days=new Map();
 for(const d of journal?.broker_days||[])if(dateOK(d.date))days.set(d.date,{date:d.date,asOf:num(d.as_of)||0,total:num(d.total)??0,rows:(d.rows||[]).map(r=>({symbol:String(r.symbol),net:num(r.net)??0,t:''}))});
 for(const d of kw.days||[]){if(!dateOK(d.date))continue;const old=days.get(d.date);if(!old||num(d.as_of)>=old.asOf)days.set(d.date,{date:d.date,asOf:num(d.as_of)||0,total:num(d.total)??0,rows:(d.rows||[]).map(r=>({symbol:String(r.symbol),net:num(r.net)??0,t:typeof r.t==='string'?r.t:''}))});}
 const kiwoom=days.size>0||!!kw.latest;
 const trades=(journal?.trades||[]).filter(t=>!isBroker(t)&&t.market!=='HL');
 const ledger=[...days.values()].map(d=>({date:d.date,usd:d.total,kind:'broker'}));const closed=[];
 for(const t of trades){const c=tradeLedger(t);if(!c.valid)continue;
  const masked=c.ledger.some(e=>days.has(e.date));
  for(const e of c.ledger)if(!days.has(e.date))ledger.push(e);
  if(c.done&&!masked&&c.lastDate)closed.push({key:'m:'+t.id,label:String(t.name||''),date:c.lastDate,time:c.lastTime||'',pnl:c.pnl});}
 for(const d of days.values())d.rows.forEach((r,i)=>closed.push({key:'k:'+d.date+':'+r.symbol,label:r.symbol,date:d.date,time:r.t||'',order:i,pnl:r.net}));
 // account basis: Kiwoom total (securities + USD cash, app kwAccountTotal) > manual setting
 let basis=null,basisSource=null;const s=kw.latest?.summary,c=s?.cash;
 if(s&&s.currency==='USD'&&c&&c.apiId==='ust21160'&&c.currency==='USD'&&c.krwIncluded===false){const sec=num(s.reportedSecuritiesValue),cash=num(c.usd);if(sec!==null&&sec>=0&&cash!==null){const tot=Math.round((sec+cash)*100)/100;if(tot>0){basis=tot;basisSource='키움 총 계좌금액';}}}
 if(basis===null&&num(journal?.settings?.account)>0){basis=num(journal.settings.account);basisSource='앱 계좌 기준액';}
 if(num(cfg.basisOverride)>0){basis=num(cfg.basisOverride);basisSource='.env 지정';}
 let unrealized=null;const pos=(kw.latest?.positions||[]).filter(p=>num(p.quantity)>0);
 if(kw.latest&&pos.every(p=>num(p.reportedPnl)!==null))unrealized=pos.reduce((a,p)=>a+num(p.reportedPnl),0);
 return {market:'US',kiwoom,zone:kiwoom?'Asia/Seoul':'America/New_York',ledger,closed:sortClosed(closed),basis,basisSource,limits:limitsOf(journal?.settings,cfg.limitsOverride),unrealized,hasData:!!journal?.exists||kiwoom};
}
export function buildHL(data,journal,cfg={}){
 const raw=data?.hl?.raw||{};const useRaw=!!raw.registered;const ledger=[],closed=[];
 if(useRaw){
  for(const d of raw.fills_daily||[])if(dateOK(d.date))ledger.push({date:d.date,usd:num(d.pnl)??0,kind:'fills'});
  for(const d of raw.funding_daily||[])if(dateOK(d.date))ledger.push({date:d.date,usd:num(d.amount)??0,kind:'funding'});
  for(const r of raw.closed||[]){const ms=num(r.closed_at);if(!ms)continue;const iso=new Date(ms).toISOString();closed.push({key:'h:'+r.coin+':'+ms,label:String(r.coin),date:iso.slice(0,10),time:iso.slice(11,19),pnl:num(r.pnl)??0});}
 }
 const trades=(journal?.trades||[]).filter(t=>t.market==='HL'||!t.market);
 const assigned=new Set();
 for(const t of trades){if(useRaw&&t.sync?.source==='hyperliquid')continue;for(const f of t.funding||[])if(f.sourceKey)assigned.add(f.sourceKey);
  const c=tradeLedger({...t,market:'HL'});if(!c.valid)continue;ledger.push(...c.ledger);
  if(c.done&&c.lastDate)closed.push({key:'m:'+t.id,label:String(t.name||''),date:c.lastDate,time:c.lastTime||'',pnl:c.pnl});}
 if(!useRaw)for(const f of journal?.account_funding||[]){if(assigned.has(f.sourceKey)||!num(f.timestamp))continue;ledger.push({date:utcDate(num(f.timestamp)),usd:num(f.amount)??0,kind:'account-funding'});}
 let basis=null,basisSource=null;
 if(num(cfg.liveBalance)>0){basis=num(cfg.liveBalance);basisSource='하이퍼리퀴드 BALANCE';}
 else if(num(journal?.settings?.account)>0){basis=num(journal.settings.account);basisSource='앱 계좌 기준액';}
 if(num(cfg.basisOverride)>0){basis=num(cfg.basisOverride);basisSource='.env 지정';}
 return {market:'HL',zone:'UTC',useRaw,address:raw.address||null,ledger,closed:sortClosed(closed),basis,basisSource,limits:limitsOf(journal?.settings,cfg.limitsOverride),unrealized:num(cfg.unrealized),hasData:!!journal?.exists||useRaw};
}
function limitsOf(settings,override){
 const o=Array.isArray(override)?override:null;const out={};
 for(const [k,mode] of MODES){const v=o?o[MODES.findIndex(x=>x[1]===mode)]:num(settings?.[k]);out[mode]=num(v)>0?num(v):null;}
 return out;
}
function sortClosed(a){return a.sort((x,y)=>x.date.localeCompare(y.date)||String(x.time).localeCompare(String(y.time))||((x.order??0)-(y.order??0))||x.key.localeCompare(y.key));}

// Consecutive losing closed trades counted from the most recent one (0 or profit breaks).
export function lossStreak(closed){let n=0;const items=[];for(let i=closed.length-1;i>=0;i--){if(closed[i].pnl<0){n++;items.push(closed[i]);}else break;}return {count:n,items,last:closed.length?closed[closed.length-1]:null};}

export function todayFor(model,nowMs){return model.zone==='UTC'?utcDate(nowMs):model.zone==='Asia/Seoul'?kstDate(nowMs):etDate(nowMs);}
export function periodSums(model,nowMs,{includeUnrealized=false}={}){
 const today=todayFor(model,nowMs),out={today};
 for(const mode of ['day','week','month']){const pk=periodKey(today,mode);let sum=0;for(const e of model.ledger)if(e.date<=today&&periodKey(e.date,mode)===pk)sum+=e.usd;
  if(includeUnrealized&&Number.isFinite(model.unrealized))sum+=model.unrealized;
  sum=Math.round(sum*1e6)/1e6;
  const limit=model.limits[mode],budget=model.basis>0&&limit>0?model.basis*limit/100:null;
  out[mode]={key:pk,sum,limit,budget,ratio:budget?Math.max(0,-sum)/budget:null};}
 return out;
}

// ---- formatting -------------------------------------------------------------------------
export const usd=x=>(x<0?'-':'')+'$'+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export const signed=x=>(x>0?'+':'')+usd(x);
const pctText=r=>Math.floor(r*100+1e-9)+'%';
export function limitMessage(model,mode,p,th,{includeUnrealized=false}={}){
 const m=MARKET_LABEL[model.market],pct=pctText(p.ratio),extra=includeUnrealized?' (미실현 포함)':'';
 if(th>=100)return `⛔ ${m} ${MODE_LABEL[mode]} 손실 ${usd(p.sum)} · ${LIMIT_LABEL[mode]} ${usd(p.budget)} 도달(${pct})${extra}\n신규 진입 전에 계획을 확인하세요.`;
 return `${th>=80?'⚠️':'🔔'} ${m} ${MODE_LABEL[mode]} 손실 ${usd(p.sum)} · ${LIMIT_LABEL[mode]} ${usd(p.budget)}의 ${pct}${extra}`;
}
export function streakMessage(model,s){
 const recent=s.items.slice(0,3).map(x=>`${x.label} ${usd(x.pnl)}`).join(', ');
 return `🔻 ${MARKET_LABEL[model.market]} 연속 손실 ${s.count}회 · 최근 ${recent}`;
}
export function unsetMessage(model){
 const miss=[];if(!(model.basis>0))miss.push('계좌 기준액');const lm=['day','week','month'].filter(m=>!model.limits[m]);
 if(lm.length===3)miss.push('손실 한도(하루·주·달)');else if(lm.length)miss.push(lm.map(m=>LIMIT_LABEL[m]).join('·'));
 return `ℹ️ ${MARKET_LABEL[model.market]} ${miss.join(', ')} 미설정 → 해당 한도 알림은 건너뜁니다. 앱 설정 → 계좌·위험에서 입력하세요.`;
}
export function summaryMessage(models,nowMs,opts={}){
 const et=zonedParts(nowMs,'America/New_York');const lines=[`📊 일일 요약 · 미국 ${et.date.slice(5).replace('-','/')} 장 마감 후`];
 for(const model of models){const p=periodSums(model,nowMs,opts);const part=mode=>{const x=p[mode];return `${MODE_LABEL[mode]} ${signed(x.sum)}`+(x.budget?` (${LIMIT_LABEL[mode].replace(' 한도','')} ${pctText(x.ratio)})`:'');};
  lines.push(`${MARKET_LABEL[model.market]} ${part('day')} · ${part('week')} · ${part('month')}`);
  const s=lossStreak(model.closed);if(s.count>0)lines.push(`  연속 손실 ${s.count}회`);}
 if(opts.includeUnrealized)lines.push('(미실현 포함)');
 return lines.join('\n');
}

// ---- rules --------------------------------------------------------------------------------
// state: {sent:{key:isoTime}, unsetNotified:{market:true}, summary:{date:true}}
// Returns {messages:[{key,text}], marks:[keys]}; the caller marks keys only after a send succeeds.
export function evaluate(models,nowMs,state,cfg){
 const out=[];const sent=state.sent||{};
 for(const model of models){
  const p=periodSums(model,nowMs,cfg);
  for(const mode of ['day','week','month']){const x=p[mode];if(!x.budget)continue;
   const crossed=cfg.thresholds.filter(th=>x.ratio*100>=th-1e-9);if(!crossed.length)continue;
   const keys=crossed.map(th=>`${model.market}:${mode}:${x.key}:${th}`);const fresh=keys.filter(k=>!sent[k]);if(!fresh.length)continue;
   const top=Math.max(...crossed);out.push({keys,text:limitMessage(model,mode,x,top,cfg)});}
  if(cfg.streakN>0){const s=lossStreak(model.closed);
   if(s.count>=cfg.streakN&&s.last){const key=`${model.market}:streak:${cfg.streakRepeat?s.last.key:s.items[s.items.length-1].key}`;
    if(!sent[key])out.push({keys:[key],text:streakMessage(model,s)});}}
 }
 return out;
}
export function isActive(nowMs,{hlAlwaysActive=false,hasHL=false}={}){
 if(hlAlwaysActive&&hasHL)return true;const et=zonedParts(nowMs,'America/New_York');
 return et.weekday!=='Sat'&&et.weekday!=='Sun'&&et.minutes>=4*60&&et.minutes<20*60;
}
export function summaryDue(nowMs,state,cfg){
 if(!cfg.dailySummary)return null;const et=zonedParts(nowMs,'America/New_York');
 if(et.weekday==='Sat'||et.weekday==='Sun')return null;const [h,m]=cfg.summaryTime;
 if(et.minutes<h*60+m)return null;if(et.minutes>=20*60+59)return null;
 const key='summary:'+et.date;return state.sent?.[key]?null:key;
}
export function pruneState(state,nowMs,keepDays=45){
 const cut=nowMs-keepDays*86400000;const sent={};for(const [k,v] of Object.entries(state.sent||{})){const t=Date.parse(v);if(Number.isFinite(t)&&t>=cut)sent[k]=v;}
 return {...state,sent};
}
