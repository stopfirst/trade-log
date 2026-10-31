// trade-alert 2.9.0 (alert13): 서버 일일 백업 — 설정·수집(페이지)·사진 제외·저장/보관·추출·복원 SQL·실패 알림
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readdir,writeFile,readFile,stat} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import * as bk from '../src/backup.mjs';import {VERSION} from '../src/alert.mjs';

const TOKEN='kwc_'+'A'.repeat(43),UID='11111111-1111-1111-1111-111111111111';
const ENV={SUPABASE_URL:'https://ktndayhrlhrlxtkirrvx.supabase.co',SUPABASE_KEY:'sb_publishable_testtesttesttest1234',KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:'123456:'+'b'.repeat(35),TELEGRAM_CHAT_ID:'42'};
const PHOTO='data:image/png;base64,iVBORw0KGgo=';

// 가짜 backup_dump 서버: kw 130행(60씩), fills 4100행(2000씩)
function fakeServer({fills=4100,kw=130,failPart=null,rateOnce=false}={}){
 const calls=[];let rated=false;
 const journal=s=>({scope:s,revision:s==='US'?7:3,updated_at:'2026-10-31T00:00:00Z',payload:{format:s==='US'?'trade-journal-usd':'trade-journal-hyperliquid',settings:{},trades:[{id:'t1',images:[{data:PHOTO}],chart:PHOTO,note:'메모'}]}});
 const page=(n,after,size,key)=>{const all=Array.from({length:n},(_,i)=>({[key]:i+1,user_id:UID,raw:{i}}));const rows=all.filter(r=>r[key]>after).slice(0,size);return {rows,next:rows.length===size?rows.at(-1)[key]:null};};
 return {calls,rpc:{call:async(name,b)=>{
  assert.equal(name,'backup_dump');assert.equal(b.p_token,TOKEN);calls.push(b.p_part+(b.p_scope?':'+b.p_scope:'')+(b.p_after?'@'+b.p_after:''));
  if(rateOnce&&!rated&&b.p_part==='server'){rated=true;throw Error('SUPABASE_REJECTED_rate_limited');}
  if(b.p_part===failPart)throw Error('SUPABASE_SQL_NOT_INSTALLED');
  const base={ok:true,version:13,user_id:UID};
  switch(b.p_part){
   case 'meta':return {...base,journals:[{scope:'US',revision:7}],history_versions:2,kw_snapshots:kw,hl_address:'0x'+'a'.repeat(40),tables:{risk:true}};
   case 'journal':return {...base,journal:journal(b.p_scope)};
   case 'history':return {...base,history:[{id:1,revision:6}]};
   case 'server':return {...base,tables:{risk_days:[{user_id:UID,market:'hl',day:'2026-10-30',rec:{a:1},updated_at:'x'}],risk_state:[]}};
   case 'kw_snapshots':return {...base,...page(kw,b.p_after,60,'seq')};
   case 'hl_fills':return {...base,...page(fills,b.p_after,2000,'id')};
   case 'hl_funding':return {...base,rows:[],next:null};
  }
  throw Error('unexpected '+b.p_part);
 }}};
}
const noSleep=async()=>{};

test('버전 2.9.0',()=>{assert.equal(VERSION,'2.9.0');});

test('설정: 기본값 · secret 키 거부 · 잘못된 값', ()=>{
 const c=bk.readBackupConfig(ENV);assert.equal(c.dir,'/opt/trade-alert/backups');assert.equal(c.keepDays,30);assert.equal(c.photos,true);assert.equal(c.notify,'fail');assert.ok(c.telegram);
 assert.throws(()=>bk.readBackupConfig({...ENV,SUPABASE_KEY:'sb_secret_abcdefghijklmnop'}),/CONFIG_SECRET_KEY_REFUSED/);
 const jwt=r=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:r})).toString('base64url')+'.sig';
 assert.throws(()=>bk.readBackupConfig({...ENV,SUPABASE_KEY:jwt('service_role')}),/CONFIG_SECRET_KEY_REFUSED/);
 assert.ok(bk.readBackupConfig({...ENV,SUPABASE_KEY:jwt('anon')}));
 assert.throws(()=>bk.readBackupConfig({...ENV,BACKUP_KEEP_DAYS:'0'}),e=>e.fields.some(f=>/KEEP/.test(f)));
 assert.throws(()=>bk.readBackupConfig({...ENV,BACKUP_DIR:'rel/dir'}),e=>e.fields.some(f=>/BACKUP_DIR/.test(f)));
 assert.throws(()=>bk.readBackupConfig({...ENV,KW_COLLECTOR_TOKEN:'x'}),e=>e.fields.includes('KW_COLLECTOR_TOKEN'));
 assert.equal(bk.readBackupConfig({...ENV,BACKUP_PHOTOS:'0'}).photos,false);
 assert.equal(bk.readBackupConfig({...ENV,TELEGRAM_BOT_TOKEN:''}).telegram,null,'텔레그램 없이도 백업은 됨');
});

test('수집: 모든 부분·페이지 끝까지, 호출 사이 간격, 사진 포함', async()=>{
 const f=fakeServer();const sleeps=[];
 const d=await bk.collect(f.rpc,TOKEN,{sleep:async ms=>{sleeps.push(ms);},now:()=>Date.parse('2026-11-01T00:00:00Z')});
 assert.equal(d.format,bk.FORMAT);assert.equal(d.user_id,UID);assert.equal(d.kw_snapshots.length,130);assert.equal(d.hl_fills.length,4100);
 assert.deepEqual(f.calls,['meta','journal:US','history:US','journal:HL','history:HL','server','kw_snapshots','kw_snapshots@60','kw_snapshots@120','hl_fills','hl_fills@2000','hl_fills@4000','hl_funding']);
 assert.equal(sleeps.length,f.calls.length-1);assert.ok(sleeps.every(ms=>ms===2500),'분당 한도 나눠 쓰기: 2.5초 간격');
 assert.equal(d.journals.US.payload.trades[0].images[0].data,PHOTO);assert.equal(d.photos,'included');
 const s=bk.summary(d);assert.equal(s.us.revision,7);assert.equal(s.hl.trades,1);assert.equal(s.risk_days,1);
});

test('수집: BACKUP_PHOTOS=0 → data:image 문자열만 표시로 바꿈, 메모는 그대로', async()=>{
 const d=await bk.collect(fakeServer({fills:0,kw:0}).rpc,TOKEN,{photos:false,sleep:noSleep});
 const t=d.journals.US.payload.trades[0];assert.equal(t.images[0].data,bk.PHOTO_MARK);assert.equal(t.chart,bk.PHOTO_MARK);assert.equal(t.note,'메모');
 assert.equal(d.photos_removed,4);assert.equal(d.photos,'removed');
});

test('수집: rate_limited 한 번이면 65초 기다렸다 다시 · SQL 미설치면 실패', async()=>{
 const sleeps=[];const d=await bk.collect(fakeServer({fills:0,kw:0,rateOnce:true}).rpc,TOKEN,{sleep:async ms=>{sleeps.push(ms);}});
 assert.ok(sleeps.includes(65000));assert.ok(d.server.risk_days);
 await assert.rejects(bk.collect(fakeServer({failPart:'meta'}).rpc,TOKEN,{sleep:noSleep}),/SQL_NOT_INSTALLED/);
});

test('수집: 커서가 줄지 않으면 무한 반복 대신 오류', async()=>{
 const rpc={call:async(n,b)=>b.p_part==='kw_snapshots'?{ok:true,rows:[{seq:1}],next:0}:b.p_part==='meta'?{ok:true,user_id:UID}:b.p_part==='journal'?{ok:true,journal:null}:b.p_part==='history'?{ok:true,history:[]}:b.p_part==='server'?{ok:true,tables:{}}:{ok:true,rows:[],next:null}};
 await assert.rejects(bk.collect(rpc,TOKEN,{sleep:noSleep}),/BACKUP_BAD_CURSOR/);
});

test('저장: gzip JSON 0600 · KST 날짜 이름 · sha256 · 다시 읽기', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bk-'));const d=await bk.collect(fakeServer({fills:10,kw:3}).rpc,TOKEN,{sleep:noSleep});
 const ms=Date.parse('2026-10-31T21:40:00Z'); // KST 11/01 06:40
 const w=await bk.writeBackup(dir,d,ms);assert.equal(path.basename(w.file),'trade-journal-2026-11-01-0640.json.gz');
 assert.equal((await stat(w.file)).mode&0o777,0o600);
 const buf=await readFile(w.file);assert.equal(createHash('sha256').update(buf).digest('hex'),w.sha256);
 assert.match(await readFile(w.file+'.sha256','utf8'),new RegExp('^'+w.sha256+'  trade-journal-2026-11-01-0640.json.gz'));
 const back=await bk.readBackup(w.file);assert.deepEqual(back,JSON.parse(gunzipSync(buf).toString()));assert.equal(back.hl_fills.length,10);
 const junk=path.join(dir,'x.json.gz');await writeFile(junk,Buffer.from('1f8b','hex'));await assert.rejects(bk.readBackup(junk));
});

test('보관: 30일 넘은 것만 삭제, 최신 3개는 항상 남김, 다른 파일·임시 파일 처리', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bk-'));
 const names=['2026-09-01-0640','2026-09-30-0640','2026-10-01-0640','2026-10-02-0640','2026-10-31-0640'].map(s=>`trade-journal-${s}.json.gz`);
 for(const n of names){await writeFile(path.join(dir,n),'x');await writeFile(path.join(dir,n+'.sha256'),'x');}
 await writeFile(path.join(dir,'notes.txt'),'keep');await writeFile(path.join(dir,names[4]+'.tmp-0a1b2c3d'),'partial');
 const gone=await bk.prune(dir,30,Date.parse('2026-10-31T21:40:00Z')); // KST 11/01 → 기준 10/02
 assert.deepEqual(gone,[names[0],names[1]],'최신 3개(10/01,10/02,10/31) 남김');
 const left=(await readdir(dir)).sort();assert.ok(left.includes('notes.txt'));assert.ok(!left.some(n=>n.includes('.tmp-')));
 assert.ok(left.includes(names[2])&&!left.includes(names[0]+'.sha256'));
 const gone2=await bk.prune(dir,1,Date.parse('2026-12-31T00:00:00Z'));assert.equal(gone2.length,0,'3개 이하면 아무것도 안 지움');
});

test('추출: 일지별 앱 가져오기 JSON (payload 그대로)', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bk-'));const d=await bk.collect(fakeServer({fills:0,kw:0}).rpc,TOKEN,{sleep:noSleep,now:()=>Date.parse('2026-11-01T00:00:00Z')});
 const made=await bk.extract(d,dir);assert.deepEqual(made.map(f=>path.basename(f)),['trade-journal-usd-2026-11-01-rev7.json','trade-journal-hyperliquid-2026-11-01-rev3.json']);
 assert.deepEqual(JSON.parse(await readFile(made[0],'utf8')),d.journals.US.payload);
});

test('복원 SQL: 표마다 on conflict do nothing · identity id 제외 · 사용자 바꾸기 · 일지는 archive_and_write', async()=>{
 const d=await bk.collect(fakeServer({fills:3,kw:2}).rpc,TOKEN,{sleep:noSleep});
 const sql=bk.restoreSql(d);assert.match(sql,/^-- trade-alert 서버 백업 복원/);assert.match(sql,/begin;[\s\S]*commit;\n$/);
 assert.match(sql,/insert into public\.risk_days \(user_id, market, day, rec, updated_at\) select .* from jsonb_populate_recordset\(null::public\.risk_days, \$bk[0-9a-f]{8}\$/);
 assert.match(sql,/insert into public\.hl_fills \(user_id, raw\)/,'hl_fills id 제외');assert.ok(!/journal_cloud/.test(sql),'기본은 일지 제외');
 const sql2=bk.restoreSql(d,{journal:true,user:'22222222-2222-2222-2222-222222222222'});
 assert.ok(sql2.includes('22222222-2222-2222-2222-222222222222')&&!sql2.includes('"user_id":"'+UID+'"'));assert.match(sql2,/journal_archive_and_write/);
 assert.throws(()=>bk.restoreSql({...d,user_id:'nope'}),/BACKUP_NO_USER/);
 assert.throws(()=>bk.restoreSql({...d,server:{risk_days:[{'bad col':1,user_id:UID}]}}),/BACKUP_BAD_COLUMN/);
});

test('runBackup: 성공 = 파일 + 요약 로그(비밀 없음) · 실패 = 텔레그램 1회 + 종료 코드 1', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bk-'));const logs=[];const sent=[];
 const f=fakeServer({fills:5,kw:2});
 const resp=body=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const fetcher=async(url,opt)=>{if(url.includes('api.telegram.org')){sent.push(JSON.parse(opt.body).text);return resp({ok:true,result:{}});}
  const b=JSON.parse(opt.body);return resp(await f.rpc.call('backup_dump',b));};
 const code=await bk.runBackup({...ENV,BACKUP_DIR:dir},{fetcher,sleep:noSleep,log:(l,m)=>logs.push(l+' '+m)});
 assert.equal(code,0);const files=(await readdir(dir)).filter(n=>bk.FILE_RE.test(n));assert.equal(files.length,1);
 assert.match(logs.join('\n'),/백업 완료 .* US rev 7 거래 1 .* HL 체결 5/);assert.ok(!logs.join('').includes(TOKEN));assert.equal(sent.length,0,'fail 모드: 성공 땐 알림 없음');
 const bad=async(url,opt)=>{if(url.includes('api.telegram.org')){sent.push(JSON.parse(opt.body).text);return resp({ok:true,result:{}});}return {ok:false,status:404,text:async()=>JSON.stringify({message:'Could not find the function public.backup_dump'})};};
 const code2=await bk.runBackup({...ENV,BACKUP_DIR:dir},{fetcher:bad,sleep:noSleep,log:(l,m)=>logs.push(l+' '+m)});
 assert.equal(code2,1);assert.equal(sent.length,1);assert.match(sent[0],/백업 실패[\s\S]*alert13\.sql/);
 assert.equal(await bk.runBackup({...ENV,SUPABASE_KEY:'sb_secret_abcdefghijklmnop'},{fetcher,log:()=>{}}),2);
});
