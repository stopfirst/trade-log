// 2.7.0 HL 현물 평가를 손실 한도 분모에 포함 (사용자 결정 2026-10-28: 현물 포함 전체 계좌 기준, 앱 v67과 같은 정의)
//  지금 현물 = spotClearinghouseState 잔고(USDC·토큰0 제외) × spotMetaAndAssetCtxs USDC 페어 중간가(없으면 mark).
//  마감(key = UTC 날짜, 경계 = key+1일 00:00 UTC) 현물 = (지금 수량 − 경계 뒤 순매수) × 경계 시각 봉 시가.
//    순매수 = userFillsByTime의 그 페어(@N) 체결(B +, A −, 그 토큰으로 낸 수수료 −). 봉 = 경계가 3일 안이면 1분봉, 150일 안이면 1시간봉, 아니면 1일봉.
//  계산 못 한 날은 더하지 않음(USDC만) → 로그 WARN. SPOT_IN_BASIS=0이면 이 모듈을 안 씀.
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
const DAY=86400000;
export function addDaysKey(k,n){const d=new Date(k+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function boundOf(key){return Date.parse(addDaysKey(key,1)+'T00:00:00Z');}
export function priceItems(balances,meta,ctxs){
 const uni=meta&&Array.isArray(meta.universe)?meta.universe:[];const items=[];let usd=0,miss=0;
 for(const b of balances||[]){if(!b||b.token===0)continue;const qty=num(b.total);if(!qty)continue;
  const pair=uni.find(u=>Array.isArray(u.tokens)&&u.tokens[0]===b.token&&u.tokens[1]===0),c=pair&&ctxs?.[pair.index];
  const px=c?(num(c.markPx)||num(c.midPx)):null; // 2.7.2: HL 화면과 같게 markPx 우선
  if(px>0){items.push({coin:String(b.coin),token:b.token,pair:pair.name,qty,px,usd:qty*px});usd+=qty*px;}else{miss++;items.push({coin:String(b.coin),token:b.token,pair:pair?pair.name:null,qty,px:null,usd:null});}}
 return {items,usd:Math.round(usd*1e6)/1e6,miss,sig:items.map(i=>i.coin+':'+i.qty).sort().join(',')};
}
export function netAfter(fills,item,bound){let net=0;for(const f of fills||[]){if(!f||f.coin!==item.pair||!(num(f.time)>=bound))continue;const z=num(f.sz);if(z)net+=f.side==='B'?z:-z;if(f.feeToken===item.coin){const fe=num(f.fee);if(fe)net-=fe;}}return net;}
export function candleIv(bound,now){const age=now-bound;return age<3*DAY?['1m',60e3]:age<150*DAY?['1h',3600e3]:['1d',DAY];}
export function openAt(candles,bound,ivMs){if(!Array.isArray(candles))return null;const c=candles.find(x=>num(x.t)>=bound-ivMs/2&&num(x.t)<bound+ivMs);const o=c&&num(c.o);return o>0?o:null;}
export class SpotBasis{
 constructor({post,now=Date.now,log=()=>{}}){this.post=post;this.now=now;this.log=log;this.addr=null;this.px=new Map();this.byKey=new Map();this.sig=null;this.cur=null;this.warned=new Set();}
 async current(addr){
  const [st,mc]=await Promise.all([this.post({type:'spotClearinghouseState',user:addr}),this.post({type:'spotMetaAndAssetCtxs'})]);
  const r=priceItems(st?.balances,mc?.[0],mc?.[1]);this.cur={...r,at:this.now()};return this.cur;}
 /** keys: UTC 날짜 키들 → Map key→usd(계산된 것만) */
 async closes(addr,keys){
  if(this.addr!==addr){this.addr=addr;this.px.clear();this.byKey.clear();this.sig=null;}
  const cur=this.cur;if(!cur)return new Map();
  if(cur.sig!==this.sig){this.byKey.clear();this.sig=cur.sig;}
  const need=[...new Set(keys)].filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&!this.byKey.has(k)&&boundOf(k)<=this.now());
  if(need.length&&cur.items.length){
   if(cur.miss){this.warn('miss','현물 중 가격 없는 토큰이 있어 마감 현물 평가를 건너뜀(분모 = USDC만)');}
   else{const from=Math.min(...need.map(boundOf));let fills=[];
    try{let s=from;for(let i=0;i<10;i++){const page=await this.post({type:'userFillsByTime',user:addr,startTime:s,aggregateByTime:false});if(!Array.isArray(page))throw Error('bad fills');fills.push(...page);if(page.length<2000)break;s=Math.max(...page.map(f=>f.time))+1;}}
    catch(e){this.warn('fills','현물 체결 조회 실패 → 마감 현물 평가 건너뜀: '+String(e.message||e).slice(0,60));fills=null;}
    if(fills)for(const k of need){const b=boundOf(k);let tot=0,ok=true;
     for(const it of cur.items){const q0=Math.max(0,it.qty-netAfter(fills,it,b));if(q0<=1e-12)continue;const [iv,ms]=candleIv(b,this.now()),ck=it.pair+'|'+iv+'|'+b;
      let px=this.px.get(ck);if(px===undefined){try{px=openAt(await this.post({type:'candleSnapshot',req:{coin:it.pair,interval:iv,startTime:b-ms,endTime:b+2*ms}}),b,ms);}catch{px=null;}if(px)this.px.set(ck,px);}
      if(!px){ok=false;break;}tot+=q0*px;}
     if(ok)this.byKey.set(k,Math.round(tot*1e6)/1e6);else this.warn('px:'+k,k+' 마감 현물 시세를 못 받아 그날 분모는 USDC만');}}
  }
  const out=new Map();for(const k of keys)if(this.byKey.has(k))out.set(k,this.byKey.get(k));return out;}
 warn(id,msg){if(this.warned.has(id))return;this.warned.add(id);this.log('WARN',msg);}
}
/** acct_snapshots 행 중 HL 마감값에 그날 마감 현물 더함(원본 안 바꿈) */
export function withSpot(acct,map){if(!map||!map.size)return acct;return (acct||[]).map(r=>r&&r.market==='hl'&&map.has(r.day)?{...r,value:Number(r.value)+map.get(r.day),spot:map.get(r.day)}:r);}
