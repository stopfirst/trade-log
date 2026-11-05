// trade-alert 2.14.0 — 단타 판정 (앱 v121-scalp와 같은 기준). 매일 복기 알림(remind.mjs)에서 예외 없는 단타를 빈 칸 알림에서 뺌.
// 단타 = 끝난 거래(앱 calcTrade done)의 첫 진입 체결 ~ 마지막 청산 체결 < 기준 분.
//   기준 분 = 앱 설정 settings.v121Min(review_gaps v12 = alert18.sql이 줌) → 없으면 .env SCALP_MIN(기본 30). SCALP_MIN=0 = 끔(2.13.0까지와 같은 동작).
//   시각 = 앱 v99Ms: 체결 timestamp, 없으면 HL = UTC 날짜·시각, 미국 = 미국 동부 벽시계. 진행 중 거래·시각 모르는 거래는 판정 안 함(스윙 취급).
// 예외(단타여도 알림에 남음) = 앱 v121Exc:
//   · 규칙 위반(앱 processOf): 저장한 위반(violations)·process 'violation'·청산 체결 위반 표시·서버 중단 중 진입(risk_events, 앱 v21Viol)
//     · 앱 v99 복수매매 의심·n연패 후 진입·위험 키움·갈아타기 '강해 보여서'(앱 v109에서 ×로 숨긴 감지는 뺌)
//   · 손익비 기준 미달(앱 v92Checks 'rr' bad = v71PlanRR < v92MinRR)
//   · 앱 v37 자동 감지 '포지션 위험 초과'·'총 오픈 위험 초과'(기준액 = 거래의 acctAt → 없으면 설정 account; 둘 다 없으면 판정 안 함)
//     '한도 도달 뒤 진입'은 서버가 직접 판정한 거래 중단 중 진입(위 v21)으로 대신함(아래 한계 참고)
//   · 실현 R < −1 (손익 = 체결가·수수료·HL 펀딩 합, 1R = initialRisk. 1R 없으면 판정 못 함 → 다른 위반 없으면 빠짐, 앱과 같음)
export const SCALP_DEFAULT=30;
const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null;};
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const timeOK=s=>!s||/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s);
/** 앱 sortEvents: 날짜 → 시각 → seq(없으면 입력 순서) */
const sortEv=(a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time||'00:00:00').localeCompare(String(b.time||'00:00:00'))||((num(a.seq)??a._i??0)-(num(b.seq)??b._i??0));
const sorted=(L,base=0)=>(Array.isArray(L)?L:[]).filter(e=>e&&typeof e==='object').map((e,i)=>({...e,_i:base+i})).sort(sortEv);

/** .env SCALP_MIN: 빈칸 = 30, 0 = 끔, 1~1440 정수. 이상한 값 = 30(로그용 bad). */
export function scalpConfig(env){const raw=String(env.SCALP_MIN??'').trim();if(raw==='')return {min:SCALP_DEFAULT,enabled:true,raw};
 const v=Number(raw);if(v===0)return {min:0,enabled:false,raw};if(Number.isInteger(v)&&v>=1&&v<=1440)return {min:v,enabled:true,raw};return {min:SCALP_DEFAULT,enabled:true,raw,bad:true};}
/** 일지(시장)별 기준 분: 앱 settings.v121Min(양수) → 없으면 .env. .env 0이면 무조건 끔. */
export function scopeMin(j,cfg){if(!cfg||!cfg.enabled)return 0;const a=num(j&&j.v121Min);return a>0?a:cfg.min;}
/** review_gaps가 v12(alert18.sql)인지 = 단타 판정에 필요한 칸(체결가·1R 등)이 있는지. 거래가 없으면 판단 불가 → true. */
export function hasScalpData(journal){for(const sc of ['HL','US']){const tr=journal?.[sc]?.trades;if(Array.isArray(tr))for(const t of tr)if(t&&typeof t==='object')return Object.prototype.hasOwnProperty.call(t,'initialRisk')&&Object.prototype.hasOwnProperty.call(t,'srvViol');}return true;}

/** 미국 동부 벽시계 → UTC ms (앱 v99EtMs) */
export function etMs(date,tm){const g=Date.parse(date+'T'+tm+'Z');if(!Number.isFinite(g))return null;
 const off=x=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(x)).map(q=>[q.type,q.value]));
  return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-x;};
 let ms=g-off(g);ms=g-off(ms);return ms;}
/** 체결 시각 ms (앱 v99Ms) */
export function evMs(e,hl){if(!e)return null;if(Number.isSafeInteger(e.timestamp))return e.timestamp;if(!dateOK(e.date))return null;
 let tm=timeOK(e.time)?String(e.time):'00:00:00'; // 앱 그대로: 시각이 비면(null·'') 시각 모름 → nullif(tm.length===5)tm+=':00';
 if(hl){const x=Date.parse(e.date+'T'+tm+'Z');return Number.isFinite(x)?x:null;}return etMs(e.date,tm);}
/** 보유 시간(첫 진입 ~ 마지막 청산, 앱 v121HoldMs) */
export function holdMs(t,hl){let E=null,X=null;for(const e of t.entries||[]){const m=evMs(e,hl);if(m!==null&&(E===null||m<E))E=m;}for(const f of t.fills||[]){const m=evMs(f,hl);if(m!==null&&(X===null||m>X))X=m;}
 if(E===null||X===null||X<E)return null;return X-E;}
/** 앱 calcTrade 요약: valid·done·손익(수수료 차감, HL 펀딩 합 더함)·R. 끝난 거래의 이동평균 실현 합 = 현금 흐름 합이라 같은 값. */
export function calc(t,hl){const sign=hl&&t.direction==='short'?-1:1;let qty=0,avg=0,pnl=0,totalIn=0,sold=0,valid=true;
 const ev=[...sorted(t.entries).map(e=>({...e,k:'in'})),...sorted(t.fills,10000).map(e=>({...e,k:'out'}))].sort(sortEv);
 for(const e of ev){const q=num(e.shares),p=num(e.price),fee=num(e.fee)||0;if(!(q>0)||!(p>0)||!dateOK(e.date)||!timeOK(e.time)){valid=false;continue;}
  if(e.k==='in'){avg=(avg*qty+p*q)/(qty+q);qty+=q;totalIn+=q;pnl-=fee;}
  else{if(q-qty>Number.EPSILON*Math.max(1,q,qty,totalIn)*64){valid=false;continue;}pnl+=q*(p-avg)*sign-fee;qty-=q;sold++;if(Math.abs(qty)<=Number.EPSILON*Math.max(1,q,totalIn)*64){qty=0;avg=0;}}}
 if(hl){const f=num(t.funding);if(f!==null)pnl+=f;}
 const risk=num(t.initialRisk),done=valid&&totalIn>0&&qty===0;
 return {valid,done,pnl:valid?pnl:null,R:valid&&risk>0&&sold>0?Number((pnl/risk).toPrecision(12)):null,qty};}
/** 앱 v71PlanRR: (목표 − 첫 진입가) ÷ (첫 진입가 − 최초 손절). 목표 = riskPlan.target → 없으면 R 도구 tp. */
export function planRR71(t){const e0=sorted(t.entries)[0],p0=e0?num(e0.price):null,s0=num(t.stop0);let tg=num(t.target);if(!(tg>0))tg=num(t.rrTp);
 if(!(p0>0&&s0>0&&tg>0)||p0===s0)return null;const v=(tg-p0)/(p0-s0);return v>0?v:null;}
const dismissed=t=>new Set(Array.isArray(t&&t.dismiss)?t.dismiss.filter(x=>typeof x==='string'&&x):[]);
const pctP=x=>x.toFixed(2)+'%',pctL=x=>String(Number(x.toFixed(4)))+'%'; // 앱 v37P · v37L

/** 앱 v99Build (복수매매·연패·위험 키움·갈아타기) — 한 일지(시장) 안에서. 반환 Map id → flags[] (v109 숨김 반영). */
export function v99Flags(trades,hl,{cool=15,maxLoss=3}={}){const coolMs=cool*60000,rows=[];
 for(const t of trades){const c=calc(t,hl);if(!c.valid)continue;const e0=sorted(t.entries)[0],E=evMs(e0,hl);if(E===null)continue;
  let X=null,xd=null;if(c.done&&(t.fills||[]).length){const f=sorted(t.fills).at(-1);X=evMs(f,hl);xd=f.date;}
  const R=num(t.initialRisk);rows.push({t,c,E,ed:e0.date,X,xd,loss:X!==null&&Number.isFinite(c.pnl)&&c.pnl<0,risk:R>0?R:null,name:String(t.name||'').toUpperCase()});}
 const losses=rows.filter(r=>r.loss).sort((a,b)=>a.X-b.X),out=new Map();
 for(const r of rows){const prior=losses.filter(L=>L.t!==r.t&&L.X<=r.E),L=prior.at(-1)||null,gap=L?r.E-L.X:null,flags=[];
  if(L&&coolMs>0&&gap<=coolMs)flags.push({code:'revenge',label:'복수매매 의심',viol:true});
  if(!hl){const sw=prior.filter(x=>x.xd===r.ed&&x.name!==r.name);if(sw.length){const w=r.t.v99Why;flags.push({code:'switch',label:w==='strong'?'갈아타기 · 강해 보여서':w==='plan'?'갈아타기 · 미리 정한 가격':'갈아타기',viol:w==='strong'});}}
  if(maxLoss>0){const d=prior.filter(x=>x.xd===r.ed);if(d.length>=maxLoss)flags.push({code:'maxloss',label:maxLoss+'연패 후 진입',viol:true});}
  if(L&&r.risk&&L.risk){const within=coolMs>0&&gap<=coolMs,next=L.xd===r.ed&&!rows.some(o=>o!==r&&o.t!==L.t&&o.E>=L.X&&o.E<r.E);
   if((within||next)&&r.risk>L.risk*(1+1e-9))flags.push({code:'riskup',label:'위험 키움',viol:true});}
  const ds=dismissed(r.t);out.set(r.t,flags.filter(f=>!ds.has('v99'+f.code)));}
 return out;}
const before=(e,ref)=>{if(Number.isSafeInteger(e.timestamp)&&Number.isSafeInteger(ref.timestamp))return e.timestamp<ref.timestamp;return String(e.date)+' '+String(e.time||'00:00:00')<String(ref.date)+' '+String(ref.time||'00:00:00');};
function openAt(x,ref,hl){const f=sorted(x.entries)[0];if(!f||!before(f,ref))return false;if(!calc(x,hl).valid)return false;
 let q=0;for(const e of [...(x.entries||[]).map(e=>({...e,k:1})),...(x.fills||[]).map(e=>({...e,k:-1}))])if(e&&before(e,ref))q+=e.k*(num(e.shares)||0);return q>1e-12;}
/** 앱 v37 '포지션 위험'·'총 오픈 위험' (v109 숨김 반영). 기준액 = acctAt → 설정 account. */
export function v37Flags(t,trades,j,hl){const out=[],ds=dismissed(t),f=sorted(t.entries)[0];if(!f)return out;
 const R=num(t.initialRisk),basis=num(t.acctAt)>0?num(t.acctAt):num(j&&j.account)>0?num(j.account):null;if(!(R>0&&basis>0))return out;
 const nn=(v,d)=>{const x=num(v);return x!==null&&x>=0?x:d;},rmax=nn(j&&j.riskMax,2),omax=nn(j&&j.openMax,6);
 if(rmax>0){const p=R/basis*100;if(p>rmax+1e-9&&!ds.has('risk'))out.push({code:'risk',label:`포지션 위험 ${pctP(p)} > ${pctL(rmax)}`});}
 if(omax>0&&!ds.has('open')){const others=trades.filter(x=>x!==t&&openAt(x,f,hl));if(others.every(x=>num(x.initialRisk)>0)){const tot=others.reduce((s,x)=>s+num(x.initialRisk),0)+R,p=tot/basis*100;
  if(p>omax+1e-9)out.push({code:'open',label:`총 오픈 위험 ${pctP(p)} > ${pctL(omax)}`});}}
 return out;}
/** 앱 rText: (+)숫자(최대 소수 2자리, en-US)R */
const rTxt=x=>Number.isFinite(x)?(x>0?'+':'')+(x===0?0:x).toLocaleString('en-US',{maximumFractionDigits:2})+'R':'—';
/** 한 일지(시장) 전체 판정. 반환 Map(trade → {hold, scalp, exc[], R, pnl, revenge}). 끝난 거래·시각 아는 거래만 들어감. */
export function model(j,hl,min){const out=new Map();if(!(min>0)||!j||!Array.isArray(j.trades))return out;const trades=j.trades.filter(t=>t&&typeof t==='object');
 const cool=(()=>{const v=num(j.v99Cool);return v===null||v<0?15:v;})(),maxLoss=(()=>{const v=num(j.v99MaxLoss);return v===null||v<0?3:Math.floor(v);})(),minRR=num(j.minRR)>0?num(j.minRR):2;
 let F=null;const flags=()=>F||(F=v99Flags(trades,hl,{cool,maxLoss}));
 for(const t of trades){const c=calc(t,hl);if(!c.valid||!c.done)continue;const h=holdMs(t,hl);if(h===null)continue;const scalp=h<min*60000,r={hold:h,scalp,exc:[],R:c.R,pnl:c.pnl,revenge:false};
  if(scalp){const why=[],fl=flags().get(t)||[];r.revenge=fl.some(f=>f.code==='revenge');
   const viol=fl.filter(f=>f.viol).map(f=>f.label);
   if(t.srvViol===true||t.viol===true||t.fillViol===true||t.process==='violation'||viol.length){if(viol.length)why.push(...viol);else why.push(t.srvViol===true?'거래 중단 중 진입':'규칙 위반');}
   const rr=planRR71(t);if(rr!==null&&rr<minRR-1e-9)why.push('손익비 미달');
   for(const x of v37Flags(t,trades,j,hl))why.push(x.label);
   if(c.R!==null&&Number.isFinite(c.R)&&c.R<-1-1e-9)why.push('−1R 넘긴 손실 ('+rTxt(c.R)+')');
   r.exc=[...new Set(why)];}
  out.set(t,r);}
 return out;}
export const holdText=ms=>{const m=Math.floor(ms/60000+1e-9);if(m<1)return '1분 미만';if(m<60)return m+'분';const h=Math.floor(m/60),r=m%60;return h+'시간'+(r?' '+r+'분':'');};
