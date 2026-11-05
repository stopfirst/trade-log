// trade-alert 2.16.0 (alert20) — HL 하위계정 '탄창' (앱 v123-subacct와 같은 규칙, 순수 함수 + 알림 처리기)
//  사용자 규칙(2026-11-05): 매일 HL 하루 시작(UTC 00:00 = 09:00 KST)에 계좌의 2%(= 하루 손실 한도)만 하위계정 하나('탄창')에 넣고
//  그 계정으로만 거래. 장중 재충전 금지. 주계정 = 금고.
//  * 탄창 목록: 앱 설정(Supabase 일지 state.settings.v123Subs, alert20.sql mag_status로 읽음) → 없으면 .env HL_SUBS.
//    − v123Ex(앱 제외 목록, 없으면 Scalping 0x2b4f…eea9 + 이름 'Scalping') − 주계정 − Scalping(항상). 최대 5개.
//  * 잔고: HL info subAccounts(주계정) 응답 — 앱 v123Bal과 같음(통합 계좌처럼 현물 USDC hold ≈ 무기한 계좌가치면 현물 USDC total, 아니면 무기한 + 현물 USDC).
//    HIP-3 dex 잔고는 안 셈(앱은 거래한 dex 최대 4개를 더함 — 한계).
//  * 마감값: 탄창 주소의 HL portfolio 계좌가치 기록점 중 마감 시각에 가장 가까운 점(4시간 이내, 근삿값 — 앱과 같음).
//  * 주↔탄창(·탄창끼리) 이체(send·subAccountTransfer·internalTransfer·spotTransfer)는 합산 계산 안에서 입출금 아님(내부 이동).
//  * 알림(각각 .env로 끔, 같은 사건 1회): 탄창 소진 · 장중 재충전 · 금고에서 거래 · 09:00 탄창 점검.
import * as src from './sources.mjs';
import * as day from './day.mjs';
import * as fmt from './format.mjs';

export const SCALP='0x2b4f2042354fadf45922a6e7593b79adf0beeea9';
const MIN=60000,HOUR=3600000,DAY=86400000;
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null;};
const r2=x=>Math.round(x*100)/100;
export const addr=a=>{a=String(a||'').trim().toLowerCase();return /^0x[0-9a-f]{40}$/.test(a)?a:'';};
/** 앱 v123Split: 공백·쉼표로 나눈 주소, 소문자, 중복 없음 */
export const split=s=>[...new Set(String(s||'').split(/[\s,]+/).map(addr).filter(Boolean))];
const onOff=(env,k,d)=>{const v=String(env[k]??'').trim().toLowerCase();if(!v)return d;if(['1','true','yes','on','켬'].includes(v))return true;if(['0','false','no','off','끔'].includes(v))return false;return null;};

/** .env → 탄창 설정. errors = 형식 오류 목록(시작 시 CONFIG_INCOMPLETE) */
export function magConfig(env){
 const errors=[];
 const raw=String(env.HL_SUBS??'').trim(),parts=raw?raw.split(/[\s,]+/).filter(Boolean):[];
 if(parts.some(p=>!addr(p)))errors.push('HL_SUBS (탄창 하위계정 주소 0x… 40자리, 여러 개면 쉼표 · 비우면 앱 설정만)');
 const flag=(k,d)=>{const v=onOff(env,k,d);if(v===null){errors.push(k+' (1 = 켬, 0 = 끔)');return d;}return v;};
 const nm=(k,d,lo,hi)=>{const v=String(env[k]??'').trim();if(!v)return d;const x=Number(v);if(!Number.isFinite(x)||x<lo||x>hi){errors.push(`${k} (${lo}–${hi})`);return d;}return x;};
 const enabled=flag('MAG',true);
 return {enabled,envSubs:split(raw).slice(0,5),
  alerts:{empty:flag('MAG_EMPTY_ALERT',true),refill:flag('MAG_REFILL_ALERT',true),vault:flag('MAG_VAULT_ALERT',true),open:flag('MAG_OPEN_ALERT',true)},
  pct:nm('MAG_PCT',2,0.1,100),emptyPct:nm('MAG_EMPTY_PCT',10,1,50),openTolPct:nm('MAG_OPEN_TOL_PCT',10,1,100),openMin:nm('MAG_OPEN_CHECK_MIN',10,1,120),errors};
}

/** HL info subAccounts → [{addr,name,ch,spot}] */
export function parseSubAccounts(r){
 if(r===null)return [];if(!Array.isArray(r))throw Error('HL_BAD_SUBACCOUNTS');
 const out=[];for(const a of r){const x=addr(a?.subAccountUser);if(!x)continue;out.push({addr:x,name:String(a?.name||'').slice(0,40),ch:a?.clearinghouseState||null,spot:a?.spotState||null});}return out;
}
/** 앱 v123Bal(HIP-3 dex 제외): 통합 계좌(현물 USDC hold ≈ 무기한 계좌가치)면 현물 USDC total, 아니면 무기한 + 현물 USDC */
export function subBalance(sa){
 const ms=sa?.ch?.marginSummary||{},perp=num(ms.accountValue)||0,bl=Array.isArray(sa?.spot?.balances)?sa.spot.balances:[];
 const u=bl.find(b=>b&&(b.token===0||b.coin==='USDC'))||{},tot=num(u.total)||0,hold=num(u.hold)||0;
 const unified=perp>0&&Math.abs(hold-perp)<=Math.max(0.01,perp*0.01);
 return {value:r2(unified?tot:perp+tot),perp,spot:tot,unified};
}

/** 탄창 목록 결정. settings = mag_status.settings({subs,ex,pct,since}) 또는 null(alert20.sql 없음) */
export function resolveSubs({settings,cfg,main,list=[]}){
 const s=settings||{},m=addr(main);
 const ex=typeof s.ex==='string'?new Set(split(s.ex)):new Set([SCALP,...(list||[]).filter(x=>/^scalping$/i.test(String(x.name||'').trim())).map(x=>x.addr)]);
 const ok=a=>a&&a!==m&&a!==SCALP&&!ex.has(a);
 const app=typeof s.subs==='string'?split(s.subs).filter(ok):[],env=(cfg.envSubs||[]).filter(ok);
 const subs=(app.length?app:env).slice(0,5);
 const pv=num(s.pct),pct=pv>0&&pv<=100?pv:cfg.pct;
 const sv=num(s.since);
 return {subs,source:app.length?'app':env.length?'env':null,pct,pctSource:pv>0&&pv<=100?'app':'env',since:sv>0?sv:null};
}

// ---- 이체 ---------------------------------------------------------------------------------
const MOVE=['send','subAccountTransfer','internalTransfer','spotTransfer'];
/** 주계정·탄창 사이(또는 탄창끼리) 이체 = 계좌 안 이동 */
export function isInternal(u,main,subs){
 const d=u?.delta||{};if(!MOVE.includes(d.type))return false;if((d.type==='spotTransfer'||d.type==='send')&&String(d.token||'USDC')!=='USDC')return false;
 const from=String(d.user||'').toLowerCase(),to=String(d.destination||'').toLowerCase(),all=new Set([String(main).toLowerCase(),...subs]);
 return from!==to&&all.has(from)&&all.has(to);
}
export const ledgerRef=u=>'hl-ledger:'+(u?.hash||'')+':'+num(u?.time)+':'+u?.delta?.type;
export function internalRefs(ledger,main,subs){const s=new Set();for(const u of ledger||[])if(isInternal(u,main,subs))s.add(ledgerRef(u));return s;}
const moveUsd=d=>num(d.usdc)??num(d.usdcValue)??num(d.amount)??0;
/** 주계정 원장에서 주계정 → 탄창 이체(시간순) */
export function mainToSub(ledger,main,subs){
 const m=String(main).toLowerCase(),out=[];
 for(const u of ledger||[]){if(!isInternal(u,main,subs))continue;const d=u.delta,t=num(u.time);if(!t)continue;
  if(String(d.user||'').toLowerCase()===m&&subs.includes(String(d.destination||'').toLowerCase()))out.push({ref:ledgerRef(u),t,to:String(d.destination).toLowerCase(),usd:r2(moveUsd(d)),type:d.type});}
 return out.sort((a,b)=>a.t-b.t);
}

// ---- 마감값 -------------------------------------------------------------------------------
/** HL portfolio 계좌가치 기록점 중 ms 직전 점(maxGap 이내, 없으면 직후 점). 기록이 전혀 없으면(빈 하위계정) 0. 조회 실패(null) = undefined */
export function closeAt(portfolio,ms,maxGap=4*HOUR){
 if(!Array.isArray(portfolio))return undefined;
 const pts=[];for(const w of portfolio){if(!Array.isArray(w)||!['day','week','month','allTime'].includes(w[0]))continue;for(const p of w[1]?.accountValueHistory||[]){const t=num(p?.[0]),v=num(p?.[1]);if(t&&v!==null)pts.push([t,v]);}}
 if(!pts.length)return 0;
 // 앱 v123PickClose처럼 마감 직전 점(maxGap 안) 우선, 없으면 직후 점(maxGap 안).
 // 거래가 없는 하위계정은 기록점이 드묾(실측 1R-1: 하루 9개) → 앞뒤 점 값이 같으면(그 사이 변화 없음) 그 값, 앞 점이 없고 첫 점이 0이면 0.
 let pre=null,post=null;for(const p of pts){if(p[0]<=ms){if(!pre||p[0]>pre[0])pre=p;}else if(!post||p[0]<post[0])post=p;}
 if(pre&&ms-pre[0]<=maxGap)return r2(pre[1]);
 if(post&&post[0]-ms<=maxGap)return r2(post[1]);
 if(pre&&post&&Math.abs(pre[1]-post[1])<=0.005)return r2(pre[1]);
 if(!pre&&post&&Math.abs(post[1])<=0.005)return 0;
 return undefined;
}
/** acct rows(market 'hl', day = UTC 마감 날짜)에 탄창 마감값 더함. 하나라도 모르면 그 행은 주계정만 + missing에 기록(섞인 숫자 안 만듦 — 앱 v123DenomAdd) */
export function withSubCloses(acct,subs){
 const missing=new Set(),add=new Map();if(!subs||!subs.length)return {rows:acct,missing,add};
 const rows=(acct||[]).map(r=>{if(!r||r.market!=='hl'||typeof r.day!=='string')return r;const at=day.utcStart(r.day)+DAY;let s=0;
  for(const x of subs){const v=closeAt(x.portfolio,at);if(v===undefined){missing.add(r.day);return r;}s+=v;}
  add.set(r.day,r2(s));return {...r,value:Number(r.value)+s,mag:r2(s)};});
 return {rows,missing,add};
}

// ---- 손익 ---------------------------------------------------------------------------------
/** 탄창들 하루 실현손익(HL UTC 날짜, closedPnl − fee + 펀딩) */
export function subDayRealized(subs,key){
 let pnl=0,trades=0,funding=0,fees=0,fills=0,fc=0;
 for(const s of subs||[]){const D=day.hlDayRealized(s.rawFills,day.mergeHlFunding(s.rawFunding),key);pnl+=D.pnl;trades+=D.parts.trades;funding+=D.parts.funding;fees+=D.parts.fees;fills+=D.parts.fills;fc+=D.parts.fundingCount;}
 const r6=x=>Math.round(x*1e6)/1e6;return {pnl:r6(pnl),trades:r6(trades),funding:r6(funding),fees:r6(fees),fills,fundingCount:fc};
}
/** 주계정 day.hlDayRealized 결과에 탄창 몫을 더함(새 객체) */
export function addDay(D,S){
 if(!D||!S)return D;const r6=x=>Math.round(x*1e6)/1e6;
 return {...D,pnl:r6(D.pnl+S.pnl),parts:{...D.parts,trades:r6(D.parts.trades+S.trades),funding:r6(D.parts.funding+S.funding),fees:r6(D.parts.fees+S.fees),fills:D.parts.fills+S.fills,fundingCount:D.parts.fundingCount+S.fundingCount,mag:{pnl:S.pnl,fills:S.fills}},source:D.source+' + 탄창'};
}
/** 주계정 hlPeriodDays 결과에 탄창 날짜별 실현손익을 더함 */
export function addPeriodDays(days,subs,fromKey,toKey){
 if(!subs||!subs.length)return days;const r6=x=>Math.round(x*1e6)/1e6;const by=new Map();
 for(const s of subs)for(const d of day.hlPeriodDays(s.rawFills,day.mergeHlFunding(s.rawFunding),null,fromKey,toKey)){const o=by.get(d.key)||{pnl:0,trades:0};o.pnl+=d.pnl;o.trades+=d.trades;by.set(d.key,o);}
 return days.map(d=>{const o=by.get(d.key);return o&&(o.pnl||o.trades)?{...d,pnl:r6(d.pnl+o.pnl),trades:d.trades+o.trades,mag:r6(o.pnl)}:d;});
}

// ---- 오늘 탄창 모델 -------------------------------------------------------------------------
/** in: {t, main, subs:[{addr,name,bal,rawFills}], balSum, denom(합산 직전 마감 or null), denomPending, pct, since, mainRawFills, ledger, cfg}
 *  out: 앱 v123Model과 같은 뜻 — 목표 = 직전 마감(합산) × pct%, 상태 empty(< 목표 emptyPct%)/full(사용 ≤ 2%)/use, 첫 탄창 체결, 장중 재충전, 금고 체결 */
export function model(x){
 const t=x.t,key=day.utcDate(t),t0=day.utcStart(key),cfg=x.cfg;
 const subs=x.subs||[],sel=subs.map(s=>s.addr);
 const m={key,t0,subs:subs.map(s=>({addr:s.addr,name:s.name||short(s.addr),bal:s.bal})),source:x.source||null,balSum:x.balSum,pct:x.pct,denom:x.denom??null,denomPending:!!x.denomPending,target:null,used:null,state:null,first:null,refills:[],charges:[],vault:[],pnl:x.pnl??null};
 if(!sel.length)return m;
 if(m.denom>0)m.target=r2(m.denom*m.pct/100);
 if(m.target>0&&m.balSum!==null&&m.balSum!==undefined){m.used=Math.max(0,Math.min(1,(m.target-m.balSum)/m.target));m.state=m.balSum<m.target*cfg.emptyPct/100?'empty':m.used<=0.02?'full':'use';}
 for(const s of subs)for(const f of s.rawFills||[]){const ft=num(f?.time);if(ft>=t0&&(m.first===null||ft<m.first))m.first=ft;}
 for(const tr of mainToSub(x.ledger,x.main,sel)){if(tr.t<t0)continue;if(m.first!==null&&tr.t>m.first)m.refills.push(tr);else m.charges.push(tr);}
 const vs=Math.max(t0,x.since||0);
 for(const f of src.hlFills(x.mainRawFills||[]))if(f.entry&&f.t>=vs)m.vault.push({...f,oid:(x.mainRawFills||[]).find(r=>String(r.tid)===String(f.tid))?.oid??null});
 return m;
}
export const short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'';
const nameOf=(m,a)=>m.subs.find(s=>s.addr===a)?.name||short(a);
const U=x=>Number.isFinite(x)?(x<0?'−':'')+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDC':'—';
const SU=x=>Number.isFinite(x)?(x>0?'+':'')+U(x):'—';
const kst=ms=>new Date(ms+9*HOUR).toISOString().slice(11,16)+' KST';
const STATE={empty:'소진',full:'가득',use:'사용 중'};

// ---- 메시지 --------------------------------------------------------------------------------
export function emptyText(m){
 return fmt.card('🧯 탄창 소진 · 오늘 매매 끝',[['탄창',`${m.subs.map(s=>s.name).join('·')} ${U(m.balSum)} / 목표 ${U(m.target)} (${m.pct}%)`],['오늘 탄창 실현',m.pnl===null?null:SU(m.pnl)],['다음 충전','내일 09:00 KST (HL 하루 시작)']],['장중 재충전 금지 — 오늘은 여기까지']);
}
export function refillText(m,tr){
 return fmt.card('⚠️ [장중 재충전] 주계정 → 탄창 이체',[['이체',`${U(tr.usd)} → ${nameOf(m,tr.to)} · ${kst(tr.t)}`],['오늘 첫 탄창 체결',m.first?kst(m.first):null],['규칙','탄창은 09:00 KST에만 채움 · 장중 재충전 금지']]);
}
export function vaultText(m,list){
 const f=list[0],n=list.length;
 return fmt.card('⚠️ [금고에서 거래] 주계정에서 진입',[['체결',`${f.symbol} ${f.long?'롱':'숏'} 진입 ${f.qty} @ ${f.price}${n>1?` 외 ${n-1}건`:''} · ${kst(f.t)}`],['탄창',m.subs.map(s=>s.name).join('·')],['규칙','거래는 탄창 하위계정에서만 · 주계정 = 금고']]);
}
export function openText(m){
 const diff=m.balSum-m.target,dev=m.target>0?diff/m.target*100:0;
 return fmt.card('🔔 탄창 09:00 점검 · 목표와 다름',[['탄창 잔고',U(m.balSum)],['목표',`${U(m.target)} = 직전 마감 ${U(m.denom)} × ${m.pct}%`],['차이',`${SU(r2(diff))} (${(dev>0?'+':'')+dev.toFixed(1)}%)`]],
  [diff<0?`HL에서 주계정 → 탄창으로 ${U(r2(-diff))} 이체`:`탄창이 목표보다 ${U(r2(diff))} 많음 — 초과분은 주계정으로`]);
}
/** 지금 조건으로 보낼 알림 후보(보낸 기록 무시 — 처리기·드라이런 공통). 각 항목 {key, kind, text, at} */
export function candidates(m,cfg,t){
 const out=[];if(!m||!m.subs.length)return out;const A=cfg.alerts;
 if(A.empty&&m.state==='empty'&&m.first!==null)out.push({key:'empty:'+m.key,kind:'empty',text:emptyText(m),at:t});
 if(A.refill)for(const tr of m.refills)out.push({key:'refill:'+tr.ref,kind:'refill',text:refillText(m,tr),at:tr.t});
 if(A.vault){const by=new Map();for(const f of m.vault){const k=f.oid??'t'+f.tid;if(!by.has(k))by.set(k,[]);by.get(k).push(f);}
  for(const [k,l] of by)out.push({key:'vault:'+k,kind:'vault',text:vaultText(m,l),at:l[0].t});}
 if(A.open){const o=m.t0+cfg.openMin*MIN;
  if(t>=o&&t<m.t0+3*HOUR&&m.target>0&&Number.isFinite(m.balSum)&&!m.denomPending){const dev=Math.abs(m.balSum-m.target)/m.target*100;
   out.push({key:'open:'+m.key,kind:'open',text:dev>cfg.openTolPct?openText(m):null,at:t,dev});}}
 return out;
}

/** 드라이런 / --test 한 줄 */
export function statusLine(m){
 if(!m||!m.subs.length)return null;
 return `탄창 ${m.subs.map(s=>s.name).join('·')} ${U(m.balSum)}${m.target?` / 목표 ${U(m.target)} (${m.pct}%)`:''}${m.state?' · '+STATE[m.state]:''}`;
}
export function dryText(m,cfg,t,{resolved,watch,sqlMissing,note}={}){
 const L=[`탄창 드라이런 (보내지 않음 · 저장 안 함) · HL 하루 ${m?.key||day.utcDate(t)} (09:00 KST 시작)`];
 const r=resolved||{};
 L.push(`목록: ${r.subs?.length?r.subs.map(a=>`${nameOf(m||{subs:[]},a)} ${short(a)}`).join(', '):'없음'} · 출처 ${r.source==='app'?'앱 설정(v123Subs)':r.source==='env'?'.env HL_SUBS':'—'}${sqlMissing?' · alert20.sql 없음(앱 설정 못 읽음 → .env만)':''}`);
 if(!m||!m.subs.length){L.push('탄창이 없습니다 → 2.15.0처럼 주계정만 판정합니다.');if(note)L.push(note);return L.join('\n');}
 for(const s of m.subs)L.push(`  ${s.name} ${short(s.addr)} 잔고 ${U(s.bal)}`);
 L.push(`목표 ${m.target?U(m.target)+` = 직전 마감(주계정+탄창) ${U(m.denom)} × ${m.pct}%`:m.denomPending?'— (탄창 마감값 확인 중)':'— (직전 마감 없음)'}`);
 L.push(`상태 ${m.state?STATE[m.state]+(m.used!==null?` · 사용 ${(m.used*100).toFixed(1)}%`:''):'—'} · 오늘 탄창 실현 ${m.pnl===null?'—':SU(m.pnl)}`);
 L.push(`오늘 첫 탄창 체결 ${m.first?kst(m.first):'없음'} · 아침 충전 ${m.charges.length}건${m.charges.length?' ('+m.charges.map(c=>U(c.usd)+' '+kst(c.t)).join(', ')+')':''} · 장중 재충전 ${m.refills.length}건 · 금고 진입 체결 ${m.vault.length}건`);
 if(watch&&watch.length)L.push('Supabase 수집: '+watch.map(w=>`${short(w.address)} ${w.active?'수집 중':'멈춤'}${w.last_error?' · 오류 '+String(w.last_error).slice(0,60):''}`).join(' · '));
 const c=candidates(m,cfg,t).filter(x=>x.text);
 L.push('',c.length?`지금 조건이면 보낼 알림 ${c.length}건 (이미 보낸 것은 서비스가 다시 안 보냄):`:'지금 조건으로 보낼 탄창 알림 없음');
 for(const x of c)L.push('',x.text);
 if(note)L.push('',note);
 return L.join('\n');
}

// ---- 처리기(서비스 안) ------------------------------------------------------------------------
export class Mag{
 /** d: {cfg, tg, log, now, state:()=>S, save:()=>Promise} */
 constructor(d){Object.assign(this,d);}
 get S(){const S=this.state();if(!S.mag||typeof S.mag!=='object')S.mag={since:this.now(),sent:{},outbox:[]};const M=S.mag;M.sent=M.sent||{};M.outbox=M.outbox||[];if(!M.since)M.since=this.now();return M;}
 async afterCheck(m,t=this.now()){
  const M=this.S;let n=0;
  for(const [k,v] of Object.entries(M.sent))if(v<t-14*DAY)delete M.sent[k];
  await this.flush(t);
  if(!m||!m.subs.length)return 0;
  for(const c of candidates(m,this.cfg,t)){
   if(M.sent[c.key])continue;
   if(c.kind!=='open'&&c.kind!=='empty'&&(c.at<M.since||t-c.at>6*HOUR))continue; // 서비스 시작 전·6시간 넘은 사건은 안 보냄
   M.sent[c.key]=t;await this.save();
   if(!c.text){this.log('INFO',`탄창 09:00 점검: 목표와 ±${this.cfg.openTolPct}% 안 (${c.dev.toFixed(1)}%) → 안내 없음`);continue;}
   try{await this.tg.send(c.text);}catch(e){M.outbox.push({key:c.key,at:t,text:c.text});this.log('ERROR','탄창 알림 전송 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}
   n++;this.log('INFO','탄창 알림: '+c.text.split('\n')[0]);
  }
  if(n)await this.save();
  return n;
 }
 async flush(t){const M=this.S;if(!M.outbox.length)return;const keep=[];for(const o of M.outbox){if(t-o.at>2*HOUR)continue;try{await this.tg.send(o.text);}catch{keep.push(o);}}M.outbox=keep;await this.save();}
}
