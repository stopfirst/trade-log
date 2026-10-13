// alert2 손실한도 판정 v1.2 — 시장별 거래일 달력 (순수 함수, I/O 없음).
//  * US(키움 미국주식): 거래일 = 미국 동부(ET) 날짜, NYSE 휴장일 제외.
//    하루 경계 = 미국 장 마감 16:00 ET(서머타임 자동). 거래일 T의 구간 = [직전 거래일 16:00 ET, T 16:00 ET).
//    → 16:00 ET 이후 애프터마켓·주말·휴장일 체결은 "다음 거래일" 몫.
//  * HL(하이퍼리퀴드): 거래일 = 한국(KST) 달력 날짜, 매일. 구간 = [D 00:00 KST, D+1 00:00 KST).
//  * 주 = 월요일 시작(US는 ET 날짜, HL은 KST 날짜), 달 = 달력 월. 주/달 시작 자산 = 그 기간 첫 거래일의 시작 자산.
const DAY=86400000;
export const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const dow=d=>new Date(d+'T00:00:00Z').getUTCDay(); // 0=일
const ymd=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);
export function mondayOf(d){return addDays(d,-((dow(d)+6)%7));}
function nthWeekday(y,m,wd,n){const first=new Date(Date.UTC(y,m-1,1)).getUTCDay();return ymd(y,m,1+((wd-first+7)%7)+(n-1)*7);}
function lastWeekday(y,m,wd){const last=new Date(Date.UTC(y,m,0));const d=last.getUTCDate()-((last.getUTCDay()-wd+7)%7);return ymd(y,m,d);}
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return ymd(y,mo,da);}
// 토요일 → 금요일, 일요일 → 월요일 (NYSE). 단 1월 1일이 토요일이면 전년 12/31은 휴장 아님(NYSE 규칙).
function observed(d,{newYear=false}={}){const w=dow(d);if(w===6)return newYear?null:addDays(d,-1);if(w===0)return addDays(d,1);return d;}
const holidayCache=new Map();
export function nyseHolidays(y){
 if(holidayCache.has(y))return holidayCache.get(y);
 const s=new Set();const add=d=>{if(d)s.add(d);};
 add(observed(ymd(y,1,1),{newYear:true}));
 add(nthWeekday(y,1,1,3));          // MLK
 add(nthWeekday(y,2,1,3));          // Washington's Birthday
 add(addDays(easter(y),-2));        // Good Friday
 add(lastWeekday(y,5,1));           // Memorial Day
 if(y>=2022)add(observed(ymd(y,6,19))); // Juneteenth
 add(observed(ymd(y,7,4)));         // Independence Day
 add(nthWeekday(y,9,1,1));          // Labor Day
 add(nthWeekday(y,11,4,4));         // Thanksgiving
 add(observed(ymd(y,12,25)));       // Christmas
 holidayCache.set(y,s);return s;
}
function zoned(ms,timeZone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,h:Number(p.hour),m:Number(p.minute),s:Number(p.second)};}
export const etDate=ms=>zoned(ms,'America/New_York').date;
export const kstDate=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
// ET 벽시계 → UTC ms (서머타임 자동: -4h/-5h 중 맞는 쪽)
export function etWall(date,hh,mm=0){for(const off of [4,5]){const t=Date.parse(date+'T00:00:00Z')+(hh+off)*3600000+mm*60000;const z=zoned(t,'America/New_York');if(z.date===date&&z.h===hh&&z.m===mm)return t;}throw Error('ET_TIME_INVALID '+date);}
export const kstWall=(date,hh=0,mm=0)=>Date.parse(date+'T00:00:00Z')+(hh-9)*3600000+mm*60000;

export function usCalendar({extraHolidays=[],closeHour=16,closeMinute=0}={}){
 const extra=new Set(extraHolidays);
 const isTradingDay=d=>{const w=dow(d);if(w===0||w===6)return false;if(extra.has(d))return false;return !nyseHolidays(Number(d.slice(0,4))).has(d);};
 const next=d=>{let x=addDays(d,1);for(let i=0;i<15&&!isTradingDay(x);i++)x=addDays(x,1);return x;};
 const prev=d=>{let x=addDays(d,-1);for(let i=0;i<15&&!isTradingDay(x);i++)x=addDays(x,-1);return x;};
 const dayEnd=d=>etWall(d,closeHour,closeMinute);
 const dayStart=d=>dayEnd(prev(d));
 const dayOf=ms=>{const d=etDate(ms);if(isTradingDay(d)&&ms<dayEnd(d))return d;return next(d);};
 const weekKey=d=>mondayOf(d),monthKey=d=>d.slice(0,7);
 const periodKey=(d,mode)=>mode==='day'?d:mode==='week'?weekKey(d):monthKey(d);
 // 기간의 거래일 목록(첫/마지막)
 const firstOf=(d,mode)=>{if(mode==='day')return d;let x=d;for(;;){const p=prev(x);if(periodKey(p,mode)!==periodKey(d,mode))return x;x=p;}};
 const lastOf=(d,mode)=>{if(mode==='day')return d;let x=d;for(;;){const n=next(x);if(periodKey(n,mode)!==periodKey(d,mode))return x;x=n;}};
 return {market:'US',zone:'America/New_York',isTradingDay,next,prev,dayStart,dayEnd,dayOf,periodKey,firstOf,lastOf,
  periodStart:(d,mode)=>dayStart(firstOf(d,mode)),periodEnd:(d,mode)=>dayEnd(lastOf(d,mode)),
  label:d=>d.slice(5).replace('-','/')+'('+'일월화수목금토'[dow(d)]+')'};
}
export function hlCalendar(){
 const isTradingDay=()=>true,next=d=>addDays(d,1),prev=d=>addDays(d,-1);
 const dayStart=d=>kstWall(d),dayEnd=d=>kstWall(addDays(d,1));
 const dayOf=ms=>kstDate(ms);
 const periodKey=(d,mode)=>mode==='day'?d:mode==='week'?mondayOf(d):d.slice(0,7);
 const firstOf=(d,mode)=>mode==='day'?d:mode==='week'?mondayOf(d):d.slice(0,7)+'-01';
 const lastOf=(d,mode)=>{if(mode==='day')return d;if(mode==='week')return addDays(mondayOf(d),6);const [y,m]=d.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
 return {market:'HL',zone:'Asia/Seoul',isTradingDay,next,prev,dayStart,dayEnd,dayOf,periodKey,firstOf,lastOf,
  periodStart:(d,mode)=>dayStart(firstOf(d,mode)),periodEnd:(d,mode)=>dayEnd(lastOf(d,mode)),
  label:d=>d.slice(5).replace('-','/')+'('+'일월화수목금토'[dow(d)]+')'};
}
// "~ 10/15(목) 05:00 KST" (US는 " · 미국 10/14 16:00 ET" 덧붙임)
export function untilText(ms,market){
 const k=new Date(ms+9*3600000),kd=k.toISOString().slice(0,10),kt=k.toISOString().slice(11,16);
 let s=`${kd.slice(5).replace('-','/')}(${'일월화수목금토'[k.getUTCDay()]}) ${kt} KST`;
 if(market==='US'){const z=zoned(ms,'America/New_York');s+=` · 미국 ${z.date.slice(5).replace('-','/')} ${String(z.h).padStart(2,'0')}:${String(z.m).padStart(2,'0')} ET`;}
 return s;
}
