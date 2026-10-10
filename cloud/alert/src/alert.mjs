// trade-alert: Telegram loss-limit alerts for the trade journal (alert1, 1.0.0).
// Reads alert_status() from Supabase with the publishable key + collector token (kwc_...),
// evaluates the rules in core.mjs and sends short Korean messages to one Telegram chat.
// Run: node --env-file=.env src/alert.mjs              (systemd does this)
//      node --env-file=.env src/alert.mjs --find-chat  (print chat ids that messaged the bot)
//      node --env-file=.env src/alert.mjs --test       (send a test message + current numbers)
//      node --env-file=.env src/alert.mjs --once [--dry-run]  (one check; --dry-run prints instead of sending)
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as core from './core.mjs';
const require=createRequire(import.meta.url);
const {fetchAccountBalance}=require('./hl-balance.cjs');

export const VERSION='1.0.0';
const MIN=60000;

// ---- config ------------------------------------------------------------------------------
const placeholder=v=>!String(v||'').trim()||/여기에|붙여넣기|CHANGE_ME/.test(String(v));
function intIn(env,k,d,min,max){const v=env[k];if(v===undefined||String(v).trim()==='')return d;const x=Number(v);if(!Number.isInteger(x)||x<min||x>max)throw Object.assign(Error('CONFIG_INCOMPLETE'),{fields:[`${k} (${min}–${max})`]});return x;}
function bool(env,k,d){const v=String(env[k]??'').trim().toLowerCase();if(!v)return d;return ['1','true','yes','on','켬'].includes(v);}
function limitsList(env,k){const v=String(env[k]??'').trim();if(!v)return null;const a=v.split(',').map(x=>x.trim()===''?null:Number(x));if(a.length!==3||a.some(x=>x!==null&&!(Number.isFinite(x)&&x>=0&&x<=100)))throw Object.assign(Error('CONFIG_INCOMPLETE'),{fields:[k+' (하루,주,달 % 예: 2,5,10)']});return a;}
function money(env,k){const v=String(env[k]??'').trim();if(!v)return null;const x=Number(v);if(!(x>0&&x<1e12))throw Object.assign(Error('CONFIG_INCOMPLETE'),{fields:[k+' (달러 금액)']});return x;}
export function readConfig(env,{needSupabase=true,needTelegram=true}={}){
 const problems=[];
 let url='';try{const u=new URL(String(env.SUPABASE_URL||'').trim());if(u.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.port)throw Error();url=u.origin;}catch{if(needSupabase)problems.push('SUPABASE_URL (https://프로젝트ID.supabase.co)');}
 const key=String(env.SUPABASE_KEY||'').trim();
 if(key.startsWith('sb_secret_'))throw Error('CONFIG_SECRET_KEY_REFUSED');
 if(key.startsWith('eyJ')){let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role;}catch{}if(role!=='anon')throw Error('CONFIG_SECRET_KEY_REFUSED');}
 else if(needSupabase&&!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))problems.push('SUPABASE_KEY (sb_publishable_…)');
 const token=String(env.KW_COLLECTOR_TOKEN||'').trim();
 if(needSupabase&&!/^kwc_[A-Za-z0-9_-]{43}$/.test(token))problems.push('KW_COLLECTOR_TOKEN (앱에서 만든 kwc_… 토큰)');
 const bot=String(env.TELEGRAM_BOT_TOKEN||'').trim();
 if(!/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/.test(bot))problems.push('TELEGRAM_BOT_TOKEN (BotFather가 준 123456:ABC… 토큰)');
 const chat=String(env.TELEGRAM_CHAT_ID||'').trim();
 if(needTelegram&&!/^-?\d{1,20}$/.test(chat))problems.push('TELEGRAM_CHAT_ID (--find-chat 로 확인한 숫자)');
 const markets=String(env.ALERT_MARKETS||'auto').trim().toUpperCase().replace(/\s/g,'');
 if(!/^(AUTO|US|HL|US,HL|HL,US)$/.test(markets))problems.push('ALERT_MARKETS (auto, US, HL, US,HL)');
 let thresholds=[50,80,100];const tv=String(env.ALERT_THRESHOLDS||'').trim();
 if(tv){thresholds=[...new Set(tv.split(',').map(Number))].sort((a,b)=>a-b);if(!thresholds.length||thresholds.some(x=>!Number.isFinite(x)||x<=0||x>500))problems.push('ALERT_THRESHOLDS (예: 50,80,100)');}
 const st=String(env.DAILY_SUMMARY_TIME_ET||'16:15').trim();const sm=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(st);if(!sm)problems.push('DAILY_SUMMARY_TIME_ET (HH:MM, 미국 동부)');
 let cfg;
 try{cfg={supabaseUrl:url,supabaseKey:key,token,bot,chat,markets:markets==='AUTO'?null:markets.split(','),thresholds,
  streakN:intIn(env,'LOSS_STREAK_N',3,0,50),streakRepeat:bool(env,'LOSS_STREAK_REPEAT',true),
  includeUnrealized:bool(env,'INCLUDE_UNREALIZED',false),dailySummary:bool(env,'DAILY_SUMMARY',true),summaryTime:sm?[Number(sm[1]),Number(sm[2])]:[16,15],
  activeSec:intIn(env,'CHECK_ACTIVE_SEC',60,30,600),idleSec:intIn(env,'CHECK_IDLE_SEC',600,60,3600),hlAlwaysActive:bool(env,'HL_ALWAYS_ACTIVE',false),
  hlLiveBalance:bool(env,'HL_LIVE_BALANCE',true),
  usLimits:limitsList(env,'US_LIMITS_PCT'),hlLimits:limitsList(env,'HL_LIMITS_PCT'),usBasis:money(env,'US_ACCOUNT_BASIS'),hlBasis:money(env,'HL_ACCOUNT_BASIS'),
  stateDir:String(env.STATE_DIRECTORY||env.ALERT_STATE_DIR||'/var/lib/trade-alert').split(':')[0]};}
 catch(e){if(e.fields)problems.push(...e.fields);else throw e;}
 if(problems.length){const e=Error('CONFIG_INCOMPLETE');e.fields=problems;throw e;}
 return cfg;
}

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
   chats.set(String(c.id),{id:String(c.id),type:c.type,name:c.title||[c.first_name,c.last_name].filter(Boolean).join(' ')||'',username:c.username?'@'+c.username:'',last:m.date?new Date(m.date*1000).toISOString():''});}
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
   if(r.status===404||/alert_status|could not find the function/i.test(String(data?.message||'')))throw Error('SUPABASE_SQL_NOT_INSTALLED');
   if(!r.ok)throw Error('SUPABASE_HTTP_'+r.status);
   if(!data||typeof data!=='object')throw Error('SUPABASE_BAD_RESPONSE');
   if(data.ok===false)throw Error('SUPABASE_REJECTED_'+String(data.error||'unknown').replace(/[^a-z_]/g,'').slice(0,40));
   return data;
  }
 }
}

// ---- Hyperliquid live (account basis like the app's BALANCE, optional unrealized) -------
export async function hlLive(address,fetcher=fetch,{balance=true,unrealized=false}={}){
 const request=async q=>{const body=(q.type==='perpDexs'||q.type==='metaAndAssetCtxs')?q:{...q,user:address.toLowerCase()};const r=await fetcher('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HL_HTTP_'+r.status);return r.json();};
 const base=await request({type:'clearinghouseState'});const out={};
 if(balance){const b=await fetchAccountBalance(request,base,address.toLowerCase());const eq=Number(b.equity);if(eq>0)out.equity=eq;}
 if(unrealized){out.unrealized=(base?.assetPositions||[]).reduce((s,a)=>s+(Number(a?.position?.unrealizedPnl)||0),0);}
 return out;
}

// ---- state -------------------------------------------------------------------------------
export async function loadState(dir){try{const s=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));return s&&typeof s==='object'?{sent:s.sent||{},journal:s.journal||{}}:{sent:{},journal:{}};}catch{return {sent:{},journal:{}};}}
export async function saveState(dir,state){await mkdir(dir,{recursive:true});const f=path.join(dir,'state.json'),tmp=f+'.tmp';await writeFile(tmp,JSON.stringify(state),{mode:0o600});await rename(tmp,f);}

// ---- the alert loop ----------------------------------------------------------------------
export class Alerter{
 constructor(env,{fetcher=fetch,now=Date.now,log,sleep,dryRun=false,out=l=>console.log(l)}={}){
  this.env=env;this.cfg=readConfig(env);this.fetcher=fetcher;this.now=now;this.log=log||makeLogger(env);this.dryRun=dryRun;this.out=out;
  this.rpc=new SupabaseRpc(this.cfg,fetcher,sleep);this.tg=new Telegram(this.cfg.bot,this.cfg.chat,fetcher,sleep);
  this.state={sent:{},journal:{}};this.unsetDone=new Set();this.hlCache={at:0,data:null};this.failures=0;this.lastError=null;
 }
 async init(){this.state=await loadState(this.cfg.stateDir);}
 async fetchModels(){
  const j=this.state.journal||{};
  const data=await this.rpc.call('alert_status',{p_token:this.cfg.token,p_us_revision:j.US?.revision??null,p_hl_revision:j.HL?.revision??null});
  for(const [scope,key] of [['US','us'],['HL','hl']]){const got=data?.[key]?.journal;if(!got)continue;
   if(!got.exists)j[scope]={exists:false};else if(!got.unchanged)j[scope]=got;}
  this.state.journal=j;
  const want=m=>this.cfg.markets?this.cfg.markets.includes(m):null;
  const models=[];
  const us=core.buildUS(data,j.US,{limitsOverride:this.cfg.usLimits,basisOverride:this.cfg.usBasis});
  if(want('US')??us.hasData)models.push(us);
  let live={};const raw=data?.hl?.raw;
  if((want('HL')??(!!j.HL?.exists||!!raw?.registered))&&raw?.address&&(this.cfg.hlLiveBalance||this.cfg.includeUnrealized)){
   const ttl=this.cfg.includeUnrealized?MIN:5*MIN;
   if(this.now()-this.hlCache.at<ttl&&this.hlCache.addr===raw.address)live=this.hlCache.data;
   else{try{live=await hlLive(raw.address,this.fetcher,{balance:this.cfg.hlLiveBalance,unrealized:this.cfg.includeUnrealized});this.hlCache={at:this.now(),data:live,addr:raw.address};}catch(e){this.log('WARN','하이퍼리퀴드 잔고 조회 실패 → 앱 계좌 기준액 사용: '+String(e.message||e).slice(0,80));live=this.hlCache.data||{};}}
  }
  const hl=core.buildHL(data,j.HL,{limitsOverride:this.cfg.hlLimits,basisOverride:this.cfg.hlBasis,liveBalance:live.equity,unrealized:live.unrealized});
  if(want('HL')??hl.hasData)models.push(hl);
  return {data,models};
 }
 async deliver(text){if(this.dryRun){this.out('[보낼 메시지]\n'+text);return;}await this.tg.send(text);}
 async check(){
  const t=this.now();const {models}=await this.fetchModels();const msgs=[];
  for(const m of models){if(this.unsetDone.has(m.market))continue;this.unsetDone.add(m.market);
   const lm=['day','week','month'].filter(x=>!m.limits[x]);if(!(m.basis>0)||lm.length)msgs.push({keys:[],text:core.unsetMessage(m)});}
  msgs.push(...core.evaluate(models,t,this.state,this.cfg));
  const sk=core.summaryDue(t,this.state,this.cfg);if(sk&&models.length)msgs.push({keys:[sk],text:core.summaryMessage(models,t,this.cfg)});
  let sent=0;
  for(const m of msgs){try{await this.deliver(m.text);sent++;for(const k of m.keys)this.state.sent[k]=new Date(t).toISOString();this.log('INFO','알림 전송: '+m.text.split('\n')[0]);}
   catch(e){this.log('ERROR','텔레그램 전송 실패: '+(e.message||e)+' (다음 확인 때 다시 시도)');}}
  this.state=core.pruneState(this.state,t);if(!this.dryRun)await saveState(this.cfg.stateDir,this.state);
  return {models,sent,messages:msgs.map(m=>m.text)};
 }
 delay(models){return (core.isActive(this.now(),{hlAlwaysActive:this.cfg.hlAlwaysActive,hasHL:(models||[]).some(m=>m.market==='HL')})?this.cfg.activeSec:this.cfg.idleSec)*1000;}
 describe(models){const t=this.now();return models.map(m=>{const p=core.periodSums(m,t,this.cfg);const part=mode=>`${core.MODE_LABEL[mode]} ${core.signed(p[mode].sum)}`+(p[mode].budget?` / ${core.LIMIT_LABEL[mode]} ${core.usd(p[mode].budget)} (${Math.floor(p[mode].ratio*100)}%)`:' / 한도 미설정');
  const s=core.lossStreak(m.closed);return `${core.MARKET_LABEL[m.market]} (기준일 ${p.today}, ${m.zone}) · 계좌 ${m.basis>0?core.usd(m.basis)+' '+m.basisSource:'미설정'}\n ${part('day')}\n ${part('week')}\n ${part('month')}\n 연속 손실 ${s.count}회`;}).join('\n');}
 async run(){
  await this.init();this.log('INFO',`trade-alert ${VERSION} 시작 · 임계값 ${this.cfg.thresholds.join('/')}% · 연속 손실 ${this.cfg.streakN||'끔'} · 미실현 ${this.cfg.includeUnrealized?'포함':'제외'} · 일일 요약 ${this.cfg.dailySummary?'켬':'끔'}`);
  let models=[];
  for(;;){
   try{const r=await this.check();models=r.models;if(this.failures)this.log('INFO','정상 복구');this.failures=0;this.lastError=null;}
   catch(e){this.failures++;const code=String(e.message||e);this.lastError=code;this.log('ERROR',`확인 실패(${this.failures}): ${code}`+(code==='SUPABASE_SQL_NOT_INSTALLED'?' → Supabase SQL Editor에서 alert.sql을 실행하세요.':code==='SUPABASE_TOKEN_REJECTED'?' → KW_COLLECTOR_TOKEN이 앱의 현재 토큰과 같은지 확인하세요.':''));}
   const wait=this.failures?Math.min(30*MIN,this.delay(models)*2**Math.min(this.failures-1,4)):this.delay(models);
   await new Promise(r=>setTimeout(r,wait));
  }
 }
}

function explainConfig(e,log){if(e.message==='CONFIG_SECRET_KEY_REFUSED')log('ERROR','SUPABASE_KEY에 secret/service_role 키를 넣지 마세요. sb_publishable_… 키만 사용합니다.');else if(e.message==='CONFIG_INCOMPLETE')log('ERROR','.env 값이 비었거나 형식이 다릅니다: '+e.fields.join(', ')+'  → sudo nano /opt/trade-alert/.env');else log('ERROR',String(e.message||e));}

export async function main(argv=process.argv.slice(2),env=process.env){
 const log=makeLogger(env);
 if(argv.includes('--version')){console.log(VERSION);return 0;}
 if(argv.includes('--find-chat')){
  let cfg;try{cfg=readConfig(env,{needSupabase:false,needTelegram:false});}catch(e){explainConfig(e,log);return 2;}
  try{const chats=await new Telegram(cfg.bot,'').findChats();
   if(!chats.length){console.log('최근 메시지가 없습니다. 텔레그램에서 내 봇을 열고 아무 메시지(예: 안녕)를 보낸 뒤 다시 실행하세요.');return 1;}
   console.log('봇에게 메시지를 보낸 대화방:');for(const c of chats)console.log(`  TELEGRAM_CHAT_ID=${c.id}   (${c.type}${c.name?' · '+c.name:''}${c.username?' '+c.username:''})`);
   console.log('위 줄 하나를 /opt/trade-alert/.env 에 그대로 넣으세요.');return 0;}
  catch(e){log('ERROR',e.message==='TELEGRAM_WEBHOOK_ACTIVE'?'이 봇에 웹훅이 설정되어 있어 getUpdates를 쓸 수 없습니다. 다른 봇을 쓰거나 웹훅을 해제하세요.':e.message==='TELEGRAM_BOT_TOKEN_REJECTED'?'TELEGRAM_BOT_TOKEN이 올바르지 않습니다(BotFather에서 다시 복사).':String(e.message));return 1;}
 }
 const dryRun=argv.includes('--dry-run');
 if(argv.includes('--test')){
  let cfg;try{cfg=readConfig(env,{needSupabase:false});}catch(e){explainConfig(e,log);return 2;}
  let detail='';
  try{const a=new Alerter(env,{dryRun:true,log});await a.init();const {models}=await a.fetchModels();detail=models.length?a.describe(models):'(표시할 시장 없음: 앱에 저장된 일지·자동수집 기록이 없습니다)';}
  catch(e){detail='(Supabase 연결 확인 실패: '+(e.fields?'.env 미입력 '+e.fields.join(', '):String(e.message||e))+')';}
  try{await new Telegram(cfg.bot,cfg.chat).send('✅ 매매일지 알림 테스트 · 연결 정상\n'+detail);console.log('테스트 메시지를 보냈습니다. 텔레그램을 확인하세요.\n'+detail);return 0;}
  catch(e){log('ERROR','테스트 전송 실패: '+(e.message==='TELEGRAM_CHAT_NOT_FOUND'?'TELEGRAM_CHAT_ID가 틀렸거나 봇에게 먼저 메시지를 보내지 않았습니다.':e.message==='TELEGRAM_BOT_BLOCKED'?'봇이 차단되어 있습니다. 텔레그램에서 봇 차단을 해제하세요.':String(e.message)));return 1;}
 }
 let a;try{a=new Alerter(env,{dryRun,log});}catch(e){explainConfig(e,log);return 2;}
 if(argv.includes('--once')||dryRun){await a.init();try{const r=await a.check();console.log(a.describe(r.models));console.log(`메시지 ${r.messages.length}건${dryRun?' (dry-run: 보내지 않음, 상태 저장 안 함)':' 전송'}`);return 0;}catch(e){log('ERROR',String(e.message||e));return 1;}}
 await a.run();return 0;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 main().then(code=>{if(code)process.exitCode=code;},e=>{makeLogger(process.env)('ERROR',String(e?.message||e));process.exitCode=1;});
}
