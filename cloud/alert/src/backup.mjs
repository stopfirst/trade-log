// trade-alert 2.9.0 (alert13): 매매일지 서버 일일 백업 — Supabase backup_dump(토큰, alert13.sql) → gzip JSON, 30일 보관.
// 읽기 전용: Supabase에는 아무것도 쓰지 않음(backup_dump가 호출 횟수 카운터만 올림). publishable key + 수집기 토큰만 사용.
// Run: node --env-file=/opt/trade-alert/.env src/backup.mjs                 (systemd trade-alert-backup.timer, 매일 1회)
//      node --env-file=/opt/trade-alert/.env src/backup.mjs --list          (보관 중인 백업 목록)
//      node src/backup.mjs --extract <백업.json.gz> <출력폴더>               (앱 '기존 기록 가져오기'용 일지 JSON 꺼내기)
//      node src/backup.mjs --restore-sql <백업.json.gz> [--journal] [--user <uuid>] > restore.sql
//                                                                           (SQL Editor 복원 스크립트: 서버 표는 없는 행만 추가)
import {readFile,writeFile,rename,mkdir,readdir,unlink,chmod,stat} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {VERSION,SupabaseRpc,Telegram,makeLogger} from './alert.mjs';

export const FORMAT='trade-journal-server-backup';
export const FILE_RE=/^trade-journal-(\d{4}-\d{2}-\d{2})-(\d{4})\.json\.gz$/;
const PHOTO_RE=/^data:image\//;
export const PHOTO_MARK='[사진 제외됨: BACKUP_PHOTOS=0]';

function cfgErr(fields){const e=Error('CONFIG_INCOMPLETE');e.fields=fields;return e;}
export function readBackupConfig(env){
 const P=[];
 let url='';try{const u=new URL(String(env.SUPABASE_URL||'').trim());if(u.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.port)throw Error();url=u.origin;}catch{P.push('SUPABASE_URL');}
 const key=String(env.SUPABASE_KEY||'').trim();
 if(key.startsWith('sb_secret_'))throw Error('CONFIG_SECRET_KEY_REFUSED');
 if(key.startsWith('eyJ')){let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role;}catch{}if(role!=='anon')throw Error('CONFIG_SECRET_KEY_REFUSED');}
 else if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))P.push('SUPABASE_KEY');
 const token=String(env.KW_COLLECTOR_TOKEN||'').trim();if(!/^kwc_[A-Za-z0-9_-]{43}$/.test(token))P.push('KW_COLLECTOR_TOKEN');
 const dir=String(env.BACKUP_DIR||'/opt/trade-alert/backups').trim();if(!path.isAbsolute(dir))P.push('BACKUP_DIR (절대 경로)');
 const kd=String(env.BACKUP_KEEP_DAYS??'').trim();const keepDays=kd?Number(kd):30;if(!Number.isInteger(keepDays)||keepDays<1||keepDays>3650)P.push('BACKUP_KEEP_DAYS (1–3650)');
 const ph=String(env.BACKUP_PHOTOS??'').trim().toLowerCase();const photos=ph?['1','true','yes','on','켬'].includes(ph):true;
 const nt=String(env.BACKUP_NOTIFY??'fail').trim().toLowerCase();if(!['fail','always','0'].includes(nt))P.push('BACKUP_NOTIFY (fail | always | 0)');
 const bot=String(env.TELEGRAM_BOT_TOKEN||'').trim(),chat=String(env.TELEGRAM_CHAT_ID||'').trim();
 const telegram=/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/.test(bot)&&/^-?\d{1,20}$/.test(chat)?{bot,chat,html:String(env.TELEGRAM_HTML??'1').trim()!=='0'}:null;
 if(P.length)throw cfgErr(P);
 return {supabaseUrl:url,supabaseKey:key,token,dir,keepDays,photos,notify:nt,telegram};
}

/** data:image/… 문자열을 표시로 바꿈(제자리). return 바꾼 개수 */
export function stripPhotos(v){
 let n=0;const walk=o=>{if(Array.isArray(o)){for(let i=0;i<o.length;i++){if(typeof o[i]==='string'&&PHOTO_RE.test(o[i])){o[i]=PHOTO_MARK;n++;}else if(o[i]&&typeof o[i]==='object')walk(o[i]);}}
  else if(o&&typeof o==='object'){for(const k of Object.keys(o)){const x=o[k];if(typeof x==='string'&&PHOTO_RE.test(x)){o[k]=PHOTO_MARK;n++;}else if(x&&typeof x==='object')walk(x);}}};
 walk(v);return n;
}

/** backup_dump 를 순서대로 불러 한 개의 백업 객체로. rpc.call(name, body) → data(ok:true) */
export async function collect(rpc,token,{photos=true,sleep=ms=>new Promise(r=>setTimeout(r,ms)),gapMs=2500,now=Date.now,log=()=>{},maxPages=2000}={}){
 let calls=0;
 const call=async(part,extra={})=>{
  for(let attempt=0;;attempt++){
   if(calls++)await sleep(gapMs); // 수집기·알림 서비스와 같은 분당 60회 한도를 나눠 씀
   try{return await rpc.call('backup_dump',{p_token:token,p_part:part,p_scope:null,p_after:null,...extra});}
   catch(e){if(/SUPABASE_REJECTED_rate_limited/.test(String(e.message))&&attempt<3){log('WARN','분당 호출 한도 — 65초 뒤 다시');await sleep(65000);continue;}throw e;}
  }
 };
 const pages=async part=>{const rows=[];let after=0;for(let i=0;i<maxPages;i++){const d=await call(part,{p_after:after});if(!Array.isArray(d.rows))throw Error('BACKUP_BAD_RESPONSE '+part);rows.push(...d.rows);if(d.next==null)return rows;if(!(Number(d.next)>after))throw Error('BACKUP_BAD_CURSOR '+part);after=Number(d.next);}throw Error('BACKUP_TOO_MANY_PAGES '+part);};
 const meta=await call('meta');
 const out={format:FORMAT,version:1,tool:'trade-alert '+VERSION,created_at:new Date(now()).toISOString(),user_id:meta.user_id,meta:{journals:meta.journals,history_versions:meta.history_versions,kw_snapshots:meta.kw_snapshots,hl_address:meta.hl_address,hl_fills:meta.hl_fills,hl_funding:meta.hl_funding,tables:meta.tables},
  photos:photos?'included':'removed',photos_removed:0,journals:{},history:{},server:{},kw_snapshots:[],hl_fills:[],hl_funding:[]};
 for(const scope of ['US','HL']){
  const j=(await call('journal',{p_scope:scope})).journal||null;
  if(j&&!photos)out.photos_removed+=stripPhotos(j.payload);
  out.journals[scope]=j;
  out.history[scope]=(await call('history',{p_scope:scope})).history||[];
 }
 out.server=(await call('server')).tables||{};
 out.kw_snapshots=await pages('kw_snapshots');
 out.hl_fills=await pages('hl_fills');
 out.hl_funding=await pages('hl_funding');
 out.calls=calls;
 return out;
}

/** 요약 숫자(로그·텔레그램·--list) */
export function summary(d){
 const j=s=>d.journals?.[s];const t=d.server||{};const cnt=k=>Array.isArray(t[k])?t[k].length:0;
 return {us:j('US')?{revision:j('US').revision,trades:Array.isArray(j('US').payload?.trades)?j('US').payload.trades.length:0}:null,
  hl:j('HL')?{revision:j('HL').revision,trades:Array.isArray(j('HL').payload?.trades)?j('HL').payload.trades.length:0}:null,
  kw_snapshots:d.kw_snapshots?.length||0,hl_fills:d.hl_fills?.length||0,hl_funding:d.hl_funding?.length||0,
  risk_days:cnt('risk_days'),risk_events:cnt('risk_events'),acct_snapshots:cnt('acct_snapshots'),quick_reviews:cnt('quick_reviews'),photos:d.photos,photos_removed:d.photos_removed||0};
}

const kstStamp=ms=>{const s=new Date(ms+9*3600000).toISOString();return {date:s.slice(0,10),hm:s.slice(11,13)+s.slice(14,16)};};
export function fileName(ms){const k=kstStamp(ms);return `trade-journal-${k.date}-${k.hm}.json.gz`;}

/** gzip 저장(임시 파일 → rename, 0600). return {file, bytes, sha256} */
export async function writeBackup(dir,dump,ms=Date.now()){
 await mkdir(dir,{recursive:true,mode:0o700});
 const gz=gzipSync(Buffer.from(JSON.stringify(dump)),{level:9});
 const name=fileName(ms),file=path.join(dir,name),tmp=file+'.tmp-'+randomBytes(4).toString('hex');
 await writeFile(tmp,gz,{mode:0o600});await chmod(tmp,0o600);await rename(tmp,file);
 const sha256=createHash('sha256').update(gz).digest('hex');
 await writeFile(file+'.sha256',`${sha256}  ${name}\n`,{mode:0o600});
 return {file,bytes:gz.length,sha256};
}

/** 이름의 KST 날짜 기준 keepDays 일보다 오래된 백업 삭제. 최신 3개는 항상 남김. return 지운 파일 이름 */
export async function prune(dir,keepDays,ms=Date.now()){
 let names;try{names=await readdir(dir);}catch{return [];}
 const files=names.filter(n=>FILE_RE.test(n)).sort();const keepNewest=new Set(files.slice(-3));
 const cutoff=kstStamp(ms-keepDays*86400000).date;const gone=[];
 for(const n of files){const d=FILE_RE.exec(n)[1];if(d<cutoff&&!keepNewest.has(n)){await unlink(path.join(dir,n)).catch(()=>{});await unlink(path.join(dir,n+'.sha256')).catch(()=>{});gone.push(n);}}
 for(const n of names)if(/\.tmp-[0-9a-f]{8}$/.test(n)){await unlink(path.join(dir,n)).catch(()=>{});}
 return gone;
}

export async function readBackup(file){
 const d=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
 if(d?.format!==FORMAT||d.version!==1)throw Error('BACKUP_FORMAT 이 파일은 trade-alert 서버 백업이 아닙니다');
 return d;
}

/** 앱 설정 → '기존 기록 가져오기'에 넣을 일지 JSON(클라우드 저장본 payload 그대로). return 만든 파일 목록 */
export async function extract(d,outDir){
 await mkdir(outDir,{recursive:true,mode:0o700});const made=[];const day=String(d.created_at||'').slice(0,10)||'backup';
 for(const [scope,label] of [['US','usd'],['HL','hyperliquid']]){
  const j=d.journals?.[scope];if(!j?.payload)continue;
  const f=path.join(outDir,`trade-journal-${label}-${day}-rev${j.revision}.json`);
  await writeFile(f,JSON.stringify(j.payload,null,2),{mode:0o600});made.push(f);
 }
 return made;
}

// ---- 복원 SQL ---------------------------------------------------------------------------
const TABLES=['risk_state','risk_days','risk_events','risk_flows','acct_snapshots','quick_reviews','hl_watch','kw_snapshots','hl_fills','hl_funding'];
const SKIP_COLS={hl_fills:['id'],hl_funding:['id']}; // generated always as identity → 새 번호
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function dollar(text){let tag;do{tag='$bk'+randomBytes(4).toString('hex')+'$';}while(text.includes(tag));return tag+text+tag;}
const ident=c=>{if(!/^[a-z_][a-z0-9_]*$/.test(c))throw Error('BACKUP_BAD_COLUMN '+c);return c;};

/** SQL Editor용 복원 스크립트. 서버 표 = 없는 행만 추가(on conflict do nothing). journal=true면 일지도:
 *  행이 없으면 만들고, 있고 내용이 다르면 journal_archive_and_write 로 교체(지금 것은 history에 보관 → 앱 '이전 버전'에서 되돌릴 수 있음). */
export function restoreSql(d,{journal=false,user=null,tables=TABLES,chunk=500}={}){
 const uid=user||d.user_id;if(!UUID_RE.test(String(uid||'')))throw Error('BACKUP_NO_USER');
 const remap=r=>('user_id' in r)?{...r,user_id:uid}:r;
 const L=[`-- trade-alert 서버 백업 복원 (${d.created_at}, 원래 user ${d.user_id}${user?' → '+uid:''}). 멱등: 다시 실행해도 같은 결과.`,
  '-- 서버 표는 백업에만 있는 행을 추가(이미 있는 행은 그대로). 실행 전 Supabase Database → Backups 도 확인하세요.','begin;'];
 const sets={...Object.fromEntries(Object.entries(d.server||{})),kw_snapshots:d.kw_snapshots,hl_fills:d.hl_fills,hl_funding:d.hl_funding};
 for(const t of tables){
  const rows=(sets[t]||[]).map(remap);if(!rows.length)continue;
  const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(c=>!(SKIP_COLS[t]||[]).includes(c)).map(ident);
  for(let i=0;i<rows.length;i+=chunk){
   const part=rows.slice(i,i+chunk).map(r=>Object.fromEntries(cols.map(c=>[c,r[c]])));
   L.push(`insert into public.${t} (${cols.join(', ')}) select ${cols.join(', ')} from jsonb_populate_recordset(null::public.${t}, ${dollar(JSON.stringify(part))}::jsonb) on conflict do nothing;`);
  }
 }
 if(journal)for(const scope of ['US','HL']){
  const j=d.journals?.[scope];if(!j?.payload)continue;const p=dollar(JSON.stringify(j.payload));
  L.push(`-- 일지 ${scope} (백업 당시 revision ${j.revision})`);
  L.push(`create temp table if not exists _bk_journal(scope text primary key, payload jsonb not null) on commit drop;`);
  L.push(`insert into _bk_journal values ('${scope}', ${p}::jsonb) on conflict (scope) do update set payload = excluded.payload;`);
  L.push(`insert into public.journal_cloud(user_id, scope, revision, payload, updated_at) select '${uid}'::uuid, '${scope}', 1, b.payload, now() from _bk_journal b where b.scope = '${scope}' on conflict (user_id, scope) do nothing;`);
  L.push(`select public.journal_archive_and_write(j.user_id, j.scope, j.revision, j.payload, j.updated_at, b.payload) as new_revision_${scope.toLowerCase()} from public.journal_cloud j join _bk_journal b on b.scope = j.scope where j.user_id = '${uid}'::uuid and j.scope = '${scope}' and j.payload is distinct from b.payload;`);
 }
 L.push('commit;');return L.join('\n')+'\n';
}

// ---- 실행 ---------------------------------------------------------------------------------
function explain(e){if(e.message==='CONFIG_SECRET_KEY_REFUSED')return 'SUPABASE_KEY에 secret/service_role 키를 넣지 마세요(sb_publishable_…만).';if(e.message==='CONFIG_INCOMPLETE')return '.env 값이 비었거나 형식이 다릅니다: '+e.fields.join(', ');if(/SQL_NOT_INSTALLED/.test(e.message))return 'Supabase에 alert13.sql(backup_dump)이 아직 없습니다 → SQL Editor에서 실행';if(/TOKEN_REJECTED/.test(e.message))return '수집기 토큰이 거부됨(앱에서 토큰을 다시 만들었으면 .env KW_COLLECTOR_TOKEN 갱신)';if(/daily_limit/.test(e.message))return '하루 호출 한도(400회) 초과 — 내일 다시';return String(e.message||e);}
const fmtBytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(0)+' KB';

export async function runBackup(env,{fetcher=fetch,now=Date.now,sleep,log=makeLogger(env),notify=true}={}){
 let cfg;try{cfg=readBackupConfig(env);}catch(e){log('ERROR',explain(e));return 2;}
 const tg=cfg.telegram&&notify&&cfg.notify!=='0'?new Telegram(cfg.telegram.bot,cfg.telegram.chat,fetcher,undefined,{html:cfg.telegram.html}):null;
 const t0=now();
 try{
  const rpc=new SupabaseRpc({supabaseUrl:cfg.supabaseUrl,supabaseKey:cfg.supabaseKey},fetcher,sleep);
  const dump=await collect(rpc,cfg.token,{photos:cfg.photos,sleep,now,log});
  const w=await writeBackup(cfg.dir,dump,t0);const gone=await prune(cfg.dir,cfg.keepDays,t0);const s=summary(dump);
  const line=`백업 완료 ${path.basename(w.file)} · ${fmtBytes(w.bytes)} · US ${s.us?`rev ${s.us.revision} 거래 ${s.us.trades}`:'없음'} · HL ${s.hl?`rev ${s.hl.revision} 거래 ${s.hl.trades}`:'없음'} · 키움 스냅샷 ${s.kw_snapshots} · HL 체결 ${s.hl_fills} · 펀딩 ${s.hl_funding} · 사진 ${s.photos==='included'?'포함':'제외 '+s.photos_removed}${gone.length?` · 오래된 백업 ${gone.length}개 삭제`:''} · 호출 ${dump.calls}회 · ${Math.round((now()-t0)/1000)}초`;
  log('INFO',line);
  if(tg&&cfg.notify==='always'){try{await tg.send('💾 매매일지 서버 백업\n\n'+line);}catch(e){log('WARN','텔레그램 알림 실패: '+e.message);}}
  return 0;
 }catch(e){
  const msg=explain(e);log('ERROR','백업 실패: '+msg);
  if(tg){try{await tg.send('⚠️ 매매일지 서버 백업 실패\n\n'+msg+'\n로그: sudo journalctl -u trade-alert-backup -n 20 --no-pager');}catch(e2){log('WARN','텔레그램 알림 실패: '+e2.message);}}
  return 1;
 }
}

export async function main(argv=process.argv.slice(2),env=process.env){
 if(argv.includes('--version')){console.log(VERSION);return 0;}
 const ei=argv.indexOf('--extract');
 if(ei>=0){const f=argv[ei+1],o=argv[ei+2];if(!f||!o){console.log('사용법: --extract <백업.json.gz> <출력폴더>');return 2;}
  const d=await readBackup(f);const made=await extract(d,o);
  console.log(made.length?'만든 파일(앱 설정 → 백업과 이전 → 기존 기록 가져오기):\n  '+made.join('\n  '):'이 백업에는 클라우드 일지가 없습니다.');
  if(d.photos!=='included')console.log('주의: 이 백업은 사진 제외(BACKUP_PHOTOS=0)로 만들어졌습니다.');return 0;}
 const ri=argv.indexOf('--restore-sql');
 if(ri>=0){const f=argv[ri+1];if(!f){console.log('사용법: --restore-sql <백업.json.gz> [--journal] [--user <uuid>] > restore.sql');return 2;}
  const ui=argv.indexOf('--user');const d=await readBackup(f);process.stdout.write(restoreSql(d,{journal:argv.includes('--journal'),user:ui>=0?argv[ui+1]:null}));return 0;}
 if(argv.includes('--list')){
  let cfg;try{cfg=readBackupConfig(env);}catch(e){console.log(explain(e));return 2;}
  let names=[];try{names=(await readdir(cfg.dir)).filter(n=>FILE_RE.test(n)).sort();}catch{}
  if(!names.length){console.log('백업 없음: '+cfg.dir);return 0;}
  for(const n of names){const st=await stat(path.join(cfg.dir,n));console.log(`${n}  ${fmtBytes(st.size)}`);}
  console.log(`${names.length}개 · ${cfg.dir} · 보관 ${cfg.keepDays}일`);return 0;}
 return runBackup(env);
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 main().then(code=>{if(code)process.exitCode=code;},e=>{console.error('ERROR '+String(e?.message||e));process.exitCode=1;});
}
