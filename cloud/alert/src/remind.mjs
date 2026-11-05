// trade-alert 2.14.0 — 매일 복기 알림 · 2.14.0(앱 v121·v122): 예외 없는 단타(끝난 거래, 가장 긴 0→0 왕복 보유 < 앱 settings.v121Min → .env SCALP_MIN 기본 30분)는 빼고 '단타 n건 제외' 한 줄.
//   예외(규칙 위반·복수매매·손익비 미달·위험 초과·실현 R < −1)는 남김(scalp.mjs). 판정 데이터는 review_gaps v12(alert18.sql) — 없으면 예전처럼 단타도 알림(로그 WARN 1회). SCALP_MIN=0 = 끔.
//   단타를 빼고 나면 대상이 없거나, 남은 게 예외 단타뿐이고 빈 칸이 없으면 안 보냄.
// (이전) 2.12.0 — 매일 복기 알림 (앱 v92 '진입 전 체크'와 같은 5개 항목, 빈 칸 판정은 앱 v106 v92Gaps와 같음).
// 매일 REVIEW_REMIND_AT(KST, 기본 09:30)에 한 번: 어제(KST 날짜 − 1 = HL UTC 하루 · 미국 ET 거래일) 거래했거나 그때 들고 있던 거래 중
// 진입 근거 · 스탑 이유 · 손익비(미기록일 때만) · 가격 반응 확인 · 타임프레임(LTF 진입이면 청산도 LTF)이 빈 것을 텔레그램으로.
// 2.12.0(앱 v106): 계획 손익비가 기록돼 있으면 기준(v92MinRR) 미달이어도 빈 칸 아님(기록된 사실). 앱에서 ×로 숨긴 거래(t.v92Hide → review_gaps 'hide')는 알림에서 뺌.
// 대상 = 첫 진입이 앱 설정 v92From(기본 2026-11-01) 이후. 어제 거래가 없으면 보내지 않음. alert11.sql(review_gaps) 없으면 로그 1회 후 하루 1번만 다시 확인.
import * as sc from './scalp.mjs';
export const TF_LTF='ltf';
const num=v=>{const x=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;return Number.isFinite(x)?x:null;};
const evKey=e=>String(e.date||'')+' '+String(e.time||'00:00:00')+' '+String(num(e.seq)??0).padStart(16,'0');
export function remindConfig(env){
 const v=String(env.REVIEW_REMIND??'').trim().toLowerCase(),at=String(env.REVIEW_REMIND_AT||'09:30').trim(),m=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(at);
 return {enabled:!v||['1','true','yes','on','켬'].includes(v),at:m?[Number(m[1]),Number(m[2])]:null,atText:at};
}
export function kstParts(t){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,mins:Number(p.hour)*60+Number(p.minute)};}
export const prevDate=d=>new Date(Date.parse(d+'T00:00:00Z')-864e5).toISOString().slice(0,10);
/** 계획 손익비: plan0.rr(첫 청산 때 고정) → 없으면 (목표 − 첫 청산 전 평균 진입) ÷ (평균 진입 − 최초 손절). 앱 v79Live와 같은 식. */
export function planRR(t){
 const fixed=num(t.planRR);if(fixed>0)return fixed;
 const s0=num(t.stop0),tg=num(t.target)>0?num(t.target):num(t.rrTp);if(!(s0>0&&tg>0))return null;
 const fills=[...(t.fills||[])].filter(f=>num(f.shares)>0).sort((a,b)=>evKey(a)<evKey(b)?-1:1),cut=fills.length?evKey(fills[0]):null;
 const ent=(t.entries||[]).filter(e=>num(e.shares)>0&&num(e.price)>0&&(!cut||evKey(e)<=cut));if(!ent.length)return null;
 const q=ent.reduce((s,e)=>s+num(e.shares),0),avg=ent.reduce((s,e)=>s+num(e.shares)*num(e.price),0)/q;if(!(avg>0)||avg===s0)return null;
 const rr=(tg-avg)/(avg-s0);return rr>0&&Number.isFinite(rr)?rr:null;
}
/** 빈 칸(앱 v106 v92Gaps = v92Checks 중 !ok, 단 손익비 미달 제외). minRR은 예전 호출 호환용(판정에 안 씀). */
export function gaps(t,minRR=2){const rr=planRR(t),ti=String(t.tfIn||''),to=String(t.tfOut||''),out=[];
 if(!t.entryNote)out.push({k:'entry',text:'진입 근거'});
 if(!t.stopNote)out.push({k:'stop',text:'스탑 이유'});
 if(rr===null)out.push({k:'rr',text:'손익비'}); // 기준 미달은 빈 칸 아님(앱 v106)
 if(!t.react)out.push({k:'react',text:'가격 반응 확인'});
 if(!ti)out.push({k:'tf',text:'타임프레임'});else if(ti===TF_LTF&&to&&to!==TF_LTF)out.push({k:'tf',text:'LTF 진입인데 HTF 청산',bad:true});
 return out;}
function span(t){const ev=[...(t.entries||[]),...(t.fills||[])].filter(e=>e&&typeof e.date==='string'&&e.date).map(e=>e.date).sort();if(!ev.length)return null;
 const qin=(t.entries||[]).reduce((s,e)=>s+(num(e.shares)||0),0),qout=(t.fills||[]).reduce((s,e)=>s+(num(e.shares)||0),0);
 return {first:ev[0],last:ev[ev.length-1],dates:new Set(ev),open:qin-qout>1e-9};}
/** 앱에서 ×로 숨긴 거래(t.v92Hide, 앱은 참 같은 값이면 숨김 → 여기서도 JS 참이면 숨김). */
export const hidden=t=>!!(t&&t.hide);
/** review_gaps가 'hide' 키를 주는지(alert11.sql 2.12.0판). 예전 SQL이면 거래에 키 자체가 없음. */
export const hasHideField=journal=>{for(const sc of ['HL','US']){const tr=journal?.[sc]?.trades;if(Array.isArray(tr))for(const t of tr)if(t&&typeof t==='object')return Object.prototype.hasOwnProperty.call(t,'hide');}return true;};
/** journal = review_gaps().journal, day = 어제(YYYY-MM-DD) → [{market, name, direction, gaps[], ok, open, scalp?}].
 * opts.onHidden(t) = 숨겨서 뺀 대상 거래. opts.scalp = scalpConfig(env)(없으면 단타 판정 안 함) · opts.onScalp(t, info, min) = 단타라서 뺀 대상 거래.
 * 남은 단타(예외)는 row.scalp = {hold, exc[]}. */
export function pick(journal,day,opts={}){const rows=[];const useScalp=!!(opts.scalp&&opts.scalp.enabled&&sc.hasScalpData(journal));
 for(const scp of ['HL','US']){const j=journal?.[scp];if(!j||!Array.isArray(j.trades))continue;
  const from=/^\d{4}-\d{2}-\d{2}$/.test(String(j.from||''))?j.from:'2026-11-01',mr=num(j.minRR)>0?num(j.minRR):2;
  const min=useScalp?sc.scopeMin(j,opts.scalp):0;let M=null;const model=()=>M||(M=sc.model(j,scp==='HL',min,{streakMode:opts.scalp?.streakMode}));
  for(const t of j.trades){const s=span(t);if(!s||s.first<from)continue;if(!(s.dates.has(day)||(s.open&&s.first<=day)))continue;
   if(hidden(t)){opts.onHidden?.(t);continue;} // 앱 v106 × 숨김
   let si=null;if(min>0){si=model().get(t)||null;if(si&&si.scalp&&!si.exc.length){opts.onScalp?.(t,si,min);continue;}} // 앱 v121 예외 없는 단타
   const g=gaps(t,mr);rows.push({market:scp,name:String(t.name||'?').slice(0,40),direction:t.direction==='short'?'short':'long',gaps:g,ok:!g.length,open:s.open,...(si&&si.scalp?{scalp:{hold:si.hold,exc:si.exc,min}}:{})});}}
 return rows;}
const DOW=['일','월','화','수','목','금','토'];
/** opts.scalpSkip = 뺀 단타 건수, opts.scalpMin = 기준 분(시장마다 다르면 null) */
export function text(rows,day,opts={}){const md=day.slice(5).replace('-','/'),dw=DOW[new Date(day+'T00:00:00Z').getUTCDay()];
 const bad=rows.filter(r=>!r.ok),good=rows.length-bad.length,sk=opts.scalpSkip||0;
 const L=[`📝 복기 시간 · ${md}(${dw}) 거래 ${rows.length}건`];
 if(sk)L.push(`단타 ${sk}건 제외${opts.scalpMin?` · 보유 ${opts.scalpMin}분 미만`:''} (규칙 위반·−1R 넘긴 손실은 남김)`);
 const sx=r=>r.scalp?` [단타 ${sc.holdText(r.scalp.hold)} · 예외: ${r.scalp.exc.join(', ')}]`:'';
 if(bad.length){L.push(`일지 빈 칸 ${bad.length}건${good?` · 다 채운 거래 ${good}건`:''}`);
  for(const r of bad.slice(0,10))L.push(`• ${r.market==='HL'?'HL':'US'} ${r.name} ${r.direction==='short'?'숏':'롱'}${r.open?'(보유 중)':''} — ${r.gaps.map(g=>(g.bad?'⚠️ ':'')+g.text).join(' · ')}${sx(r)}`);
  if(bad.length>10)L.push(`외 ${bad.length-10}건`);
 }else L.push(`✅ ${rows.length}건 모두 진입 근거 · 스탑 이유 · 손익비 · 가격 반응 · 타임프레임 기록 완료`);
 L.push('','오늘 할 일: 앱 → 복기 탭에서 어제 거래 다시 읽고 일간 복기 쓰기.');
 return L.join('\n');}
/** 보낼지: 대상이 없으면 안 보냄 · 단타를 뺐고 남은 게 예외 단타뿐인데 빈 칸이 없으면 안 보냄(단타만 있는 날). */
export function shouldSend(rows,scalpSkip){if(!rows.length)return false;if(scalpSkip>0&&rows.every(r=>r.scalp)&&rows.every(r=>r.ok))return false;return true;}
/** 확인 루프에서 호출. deps: {rpc, token, cfg(remindConfig), state:()=>S, log, deliver(text)} */
export class Reminder{
 constructor(d){Object.assign(this,d);if(!this.scalp)this.scalp={min:0,enabled:false};this.missingLogged=false;this.oldSqlLogged=false;this.noScalpLogged=false;}
 due(t){if(!this.cfg.enabled||!this.cfg.at)return null;const {date,mins}=kstParts(t),[h,m]=this.cfg.at;if(mins<h*60+m||mins>=23*60)return null;
  const S=this.state(),k='remind:'+date;if(S.sent[k])return null;if(S.remindMissing&&S.remindMissing===date)return null;return {key:k,date};}
 async afterCheck(t){const d=this.due(t);if(!d)return null;const S=this.state(),day=prevDate(d.date);
  let data;try{data=await this.rpc.call('review_gaps',{p_token:this.token,p_since:day});}
  catch(e){const c=String(e.message||e);if(/SQL_NOT_INSTALLED/.test(c)){S.remindMissing=d.date;if(!this.missingLogged){this.missingLogged=true;this.log('WARN','매일 복기 알림: Supabase에 alert11.sql(review_gaps)이 없어 건너뜀 → SQL Editor에서 alert11.sql 실행. 손실 한도 알림은 그대로.');}return null;}
   this.log('WARN','매일 복기 알림 조회 실패(다음 확인 때 다시): '+c.slice(0,80));return null;}
  delete S.remindMissing;let nh=0,ns=0;const mins=new Set();const rows=pick(data.journal,day,{onHidden:()=>nh++,scalp:this.scalp,onScalp:(t,i,m)=>{ns++;mins.add(m);}});S.sent[d.key]=t;
  if(!this.oldSqlLogged&&!hasHideField(data.journal)){this.oldSqlLogged=true;this.log('WARN','매일 복기 알림: Supabase alert11.sql이 예전 판(숨김 정보 없음) → 앱에서 ×로 숨긴 거래도 알림에 나옴. SQL Editor에서 새 alert11.sql 다시 실행.');}
  if(this.scalp.enabled&&!this.noScalpLogged&&!sc.hasScalpData(data.journal)){this.noScalpLogged=true;this.log('WARN','매일 복기 알림: Supabase에 alert18.sql(review_gaps v12)이 없어 단타 제외를 못 함 → 단타도 예전처럼 알림. SQL Editor에서 alert18.sql 실행하면 앱 v121과 같게 빠짐.');}
  const extra=`${nh?` · 숨긴 거래 ${nh}건 제외`:''}${ns?` · 단타 ${ns}건 제외`:''}`;
  if(!shouldSend(rows,ns)){{const why=[nh?`숨긴 거래 ${nh}건 제외`:'',ns?`단타 ${ns}건 제외`:''].filter(Boolean).join(' · ');this.log('INFO',`매일 복기 알림: ${day} ${rows.length?`남은 거래 ${rows.length}건(예외 단타) 빈 칸 없음${extra}`:`거래 없음${why?`(${why})`:''}`} → 안 보냄`);};return null;}
  const msg=text(rows,day,{scalpSkip:ns,scalpMin:mins.size===1?[...mins][0]:null});S.outbox.push({key:d.key,at:t,text:msg});this.log('INFO',`매일 복기 알림: ${day} 거래 ${rows.length}건 · 빈 칸 ${rows.filter(r=>!r.ok).length}건${extra}`);return msg;}
}
