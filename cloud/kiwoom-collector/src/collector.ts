// Kiwoom US-stock cloud collector (v10).
// Reads the Kiwoom read-only APIs through KiwoomJournal (same code as the PC server)
// and pushes changed day snapshots to Supabase via the kw_push RPC, using only the
// publishable/anon key plus a per-user collector token. No service_role key.
// Run: node --env-file=.env src/collector.ts            (systemd does this)
//      node --env-file=.env src/collector.ts --once     (one round, then exit; for checking)
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {KiwoomJournal} from './adapters/kiwoom-journal.ts';

export const VERSION='1.0.0';
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
export function materialHash(s:any){return sha({account:s.account,orderDate:s.orderDate,orders:s.orders,realized:s.realized,positions:(s.positions||[]).map((p:any)=>[p.symbol,p.quantity,p.averagePrice])});}
// Everything except the timestamp: price-only changes are pushed at most every KW_PRICE_PUSH_MIN.
export function fullHash(s:any){const {asOf,...rest}=s;return sha(rest);}

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
 constructor(env:NodeJS.ProcessEnv,{fetcher=fetch,now=Date.now,log,sleep}:{fetcher?:typeof fetch,now?:()=>number,log?:ReturnType<typeof makeLogger>,sleep?:(ms:number)=>Promise<void>}={}){
  this.env={...env,DATA_PATH:':memory:'};this.cfg=readConfig(this.env);this.now=now;
  this.journal=new KiwoomJournal(this.env,fetcher,now);this.rpc=new SupabaseRpc(this.cfg,fetcher,sleep);this.log=log||makeLogger(this.env);
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
 private fail(code:string){
  this.failures++;this.lastError=code;const [first,max]=BACKOFF[code]||[2*MIN,10*MIN];
  const wait=Math.min(max,first*2**Math.min(this.failures-1,5));this.blockedUntil=this.now()+wait;return wait;
 }
 async tick(){
  const t=this.now();this.round++;
  if(t<this.blockedUntil)return {skipped:true};
  const results:any[]=[];let error:string|null=null;
  for(const date of this.dates(t)){
   let s:any;
   try{s=await this.journal.query(date);}
   catch(e:any){const code=/^KIWOOM_[A-Z_]+$/.test(e.message)?e.message:'KIWOOM_REVIEW_STORAGE_ERROR',d=e.diagnostic;
    error=code;this.log(code==='KIWOOM_REVIEW_RATE_LIMIT'?'WARN':'ERROR',`키움 조회 실패 ${date} ${code}`+(d?` [${[d.apiId,d.httpStatus?('HTTP '+d.httpStatus):null,d.returnCode!==null&&d.returnCode!==undefined?('코드 '+d.returnCode):null,d.brokerMessage].filter(Boolean).join(' · ')}]`:''));
    if(BACKOFF[code])break;continue;}
   this.lastQueryAt=t;const decision=this.shouldPush(s,t);
   if(!decision.push){results.push({date,pushed:false});continue;}
   try{const out=await this.rpc.call('kw_push',{p_token:this.cfg.token,p_snapshot:s});
    this.memo.set(date,{material:decision.material,full:decision.full,pushedAt:t});
    results.push({date,pushed:true,stored:out.stored});
    this.log('INFO',`전송 ${date} · ${decision.reason} · 주문 ${s.orders.length} · 실현손익 ${s.realized.rows.length}종목 ${s.realized.reportedTotal} USD · 보유 ${s.positions.length}종목${out.stored?'':' · 서버에 더 새 값 있음'}`);}
   catch(e:any){error=/^SUPABASE_[A-Z_0-9a-z]+$/.test(e.message)?e.message:'SUPABASE_ERROR';this.log('ERROR',`Supabase 전송 실패 ${date} ${error}`);if(BACKOFF[error])break;}
  }
  if(error){const wait=this.fail(error);this.log('WARN',`다음 시도까지 ${Math.round(wait/1000)}초 대기 (연속 실패 ${this.failures})`);}
  else{if(this.failures)this.log('INFO','복구됨');this.failures=0;this.lastError=null;this.blockedUntil=0;}
  await this.heartbeat(t);
  return {results,error};
 }
 async heartbeat(t:number,force=false){
  if(!force&&t-this.lastHeartbeat<5*MIN)return;
  try{await this.rpc.call('kw_heartbeat',{p_token:this.cfg.token,p_info:{version:VERSION,phase:phase(t),intervalSec:Math.round(intervalFor(phase(t),this.env)/1000),lastError:this.lastError,failures:this.failures,lastQueryAt:this.lastQueryAt||null,nextAt:new Date(t+this.delay()).toISOString()}});this.lastHeartbeat=t;}
  catch(e:any){this.log('WARN','heartbeat 실패 '+(/^SUPABASE_[A-Za-z0-9_]+$/.test(e.message)?e.message:'SUPABASE_ERROR'));}
 }
}

// ---- main ------------------------------------------------------------------------------------
async function main(){
 const once=process.argv.includes('--once'),log=makeLogger(process.env);
 let c:Collector;
 try{c=new Collector(process.env,{log});}
 catch(e:any){
  if(e.message==='CONFIG_SECRET_KEY_REFUSED')log('ERROR','SUPABASE_KEY에 secret/service_role 키는 쓸 수 없습니다. Publishable key(sb_publishable_…)를 넣으세요.');
  else if(e.message==='CONFIG_INCOMPLETE')log('ERROR','.env를 채워 주세요: '+(e.fields||[]).join(', ')+'  →  sudo nano /opt/kiwoom-collector/.env');
  else log('ERROR','설정 오류');
  // Do not spin: systemd restarts after RestartSec; keep the process alive a while so logs stay readable.
  if(!once)await new Promise(r=>setTimeout(r,5*MIN));process.exit(2);
 }
 log('INFO',`키움 클라우드 수집기 v${VERSION} 시작 · 계좌 해시 ${c.journal.account()} · 미국 동부 04:00–20:00 평일 1분, 그 외 ${Math.round(intervalFor('offhours',process.env)/MIN)}–${Math.round(intervalFor('weekend',process.env)/MIN)}분`);
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
