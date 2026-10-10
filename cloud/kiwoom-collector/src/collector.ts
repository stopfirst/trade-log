// Kiwoom US-stock cloud collector (v11: + USD cash via ust21160, + --backfill).
// Reads the Kiwoom read-only APIs through KiwoomJournal (same code as the PC server)
// and pushes changed day snapshots to Supabase via the kw_push RPC, using only the
// publishable/anon key plus a per-user collector token. No service_role key.
// Run: node --env-file=.env src/collector.ts            (systemd does this)
//      node --env-file=.env src/collector.ts --once     (one round, then exit; for checking)
//      node --env-file=.env src/collector.ts --backfill 2026-01-01 [2026-10-09]
//           (past Korean dates one by one, oldest first; end defaults to yesterday; Sundays skipped)
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {KiwoomJournal,checkDate} from './adapters/kiwoom-journal.ts';

export const VERSION='1.1.0';
const MIN=60000;

export type Config={supabaseUrl:string,supabaseKey:string,token:string};
export function readConfig(env:NodeJS.ProcessEnv):Config{
 const problems:string[]=[];
 let url='';try{const u=new URL(String(env.SUPABASE_URL||'').trim());if(u.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.port)throw Error();url=u.origin;}catch{problems.push('SUPABASE_URL (https://프로젝트ID.supabase.co)');}
 const key=String(env.SUPABASE_KEY||'').trim();
 if(key.startsWith('sb_secret_'))throw Error('CONFIG_SECRET_KEY_REFUSED');
 if(key.startsWith('eyJ')){let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role;}catch{}if(role!=='anon')throw Error('CONFIG_SECRET_KEY_REFUSED');}
 else if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))problems.push('SUPABASE_KEY (sb_publishable_…)');
 const token=String(env.KW_COLLECTOR_TOKEN||'').trim();
 if(!/^kwc_[A-Za-z0-9_-]{43}$/.test(token))problems.push('KW_COLLECTOR_TOKEN (앱에서 만든 kwc_… 토큰)');
 for(const k of ['KIWOOM_APP_KEY','KIWOOM_SECRET','KIWOOM_ACCOUNT'])if(!String(env[k]||'').trim()||/여기에|붙여넣기|CHANGE_ME/.test(String(env[k])))problems.push(k);
 if(problems.length){const e:any=Error('CONFIG_INCOMPLETE');e.fields=problems;throw e;}
 return {supabaseUrl:url,supabaseKey:key,token};
}

// ---- time ------------------------------------------------------------------------
function parts(ms:number,timeZone:string){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return {weekday:p.weekday as string,date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export function kstDate(ms:number,offsetDays=0){return parts(ms+offsetDays*86400000,'Asia/Seoul').date;}
// US extended hours: weekdays 04:00-20:00 America/New_York (pre-market, regular, after-hours).
// Exchange holidays are not modelled; on a holiday the collector just polls every minute.
export type Phase='session'|'offhours'|'weekend';
export function phase(ms:number):Phase{
 const et=parts(ms,'America/New_York');
 if(et.weekday==='Sat'||et.weekday==='Sun')return 'weekend';
 return et.minutes>=4*60&&et.minutes<20*60?'session':'offhours';
}
export function intervalFor(p:Phase,env:NodeJS.ProcessEnv={}){
 const n=(k:string,d:number,min:number,max:number)=>{const v=Number(env[k]);return Number.isFinite(v)&&v>=min&&v<=max?v*1000:d;};
 return p==='session'?n('KW_SESSION_INTERVAL_SEC',60*1000,30,600):p==='offhours'?n('KW_OFFHOURS_INTERVAL_SEC',15*MIN,300,1800):n('KW_WEEKEND_INTERVAL_SEC',30*MIN,600,3600);
}

// ---- change detection ----------------------------------------------------------------
const sha=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Trades / PnL / quantities: push immediately when these change.
export function materialHash(s:any){return sha({account:s.account,orderDate:s.orderDate,orders:s.orders,realized:s.realized,positions:(s.positions||[]).map((p:any)=>[p.symbol,p.quantity,p.averagePrice]),cash:s.summary?.cash?.usd??null});}
// Everything except the timestamp: price-only changes are pushed at most every KW_PRICE_PUSH_MIN.
export function fullHash(s:any){const {asOf,...rest}=s;return sha(rest);}

// ---- USD cash (ust21160 미국주식 예수금 상세) ----------------------------------------------
// Official Kiwoom spec (Kiwoom-Securities/Kiwoom-REST-API kiwoom_api_spec.json): POST /api/us/acnt,
// api-id ust21160, empty body. dN_usd_fx_entr = 'DN 외화예수금(USD)' after the settlements due by dN_setl_dt.
// We use the furthest settlement column present (d4..d0) so a buy that is already in the holdings
// value (ust21070 tot_evlt_amt) is not counted twice as cash. won_entr (KRW) is reported but never
// converted or added (the USD conversion basis is not defined by the API).
export const CASH_API='ust21160';
const CASH_FIELDS=['won_entr','d0_setl_dt','d0_usd_fx_entr','d1_setl_dt','d1_usd_fx_entr','d2_setl_dt','d2_usd_fx_entr','d3_setl_dt','d3_usd_fx_entr','d4_setl_dt','d4_usd_fx_entr'];
const SPEC_PATH=fileURLToPath(new URL('../specs/kiwoom-journal-spec.json',import.meta.url));
export function validateCashSpec(payload:any){
 const api:any=Object.values(payload?.apis||{}).find((v:any)=>v?.meta?.['API ID']===CASH_API);
 if(api?.meta?.URL!=='/api/us/acnt'||api.meta.Method!=='POST')throw Error('KIWOOM_CASH_SPEC_MISMATCH');
 const res=new Set((api.response?.body||[]).map((f:any)=>f.element));
 if(CASH_FIELDS.some(f=>!res.has(f)))throw Error('KIWOOM_CASH_SPEC_MISMATCH');
}
function cashDecimal(v:unknown){
 if(v==null||v==='')return null;if(typeof v!=='string'||v.length>40)throw Error('KIWOOM_CASH_SCHEMA_CHANGED');
 const raw=v.trim().replace(/,/g,'');if(!/^[+-]?\d+(\.\d{1,6})?$/.test(raw))throw Error('KIWOOM_CASH_SCHEMA_CHANGED');
 const neg=raw.startsWith('-'),[w,f='']=raw.replace(/^[+-]/,'').split('.'),whole=w.replace(/^0+(?=\d)/,''),frac=f.replace(/0+$/,'');
 return (neg&&/[1-9]/.test(whole+frac)?'-':'')+whole+(frac?'.'+frac:'');
}
export function normalizeCash(data:any,asOf:number){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('KIWOOM_CASH_SCHEMA_CHANGED');
 const cols=[0,1,2,3,4].map(i=>{const d=data['d'+i+'_setl_dt'],usd=cashDecimal(data['d'+i+'_usd_fx_entr']);
  const date=typeof d==='string'&&/^\d{8}$/.test(d.trim())?d.trim().replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'):null;return {i,date,usd};});
 const last=[...cols].reverse().find(c=>c.usd!==null&&c.date!==null)||(cols[0].usd!==null?cols[0]:null);
 if(!last)throw Error('KIWOOM_CASH_SCHEMA_CHANGED');
 return {apiId:CASH_API,currency:'USD',usd:last.usd!,usdBasis:'d'+last.i,settleDate:last.date,usdD0:cols[0].usd,krw:cashDecimal(data.won_entr),krwIncluded:false,asOf};
}

// ---- logging (never prints secrets) -------------------------------------------------
export function makeLogger(env:NodeJS.ProcessEnv,out:(line:string)=>void=l=>console.log(l)){
 const secrets=()=>[env.KIWOOM_APP_KEY,env.KIWOOM_SECRET,env.KIWOOM_ACCOUNT,env.KW_COLLECTOR_TOKEN,env.SUPABASE_KEY].filter((x):x is string=>!!x&&x.length>=4);
 return (level:'INFO'|'WARN'|'ERROR',msg:string)=>{let m=String(msg);for(const s of secrets())m=m.split(s).join('[비공개]');m=m.replace(/kwc_[A-Za-z0-9_-]{10,}/g,'kwc_[비공개]').replace(/[\u0000-\u001f]/g,' ').slice(0,600);out(`${new Date().toISOString()} ${level} ${m}`);};
}

// ---- Supabase RPC --------------------------------------------------------------------------
export class SupabaseRpc{
 cfg:Config;fetcher:typeof fetch;sleep:(ms:number)=>Promise<void>;
 constructor(cfg:Config,fetcher:typeof fetch=fetch,sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))){this.cfg=cfg;this.fetcher=fetcher;this.sleep=sleep;}
 async call(name:'kw_push'|'kw_heartbeat',body:Record<string,unknown>){
  const headers:Record<string,string>={'Content-Type':'application/json',apikey:this.cfg.supabaseKey};
  if(this.cfg.supabaseKey.startsWith('eyJ'))headers.Authorization='Bearer '+this.cfg.supabaseKey;
  const payload=JSON.stringify(body);if(payload.length>1_400_000)throw Error('SUPABASE_PAYLOAD_TOO_LARGE');
  for(let attempt=0;;attempt++){
   let r:Response;
   try{r=await this.fetcher(this.cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers,body:payload,redirect:'error',signal:AbortSignal.timeout(20000)});}
   catch{if(attempt<2){await this.sleep(2000*2**attempt);continue;}throw Error('SUPABASE_NETWORK_ERROR');}
   if(r.status===429||r.status>=500){if(attempt<2){await this.sleep(2000*2**attempt);continue;}throw Error('SUPABASE_UNAVAILABLE_'+r.status);}
   const text=await r.text();let data:any=null;try{data=JSON.parse(text);}catch{}
   if(r.status===401||r.status===403||/invalid collector token/.test(String(data?.message||'')))throw Error('SUPABASE_TOKEN_REJECTED');
   if(r.status===404)throw Error('SUPABASE_SQL_NOT_INSTALLED');
   if(!r.ok)throw Error('SUPABASE_HTTP_'+r.status);
   if(!data||typeof data!=='object')throw Error('SUPABASE_BAD_RESPONSE');
   if(data.ok===false)throw Error('SUPABASE_REJECTED_'+String(data.error||'unknown').replace(/[^a-z_]/g,'').slice(0,40));
   return data;
  }
 }
}

// ---- collector ------------------------------------------------------------------------------
type Memo={material:string,full:string,pushedAt:number};
const BACKOFF:Record<string,[number,number]>={ // [first, max] ms
 KIWOOM_REVIEW_RATE_LIMIT:[2*MIN,15*MIN],KIWOOM_REVIEW_AUTH_ERROR:[5*MIN,30*MIN],KIWOOM_NOT_CONFIGURED:[30*MIN,30*MIN],
 KIWOOM_REVIEW_NETWORK_ERROR:[MIN,10*MIN],SUPABASE_TOKEN_REJECTED:[10*MIN,30*MIN],SUPABASE_SQL_NOT_INSTALLED:[10*MIN,30*MIN],
};
export class Collector{
 env:NodeJS.ProcessEnv;cfg:Config;journal:KiwoomJournal;rpc:SupabaseRpc;now:()=>number;log:ReturnType<typeof makeLogger>;
 memo=new Map<string,Memo>();failures=0;blockedUntil=0;lastError:string|null=null;lastHeartbeat=0;lastQueryAt=0;round=0;lastYesterdayAt=0;
 fetcher:typeof fetch;cash:any=null;cashAt=0;cashTried=0;cashError:string|null=null;cashSpec:boolean|null=null;
 constructor(env:NodeJS.ProcessEnv,{fetcher=fetch,now=Date.now,log,sleep}:{fetcher?:typeof fetch,now?:()=>number,log?:ReturnType<typeof makeLogger>,sleep?:(ms:number)=>Promise<void>}={}){
  this.env={...env,DATA_PATH:':memory:'};this.cfg=readConfig(this.env);this.now=now;
  this.fetcher=fetcher;this.journal=new KiwoomJournal(this.env,fetcher,now);this.rpc=new SupabaseRpc(this.cfg,fetcher,sleep);this.log=log||makeLogger(this.env);
 }
 // Dates to query this round. The US session spans Korean midnight, so the previous Korean
 // date is re-checked too (every round off-hours, every 5 minutes during the session).
 dates(t:number){const today=kstDate(t),yesterday=kstDate(t,-1),p=phase(t);
  if(p!=='session'||t-this.lastYesterdayAt>=5*MIN){this.lastYesterdayAt=t;return [yesterday,today];}
  return [today];}
 shouldPush(s:any,t:number){const old=this.memo.get(s.orderDate),material=materialHash(s),full=fullHash(s),priceEvery=Math.max(1,Number(this.env.KW_PRICE_PUSH_MIN)||10)*MIN;
  if(!old||old.material!==material)return {push:true,reason:old?'변경':'첫 전송',material,full};
  if(old.full!==full&&t-old.pushedAt>=priceEvery)return {push:true,reason:'시세 갱신',material,full};
  return {push:false,reason:'변경 없음',material,full};}
 delay(){const t=this.now(),base=intervalFor(phase(t),this.env);return Math.max(base,this.blockedUntil-t,5000);}
 // USD cash: queried at most once per KW_CASH_TTL_SEC (default 55 s, i.e. once per round). A failure never
 // blocks the journal push; the last good value is reused for up to 6 hours (it carries its own asOf).
 async fetchCash(t:number,ttl=Math.max(30,Math.min(3600,Number(this.env.KW_CASH_TTL_SEC)||55))*1000){
  if(this.env.KW_CASH_DISABLED==='1')return null;
  if(t-this.cashTried<ttl)return this.cash&&t-this.cash.asOf<6*3600000?this.cash:null;
  this.cashTried=t;
  try{
   if(this.cashSpec===null){try{validateCashSpec(JSON.parse(await readFile(this.env.KIWOOM_SPEC_PATH||SPEC_PATH,'utf8')));this.cashSpec=true;}catch{this.cashSpec=false;}
    if(!this.cashSpec)this.log('WARN','예수금 API(ust21160) 명세를 찾지 못해 예수금 수집을 끕니다. 주식·손익 수집은 계속합니다.');}
   if(!this.cashSpec)return null;
   const j:any=this.journal,signal=AbortSignal.timeout(30000),token=await j.authenticate(signal);
   const gap=Math.max(0,300-(Date.now()-j.lastRequestAt));if(gap)await new Promise(r=>setTimeout(r,gap));j.lastRequestAt=Date.now();
   let r:Response;
   try{r=await this.fetcher('https://api.kiwoom.com/api/us/acnt',{method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{'Content-Type':'application/json',authorization:'Bearer '+token,'api-id':CASH_API,'cont-yn':'N','next-key':''},body:'{}'});}
   catch{throw Error('KIWOOM_CASH_NETWORK_ERROR');}
   if(r.status===429)throw Error('KIWOOM_CASH_RATE_LIMIT');
   if(r.status===401||r.status===403){j.token='';j.expiry=0;throw Error('KIWOOM_CASH_AUTH_ERROR');}
   if(!r.ok)throw Error('KIWOOM_CASH_HTTP_'+r.status);
   const raw=await r.text();if(raw.length>200000)throw Error('KIWOOM_CASH_SCHEMA_CHANGED');
   let data:any;try{data=JSON.parse(raw);}catch{throw Error('KIWOOM_CASH_SCHEMA_CHANGED');}
   if(![0,'0'].includes(data?.return_code)){const code=/^-?\d{1,10}$/.test(String(data?.return_code))?String(data.return_code):'?';throw Error('KIWOOM_CASH_API_ERROR_'+code);}
   this.cash=normalizeCash(data,t);this.cashAt=t;
   if(this.cashError)this.log('INFO','예수금 조회 복구됨');this.cashError=null;
  }catch(e:any){
   const code=/^KIWOOM_[A-Z_0-9-]+$/.test(e.message)?e.message:'KIWOOM_CASH_ERROR';
   if(code!==this.cashError)this.log('WARN','예수금(ust21160) 조회 실패 '+code+' · 주식·손익 전송은 계속합니다.');this.cashError=code;
  }
  return this.cash&&t-this.cash.asOf<6*3600000?this.cash:null;
 }
 withCash(s:any,cash:any){if(cash)s.summary={...s.summary,cash};return s;}
 private fail(code:string){
  this.failures++;this.lastError=code;const [first,max]=BACKOFF[code]||[2*MIN,10*MIN];
  const wait=Math.min(max,first*2**Math.min(this.failures-1,5));this.blockedUntil=this.now()+wait;return wait;
 }
 async tick(){
  const t=this.now();this.round++;
  if(t<this.blockedUntil)return {skipped:true};
  const results:any[]=[];let error:string|null=null,cash:any=undefined;
  for(const date of this.dates(t)){
   let s:any;
   try{s=await this.journal.query(date);if(cash===undefined)cash=await this.fetchCash(t);this.withCash(s,cash);}
   catch(e:any){const code=/^KIWOOM_[A-Z_]+$/.test(e.message)?e.message:'KIWOOM_REVIEW_STORAGE_ERROR',d=e.diagnostic;
    error=code;this.log(code==='KIWOOM_REVIEW_RATE_LIMIT'?'WARN':'ERROR',`키움 조회 실패 ${date} ${code}`+(d?` [${[d.apiId,d.httpStatus?('HTTP '+d.httpStatus):null,d.returnCode!==null&&d.returnCode!==undefined?('코드 '+d.returnCode):null,d.brokerMessage].filter(Boolean).join(' · ')}]`:''));
    if(BACKOFF[code])break;continue;}
   this.lastQueryAt=t;const decision=this.shouldPush(s,t);
   if(!decision.push){results.push({date,pushed:false});continue;}
   try{const out=await this.rpc.call('kw_push',{p_token:this.cfg.token,p_snapshot:s});
    this.memo.set(date,{material:decision.material,full:decision.full,pushedAt:t});
    results.push({date,pushed:true,stored:out.stored});
    this.log('INFO',`전송 ${date} · ${decision.reason} · 주문 ${s.orders.length} · 실현손익 ${s.realized.rows.length}종목 ${s.realized.reportedTotal} USD · 보유 ${s.positions.length}종목${s.summary?.cash?` · USD 예수금 ${s.summary.cash.usd}`:''}${out.stored?'':' · 서버에 더 새 값 있음'}`);}
   catch(e:any){error=/^SUPABASE_[A-Z_0-9a-z]+$/.test(e.message)?e.message:'SUPABASE_ERROR';this.log('ERROR',`Supabase 전송 실패 ${date} ${error}`);if(BACKOFF[error])break;}
  }
  if(error){const wait=this.fail(error);this.log('WARN',`다음 시도까지 ${Math.round(wait/1000)}초 대기 (연속 실패 ${this.failures})`);}
  else{if(this.failures)this.log('INFO','복구됨');this.failures=0;this.lastError=null;this.blockedUntil=0;}
  await this.heartbeat(t);
  return {results,error};
 }
 async heartbeat(t:number,force=false){
  if(!force&&t-this.lastHeartbeat<5*MIN)return;
  try{await this.rpc.call('kw_heartbeat',{p_token:this.cfg.token,p_info:{version:VERSION,phase:phase(t),cashError:this.cashError,intervalSec:Math.round(intervalFor(phase(t),this.env)/1000),lastError:this.lastError,failures:this.failures,lastQueryAt:this.lastQueryAt||null,nextAt:new Date(t+this.delay()).toISOString()}});this.lastHeartbeat=t;}
  catch(e:any){this.log('WARN','heartbeat 실패 '+(/^SUPABASE_[A-Za-z0-9_]+$/.test(e.message)?e.message:'SUPABASE_ERROR'));}
 }
}

// ---- backfill (past Korean dates, one by one) ------------------------------------------------
// Supabase kw_check_snapshot accepts order dates up to 400 days back (kiwoom-collector.sql).
export const BACKFILL_MAX_DAYS=400;
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
// Korean Sunday = US Saturday 11:00 ET .. Sunday 11:00 ET: no US session can produce orders or realized PnL.
// Korean Saturday is NOT skipped: the US Friday session (and after-hours) runs into Saturday morning KST.
export function backfillDates(start:string,end:string,{includeSundays=false}={}){
 checkDate(start);checkDate(end);if(start>end)throw Error('BACKFILL_RANGE_INVERTED');
 const out:string[]=[];for(let d=start;d<=end;d=addDays(d,1)){if(includeSundays||new Date(d+'T00:00:00Z').getUTCDay()!==0)out.push(d);if(out.length>2000)throw Error('BACKFILL_RANGE_TOO_LONG');}
 return out;
}
export function parseBackfillArgs(argv:string[],now:number){
 const i=argv.indexOf('--backfill');if(i<0)return null;
 const a=argv[i+1],b=argv[i+2]&&!argv[i+2].startsWith('--')?argv[i+2]:undefined;
 const today=kstDate(now),yesterday=kstDate(now,-1),oldest=kstDate(now,-BACKFILL_MAX_DAYS+1);
 const bad=(m:string)=>{const e:any=Error('BACKFILL_ARGS');e.detail=m;throw e;};
 const ok=(d:any)=>{try{checkDate(d);return true;}catch{return false;}};
 if(!ok(a))bad('시작일을 YYYY-MM-DD로 적으세요. 예: --backfill 2026-01-01');
 const end=b??yesterday;if(!ok(end))bad('종료일을 YYYY-MM-DD로 적으세요.');
 if(end>today)bad('종료일이 오늘('+today+')보다 뒤입니다.');
 if(a>end)bad('시작일이 종료일보다 뒤입니다.');
 if(a<oldest)bad('Supabase는 '+BACKFILL_MAX_DAYS+'일 이내 날짜만 받습니다. 시작일을 '+oldest+' 이후로 적으세요.');
 return {start:a,end,includeSundays:argv.includes('--include-sundays'),pushEmpty:argv.includes('--push-empty'),delayMs:Math.max(500,Math.min(60000,Number(argv[argv.indexOf('--delay-ms')+1])||1500))};
}
const KIWOOM_RATE_CODES=new Set(['1700','1701','1702']);
// Returns {pushed, empty, failed:[{date,code}]}. Never runs two Kiwoom queries at once; waits between dates;
// Kiwoom rate limits (HTTP 429 or return_code 1700/1701/1702) wait 60 s, doubling to 5 min, 6 tries per date;
// network/upstream errors wait 30 s, 3 tries; auth/config/spec errors stop the run; other per-date
// errors are logged and the run moves on. Supabase rate_limited waits 65 s and retries.
// Holdings (ust21070) and USD cash in each pushed snapshot are values AS OF the backfill time (asOf), not of
// the order date. The app only ever uses the newest-asOf snapshot as current holdings, so this is correct;
// the order date only scopes orders (ust21150) and realized PnL (ust21640).
export async function runBackfill(c:Collector,opt:{start:string,end:string,includeSundays?:boolean,pushEmpty?:boolean,delayMs?:number},sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))){
 const dates=backfillDates(opt.start,opt.end,opt),delay=opt.delayMs??1500,failed:{date:string,code:string}[]=[];let pushed=0,empty=0,lastPush=0;
 c.log('INFO',`백필 시작 ${opt.start} ~ ${opt.end} · ${dates.length}일${opt.includeSundays?'':' (한국 일요일 제외)'} · 날짜 간격 ${Math.round(delay/100)/10}초`);
 const fatal=new Set(['KIWOOM_NOT_CONFIGURED','KIWOOM_REVIEW_AUTH_ERROR','KIWOOM_REVIEW_SPEC_MISSING','KIWOOM_REVIEW_SPEC_MISMATCH','SUPABASE_TOKEN_REJECTED','SUPABASE_SQL_NOT_INSTALLED']);
 let stop:string|null=null;
 for(let n=0;n<dates.length&&!stop;n++){
  const date=dates[n],tag=`[${n+1}/${dates.length}] ${date}`;let s:any=null,code:string|null=null;
  for(let attempt=0,rate=0,net=0;;attempt++){
   try{s=await c.journal.query(date);code=null;break;}
   catch(e:any){code=/^KIWOOM_[A-Z_]+$/.test(e.message)?e.message:'KIWOOM_REVIEW_STORAGE_ERROR';const d=e.diagnostic||{};
    const isRate=code==='KIWOOM_REVIEW_RATE_LIMIT'||(code==='KIWOOM_REVIEW_API_ERROR'&&KIWOOM_RATE_CODES.has(String(d.returnCode)));
    const info=[d.apiId,d.httpStatus?'HTTP '+d.httpStatus:null,d.returnCode!=null?'코드 '+d.returnCode:null,d.brokerMessage].filter(Boolean).join(' · ');
    if(fatal.has(code)){stop=code;c.log('ERROR',`${tag} ${code}${info?' ['+info+']':''} · 백필을 멈춥니다.`);break;}
    if(isRate&&rate<5){const w=Math.min(300000,60000*2**rate++);c.log('WARN',`${tag} 키움 요청 한도 · ${w/1000}초 뒤 다시 시도`);await sleep(w);continue;}
    if(['KIWOOM_REVIEW_NETWORK_ERROR','KIWOOM_REVIEW_UPSTREAM_ERROR','KIWOOM_REVIEW_BUSY'].includes(code)&&net<2){net++;c.log('WARN',`${tag} ${code} · 30초 뒤 다시 시도`);await sleep(30000);continue;}
    c.log('ERROR',`${tag} 조회 실패 ${code}${info?' ['+info+']':''} · 이 날짜는 건너뜁니다.`);break;}
  }
  if(stop)break;
  if(!s){failed.push({date,code:code||'UNKNOWN'});await sleep(delay);continue;}
  if(!opt.pushEmpty&&!s.orders.length&&!s.realized.rows.length){empty++;c.log('INFO',`${tag} 주문·실현손익 없음 · 건너뜀`);await sleep(delay);continue;}
  c.withCash(s,await c.fetchCash(c.now(),5*60000));
  const gap=Math.max(0,1100-(c.now()-lastPush));if(gap)await sleep(gap); // <= ~55 pushes / minute (Supabase limit 60)
  for(let tries=0;;tries++){
   try{const out=await c.rpc.call('kw_push',{p_token:c.cfg.token,p_snapshot:s});lastPush=c.now();pushed++;
    c.log('INFO',`${tag} 전송 · 주문 ${s.orders.length} · 실현손익 ${s.realized.rows.length}종목 ${s.realized.reportedTotal} USD${out.stored?'':' · 서버에 더 새 값 있음(유지)'}`);break;}
   catch(e:any){const err=/^SUPABASE_[A-Za-z0-9_]+$/.test(e.message)?e.message:'SUPABASE_ERROR';
    if(fatal.has(err)){stop=err;c.log('ERROR',`${tag} Supabase ${err} · 백필을 멈춥니다.`);break;}
    if((err==='SUPABASE_REJECTED_rate_limited'||/^SUPABASE_(UNAVAILABLE|NETWORK)/.test(err))&&tries<3){c.log('WARN',`${tag} Supabase ${err} · 65초 뒤 다시 시도`);await sleep(65000);continue;}
    failed.push({date,code:err});c.log('ERROR',`${tag} Supabase 전송 실패 ${err} · 이 날짜는 건너뜁니다.`);break;}
  }
  if(n<dates.length-1)await sleep(delay);
 }
 const summary=`백필 ${stop?'중단':'완료'} · 전송 ${pushed}일 · 기록 없음 ${empty}일 · 실패 ${failed.length}일`+(failed.length?' ('+failed.slice(0,20).map(f=>f.date+' '+f.code).join(', ')+(failed.length>20?' …':'')+')':'');
 c.log(stop||failed.length?'WARN':'INFO',summary+(failed.length&&!stop?' · 같은 명령을 다시 실행하면 전체를 다시 확인합니다(이미 올린 날짜는 덮어써도 안전).':''));
 return {pushed,empty,failed,stopped:stop,total:dates.length};
}

// ---- main ------------------------------------------------------------------------------------
async function main(){
 const once=process.argv.includes('--once'),log=makeLogger(process.env);
 let backfill:any=null;
 try{backfill=parseBackfillArgs(process.argv,Date.now());}catch(e:any){log('ERROR','백필 옵션 오류 · '+(e.detail||e.message)+'  사용법: … collector.ts --backfill 시작일 [종료일]');process.exit(2);}
 let c:Collector;
 try{c=new Collector(process.env,{log});}
 catch(e:any){
  if(e.message==='CONFIG_SECRET_KEY_REFUSED')log('ERROR','SUPABASE_KEY에 secret/service_role 키는 쓸 수 없습니다. Publishable key(sb_publishable_…)를 넣으세요.');
  else if(e.message==='CONFIG_INCOMPLETE')log('ERROR','.env를 채워 주세요: '+(e.fields||[]).join(', ')+'  →  sudo nano /opt/kiwoom-collector/.env');
  else log('ERROR','설정 오류');
  // Do not spin: systemd restarts after RestartSec; keep the process alive a while so logs stay readable.
  if(!once&&!backfill)await new Promise(r=>setTimeout(r,5*MIN));process.exit(2);
 }
 log('INFO',`키움 클라우드 수집기 v${VERSION} 시작 · 계좌 해시 ${c.journal.account()} · `+(backfill?'과거 기록 백필 모드':`미국 동부 04:00–20:00 평일 1분, 그 외 ${Math.round(intervalFor('offhours',process.env)/MIN)}–${Math.round(intervalFor('weekend',process.env)/MIN)}분`));
 if(backfill){const r=await runBackfill(c,backfill);process.exit(r.stopped||r.failed.length?1:0);}
 if(once){const r=await c.tick();await c.heartbeat(Date.now(),true);log('INFO','1회 확인 완료 '+JSON.stringify(r.results||[]));process.exit(r.error?1:0);}
 let stopping=false,timer:NodeJS.Timeout|null=null,wake:(()=>void)|null=null;
 const stop=()=>{stopping=true;if(timer)clearTimeout(timer);wake?.();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 let lastPhase='';
 while(!stopping){
  const p=phase(Date.now());if(p!==lastPhase){log('INFO','구간 '+({session:'미국 장중(프리·애프터 포함) · 1분 간격',offhours:'장외(평일)',weekend:'주말'} as any)[p]);lastPhase=p;}
  try{await c.tick();}catch(e:any){log('ERROR','예상치 못한 오류 '+String(e?.message||e).slice(0,120));}
  if(stopping)break;
  await new Promise<void>(r=>{wake=r;timer=setTimeout(r,c.delay());});
 }
 log('INFO','종료');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
