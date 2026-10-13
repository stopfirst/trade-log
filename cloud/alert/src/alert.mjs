// trade-alert 2.0.0 (alert2): 손실한도 판정 v1.2 — 텔레그램 알림 + Supabase 거래 중단 상태(앱 배너) + 규칙 위반 기록.
// 미국주식(키움)과 하이퍼리퀴드를 각자 계좌 순자산 기준으로 따로 판정합니다. 주문을 내거나 취소하지 않습니다.
// Run: node --env-file=.env src/alert.mjs                   (systemd)
//      node --env-file=.env src/alert.mjs --find-chat       (봇에게 메시지 보낸 대화방 번호)
//      node --env-file=.env src/alert.mjs --test            (테스트 메시지 + 현재 판정)
//      node --env-file=.env src/alert.mjs --once [--dry-run] (1회 판정; --dry-run은 보내지도 저장하지도 않음)
//      node --env-file=.env src/alert.mjs --flow US 500 "입금"   (입출금 수동 등록: + 입금 / − 출금, 지금 시각)
//      node --env-file=.env src/alert.mjs --flow-remove <ref>     (수동 등록 취소)
//      node --env-file=.env src/alert.mjs --clear-stops US        (잘못 걸린 중단 해제 — 기록 남김)
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as risk from './risk.mjs';
import * as src from './sources.mjs';
import {usCalendar,hlCalendar,untilText} from './calendar.mjs';
const require=createRequire(import.meta.url);
const {fetchAccountBalance}=require('./hl-balance.cjs');

export const VERSION='2.0.0';
const MIN=60000;
const MK={US:'us',HL:'hl'};

// ---- config ------------------------------------------------------------------------------
function cfgErr(field){return Object.assign(Error('CONFIG_INCOMPLETE'),{fields:[field]});}
function numIn(env,k,d,min,max,{int=false}={}){const v=env[k];if(v===undefined||String(v).trim()==='')return d;const x=Number(String(v).trim());if(!Number.isFinite(x)||x<min||x>max||(int&&!Number.isInteger(x)))throw cfgErr(`${k} (${min}–${max})`);return x;}
function bool(env,k,d){const v=String(env[k]??'').trim().toLowerCase();if(!v)return d;return ['1','true','yes','on','켬'].includes(v);}
function triple(env,k){const v=String(env[k]??'').trim();if(!v)return null;const a=v.split(',').map(x=>Number(x.trim()));if(a.length!==3||a.some(x=>!(Number.isFinite(x)&&x>=0&&x<=100)))throw cfgErr(k+' (하루,주,달 % 예: 3,6,10 · 0 = 끔)');return a;}
export function readConfig(env,{needSupabase=true,needTelegram=true}={}){
 const problems=[];const P=f=>problems.push(f);
 let url='';try{const u=new URL(String(env.SUPABASE_URL||'').trim());if(u.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.port)throw Error();url=u.origin;}catch{if(needSupabase)P('SUPABASE_URL (https://프로젝트ID.supabase.co)');}
 const key=String(env.SUPABASE_KEY||'').trim();
 if(key.startsWith('sb_secret_'))throw Error('CONFIG_SECRET_KEY_REFUSED');
 if(key.startsWith('eyJ')){let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role;}catch{}if(role!=='anon')throw Error('CONFIG_SECRET_KEY_REFUSED');}
 else if(needSupabase&&!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))P('SUPABASE_KEY (sb_publishable_…)');
 const token=String(env.KW_COLLECTOR_TOKEN||'').trim();
 if(needSupabase&&!/^kwc_[A-Za-z0-9_-]{43}$/.test(token))P('KW_COLLECTOR_TOKEN (앱에서 만든 kwc_… 토큰)');
 const bot=String(env.TELEGRAM_BOT_TOKEN||'').trim();
 if(!/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/.test(bot))P('TELEGRAM_BOT_TOKEN (BotFather가 준 123456:ABC… 토큰)');
 const chat=String(env.TELEGRAM_CHAT_ID||'').trim();
 if(needTelegram&&!/^-?\d{1,20}$/.test(chat))P('TELEGRAM_CHAT_ID (--find-chat 로 확인한 숫자)');
 const markets=String(env.ALERT_MARKETS||'auto').trim().toUpperCase().replace(/\s/g,'');
 if(!/^(AUTO|US|HL|US,HL|HL,US)$/.test(markets))P('ALERT_MARKETS (auto, US, HL, US,HL)');
 let warn=[50,80];const tv=String(env.ALERT_THRESHOLDS??'').trim();
 if(tv){warn=[...new Set(tv.split(',').map(Number))].filter(x=>x<100).sort((a,b)=>a-b);if(tv.split(',').some(x=>!Number.isFinite(Number(x))||Number(x)<=0||Number(x)>100))P('ALERT_THRESHOLDS (한도 대비 % 사전 경고, 예: 50,80)');}
 if(String(env.ALERT_THRESHOLDS??'').trim()==='0')warn=[];
 const st=String(env.DAILY_SUMMARY_TIME_ET||'16:15').trim();const sm=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(st);if(!sm)P('DAILY_SUMMARY_TIME_ET (HH:MM, 미국 동부)');
 const hlAddr=String(env.HL_ADDRESS||'').trim();if(hlAddr&&!/^0x[0-9a-fA-F]{40}$/.test(hlAddr))P('HL_ADDRESS (0x… 40자리, 비우면 앱에 저장한 HL 자동 수집 주소)');
 const extra=String(env.US_EXTRA_HOLIDAYS||'').split(',').map(s=>s.trim()).filter(Boolean);if(extra.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))P('US_EXTRA_HOLIDAYS (YYYY-MM-DD,YYYY-MM-DD)');
 let cfg;
 try{
  const base=[numIn(env,'RISK_DAY_PCT',3,0,100),numIn(env,'RISK_WEEK_PCT',6,0,100),numIn(env,'RISK_MONTH_PCT',10,0,100)];
  const lim=a=>({day:a[0]||null,week:a[1]||null,month:a[2]||null});
  cfg={supabaseUrl:url,supabaseKey:key,token,bot,chat,markets:markets==='AUTO'?null:markets.split(','),
   limits:{US:lim(triple(env,'US_RISK_PCT')||base),HL:lim(triple(env,'HL_RISK_PCT')||base)},
   warn,streakLossPct:numIn(env,'STREAK_LOSS_PCT',0.5,0,50),streakDays:numIn(env,'STREAK_DAYS',3,0,20,{int:true}),streakStopDays:numIn(env,'STREAK_STOP_DAYS',1,0,10,{int:true}),
   restartFactor:numIn(env,'RESTART_RISK_FACTOR',0.5,0.05,1),
   checkSec:numIn(env,'RISK_CHECK_SEC',60,60,300,{int:true}),idleSec:numIn(env,'RISK_IDLE_SEC',300,60,1800,{int:true}),pushMin:numIn(env,'RISK_PUSH_MIN',5,1,30,{int:true}),
   usFlowMin:numIn(env,'US_FLOW_MIN_USD',50,1,1e7),usStaleMin:numIn(env,'US_STALE_MIN',20,5,240,{int:true}),anchorMaxGapMin:numIn(env,'ANCHOR_MAX_GAP_MIN',20,2,120,{int:true}),
   usExtraHolidays:extra,hlAddress:hlAddr?hlAddr.toLowerCase():null,
   dailySummary:bool(env,'DAILY_SUMMARY',true),summaryTime:sm?[Number(sm[1]),Number(sm[2])]:[16,15],
   stateDir:String(env.STATE_DIRECTORY||env.ALERT_STATE_DIR||'/var/lib/trade-alert').split(':')[0]};
 }catch(e){if(e.fields)problems.push(...e.fields);else throw e;}
 if(problems.length){const e=Error('CONFIG_INCOMPLETE');e.fields=problems;throw e;}
 return cfg;
}
export function engineCfg(cfg,market,defaultRisk){return {limits:cfg.limits[market],warn:cfg.warn,streakLossPct:cfg.streakLossPct,streakDays:cfg.streakDays,streakStopDays:cfg.streakStopDays,restartFactor:cfg.restartFactor,checkSec:cfg.checkSec,defaultRisk:Number(defaultRisk)>0?Number(defaultRisk):null,anchorMaxGapMs:cfg.anchorMaxGapMin*MIN};}

// ---- logging (never prints secrets) ------------------------------------------------------
export function makeLogger(env,out=l=>console.log(l)){
 const secrets=()=>[env.TELEGRAM_BOT_TOKEN,env.KW_COLLECTOR_TOKEN,env.SUPABASE_KEY].filter(x=>!!x&&String(x).length>=4).map(String);
 return (level,msg)=>{let m=String(msg);for(const s of secrets())m=m.split(s).join('[비공개]');m=m.replace(/kwc_[A-Za-z0-9_-]{10,}/g,'kwc_[비공개]').replace(/bot\d{5,15}:[A-Za-z0-9_-]{20,}/g,'bot[비공개]').replace(/\d{5,15}:[A-Za-z0-9_-]{30,}/g,'[비공개]').replace(/[\u0000-\u0009\u000b-\u001f]/g,' ').slice(0,1200);out(`${new Date().toISOString()} ${level} ${m}`);};
}

// ---- Telegram ----------------------------------------------------------------------------
export class Telegram{
 constructor(bot,chat,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))){this.bot=bot;this.chat=chat;this.fetcher=fetcher;this.sleep=sleep;}
 async api(method,body){
  for(let attempt=0;;attempt++){
   let r;try{r=await this.fetcher(`https://api.telegram.org/bot${this.bot}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),redirect:'error',signal:AbortSignal.timeout(20000)});}
   catch{if(attempt<2){await this.sleep(2000*2**attempt);continue;}throw Error('TELEGRAM_NETWORK_ERROR');}
   let data=null;try{data=await r.json();}catch{}
   if(r.status===429&&attempt<2){const wait=Math.min(60,Number(data?.parameters?.retry_after)||5);await this.sleep(wait*1000);continue;}
   if(r.status>=500&&attempt<2){await this.sleep(2000*2**attempt);continue;}
   if(r.status===401||r.status===404)throw Error('TELEGRAM_BOT_TOKEN_REJECTED');
   if(r.status===409)throw Error('TELEGRAM_WEBHOOK_ACTIVE');
   if(!r.ok||!data?.ok){const d=String(data?.description||'').replace(/[^A-Za-z0-9 :_.-]/g,'').slice(0,80);if(/chat not found/i.test(d))throw Error('TELEGRAM_CHAT_NOT_FOUND');if(/blocked/i.test(d))throw Error('TELEGRAM_BOT_BLOCKED');throw Error('TELEGRAM_HTTP_'+r.status+(d?' '+d:''));}
   return data.result;
  }
 }
 send(text){return this.api('sendMessage',{chat_id:this.chat,text:String(text).slice(0,4000),disable_web_page_preview:true});}
 async findChats(){
  const updates=await this.api('getUpdates',{limit:100,timeout:0,allowed_updates:['message','channel_post','my_chat_member']});
  const chats=new Map();
  for(const u of updates||[]){const m=u.message||u.channel_post||u.my_chat_member;const c=m?.chat;if(!c||c.id===undefined)continue;
   chats.set(String(c.id),{id:String(c.id),type:c.type,name:c.title||[c.first_name,c.last_name].filter(Boolean).join(' ')||'',username:c.username?'@'+c.username:''});}
  return [...chats.values()];
 }
}

// ---- Supabase ----------------------------------------------------------------------------
export class SupabaseRpc{
 constructor(cfg,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))){this.cfg=cfg;this.fetcher=fetcher;this.sleep=sleep;}
 async call(name,body){
  const headers={'Content-Type':'application/json',apikey:this.cfg.supabaseKey};if(this.cfg.supabaseKey.startsWith('eyJ'))headers.Authorization='Bearer '+this.cfg.supabaseKey;
  for(let attempt=0;;attempt++){
   let r;try{r=await this.fetcher(this.cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});}
   catch{if(attempt<2){await this.sleep(2000*2**attempt);continue;}throw Error('SUPABASE_NETWORK_ERROR');}
   if(r.status===429||r.status>=500){if(attempt<2){await this.sleep(2000*2**attempt);continue;}throw Error('SUPABASE_UNAVAILABLE_'+r.status);}
   const text=await r.text();let data=null;try{data=JSON.parse(text);}catch{}
   if(r.status===401||r.status===403||/invalid collector token/.test(String(data?.message||'')))throw Error('SUPABASE_TOKEN_REJECTED');
   if(r.status===404||/risk_status|risk_push|could not find the function/i.test(String(data?.message||'')))throw Error('SUPABASE_SQL_NOT_INSTALLED');
   if(!r.ok)throw Error('SUPABASE_HTTP_'+r.status);
   if(!data||typeof data!=='object')throw Error('SUPABASE_BAD_RESPONSE');
   if(data.ok===false)throw Error('SUPABASE_REJECTED_'+String(data.error||'unknown').replace(/[^a-z_]/g,'').slice(0,40));
   return data;
  }
 }
}

// ---- Hyperliquid (공개 /info, 읽기 전용) ---------------------------------------------------
export class HLClient{
 constructor(address,fetcher=fetch,now=Date.now){this.address=address.toLowerCase();this.fetcher=fetcher;this.now=now;}
 async info(q){const body=['perpDexs','metaAndAssetCtxs'].includes(q.type)?q:{...q,user:this.address};const r=await this.fetcher('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HL_HTTP_'+r.status);return r.json();}
 async balance(){const base=await this.info({type:'clearinghouseState'});const b=await fetchAccountBalance(q=>this.info(q),base,this.address);const eq=Number(b.equity);if(!(eq>0))throw Error('HL_BALANCE_ZERO');return {value:Math.round(eq*1e6)/1e6,t:this.now(),source:'HL BALANCE · '+b.scope};}
 async fills(startTime){const out=[];let from=startTime;for(let i=0;i<10;i++){const page=await this.info({type:'userFillsByTime',startTime:from,aggregateByTime:false});if(!Array.isArray(page))throw Error('HL_BAD_FILLS');out.push(...page);if(page.length<2000)break;from=Math.max(...page.map(f=>f.time))+1;}return out;}
 async ledger(startTime){const r=await this.info({type:'userNonFundingLedgerUpdates',startTime});if(!Array.isArray(r))throw Error('HL_BAD_LEDGER');return r;}
 async portfolio(){return this.info({type:'portfolio'});}
}

// ---- state -------------------------------------------------------------------------------
const emptyLocal=()=>({v:2,engine:{},usObs:null,journal:{},sent:{},outbox:[],pending:{events:[],flows:[],days:[]},lastPush:{}});
export async function loadState(dir){try{const s=JSON.parse(await readFile(path.join(dir,'state2.json'),'utf8'));return s&&s.v===2?{...emptyLocal(),...s}:emptyLocal();}catch{return emptyLocal();}}
export async function saveState(dir,state){await mkdir(dir,{recursive:true});const f=path.join(dir,'state2.json'),tmp=f+'.tmp';await writeFile(tmp,JSON.stringify(state),{mode:0o600});await rename(tmp,f);}

// ---- the loop ----------------------------------------------------------------------------
export class Alerter{
 constructor(env,{fetcher=fetch,now=Date.now,log,sleep,dryRun=false,out=l=>console.log(l)}={}){
  this.env=env;this.cfg=readConfig(env);this.fetcher=fetcher;this.now=now;this.log=log||makeLogger(env);this.dryRun=dryRun;this.out=out;
  this.rpc=new SupabaseRpc(this.cfg,fetcher,sleep);this.tg=new Telegram(this.cfg.bot,this.cfg.chat,fetcher,sleep);
  this.cal={US:usCalendar({extraHolidays:this.cfg.usExtraHolidays}),HL:hlCalendar()};
  this.state=emptyLocal();this.hl={addr:null,fills:new Map(),fillsAt:0,ledger:[],ledgerAt:0,portfolio:null,portfolioAt:0};this.failures=0;this.lastStatus={};
 }
 async init(){this.state=await loadState(this.cfg.stateDir);}
 want(m,auto){return this.cfg.markets?this.cfg.markets.includes(m):auto;}
 async hlData(addr,t){
  const h=this.hl;if(h.addr!==addr){Object.assign(h,{addr,fills:new Map(),fillsAt:0,ledger:[],ledgerAt:0,portfolio:null,portfolioAt:0});h.client=new HLClient(addr,this.fetcher,this.now);}
  const cal=this.cal.HL,today=cal.dayOf(t),since=cal.dayStart(cal.firstOf(today,'month'))-3*86400000,weekSince=cal.dayStart(cal.firstOf(today,'week'))-86400000,from=Math.min(since,weekSince);
  let equity=null;try{equity=await h.client.balance();}catch(e){this.log('WARN','하이퍼리퀴드 BALANCE 조회 실패 → 이번 회차 HL 판정 건너뜀: '+String(e.message||e).slice(0,80));}
  try{const start=h.fillsAt?Math.max(from,h.fillsAt-2*3600000):from;for(const f of await h.client.fills(start))h.fills.set(String(f.tid??f.hash+':'+f.time),f);h.fillsAt=t;for(const [k,f] of h.fills)if(f.time<from-86400000)h.fills.delete(k);}
  catch(e){this.log('WARN','하이퍼리퀴드 체결 조회 실패: '+String(e.message||e).slice(0,80));}
  // 입출금 원장은 매 확인마다(잔고 조회 뒤에) 읽음 → 출금 직후 잔고 감소를 손실로 오판하지 않음
  try{h.ledger=await h.client.ledger(from);h.ledgerAt=t;}catch(e){equity=null;this.log('WARN','하이퍼리퀴드 입출금 원장 조회 실패 → 출금을 손실로 오판하지 않도록 이번 회차 HL 판정 건너뜀: '+String(e.message||e).slice(0,80));}
  if(t-h.portfolioAt>=60*MIN){try{h.portfolio=await h.client.portfolio();h.portfolioAt=t;}catch{}}
  return {equity,fills:src.hlFills([...h.fills.values()]),flows:src.hlFlows(h.ledger,addr),portfolio:h.portfolio};
 }
 async check(){
  const t=this.now(),S=this.state;
  const data=await this.rpc.call('risk_status',{p_token:this.cfg.token,p_us_revision:S.journal.US?.revision??null,p_hl_revision:S.journal.HL?.revision??null});
  for(const sc of ['US','HL']){const j=data.journal?.[sc];if(j&&!j.unchanged)S.journal[sc]={revision:j.revision,defaultRisk:Number(j.defaultRisk)||null};}
  const refs=new Set((data.risk?.events||[]).map(e=>e.ref));for(const e of S.pending.events)refs.add(e.ref);
  // 다른 곳(--clear-stops 등)이 더 새 판정 상태를 저장했으면 그것을 씀
  for(const r of data.risk?.state||[]){const m=r.market==='us'?'US':'HL';const db=r.engine;if(db&&db.rev&&(!S.engine[m]||(db.rev||0)>(S.engine[m].rev||0)))S.engine[m]=db;}
  const dbFlows=m=>(data.risk?.flows||[]).filter(f=>f.market===MK[m]).map(f=>({ref:f.ref,at:Number(f.at),amount:Number(f.amount),kind:f.kind,source:f.source}));
  const results=[];
  // --- 미국주식
  if(this.want('US',!!data.kw?.latest)){
   const cal=this.cal.US,latest=data.kw?.latest;const eq=src.usEquity(latest,t,this.cfg.usStaleMin);
   const newFlows=[];if(latest){const r=src.usImpliedFlow(S.usObs,latest,data.kw.orders,this.cfg.usFlowMin);if(r.flow&&!dbFlows('US').some(f=>f.ref===r.flow.ref)){newFlows.push(r.flow);this.log('INFO',`미국주식 입출금 추정 ${r.flow.amount} USD (${r.flow.note}) → 손익에서 제외`);}S.usObs=r.obs;}
   const flows=[...dbFlows('US'),...S.pending.flows.filter(f=>f.market==='us'),...newFlows];
   const res=risk.step(S.engine.US,{now:t,cal,cfg:engineCfg(this.cfg,'US',S.journal.US?.defaultRisk),equity:eq,flows,fills:src.usFills(data.kw?.orders),fallbackStart:src.usFallback(data.acct_us,cal),eventRefs:refs});
   if(eq?.stale)res.status.note=`키움 스냅샷이 ${Math.round((t-eq.t)/MIN)}분 전 값입니다(시세만 바뀌면 수집기가 최대 10분마다 올림)`;
   results.push({m:'US',res,newFlows});
  }
  // --- 하이퍼리퀴드
  const addr=this.cfg.hlAddress||data.hl_address;
  if(addr&&this.want('HL',true)){
   const cal=this.cal.HL,h=await this.hlData(String(addr).toLowerCase(),t);
   const known=new Set(dbFlows('HL').map(f=>f.ref));const newFlows=h.flows.filter(f=>!known.has(f.ref)&&!S.pending.flows.some(p=>p.ref===f.ref));
   const fm=new Map();for(const f of [...dbFlows('HL'),...S.pending.flows.filter(f=>f.market==='hl'),...h.flows])fm.set(f.ref,f);const flows=[...fm.values()];
   const fb=src.hlPortfolioFallback(h.portfolio,cal,h.equity);
   const res=risk.step(S.engine.HL,{now:t,cal,cfg:engineCfg(this.cfg,'HL',S.journal.HL?.defaultRisk),equity:h.equity,flows,fills:h.fills,fallbackStart:fb,eventRefs:refs});
   results.push({m:'HL',res,newFlows});
  }
  // --- 상태 반영 + 알림 + 저장
  const payload={states:[],days:[],events:[],flows:[]};
  for(const {m,res,newFlows} of results){
   const changed=res.events.length||res.days.some(d=>d.final)||newFlows.length||JSON.stringify(res.status.stops)!==JSON.stringify(this.lastStatus[m]?.stops)||res.status.halfRisk.active!==this.lastStatus[m]?.halfRisk?.active;
   res.state.rev=(S.engine[m]?.rev||0)+1;res.state.updatedAt=t;S.engine[m]=res.state;this.lastStatus[m]=res.status;
   const due=changed||t-(S.lastPush[m]||0)>=this.cfg.pushMin*MIN;
   if(due){payload.states.push({market:MK[m],status:res.status,engine:res.state});S.lastPush[m]=t;}
   for(const d of res.days)if(d.final||due)payload.days.push({market:MK[m],day:d.day,rec:d});
   for(const e of res.events)payload.events.push({market:MK[m],...e});
   for(const f of newFlows)payload.flows.push({market:MK[m],...f});
   for(const msg of res.messages)S.outbox.push({...msg,at:t});
   if(res.messages.length)this.log('INFO',`${risk.MARKET_LABEL[m]} 판정: `+res.messages.map(x=>x.text.split('\n')[0]).join(' | '));
  }
  // 이전에 실패한 저장분 같이
  payload.events.unshift(...S.pending.events.filter(p=>!payload.events.some(e=>e.ref===p.ref)));payload.flows.unshift(...S.pending.flows.filter(p=>!payload.flows.some(e=>e.ref===p.ref)));payload.days.unshift(...S.pending.days.filter(p=>!payload.days.some(d=>d.market===p.market&&d.day===p.day)));
  if(!this.dryRun&&(payload.states.length||payload.events.length||payload.flows.length||payload.days.length)){
   try{await this.rpc.call('risk_push',{p_token:this.cfg.token,p_payload:payload});S.pending={events:[],flows:[],days:[]};}
   catch(e){S.pending={events:payload.events.slice(-200),flows:payload.flows.slice(-200),days:payload.days.slice(-100)};for(const m of ['US','HL'])S.lastPush[m]=0;this.log('ERROR','Supabase 저장 실패(다음 확인 때 다시): '+(e.message||e));}
  }
  // 일일 요약(미국 장 마감 후)
  const sk=this.summaryDue(t);if(sk&&results.length){S.outbox.push({key:sk,at:t,text:this.summaryText(results.map(r=>r.res.status),t)});S.sent[sk]=t;}
  // 텔레그램(실패분은 2시간 동안 재시도)
  const keep=[];let sent=0;
  for(const msg of S.outbox){if(t-msg.at>2*3600000)continue;try{await this.deliver(msg.text);sent++;}catch(e){keep.push(msg);this.log('ERROR','텔레그램 전송 실패: '+(e.message||e)+' (다음 확인 때 다시 시도)');}}
  S.outbox=this.dryRun?[]:keep;
  for(const [k,v] of Object.entries(S.sent))if(v<t-45*86400000)delete S.sent[k];
  if(!this.dryRun)await saveState(this.cfg.stateDir,S);
  return {results,sent,messages:results.flatMap(r=>r.res.messages.map(x=>x.text)),statuses:results.map(r=>r.res.status)};
 }
 async deliver(text){if(this.dryRun){this.out('[보낼 메시지]\n'+text);return;}await this.tg.send(text);}
 summaryDue(t){
  if(!this.cfg.dailySummary)return null;const cal=this.cal.US;const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
  const d=`${p.year}-${p.month}-${p.day}`,mins=Number(p.hour)*60+Number(p.minute);if(!cal.isTradingDay(d))return null;
  const [h,m]=this.cfg.summaryTime;if(mins<h*60+m||mins>=23*60)return null;const key='summary:'+d;return this.state.sent[key]?null:key;
 }
 summaryText(statuses,t){
  const lines=['📊 손실한도 판정 요약'];
  for(const s of statuses){const P=s.periods||{};const part=(k,lbl)=>P[k]&&P[k].pct!==null?`${lbl} ${risk.pctText(P[k].pct)}`+(P[k].limit?`/−${P[k].limit}%`:''):`${lbl} —`;
   lines.push(`${risk.MARKET_LABEL[s.market]} (${s.todayLabel}) ${part('day','오늘')} · ${part('week','주')} · ${part('month','달')}`);
   const dd=P.week?.ddPct;if(Number.isFinite(dd)&&dd<0)lines.push(`  주 고점 대비 ${risk.pctText(dd)} (참고)`);
   if(s.stops.length)lines.push('  ⛔ '+s.stops.map(x=>`${x.label} ~ ${x.untilText}`).join(' / '));
   if(s.halfRisk?.active)lines.push(`  ✅ 오늘 재시작 첫날 · 위험 ${Math.round(s.halfRisk.factor*100)}%`);
   if(s.streak?.count)lines.push(`  연속 손실일 ${s.streak.count}/${s.streak.need}`);}
  return lines.join('\n');
 }
 delay(){const t=this.now();const hasHL=!!this.lastStatus.HL;if(hasHL)return this.cfg.checkSec*1000;
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));const g=k=>p.find(x=>x.type===k)?.value;const mins=Number(g('hour'))*60+Number(g('minute'));
  const active=!['Sat','Sun'].includes(g('weekday'))&&mins>=4*60&&mins<20*60+5;return (active?this.cfg.checkSec:this.cfg.idleSec)*1000;}
 describe(statuses){return statuses.map(s=>{const P=s.periods||{};const L=k=>{const x=P[k];if(!x||x.pct===null)return `${k} —`;return `${{day:'오늘',week:'이번 주',month:'이번 달'}[k]} ${risk.pctText(x.pct)} (${risk.signedUsd(x.pnl,s.market)} / 시작 ${risk.usd(x.startEquity,s.market)} ${x.startSource||''}${x.flows?` · 입출금 ${risk.signedUsd(x.flows,s.market)} 제외`:''}) 한도 −${x.limit??'—'}%`+(Number.isFinite(x.ddPct)?` · 고점 대비 ${risk.pctText(x.ddPct)}`:'');};
  return `${risk.MARKET_LABEL[s.market]} · 거래일 ${s.todayLabel} · 자산 ${s.equity?risk.usd(s.equity.value,s.market)+' ('+s.equity.source+')':'없음'}\n ${L('day')}\n ${L('week')}\n ${L('month')}\n 연속 손실일 ${s.streak.count}/${s.streak.need}`+(s.stops.length?'\n ⛔ '+s.stops.map(x=>`${x.label} ~ ${x.untilText}`).join(' / '):'\n 거래 중단 없음')+(s.halfRisk?.active?`\n ✅ 재시작 첫날(위험 ${Math.round(s.halfRisk.factor*100)}%)`:'')+(s.note?'\n ※ '+s.note:'');}).join('\n');}
 async run(){
  await this.init();const c=this.cfg;
  this.log('INFO',`trade-alert ${VERSION} 시작 · 손실한도 판정 v1.2 · US ${fmtL(c.limits.US)} · HL ${fmtL(c.limits.HL)} · 연속 손실 ${c.streakDays}일(≤−${c.streakLossPct}%)→${c.streakStopDays}거래일 · 재시작 위험 ×${c.restartFactor} · ${c.checkSec}초마다`);
  for(;;){
   try{await this.check();if(this.failures)this.log('INFO','정상 복구');this.failures=0;}
   catch(e){this.failures++;const code=String(e.message||e);this.log('ERROR',`확인 실패(${this.failures}): ${code}`+(code==='SUPABASE_SQL_NOT_INSTALLED'?' → Supabase SQL Editor에서 alert2.sql을 실행하세요.':code==='SUPABASE_TOKEN_REJECTED'?' → KW_COLLECTOR_TOKEN이 앱의 현재 토큰과 같은지 확인하세요.':''));}
   const wait=this.failures?Math.min(30*MIN,this.delay()*2**Math.min(this.failures-1,4)):this.delay();
   await new Promise(r=>setTimeout(r,wait));
  }
 }
}
const fmtL=l=>`${l.day?'−'+l.day:'끔'}/${l.week?'−'+l.week:'끔'}/${l.month?'−'+l.month:'끔'}%`;

function explainConfig(e,log){if(e.message==='CONFIG_SECRET_KEY_REFUSED')log('ERROR','SUPABASE_KEY에 secret/service_role 키를 넣지 마세요. sb_publishable_… 키만 사용합니다.');else if(e.message==='CONFIG_INCOMPLETE')log('ERROR','.env 값이 비었거나 형식이 다릅니다: '+e.fields.join(', ')+'  → sudo nano /opt/trade-alert/.env');else log('ERROR',String(e.message||e));}

async function adminPush(a,market,mutate){
 const data=await a.rpc.call('risk_status',{p_token:a.cfg.token});const row=(data.risk?.state||[]).find(r=>r.market===MK[market]);
 const eng=row?.engine&&row.engine.v?row.engine:null;if(!eng)return {msg:'저장된 판정 상태가 없습니다(서비스가 한 번 이상 실행된 뒤 사용).'};
 const r=mutate(eng);if(!r)return {msg:'바꿀 것이 없습니다.'};
 r.state.rev=(eng.rev||0)+1000;r.state.updatedAt=Date.now();
 await a.rpc.call('risk_push',{p_token:a.cfg.token,p_payload:{states:[{market:MK[market],status:{...(row.status||{}),stops:[],stopped:false,note:'수동 해제됨 — 다음 확인 때 갱신'},engine:r.state}],events:r.events||[]}});
 return {msg:r.msg};
}

export async function main(argv=process.argv.slice(2),env=process.env){
 const log=makeLogger(env);
 if(argv.includes('--version')){console.log(VERSION);return 0;}
 if(argv.includes('--find-chat')){
  let cfg;try{cfg=readConfig(env,{needSupabase:false,needTelegram:false});}catch(e){explainConfig(e,log);return 2;}
  try{const chats=await new Telegram(cfg.bot,'').findChats();
   if(!chats.length){console.log('최근 메시지가 없습니다. 텔레그램에서 내 봇을 열고 아무 메시지(예: 안녕)를 보낸 뒤 다시 실행하세요.');return 1;}
   console.log('봇에게 메시지를 보낸 대화방:');for(const c of chats)console.log(`  TELEGRAM_CHAT_ID=${c.id}   (${c.type}${c.name?' · '+c.name:''}${c.username?' '+c.username:''})`);
   console.log('위 줄 하나를 /opt/trade-alert/.env 에 그대로 넣으세요.');return 0;}
  catch(e){log('ERROR',String(e.message));return 1;}
 }
 const dryRun=argv.includes('--dry-run');
 if(argv.includes('--test')){
  let cfg;try{cfg=readConfig(env,{needSupabase:false});}catch(e){explainConfig(e,log);return 2;}
  let detail='';
  try{const a=new Alerter(env,{dryRun:true,log,out:()=>{}});await a.init();const r=await a.check();detail=r.statuses.length?a.describe(r.statuses):'(판정할 시장 없음: 키움 수집 스냅샷·HL 주소가 없습니다)';}
  catch(e){detail='(Supabase 확인 실패: '+(e.fields?'.env 미입력 '+e.fields.join(', '):String(e.message||e))+')';}
  try{await new Telegram(cfg.bot,cfg.chat).send(`✅ 매매일지 손실한도 판정 v1.2 테스트 · trade-alert ${VERSION}\n`+detail);console.log('테스트 메시지를 보냈습니다.\n'+detail);return 0;}
  catch(e){log('ERROR','테스트 전송 실패: '+String(e.message));return 1;}
 }
 let a;try{a=new Alerter(env,{dryRun,log});}catch(e){explainConfig(e,log);return 2;}
 const ai=argv.indexOf('--flow');
 if(ai>=0){const market=String(argv[ai+1]||'').toUpperCase(),amt=Number(argv[ai+2]);const note=argv[ai+3]?String(argv[ai+3]).slice(0,200):null;
  if(!['US','HL'].includes(market)||!Number.isFinite(amt)||amt===0){console.log('사용법: --flow US|HL <금액(+입금/−출금)> "메모"');return 2;}
  const t=Date.now(),ref=`manual:${market}:${t}`;
  try{await a.rpc.call('risk_push',{p_token:a.cfg.token,p_payload:{flows:[{market:MK[market],ref,at:t,amount:amt,kind:amt>0?'입금(수동)':'출금(수동)',source:'manual',note}]}});console.log(`등록했습니다: ${market} ${amt>0?'+':''}${amt} (${new Date(t).toISOString()}) · ref ${ref}\n취소: --flow-remove ${ref}`);return 0;}
  catch(e){log('ERROR',String(e.message||e));return 1;}}
 const ri=argv.indexOf('--flow-remove');
 if(ri>=0){const ref=String(argv[ri+1]||'');try{const r=await a.rpc.call('risk_push',{p_token:a.cfg.token,p_payload:{flow_deletes:[ref]}});console.log(r.flow_deletes?'취소했습니다: '+ref:'해당 수동 등록이 없습니다: '+ref);return 0;}catch(e){log('ERROR',String(e.message||e));return 1;}}
 const ci=argv.indexOf('--clear-stops');
 if(ci>=0){const market=String(argv[ci+1]||'').toUpperCase();if(!['US','HL'].includes(market)){console.log('사용법: --clear-stops US|HL');return 2;}
  try{const r=await adminPush(a,market,eng=>{const t=Date.now();const c=risk.clearStops(eng,t);if(!c.ids.length)return null;return {state:c.state,events:c.ids.map(id=>({market:MK[market],ref:'clear:'+id+':'+t,kind:'clear',rule:'manual',at:t,detail:{stopId:id}})),msg:'해제했습니다: '+c.ids.join(', ')};});console.log(r.msg);return 0;}
  catch(e){log('ERROR',String(e.message||e));return 1;}}
 if(argv.includes('--once')||dryRun){await a.init();try{const r=await a.check();console.log(a.describe(r.statuses));console.log(`메시지 ${r.messages.length}건${dryRun?' (dry-run: 보내지 않음, 저장 안 함)':''}`);return 0;}catch(e){log('ERROR',String(e.message||e));return 1;}}
 await a.run();return 0;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 main().then(code=>{if(code)process.exitCode=code;},e=>{makeLogger(process.env)('ERROR',String(e?.message||e));process.exitCode=1;});
}
