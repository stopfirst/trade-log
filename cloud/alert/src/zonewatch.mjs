// trade-alert 2.10.0 (alert14) — flow-chart 존 터치 알림. 손실 한도 판정과 무관(판정 코드·상태를 읽지도 바꾸지도 않음).
//  * 존 = flow-chart가 그리는 BB+FVG(가까운 2개)와 OB 백도식(방향별 최근 1개) — 계산은 zones.mjs(flow-chart calc.js 그대로).
//  * 봉 = flow-chart와 같은 소스 순서(ZONE_SOURCE=auto): Binance USDT-M 선물 → Binance 현물 → Hyperliquid candleSnapshot.
//    ZONE_SOURCE=hl 이면 Hyperliquid만, binance 면 Binance(선물 → 현물)만. 전체 봉 = ZONE_BARS(차트 봉 수, 기본 100) + 워밍업 260.
//  * 1분마다(ZONE_CHECK_SEC) 최근 봉만 받아 캐시에 합침(전체 다시 받기 = 6시간마다·틈이 생겼을 때). 429/5xx → 지수 백오프(Retry-After 존중).
//  * 터치 = 직전 확인 뒤의 봉(진행 중 봉 포함) 고가·저가가 존 [하단, 상단]에 걸침. 새로 보이기 시작한 존은 '지금 가격이 존 안'일 때만.
//    존이 만들어진 봉(BB+FVG: FVG 셋째 봉·브레이커 돌파 봉, OB: 돌파 봉)과 그 이전 봉은 터치로 치지 않음(flow-chart touched와 같은 시작점).
//  * 같은 존은 한 번만: 존 id = 종목:종류:방향:시작 봉 시각 → state2.json zones.sent에 저장(재시작해도 유지).
//    존이 마감된 봉 종가로 무효화되면(또는 24시간 동안 계산에서 사라지면) 기록 정리. 조용한 시간 없음.
//  * 텔레그램 /zones on|off|status — 켜기·끄기는 state2.json에 저장(.env ZONE_ALERT 값을 바꾸면 그 값이 다시 우선).
import {computeZones,selectShown,zoneRecord,WARMUP} from './zones.mjs';

const MIN=60000,HOUR=3600000,DAY=86400000;
export const TF_MS={'15m':15*MIN,'1h':HOUR,'4h':4*HOUR};
export const KIND_KO={bbfvg:'BB+FVG',ob:'OB'};
export const DIR_KO={bull:'강세',bear:'약세'};
const SRC_KO={bnf:'Binance 선물',bns:'Binance 현물',hl:'Hyperliquid'};
const truthy=v=>['1','true','yes','on','켬'].includes(String(v??'').trim().toLowerCase());

/** .env → 설정. 문제 있는 키는 errors에(alert.mjs readConfig가 모아서 알려 줌). */
export function zoneConfig(env){
 const errors=[];const E=f=>errors.push(f);
 const envOn=truthy(env.ZONE_ALERT);
 const symbols=[...new Set(String(env.ZONE_SYMBOLS||'BTC,ETH').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))];
 if(!symbols.length||symbols.length>10||symbols.some(s=>!/^[A-Z0-9]{1,12}$/.test(s)))E('ZONE_SYMBOLS (예: BTC,ETH · 최대 10개)');
 const tf=String(env.ZONE_TF||'1h').trim().toLowerCase();if(!TF_MS[tf])E('ZONE_TF (15m, 1h, 4h)');
 const kinds=[...new Set(String(env.ZONE_KINDS||'bbfvg,ob').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean))];
 if(!kinds.length||kinds.some(k=>!KIND_KO[k]))E('ZONE_KINDS (bbfvg, ob, bbfvg,ob)');
 const num=(k,d,min,max)=>{const v=String(env[k]??'').trim();if(!v)return d;const x=Number(v);if(!Number.isInteger(x)||x<min||x>max){E(`${k} (${min}–${max})`);return d;}return x;};
 const checkSec=num('ZONE_CHECK_SEC',60,30,600),bars=num('ZONE_BARS',100,20,1000);
 const source=String(env.ZONE_SOURCE||'auto').trim().toLowerCase();if(!['auto','hl','binance'].includes(source))E('ZONE_SOURCE (auto = flow-chart와 같은 순서, hl, binance)');
 let link=String(env.ZONE_LINK||'https://stopfirst.github.io/flow-chart/').trim();try{const u=new URL(link);if(u.protocol!=='https:')throw 0;}catch{E('ZONE_LINK (https://…)');link='https://stopfirst.github.io/flow-chart/';}
 const commands=String(env.ZONE_COMMANDS??'').trim()===''?true:truthy(env.ZONE_COMMANDS);
 return {envOn,symbols,tf,tfMs:TF_MS[tf]||HOUR,kinds,checkSec,bars,source,link,commands,errors};
}

// ---- 봉 소스 -------------------------------------------------------------------------------
function httpErr(src,status,retryAfter){const e=Error(`ZONE_${src.toUpperCase()}_HTTP_${status}`);e.status=status;e.retryAfter=retryAfter;return e;}
async function getJSON(fetcher,src,url,init){
 let r;try{r=await fetcher(url,{...(init||{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{const e=Error(`ZONE_${src.toUpperCase()}_NETWORK`);e.network=true;throw e;}
 if(!r.ok)throw httpErr(src,r.status,r.headers?.get?.('retry-after'));
 return r.json();
}
const bnParse=rows=>{if(!Array.isArray(rows))throw Error('ZONE_BINANCE_BAD');return rows.map(k=>({t:Number(k[0]),o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]}));};
/** flow-chart data.js와 같은 주소·같은 봉. limit = 최근 N개(진행 중 봉 포함). */
export function makeSources(fetcher=fetch){
 const iv={'15m':'15m','1h':'1h','4h':'4h'};
 return {
  bnf:async(sym,tf,{limit})=>bnParse(await getJSON(fetcher,'bnf',`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}USDT&interval=${iv[tf]}&limit=${Math.min(limit,1500)}`)),
  bns:async(sym,tf,{limit})=>{const q=`/api/v3/klines?symbol=${sym}USDT&interval=${iv[tf]}&limit=${Math.min(limit,1000)}`;
   try{return bnParse(await getJSON(fetcher,'bns','https://data-api.binance.vision'+q));}catch(e){if(e.status===400||e.status===429)throw e;return bnParse(await getJSON(fetcher,'bns','https://api.binance.com'+q));}},
  hl:async(sym,tf,{start,end})=>{const rows=await getJSON(fetcher,'hl','https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'candleSnapshot',req:{coin:sym,interval:iv[tf],startTime:start,endTime:end}})});
   if(!Array.isArray(rows))throw Error('ZONE_HL_BAD');return rows.map(k=>({t:Number(k.t),o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v}));},
 };
}
export const CHAIN={auto:['bnf','bns','hl'],binance:['bnf','bns'],hl:['hl']};

/** 종목별 봉 캐시: 전체(need개)는 처음·6시간마다·틈이 생기면, 그 사이엔 최근 봉 몇 개만. 창 = flow-chart와 같은 [floor(now/T)·T − (need−1)·T, now]. */
export class CandleCache{
 constructor({sources,cfg,now=Date.now,fullEveryMs=6*HOUR}){Object.assign(this,{sources,cfg,now,fullEveryMs});this.map=new Map();this.requests=0;}
 need(){return this.cfg.bars+WARMUP;}
 async full(sym,t){
  const {tf,tfMs}=this.cfg,need=this.need(),start=Math.floor(t/tfMs)*tfMs-(need-1)*tfMs;let last=null;
  for(const s of CHAIN[this.cfg.source]){ // flow-chart처럼 앞 소스가 실패하면 다음 소스(429는 바로 백오프)
   try{this.requests++;const rows=await this.sources[s](sym,tf,{limit:need,start,end:t});if(rows.length){return {src:s,rows};}last=Error('ZONE_EMPTY_'+s);}
   catch(e){if(e.status===429)throw e;last=e;}
  }
  throw last||Error('ZONE_NO_SOURCE');
 }
 async get(sym,t=this.now()){
  const {tf,tfMs}=this.cfg,need=this.need(),start=Math.floor(t/tfMs)*tfMs-(need-1)*tfMs;
  let c=this.map.get(sym);
  if(!c||t-c.fullAt>=this.fullEveryMs||!c.rows.length||c.rows[c.rows.length-1].t<start){
   const f=await this.full(sym,t);c={src:f.src,rows:f.rows,fullAt:t,at:t};this.map.set(sym,c);
  }else{
   const lastT=c.rows[c.rows.length-1].t;this.requests++;
   const rows=await this.sources[c.src](sym,tf,{limit:3,start:lastT-tfMs,end:t});
   if(rows.length&&rows[0].t>lastT+tfMs){const f=await this.full(sym,t);c={src:f.src,rows:f.rows,fullAt:t,at:t};this.map.set(sym,c);} // 틈 → 전체 다시
   else{const m=new Map(c.rows.map(x=>[x.t,x]));for(const x of rows)m.set(x.t,x);c.rows=[...m.values()].sort((a,b)=>a.t-b.t);c.at=t;}
  }
  c.rows=c.rows.filter(x=>x.t>=start&&x.t<=t);
  if(c.rows.length>need)c.rows=c.rows.slice(-need);
  return {src:c.src,rows:c.rows};
 }
}

// ---- 표시 ----------------------------------------------------------------------------------
export function fmtPx(x,ref){if(!Number.isFinite(x))return '—';const r=Math.abs(ref??x);const d=r>=10000?1:r>=100?2:r>=1?3:5;return x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});} // = flow-chart calc.js fmtPrice
const kst=ms=>{const d=new Date(ms+9*HOUR).toISOString();return d.slice(5,7)+'/'+d.slice(8,10)+' '+d.slice(11,16);};
export function chartLink(cfg,sym){const u=new URL(cfg.link);u.searchParams.set('s',sym);u.searchParams.set('tf',cfg.tf);return u.toString();}
/** 알림 한 통(짧게). */
export function touchText(cfg,z,price,src,{gone=false}={}){
 const ref=price,tfL=cfg.tf.toUpperCase();
 return [`🎯 ${z.sym} ${tfL} ${KIND_KO[z.kind]} ${DIR_KO[z.dir]} 존 터치`,'',
  `존: ${fmtPx(z.bottom,ref)} – ${fmtPx(z.top,ref)}`,
  `현재가: ${fmtPx(price,ref)}${gone?' (존을 종가로 넘는 중)':''}`,
  `존 시작 봉: ${kst(z.t0)} KST · ${SRC_KO[src]||src}`,
  chartLink(cfg,z.sym)].join('\n');
}

// ---- 감시 ----------------------------------------------------------------------------------
export class ZoneWatch{
 /** deps: {cfg (zoneConfig), fetcher, now, log, state:()=>S, save:()=>Promise, send:(text)=>Promise, sources?, dryRun?} */
 constructor(d){
  Object.assign(this,{now:Date.now,log:()=>{},dryRun:false},d);
  this.cache=new CandleCache({sources:this.sources||makeSources(this.fetcher||fetch),cfg:this.cfg,now:this.now});
  this.backoff={until:0,n:0};this.last={at:0,ok:{},err:{},shown:{},src:{},price:{}};this.fails=0;
 }
 get S(){const S=this.state();if(!S.zones||typeof S.zones!=='object')S.zones={};const Z=S.zones;Z.sent=Z.sent||{};Z.watch=Z.watch||{};Z.seen=Z.seen||{};Z.outbox=Z.outbox||[];return Z;}
 enabled(){const o=this.S.override;return o&&o.envOn===this.cfg.envOn?!!o.on:this.cfg.envOn;}
 setEnabled(on){this.S.override={on:!!on,envOn:this.cfg.envOn,at:this.now()};return this.save();}
 key(sym){return sym+':'+this.cfg.tf;}

 /** 한 종목: 봉 → 존 → 터치·정리. 반환 {alerts:[{z,text}], shown, all}. persist는 호출 측. */
 evaluate(sym,full,src,t){
  const Z=this.S,cfg=this.cfg,k=this.key(sym),n=full.length;
  const zc=computeZones(full,{nowMs:t,tfMs:cfg.tfMs,bars:cfg.bars}),sh=selectShown(zc,full);
  const shown=[];for(const kind of cfg.kinds)for(const z of sh[kind])shown.push(zoneRecord(sym,cfg.tf,kind,z,full));
  const price=full[n-1].c,seenT=Z.seen[k];
  // 이번 확인에서 볼 봉: 직전 확인 때의 마지막 봉(그때 진행 중) 시각 이후 전부. 처음이면 마지막 봉만.
  const recent=seenT==null?[full[n-1]]:full.filter(x=>x.t>=seenT);
  const raw=new Map();
  for(const kind of ['bbfvg','ob'])for(const z of (kind==='ob'?zc.obAll:zc.bbAll)){const r=zoneRecord(sym,cfg.tf,kind,z,full);r.end=z.end;raw.set(r.id,r);}
  const prevWatch=Z.watch[k]||{};const alerts=[];
  const cand=new Map(shown.map(r=>[r.id,{r,isNew:!prevWatch[r.id]}]));
  for(const [id,w] of Object.entries(prevWatch))if(!cand.has(id)&&cfg.kinds.includes(w.kind)){ // 지난번엔 보였는데 이번엔 빠진 존(관통·무효화 진행 등)도 이번 봉으로 한 번 더 확인
   const r=raw.get(id);cand.set(id,{r:{...w,id,sym,tf:cfg.tf,...(r?{top:r.top,bottom:r.bottom}:{})},isNew:false,gone:!!(r&&r.end!=null)});}
  for(const {r,isNew,gone} of cand.values()){
   if(Z.sent[r.id])continue;
   const inZone=x=>x.l<=r.top&&x.h>=r.bottom;
   const hit=isNew?(price<=r.top&&price>=r.bottom&&full[n-1].t>r.touchFromT):recent.some(x=>x.t>r.touchFromT&&inZone(x));
   if(!hit)continue;
   Z.sent[r.id]={at:t,seen:t,kind:r.kind,dir:r.dir,top:r.top,bottom:r.bottom};
   alerts.push({z:r,text:touchText(cfg,r,price,src,{gone:!!gone})});
  }
  // 감시 목록 갱신 + 정리(무효화 = 마감된 봉 종가로 반대편 이탈 → 기록 삭제, 계산에서 사라진 지 24시간 → 삭제)
  Z.watch[k]=Object.fromEntries(shown.map(r=>[r.id,{kind:r.kind,dir:r.dir,top:r.top,bottom:r.bottom,t0:r.t0,touchFromT:r.touchFromT}]));
  Z.seen[k]=full[n-1].t;
  const pre=sym+':';
  for(const [id,s] of Object.entries(Z.sent)){if(!id.startsWith(pre))continue;const r=raw.get(id);
   if(r&&r.end!=null&&r.end<=zc.lastClosed){delete Z.sent[id];this.log('INFO',`존 정리(무효화): ${id}`);continue;}
   if(r){s.seen=t;continue;}
   if(t-(s.seen||s.at)>DAY||t-s.at>30*DAY){delete Z.sent[id];this.log('INFO',`존 정리(계산에서 사라짐): ${id}`);}}
  this.last.shown[sym]=shown;this.last.src[sym]=src;this.last.price[sym]=price;
  return {alerts,shown,zc,price};
 }
 async deliver(text){if(this.dryRun){this.log('INFO','[보낼 존 알림]\n'+text);return;}await this.send(text);}
 /** 1회 확인(모든 종목). 꺼져 있으면 아무것도 안 함. 동시에 두 번 돌지 않도록 직렬화(/zones on 직후 확인과 1분 루프가 겹쳐도 중복 전송 없음). */
 tick(t,opts){const p=(this._busy||Promise.resolve()).catch(()=>{}).then(()=>this._tick(t??this.now(),opts));this._busy=p;return p;}
 async _tick(t,{force=false}={}){
  if(!force&&!this.enabled())return {skipped:'off'};
  if(t<this.backoff.until)return {skipped:'backoff'};
  const Z=this.S;let changed=false,sent=0;const out=[];
  for(const sym of this.cfg.symbols){
   let got;try{got=await this.cache.get(sym,t);delete this.last.err[sym];}
   catch(e){const c=String(e.message||e);this.last.err[sym]=c;
    if(e.status===429||e.status>=500||e.network){this.backoff.n++;const ra=Number(e.retryAfter);const wait=Math.min(15*MIN,Math.max(Number.isFinite(ra)?ra*1000:0,MIN*2**Math.min(this.backoff.n-1,4)));this.backoff.until=t+wait;
     this.log('WARN',`존 봉 조회 실패 ${sym}: ${c} → ${Math.round(wait/1000)}초 쉼`);break;}
    this.log('WARN',`존 봉 조회 실패 ${sym}: ${c}`);continue;}
   if(got.rows.length<30){this.last.err[sym]='봉 부족 '+got.rows.length;continue;}
   const r=this.evaluate(sym,got.rows,got.src,t);this.last.ok[sym]=t;changed=true;
   for(const a of r.alerts){Z.outbox.push({id:a.z.id,text:a.text,at:t});this.log('INFO',`존 터치: ${a.z.id} ${a.z.bottom}–${a.z.top} @ ${r.price}`);}
   out.push({sym,...r});
  }
  if(!Object.keys(this.last.err).length)this.backoff.n=0;
  this.last.at=t;
  if(Z.outbox.length){changed=true;await this.save();} // 보내기 전에 '보냄' 기록부터 저장 → 재시작해도 중복 없음
  const keep=[];
  for(const m of Z.outbox){if(t-m.at>30*MIN)continue;try{await this.deliver(m.text);sent++;}catch(e){keep.push(m);this.log('ERROR','존 알림 전송 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}}
  Z.outbox=this.dryRun?[]:keep;
  if(changed)await this.save();
  return {results:out,sent};
 }
 statusText(){
  const c=this.cfg,on=this.enabled(),o=this.S.override,L=[];
  L.push(`${on?'🟢':'⚪'} 존 터치 알림 ${on?'켜짐':'꺼짐'}${o&&o.envOn===c.envOn?' (텔레그램으로 설정)':` (.env ZONE_ALERT=${c.envOn?1:0})`}`,'');
  L.push(`종목: ${c.symbols.join(', ')} · ${c.tf.toUpperCase()} · ${c.kinds.map(k=>KIND_KO[k]).join('·')}`);
  L.push(`확인: ${c.checkSec}초마다 · 소스 ${c.source==='auto'?'flow-chart와 같은 순서':c.source}`);
  if(this.last.at)L.push(`마지막 확인: ${kst(this.last.at)} KST`);
  for(const s of c.symbols){const sh=this.last.shown[s];const err=this.last.err[s];
   if(err)L.push(`${s}: 확인 실패 ${err}`);
   else if(sh){const p=this.last.price[s];L.push(`${s} ${fmtPx(p,p)} (${SRC_KO[this.last.src[s]]||''})`+(sh.length?'':' · 보이는 존 없음'));for(const z of sh)L.push(`  ${KIND_KO[z.kind]} ${DIR_KO[z.dir]} ${fmtPx(z.bottom,p)} – ${fmtPx(z.top,p)}${this.S.sent[z.id]?' · 알림 보냄':''}`);}}
  L.push('','/zones on · /zones off · /zones status');
  return L.join('\n');
 }
 /** 텔레그램 메시지(명령) 처리. 처리했으면 답장 텍스트, 아니면 null. chat 확인은 호출 측. */
 async command(text){
  const m=/^\/zones(?:@\w+)?(?:\s+(\S+))?\s*$/i.exec(String(text||'').trim());if(!m)return null;
  const a=String(m[1]||'status').toLowerCase();
  if(['on','켜기','켬'].includes(a)){await this.setEnabled(true);this.log('INFO','존 터치 알림 켬(텔레그램)');let msg='🟢 존 터치 알림을 켰습니다.\n\n';try{await this.tick(this.now(),{force:false});}catch{}return msg+this.statusText();}
  if(['off','끄기','끔'].includes(a)){await this.setEnabled(false);this.log('INFO','존 터치 알림 끔(텔레그램)');return '⚪ 존 터치 알림을 껐습니다. 다시 켜기: /zones on';}
  if(['status','상태'].includes(a))return this.statusText();
  return '사용법: /zones on · /zones off · /zones status';
 }
}

/** --zones-dry: 보내지도 저장하지도 않고 지금 존 목록 출력(꺼져 있어도 동작). */
export async function dryList(cfg,{fetcher=fetch,now=Date.now,log=()=>{},sources}={}){
 const S={};const w=new ZoneWatch({cfg,fetcher,now,log,state:()=>S,save:async()=>{},send:async()=>{},dryRun:true,sources});
 const t=now(),lines=[`존 목록 (보내지 않음) · ${cfg.tf.toUpperCase()} · ${cfg.kinds.map(k=>KIND_KO[k]).join('·')} · 차트 ${cfg.bars}봉 · ${kst(t)} KST`];
 for(const sym of cfg.symbols){
  let got;try{got=await w.cache.get(sym,t);}catch(e){lines.push(`${sym}: 봉 조회 실패 ${String(e.message||e)}`);continue;}
  const full=got.rows,p=full[full.length-1].c;const r=w.evaluate(sym,full,got.src,t);
  lines.push('',`${sym} 현재가 ${fmtPx(p,p)} · ${SRC_KO[got.src]} 봉 ${full.length}개 (마지막 ${kst(full[full.length-1].t)} KST)`);
  if(!r.shown.length)lines.push('  보이는 존 없음');
  for(const z of r.shown){const inside=p<=z.top&&p>=z.bottom;lines.push(`  ${KIND_KO[z.kind]} ${DIR_KO[z.dir]} ${fmtPx(z.bottom,p)} – ${fmtPx(z.top,p)} · 시작 ${kst(z.t0)} KST${inside?' · 지금 존 안(켜져 있으면 알림)':''}`);}
  lines.push(`  (살아 있는 전체: BB+FVG ${r.zc.bbfvg.length}개 · OB ${r.zc.ob.length}개)`);
  lines.push('  '+chartLink(cfg,sym));
 }
 return lines.join('\n');
}
