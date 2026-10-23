// trade-alert 2.5.1 (alert8) — 텔레그램 메시지 모양만 담당(판정 로직 없음, 순수 함수).
//  * 모든 메시지 = 첫 줄 제목(이모지 + 시장 + 핵심) · 빈 줄 · '라벨: 값' 짧은 줄 · (필요하면) 빈 줄 + 각주.
//  * 여러 시장 메시지(장마감 요약·--test)는 시장 블록 사이 빈 줄 + 구분 제목('🇺🇸 미국주식', '🟦 하이퍼리퀴드').
//  * 보낼 때 HTML parse_mode: 전부 HTML 이스케이프 후 제목 줄(첫 줄·시장 구분 제목)만 <b>. 실패(400)하면 plain으로 다시 보냄.
//  * 4096자 제한: 3800자 넘으면 시장 블록·줄 경계에서 나눠 여러 메시지로(뒤 조각 제목에 (2/3) 표시).
import {etWall,untilText} from './calendar.mjs';

export const MARKET_NAME={US:'미국주식',HL:'하이퍼리퀴드'};
export const MARKET_HEAD={US:'🇺🇸 미국주식',HL:'🟦 하이퍼리퀴드'};
const HEAD_RE=/^(🇺🇸 미국주식|🟦 하이퍼리퀴드)( |$)/u;
export const TG_MAX=3800; // Telegram 4096자(엔티티 해석 뒤 글자 수) — 여유를 둠

const md=d=>d?d.slice(5).replace('-','/'):'';
const dow=d=>'일월화수목금토'[new Date(d+'T00:00:00Z').getUTCDay()];
export const dayWithDow=d=>`${md(d)}(${dow(d)})`;

/** 카드 한 장: 제목, 빈 줄, 줄들(문자열 또는 [라벨, 값]; 빈 값은 생략), 빈 줄, 각주 */
export function card(title,rows=[],foot=[]){
 const body=rows.filter(r=>r!==null&&r!==undefined&&r!==false&&r!=='').map(r=>Array.isArray(r)?(r[1]===null||r[1]===undefined||r[1]===''?null:`${r[0]}: ${r[1]}`):String(r)).filter(Boolean);
 const ft=(foot||[]).filter(Boolean);
 return [title,...(body.length?['',...body]:[]),...(ft.length?['',...ft]:[])].join('\n');
}
/** 여러 블록(시장별)을 빈 줄로 이은 메시지 */
export function multi(title,blocks,foot=[]){
 const b=blocks.filter(x=>x&&x.length);const ft=(foot||[]).filter(Boolean);
 return [title,...b.flatMap(x=>['',...x]),...(ft.length?['',...ft]:[])].join('\n');
}

/** 한도 적용 시작 표시(표시만 — 실제 경계 계산은 risk/alert의 riskStartFor 그대로).
 *  HL: '10/26(월) 09:00 KST부터'  ·  US: '10/26(월) 미국 장부터 (KST 10/26 22:30~)' (정규장 09:30 ET, 서머타임 자동) */
export function applyText(market,day,at){
 if(market==='US'&&day){let o;try{o=etWall(day,9,30);}catch{o=null;}
  if(o){const k=new Date(o+9*3600000).toISOString();return `${dayWithDow(day)} 미국 장부터 (KST ${md(k.slice(0,10))} ${k.slice(11,16)}~)`;}
  return `${dayWithDow(day)} 미국 장부터`;}
 return `${untilText(at,'HL')}부터`;
}
/** 짧은 'MM/DD부터' */
export const fromShort=day=>`${md(day)}부터`;

/** 한도 사용률 줄: '오늘   −1.20% / 3%  (40%)' · 기준일 전: '오늘   — 10/26부터' */
export function usageRow(label,{pct,limit,ratio,missing,beforeStart,startDay}={}){
 const L=label+'   ';
 if(pct===null||pct===undefined||!Number.isFinite(pct)){
  const why=missing==='before-start'||beforeStart?(startDay?fromShort(startDay):'기준일 전'):missing==='data'?'데이터 없음':missing==='denominator'?'기준 잔액 없음':'';
  return L+'—'+(why?' '+why:'');}
 const p=(pct>0?'+':pct<0?'−':'')+Math.abs(pct).toFixed(2)+'%';
 if(!(limit>0))return `${L}${p} / 한도 끔`;
 const used=Number.isFinite(ratio)?Math.floor(Math.max(0,ratio)*100):Math.floor(Math.max(0,-pct)/limit*100);
 return `${L}${p} / ${limit}%  (${used}%)`;
}

// ---- Telegram 전송 모양 ----------------------------------------------------------------------
export const escHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const isHeadLine=(l,i)=>i===0||HEAD_RE.test(l);
/** plain → HTML: 전부 이스케이프, 첫 줄과 시장 구분 제목만 굵게 */
export function toHtml(text){return String(text).split('\n').map((l,i)=>l&&isHeadLine(l,i)?`<b>${escHtml(l)}</b>`:escHtml(l)).join('\n');}
/** HTML → plain (테스트·로그용) */
export function fromHtml(html){return String(html).replace(/<\/?b>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}

/** 4096자 제한: max를 넘으면 빈 줄(블록) → 줄 → 글자 경계로 나눔. 뒤 조각은 '제목 (2/n)' + 빈 줄로 시작. */
export function splitText(text,max=TG_MAX){
 const s=String(text);if(s.length<=max)return [s];
 const lines=s.split('\n'),title=lines[0];
 // 블록 = 빈 줄로 나뉜 덩어리(첫 블록에 제목 포함)
 const blocks=[];let cur=[];for(const l of lines){if(l===''){if(cur.length)blocks.push(cur);cur=[];}else cur.push(l);}if(cur.length)blocks.push(cur);
 const room=max-title.length-12;const units=[];
 for(const b of blocks){const t=b.join('\n');if(t.length<=room){units.push(t);continue;}
  let acc='';for(let l of b){while(l.length>room){if(acc){units.push(acc);acc='';}units.push(l.slice(0,room));l=l.slice(room);}
   if(acc&&acc.length+1+l.length>room){units.push(acc);acc=l;}else acc=acc?acc+'\n'+l:l;}
  if(acc)units.push(acc);}
 const chunks=[];let c='';
 for(const u of units){if(c&&c.length+2+u.length>room){chunks.push(c);c=u;}else c=c?c+'\n\n'+u:u;}
 if(c)chunks.push(c);
 const n=chunks.length;return chunks.map((x,i)=>i===0?`${title} (1/${n})`+x.slice(title.length):`${title} (${i+1}/${n})\n\n${x}`);
}
