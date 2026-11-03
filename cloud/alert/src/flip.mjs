// trade-alert 2.13.0 (alert17) — HL 포지션 방향 전환(롱↔숏) 감지 경고. 손실 한도·복수매매 판정과 무관(그 상태를 읽지도 바꾸지도 않음).
//  계기: 주문창에 남은 수량으로 reduce-only 없이 반대 주문 → 롱 청산 + 숏 진입(11-03 kPEPE oid 593328614662).
//  규칙(같은 코인, HIP-3 dex 코인 'xyz:TSLA' 포함, 현물 '@…'·'A/B' 제외)
//   a) 한 주문(oid)의 체결들로 포지션 부호가 반전(롱 → 숏 / 숏 → 롱). HL fill dir 'Long > Short'·'Short > Long'이든,
//      한 체결이 정확히 0으로 닫고 같은 주문의 다음 체결이 반대로 열든 같음(주문 시작 직전 부호 ≠ 주문 마지막 체결 뒤 부호).
//      = reduce-only 아닌 주문이 기존 포지션을 넘어 반대 포지션을 연 경우.
//   b) 포지션이 0으로 청산된 뒤 FLIP_WINDOW_MIN(기본 5)분 이내(정각 포함) 반대 방향 새 진입(다른 주문). 기준 = 청산 마지막 체결 → 진입 첫 체결.
//  같은 주문은 한 번만(키 flip:hl:<coin>:<oid>), 보내기 전에 state2.json flip.sent에 저장 → 재시작해도 재발송 없음.
//  주문 정보(reduce-only·주문 종류·TIF·주문 수량)는 공개 /info orderStatus로 확인(실패하면 체결만으로 판단).
const MIN=60000,HOUR=3600000,DAY=86400000;
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null;};
const EPS=1e-9;
export const isPerp=c=>typeof c==='string'&&!!c&&!c.startsWith('@')&&!c.includes('/');
const sgn=(x,scale)=>Math.abs(x)<=EPS*Math.max(1,scale)?0:Math.sign(x);
const DIR={1:'long','-1':'short'},DIRK={long:'롱',short:'숏'};
import {orderCoin} from './revenge.mjs';

// ---- 설정 ---------------------------------------------------------------------------------
export function flipConfig(env){
 const errors=[];
 const fv=String(env.FLIP_ALERT??'').trim().toLowerCase();let enabled=true;
 if(fv){if(['1','true','yes','on','켬'].includes(fv))enabled=true;else if(['0','false','no','off','끔'].includes(fv))enabled=false;else errors.push('FLIP_ALERT (1 = 켬, 0 = 끔)');}
 const wv=String(env.FLIP_WINDOW_MIN??'').trim();let windowMin=5;
 if(wv){const x=Number(wv);if(!Number.isInteger(x)||x<0||x>60)errors.push('FLIP_WINDOW_MIN (0–60 정수, 0 = 청산 뒤 반대 진입 규칙 끔)');else windowMin=x;}
 return {enabled,windowMin,maxAgeMs:6*HOUR,errors};
}

// ---- 감지(순수) -----------------------------------------------------------------------------
/** HL 원시 체결 → 방향 전환 이벤트 목록(시간순).
 *  {key, kind:'order'|'window', coin, dex, prevDir, prevSize, newDir, newSize, px, time, oid, tid, fills,
 *   closeTime, closeOid, closeTid, gapMs, hlDir(전환 체결의 HL dir 문자열, 있으면)} */
export function detectFlips(rawFills,{windowMin=5}={}){
 const by=new Map();
 for(const f of rawFills||[]){if(!f||!isPerp(f.coin))continue;const t=num(f.time),sz=num(f.sz),st=num(f.startPosition),px=num(f.px);
  if(!t||!(sz>0)||st===null||f.tid===undefined||f.tid===null||(f.side!=='B'&&f.side!=='A'))continue;
  if(!by.has(f.coin))by.set(f.coin,[]);by.get(f.coin).push({f,t,sz,st,px:px||0,signed:(f.side==='B'?1:-1)*sz,tid:String(f.tid),oid:f.oid===undefined||f.oid===null?null:String(f.oid),dir:String(f.dir||'')});}
 const out=[],seen=new Set(),win=Math.max(0,Number(windowMin)||0)*MIN;
 for(const [coin,list] of by){
  const ordered=orderCoin(list);
  // 연속한 같은 oid 체결 = 한 주문 묶음(run). oid 없으면 체결 하나가 한 묶음.
  const runs=[];
  for(const x of ordered){const r=runs.at(-1);if(r&&x.oid!==null&&r.oid===x.oid){r.fills.push(x);continue;}runs.push({oid:x.oid,fills:[x]});}
  let flat=null,peak=0;
  for(const r of runs){
   const a=r.fills[0],z=r.fills.at(-1),start=a.st,end=z.st+z.signed;
   const scale=Math.max(Math.abs(start),Math.abs(end),...r.fills.map(x=>x.sz));
   const s=sgn(start,scale),e=sgn(end,scale);
   const t0=a.t,key=`flip:hl:${coin}:${r.oid??'t'+a.tid}`;
   const dex=coin.includes(':')?coin.split(':')[0]:null;
   const vwap=list=>{let q=0,c=0;for(const x of list){const en=x.st+x.signed,sx=sgn(x.st,scale);const add=sx===e?Math.abs(en)-Math.abs(x.st):Math.abs(en);if(add>0){q+=add;c+=add*x.px;}}return q>0?c/q:null;};
   if(s!==0&&e!==0&&s!==e){
    // a) 한 주문으로 반전 — 부호가 처음 바뀐(또는 0을 지난) 체결
    const cross=r.fills.find(x=>sgn(x.st+x.signed,scale)===e)||z;
    if(!seen.has(key)){seen.add(key);
     out.push({key,kind:'order',coin,dex,prevDir:DIR[s],prevSize:Math.abs(start),newDir:DIR[e],newSize:Math.abs(end),px:cross.px,avgPx:vwap(r.fills),time:cross.t,startTime:t0,
      oid:r.oid,tid:cross.tid,fills:r.fills.length,hlDir:/>/.test(cross.dir)?cross.dir:null,closeTime:null,closeOid:null,closeTid:null,gapMs:0});}
    flat=null;peak=Math.abs(end);continue;
   }
   if(s===0&&e!==0){
    // b) 0에서 새로 열림 — 직전 청산이 반대 방향이고 창 안이면
    if(flat&&win>0&&flat.dir!==DIR[e]&&t0-flat.time<=win&&t0>=flat.time&&!seen.has(key)){seen.add(key);
     out.push({key,kind:'window',coin,dex,prevDir:flat.dir,prevSize:flat.size,newDir:DIR[e],newSize:Math.abs(end),px:a.px,avgPx:vwap(r.fills),time:t0,startTime:t0,
      oid:r.oid,tid:a.tid,fills:r.fills.length,hlDir:null,closeTime:flat.time,closeOid:flat.oid,closeTid:flat.tid,gapMs:t0-flat.time});}
    flat=null;peak=Math.abs(end);continue;
   }
   if(s!==0&&e===0){flat={time:z.t,dir:DIR[s],size:Math.max(peak,Math.abs(start)),oid:r.oid,tid:z.tid};peak=0;continue;}
   peak=Math.max(peak,Math.abs(start),Math.abs(end));
  }
 }
 return out.sort((x,y)=>x.time-y.time||(x.key<y.key?-1:1));
}

// ---- 메시지 -------------------------------------------------------------------------------
const kstS=ms=>{const d=new Date(ms+9*HOUR).toISOString();return d.slice(5,7)+'/'+d.slice(8,10)+' '+d.slice(11,19);};
export const qty=x=>{if(!Number.isFinite(x))return '—';const a=Math.abs(x);return a>=1000?a.toLocaleString('en-US',{maximumFractionDigits:2}):a.toLocaleString('en-US',{maximumFractionDigits:6});};
export const price=x=>{if(!Number.isFinite(x)||x<=0)return '—';return x>=1000?x.toLocaleString('en-US',{maximumFractionDigits:2}):String(Number(x.toPrecision(6)));};
const coinLabel=ev=>ev.dex?`${ev.coin} (HIP-3 ${ev.dex})`:ev.coin;
/** order = orderStatus의 order.order (없으면 null) */
export function orderLine(ev,order){
 const id=ev.oid?`oid ${ev.oid}`:`체결 ${ev.tid}`;
 if(order&&typeof order==='object'){
  const parts=[id,[order.orderType,order.tif&&order.tif!=='FrontendMarket'?String(order.tif).toUpperCase():null].filter(Boolean).join(' ')||null,num(order.origSz)>0?'주문 수량 '+qty(num(order.origSz)):null];
  const ro=order.reduceOnly===true?'reduce-only ✅':order.reduceOnly===false?'reduce-only 아님 ❌':null;
  return [...parts.filter(Boolean),ro||(ev.kind==='order'?'reduce-only 아님(반대 포지션이 열림)':null)].filter(Boolean).join(' · ');
 }
 return [id,ev.kind==='order'?'reduce-only 아님(체결로 판단: 반대 포지션이 열림)':null].filter(Boolean).join(' · ');
}
export function flipText(ev,{order=null,closeOrder=null,windowMin=5}={}){
 const L=[`🔄 [방향 전환 의심] 🟦 하이퍼리퀴드 · ${coinLabel(ev)} ${DIRK[ev.prevDir]} → ${DIRK[ev.newDir]}`,''];
 L.push(ev.kind==='order'?'한 주문으로 기존 포지션을 넘어 반대 포지션이 열렸습니다.':`청산 ${ev.gapMs<MIN?'1분 미만':Math.floor(ev.gapMs/MIN)+'분'} 뒤 반대 방향 진입 (기준 ${windowMin}분)`);
 L.push(`이전: ${DIRK[ev.prevDir]} ${qty(ev.prevSize)}`);
 L.push(`현재: ${DIRK[ev.newDir]} ${qty(ev.newSize)} (감지 시점)`);
 L.push(`체결가: ${price(ev.px)}${ev.avgPx&&Math.abs(ev.avgPx-ev.px)>ev.px*1e-6?` (반대 진입 평균 ${price(ev.avgPx)})`:''}`);
 L.push(`시각: ${kstS(ev.time)} KST`);
 if(ev.kind==='window')L.push(`청산: ${kstS(ev.closeTime)} KST${ev.closeOid?` · oid ${ev.closeOid}`:''}${closeOrder&&closeOrder.reduceOnly===true?' · reduce-only':closeOrder&&closeOrder.reduceOnly===false?' · reduce-only 아님':''}`);
 L.push(`주문: ${orderLine(ev,order)}`);
 L.push('','👉 청산은 Positions 탭의 Close로만 하세요 — 주문창 반대 주문은 reduce-only가 아니면 반대 포지션을 엽니다.');
 return L.join('\n');
}

// ---- 서버 기록(alert17.sql flip_push) 항목 ----------------------------------------------------
export function flipItem(ev,{order=null,closeOrder=null,now}){
 const ro=order&&typeof order.reduceOnly==='boolean'?order.reduceOnly:(ev.kind==='order'?false:null);
 return {ref:'fl:hl:'+ev.coin+':'+(ev.oid??'t'+ev.tid),market:'hl',kind:ev.kind,symbol:ev.coin,dex:ev.dex,prev_dir:ev.prevDir,prev_size:ev.prevSize,new_dir:ev.newDir,new_size:ev.newSize,
  px:ev.px,at:ev.time,oid:ev.oid,tid:ev.tid,close_oid:ev.closeOid,close_tid:ev.closeTid,close_at:ev.closeTime,gap_sec:ev.kind==='window'?Math.round(ev.gapMs/1000):0,
  reduce_only:ro,reduce_only_source:order&&typeof order.reduceOnly==='boolean'?'order':ev.kind==='order'?'fills':null,
  order_type:order?.orderType?String(order.orderType).slice(0,40):null,tif:order?.tif?String(order.tif).slice(0,40):null,orig_sz:num(order?.origSz),
  detail:{avgPx:ev.avgPx??null,fills:ev.fills,hlDir:ev.hlDir,startTime:ev.startTime,closeReduceOnly:closeOrder&&typeof closeOrder.reduceOnly==='boolean'?closeOrder.reduceOnly:null},sent_at:now};
}

// ---- 서비스 안 처리기 ------------------------------------------------------------------------
export class Flip{
 /** d: {cfg, tg, rpc, token, log, now, state:()=>S, save:()=>Promise} */
 constructor(d){Object.assign(this,d);this.sql='unknown';this.sqlAt=0;this.warned={};}
 get S(){const S=this.state();if(!S.flip||typeof S.flip!=='object')S.flip={since:this.now(),sent:{},sizes:{},pending:[],outbox:[]};
  const F=S.flip;F.sent=F.sent||{};F.sizes=F.sizes||{};F.pending=F.pending||[];F.outbox=F.outbox||[];if(!F.since)F.since=this.now();return F;}
 warnOnce(k,m){if(this.warned[k])return;this.warned[k]=1;this.log('WARN',m);}
 async orderInfo(client,oid){if(!client||!oid)return null;try{const r=await client.info({type:'orderStatus',oid:Number(oid)});const o=r?.order?.order;return o&&typeof o==='object'?o:null;}catch(e){this.log('WARN','HL 주문 정보 조회 실패(체결로만 판단): '+String(e.message||e).slice(0,60));return null;}}
 /** check() 끝에서 호출. rawFills = HL 원시 체결, client = HLClient(orderStatus용) */
 async afterCheck(rawFills,client,t=this.now()){
  const F=this.S,cfg=this.cfg;let n=0;
  for(const [k,v] of Object.entries(F.sent))if(v<t-14*DAY){delete F.sent[k];delete F.sizes[k];}
  await this.flushOutbox(t);await this.flushPending();
  if(!rawFills)return 0;
  const fresh=x=>x>=F.since&&t-x<=cfg.maxAgeMs;
  for(const ev of detectFlips(rawFills,cfg)){
   if(!fresh(ev.time))continue;
   if(F.sent[ev.key]){ // 같은 주문 — 메시지는 다시 안 보냄. 체결이 더 붙어 크기가 바뀌었으면 기록만 갱신
    if(F.sizes[ev.key]!==undefined&&F.sizes[ev.key]!==ev.newSize){F.sizes[ev.key]=ev.newSize;const ref='fl:hl:'+ev.coin+':'+(ev.oid??'t'+ev.tid);
     const old=F.pending.find(p=>p.ref===ref);if(old){old.new_size=ev.newSize;}else F.pending.push({...flipItem(ev,{now:F.sent[ev.key]}),reduce_only:undefined,reduce_only_source:undefined,order_type:undefined,tif:undefined,orig_sz:undefined,sizeOnly:true});await this.save();}
    continue;}
   F.sent[ev.key]=t;F.sizes[ev.key]=ev.newSize;await this.save();
   const order=await this.orderInfo(client,ev.oid),closeOrder=ev.kind==='window'?await this.orderInfo(client,ev.closeOid):null;
   const text=flipText(ev,{order,closeOrder,windowMin:cfg.windowMin});
   try{await this.tg.send(text);}catch(e){F.outbox.push({key:ev.key,at:t,text});this.log('ERROR','방향 전환 알림 전송 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}
   F.pending.push(flipItem(ev,{order,closeOrder,now:t}));n++;
   this.log('INFO',`방향 전환 의심: ${ev.coin} ${ev.prevDir}→${ev.newDir} (${ev.kind}) oid ${ev.oid}`);
  }
  if(n)await this.save();
  await this.flushPending();
  return n;
 }
 async flushOutbox(t){const F=this.S;if(!F.outbox.length)return;const keep=[];
  for(const o of F.outbox){if(t-o.at>2*HOUR)continue;try{await this.tg.send(o.text);}catch{keep.push(o);}}
  F.outbox=keep;await this.save();}
 async probe(){const t=this.now();if(this.sql==='ok'||(this.sql==='missing'&&t-this.sqlAt<HOUR))return this.sql==='ok';
  try{await this.rpc.call('flip_push',{p_token:this.token,p_payload:{items:[]}});if(this.sql!=='ok')this.log('INFO','alert17.sql 확인 → 방향 전환 감지를 Supabase flip_alerts에 기록합니다(앱 \'주문 실수\' 태그용).');this.sql='ok';}
  catch(e){const c=String(e.message||e);if(/ALERT17_SQL_NOT_INSTALLED/.test(c)){this.sql='missing';this.warnOnce('sql','alert17.sql이 아직 없습니다 → 방향 전환 경고는 텔레그램으로만 보내고 기록은 이 서버에만 둡니다(설치하면 밀린 기록을 올림).');}
   else this.log('WARN','방향 전환 기록 저장소 확인 실패: '+c.slice(0,80));}
  this.sqlAt=t;return this.sql==='ok';}
 async flushPending(){const F=this.S;if(!F.pending.length)return;if(!(await this.probe())){F.pending=F.pending.slice(-200);return;}
  const batch=F.pending.slice(0,50);
  const clean=({sizeOnly,...x})=>{for(const k of Object.keys(x))if(x[k]===undefined)delete x[k];return x;};
  try{await this.rpc.call('flip_push',{p_token:this.token,p_payload:{items:batch.map(clean)}});F.pending=F.pending.slice(batch.length);await this.save();}
  catch(e){this.log('WARN','방향 전환 기록 저장 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}}
}

// ---- 드라이런 출력 ---------------------------------------------------------------------------
export function dryReport(events,orders,cfg,{from,to,fills}){
 const L=[`방향 전환 드라이런 (보내지 않음 · 저장 안 함) · ${from} ~ ${to} (KST) · 청산 뒤 반대 진입 기준 ${cfg.windowMin?cfg.windowMin+'분':'끔'} · HL 체결 ${fills}건`];
 const c={order:0,window:0};
 for(const ev of events){c[ev.kind]++;const o=orders.get(ev.oid)||null;
  L.push('',`${kstS(ev.time)} KST ${coinLabel(ev)} ${DIRK[ev.prevDir]} ${qty(ev.prevSize)} → ${DIRK[ev.newDir]} ${qty(ev.newSize)} · ${ev.kind==='order'?'한 주문 반전':'청산 '+(ev.gapMs/MIN).toFixed(1)+'분 뒤 반대 진입'} · 체결가 ${price(ev.px)}`);
  L.push(`   주문: ${orderLine(ev,o)}${ev.hlDir?` · HL dir '${ev.hlDir}'`:''}`);}
 if(!events.length)L.push('','(해당 없음)');
 L.push('',`합계 ${events.length}건 (한 주문 반전 ${c.order} · 청산 뒤 반대 진입 ${c.window}) = 보냈을 텔레그램 메시지 ${events.length}건`);
 return {text:L.join('\n'),counts:c};
}
