// 2.17.0 (alert21) 앱 v126 '새 출발' — 앱 settings.v126(기준 시각 cutoff · 세대 epoch · 기준 계좌 가치 eq)을 fresh_status(alert21.sql)로 읽어
// 그 시각 이전 체결·펀딩을 판정에서 뺌(손실 한도 하루·주·월 · 연속 손실 · 복수매매 · 방향 전환 · 즉시 복기 · 탄창 점검이 모두 같은 입력을 씀).
// 이월 포지션: 새 출발 뒤 청산 체결은 cutoff 이후라 그대로 셈(진입 체결만 이전).
// 손실 한도 분모: cutoff가 든 하루·주·월 = 앱이 새 출발 때 저장한 계좌 가치(eq). 판정 경계는 기존 '한도 기준일'(riskStart) 구조를 그대로 씀
// — 기준 시각 = cutoff(ms), 기준 자산 = eq. .env RISK_START_DATE가 더 늦으면 그쪽.
// US(키움) 일별 실현손익(kw_days)은 하루 합계만 있어서 cutoff 날은 '처음 본 그날 합계'를 빼서 셈(근사, 서버가 새 출발을 늦게 알면 그 사이 실현은 빠짐).
import {utcDate} from './day.mjs';

export function freshConfig(env){const v=String(env.FRESH_START??'').trim().toLowerCase();return {enabled:!['0','off','false','no','끔'].includes(v)};}

const EP=/^[A-Za-z0-9_-]{1,48}$/;
/** fresh_status 응답 → {US?:F, HL?:F} · F = {epoch,cutoff,eq,carry,day?} (켜진 것만) */
export function parseFresh(r){const out={};const J=r&&typeof r==='object'?r.journal:null;if(!J||typeof J!=='object')return out;
 for(const m of ['US','HL']){const c=J[m]&&typeof J[m]==='object'?(J[m].v126&&typeof J[m].v126==='object'?J[m].v126:J[m]):null;if(!c||c.on!==true)continue;
  const cut=Number(c.cutoff);if(!(Number.isFinite(cut)&&cut>1.5e12&&cut<4.2e12))continue;if(typeof c.epoch!=='string'||!EP.test(c.epoch))continue;
  const eq=Number(c.eq);out[m]={epoch:c.epoch,cutoff:Math.floor(cut),eq:Number.isFinite(eq)&&eq>0&&eq<1e12?Math.round(eq*100)/100:null,carry:Array.isArray(c.carry)?c.carry.length:0,appDay:typeof c.day==='string'&&/^\d{4}-\d\d-\d\d$/.test(c.day)?c.day:null};}
 return out;}
const before=(t,cut)=>Number.isFinite(t)&&t<cut;
/** HL 원본 체결({time}) · 펀딩({time}) · 정규화 체결({t}) 자르기 */
export const cutRaw=(list,cut)=>(list||[]).filter(f=>!before(Number(f&&f.time),cut));
export const cutNorm=(list,cut)=>(list||[]).filter(f=>!before(Number(f&&f.t),cut));
/** 판정 엔진 기준 시각(riskStart) — HL 키 = UTC 날짜, US 키 = 서버 US 달력의 그날 */
export function riskStartOf(F,market,cal){if(!F)return null;const d=market==='HL'?utcDate(F.cutoff):cal.dayOf(F.cutoff);
 return {date:d,day:d,realKey:d,at:F.cutoff,fresh:true,ep:F.epoch,sidKey:d+'.'+F.epoch,base0:F.eq>0?{equity:F.eq,at:F.cutoff,source:'앱 새 출발 시점'}:null};}
/** .env 기준일과 새 출발 중 더 늦은 쪽 */
export function pickStart(envRs,freshRs){if(!freshRs)return envRs||null;if(!envRs)return freshRs;return freshRs.at>=envRs.at?freshRs:envRs;}
/** 새 출발이 든 날·기간의 분모 */
export function freshDen(F,start){return {value:F.eq,mode:'basis',key:null,source:'앱 새 출발 시점 계좌 가치',fresh:true,at:F.cutoff,...(start?{start}:{})};}
/** 기간 분모 함수(키 → 분모) 감싸기: 기간 시작 키가 새 출발 날이면 eq */
export function wrapDenomAt(dn,F,rs){if(!F||!(F.eq>0)||!rs)return dn;return k=>k===rs.day?freshDen(F,k):dn(k);}
/** HL Supabase 날짜별 합계(alert5 hl_days)에서 새 출발 날·이전 날은 뺌(그날은 자른 체결로만 셈) */
export function cutDbDays(days,rs){return Array.isArray(days)&&rs?days.filter(d=>!(d&&typeof d.day==='string'&&d.day<=rs.day)):days;}
/** US kw_days: 새 출발 날 합계에서 기준(처음 본 그날 합계)을 뺌 */
export function usBaseFor(S,F,rs,kwDays){if(!F||!rs)return null;S.fresh=S.fresh&&typeof S.fresh==='object'?S.fresh:{};const k='US';const cur=S.fresh[k];
 if(cur&&cur.epoch===F.epoch&&cur.day===rs.day)return cur;
 const rows=(kwDays||[]).filter(x=>x&&x.date===rs.day).sort((a,b)=>(Number(b.as_of)||0)-(Number(a.as_of)||0));const r=rows[0];const tot=r?Number(r.total):0;
 const v={epoch:F.epoch,day:rs.day,base:Number.isFinite(tot)?tot:0,asOf:r?Number(r.as_of)||null:null,seenAt:Date.now()};S.fresh[k]=v;return v;}
export function cutKwDays(kwDays,b){if(!b||!Array.isArray(kwDays))return kwDays;return kwDays.map(x=>x&&x.date===b.day?{...x,total:String(Math.round((Number(x.total)-b.base)*1e6)/1e6)}:x);}
/** 앱 표시·로그용 한 줄 */
export function freshText(F,market){if(!F)return '';const d=new Date(F.cutoff+9*3600e3).toISOString();return `${market} 새 출발 ${d.slice(5,7)}/${d.slice(8,10)} ${d.slice(11,16)} KST부터${F.eq?' · 기준 '+F.eq:''}`;}
