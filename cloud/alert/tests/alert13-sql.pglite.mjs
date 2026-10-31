/* SQL test for alert13.sql (backup_dump) + 복원 SQL 왕복 + cloud/security/harden-2026-11.sql(+undo).
   node tests/alert13-sql.pglite.mjs <cloud 폴더>   (cloud.sql, kiwoom-collector.sql, hl-collector.sql, balance-snapshot.sql,
   alert2.sql, alert3.sql, alert5.sql, alert9.sql, alert11.sql, alert13.sql, security/harden-2026-11.sql, security/harden-2026-11-undo.sql)
   Supabase 기본 권한(새 테이블·시퀀스·함수를 anon/authenticated 에 자동 GRANT)을 흉내 낸 상태에서 검사. */
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
import * as bk from '../src/backup.mjs';
const C=process.argv[2];if(!C){console.error('usage: node tests/alert13-sql.pglite.mjs <cloud dir>');process.exit(2);}
const read=f=>fs.readFileSync(path.join(C,f),'utf8');const noExt=s=>s.split('\n').filter(l=>!l.includes('-- @extension')).join('\n');
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222',A1='0x'+'a'.repeat(40),A2='0x'+'b'.repeat(40);
const PRE=`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values('${U1}'),('${U2}');`;
const MOCKS=`create schema net; grant usage on schema net to anon, authenticated;
create table net._http_response(id bigint primary key,status_code int,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz not null default now());
create table net.requests(id bigserial primary key,url text,body jsonb);
create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds int default 5000) returns bigint language sql security definer as $$ insert into net.requests(url,body) values(url,body) returning id $$;
grant execute on function net.http_post(text,jsonb,jsonb,jsonb,int) to anon, authenticated;
create schema cron; create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean not null default true);
create function cron.schedule(job_name text,schedule text,command text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) on conflict(jobname) do update set schedule=excluded.schedule returning jobid $$;`;
let passed=0;const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exit(1);}passed++;console.log('ok',m);};
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const PHOTO='data:image/png;base64,iVBORw0KGgo=';

async function setup(){
 const db=new PGlite();await db.exec(PRE);await db.exec(MOCKS);
 await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));await db.exec(noExt(read('hl-collector.sql')));await db.exec(noExt(read('balance-snapshot.sql')));
 for(const f of ['alert2.sql','alert3.sql','alert5.sql','alert9.sql','alert11.sql','alert13.sql','alert13.sql'])await db.exec(read(f));
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const err=async(user,q,params=[])=>{try{await as(user,q,params);return '';}catch(e){return e.message;}};
 const sys=async(q,p=[])=>(await db.query(q,p)).rows;
 return {db,as,err,sys};
}
const payload=(scope,n,extra={})=>({format:scope==='HL'?'trade-journal-hyperliquid':'trade-journal-usd',currency:scope==='HL'?'USDC':'USD',settings:{account:1000},
 trades:Array.from({length:n},(_,i)=>({id:scope+i,name:'T'+i,images:[{data:PHOTO}],entryNote:'비밀 메모 '+i})),...extra});

async function seed(t){
 const {as,sys}=t;const T1=newToken(),T2=newToken();
 await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 ok((await as(U1,"select public.journal_cas('US',0,$1::jsonb) r",[JSON.stringify(payload('US',2))]))[0].r===1,'앱 저장(journal_cas) US rev 1');
 ok((await as(U1,"select public.journal_cas('US',1,$1::jsonb) r",[JSON.stringify(payload('US',3))]))[0].r===2,'앱 저장 US rev 2 (rev 1 → history)');
 await as(U1,"select public.journal_cas('HL',0,$1::jsonb)",[JSON.stringify(payload('HL',1))]);
 await as(U2,"select public.journal_cas('US',0,$1::jsonb)",[JSON.stringify(payload('US',1,{settings:{account:'OTHERUSER'}}))]);
 await sys(`insert into public.kw_snapshots(user_id,order_date,account,as_of,snapshot) select $1, date '2026-01-01' + g, '0123456789abcdef', 1700000000000+g, jsonb_build_object('n',g) from generate_series(1,130) g`,[U1]);
 await sys(`insert into public.kw_snapshots(user_id,order_date,account,as_of,snapshot) values ($1,'2026-10-30','fedcba9876543210',1,'{"other":true}')`,[U2]);
 await as(U1,'select public.hl_set_address($1)',[A1]);await as(U2,'select public.hl_set_address($1)',[A2]);
 await sys(`insert into public.hl_fills(address,tid,time,coin,raw) select $1, g, 1700000000000+g, 'BTC', jsonb_build_object('tid',g,'closedPnl','1.5') from generate_series(1,4100) g`,[A1]);
 await sys(`insert into public.hl_fills(address,tid,time,coin,raw) values ($1,1,1,'SOL','{"otheruser":true}')`,[A2]);
 await sys(`insert into public.hl_funding(address,time,coin,raw) select $1, 1700000000000+g, 'ETH', jsonb_build_object('g',g) from generate_series(1,5) g`,[A1]);
 await sys(`insert into public.risk_state(user_id,market,status,engine) values ($1,'hl','{"stopped":false}','{"v":1}'),($2,'hl','{"otheruser":true}','{}')`,[U1,U2]);
 await sys(`insert into public.risk_days(user_id,market,day,rec) values ($1,'hl','2026-10-30','{"pnl":-1}'),($1,'us','2026-10-30','{"pnl":2}')`,[U1]);
 await sys(`insert into public.risk_events(user_id,market,ref,kind,rule,at) values ($1,'hl','stop:1','stop','day',now())`,[U1]);
 await sys(`insert into public.risk_flows(user_id,market,ref,at,amount,kind,source) values ($1,'hl','flow:1',now(),100,'입금','manual')`,[U1]);
 await sys(`insert into public.acct_snapshots(user_id,market,day,value,source) values ($1,'hl','2026-10-30',1950,'close')`,[U1]);
 await sys(`insert into public.quick_reviews(user_id,ref,market,symbol,direction,close_key,close_at,decision) values ($1,'hl:9','hl','BTC','long','9',now(),'compliant')`,[U1]);
 return {T1,T2};
}
const dump=(t,token,part,scope=null,after=null)=>t.as(null,'select public.backup_dump($1,$2,$3,$4) r',[token,part,scope,after]).then(x=>x[0].r);
const counts=async(sys,user)=>Object.fromEntries(await Promise.all(['kw_snapshots','risk_state','risk_days','risk_events','risk_flows','acct_snapshots','quick_reviews','hl_watch'].map(async tb=>[tb,Number((await sys(`select count(*) n from public.${tb} where user_id=$1`,[user]))[0].n)])));

// ---- A. backup_dump ----------------------------------------------------------------------
const t=await setup();const {T1,T2}=await seed(t);
{
 const m=await dump(t,T1,'meta');
 ok(m.ok&&m.version===13&&m.user_id===U1,'meta: anon + 토큰 · version 13');
 ok(m.journals.length===2&&m.journals.find(j=>j.scope==='US').revision===2&&m.journals.find(j=>j.scope==='US').trades===3,'meta: 일지 revision·거래 수');
 ok(m.history_versions===1&&m.kw_snapshots===130&&m.hl_address===A1&&m.hl_fills===4100&&m.hl_funding===5,'meta: 개수');
 const j=await dump(t,T1,'journal','US');
 ok(j.journal.revision===2&&j.journal.payload.trades.length===3&&j.journal.payload.trades[0].images[0].data===PHOTO,'journal: 전체 payload(사진·메모 포함)');
 ok((await dump(t,T1,'journal','HL')).journal.payload.trades.length===1,'journal HL');
 const h=await dump(t,T1,'history','US');ok(h.history.length===1&&h.history[0].revision===1&&!('payload' in h.history[0])&&h.history[0].bytes>0,'history: 목록만(payload 없음)');
 const s=await dump(t,T1,'server');const st=JSON.stringify(s);
 ok(s.tables.risk_days.length===2&&s.tables.risk_state.length===1&&s.tables.risk_events.length===1&&s.tables.risk_flows.length===1&&s.tables.acct_snapshots.length===1&&s.tables.quick_reviews.length===1&&s.tables.hl_watch.length===1,'server: 표마다 자기 행');
 ok(!st.includes('token_hash')&&!st.includes(hash(T1))&&!st.includes('otheruser'),'server: kw_collector(토큰 해시)·다른 사용자 없음');
 const p1=await dump(t,T1,'kw_snapshots',null,0),p2=await dump(t,T1,'kw_snapshots',null,p1.next),p3=await dump(t,T1,'kw_snapshots',null,p2.next);
 ok(p1.rows.length===60&&p2.rows.length===60&&p3.rows.length===10&&p3.next===null&&p1.rows[0].seq<p2.rows[0].seq,'kw_snapshots: 60행씩 페이지, 끝이면 next=null');
 const f1=await dump(t,T1,'hl_fills',null,0);ok(f1.rows.length===2000&&f1.next!==null&&!JSON.stringify(f1).includes('otheruser'),'hl_fills: 2000행 페이지 · 내 주소만');
 ok((await dump(t,T2,'journal','US')).journal.payload.settings.account==='OTHERUSER'&&(await dump(t,T2,'hl_fills',null,0)).rows.length===1,'다른 토큰 = 그 사용자 데이터만');
 ok(/invalid collector token/.test(await t.err(null,'select public.backup_dump($1,$2)',[newToken(),'meta'])),'모르는 토큰 거부');
 ok((await dump(t,T1,'everything')).error==='bad_part'&&(await dump(t,T1,'journal','XX')).error==='bad_scope','잘못된 part/scope 거부');
 await t.sys(`update public.kw_collector set window_count=60, window_start=now() where user_id=$1`,[U1]);
 ok((await dump(t,T1,'meta')).error==='rate_limited','분당 60회 공유 한도');
 await t.sys(`update public.kw_collector set window_count=0 where user_id=$1`,[U1]);
 await t.sys(`update public.backup_log set day_count=400 where user_id=$1`,[U1]);
 ok((await dump(t,T1,'meta')).error==='daily_limit','하루 400회 한도');
 await t.sys(`update public.backup_log set day_count=0 where user_id=$1`,[U1]);
 ok(/permission denied/.test(await t.err(null,'select * from public.backup_log')),'anon 은 backup_log 못 읽음');
 const bl=await t.as(U1,'select user_id from public.backup_log');ok(bl.length===1&&bl[0].user_id===U1,'로그인 사용자는 자기 backup_log 만');
 ok(/permission denied/.test(await t.err(U1,"update public.backup_log set day_count=0")),'backup_log 쓰기 권한 없음');
 ok(/permission denied/.test(await t.err(null,'select public.kw_auth($1)',[T1])),'kw_auth 직접 호출 불가(Supabase 기본 권한 상태에서도)');
}

// ---- B. 전체 수집 → 복원 SQL → 빈 DB 에 복원 ---------------------------------------------------
const rpc={call:async(name,b)=>{const r=(await t.as(null,`select public.${name}($1,$2,$3,$4) r`,[b.p_token,b.p_part,b.p_scope,b.p_after]))[0].r;if(r.ok===false)throw Error('SUPABASE_REJECTED_'+r.error);return r;}};
const D=await bk.collect(rpc,T1,{sleep:async()=>{}});
ok(D.kw_snapshots.length===130&&D.hl_fills.length===4100&&D.hl_funding.length===5&&D.journals.US.revision===2&&D.history.US.length===1,'collect: 실제 SQL 상대로 전부 수집 ('+D.calls+'회 호출)');
{
 const t2=await setup();await t2.as(U1,'select public.hl_set_address($1)',[A1]); // 복원 대상 프로젝트에 같은 사용자·주소
 const sql=bk.restoreSql(D,{journal:true});await t2.db.exec(sql);
 const c1=await counts(t.sys,U1),c2=await counts(t2.sys,U1);ok(JSON.stringify(c1)===JSON.stringify(c2),'복원: 표별 행 수 같음 '+JSON.stringify(c2));
 const fx=async(s)=>(await s(`select tid,time,raw from public.hl_fills where address=$1 order by tid`,[A1])).map(r=>JSON.stringify(r)).join();
 ok(await fx(t.sys)===await fx(t2.sys),'복원: hl_fills 내용 같음(id 는 새로 매김)');
 const ks=async s=>JSON.stringify(await s(`select order_date,account,as_of,snapshot from public.kw_snapshots where user_id=$1 order by order_date`,[U1]));ok(await ks(t.sys)===await ks(t2.sys),'복원: kw_snapshots 내용 같음');
 const j2=(await t2.sys(`select revision,payload from public.journal_cloud where user_id=$1 and scope='US'`,[U1]))[0];
 ok(j2.payload.trades.length===3&&j2.payload.trades[0].images[0].data===PHOTO,'복원 --journal: 비어 있던 일지 생성(사진 포함)');
 await t2.db.exec(sql);ok(JSON.stringify(await counts(t2.sys,U1))===JSON.stringify(c2)&&Number((await t2.sys('select count(*) n from public.journal_cloud_history'))[0].n)===0,'복원 SQL 다시 실행 = 변화 없음(멱등)');
 await t2.as(U1,"select public.journal_cas('US',1,$1::jsonb)",[JSON.stringify(payload('US',9))]);
 await t2.db.exec(sql);
 const j3=(await t2.sys(`select revision,payload from public.journal_cloud where user_id=$1 and scope='US'`,[U1]))[0];
 const hist=await t2.sys(`select revision,payload from public.journal_cloud_history where user_id=$1 and scope='US' order by revision`,[U1]);
 ok(j3.payload.trades.length===3&&j3.revision===3&&hist.at(-1).payload.trades.length===9,'복원 --journal: 바뀐 일지는 백업본으로 교체, 바뀐 것은 history 에 보관(앱에서 되돌릴 수 있음)');
 const t3=await setup();await t3.db.exec(bk.restoreSql({...D,server:{},kw_snapshots:[],hl_fills:[],hl_funding:[]},{user:U2,journal:true}));
 ok(Number((await t3.sys(`select count(*) n from public.journal_cloud where user_id=$1`,[U2]))[0].n)===2,'--user: 다른 사용자 id 로 복원');
}

// ---- C. 보안 보강 SQL ---------------------------------------------------------------------
{
 const {sys,err,as}=t;const H=read('security/harden-2026-11.sql'),UNDO=read('security/harden-2026-11-undo.sql');
 await sys(`create function public.leaky() returns int language sql security definer set search_path='' as $$ select 1 $$`); // 기본 권한으로 anon 에 열림
 await t.db.exec(`create function public.nopath() returns int language sql security definer as $$ select 2 $$; revoke all on function public.nopath() from public, anon, authenticated;`);
 await sys(`create table public.unprotected(x int)`);
 ok(!(await err(null,'select public.leaky()')),'보강 전: 실수로 열린 security definer 를 anon 이 부를 수 있음(시연)');
 const seqAnon=async()=>(await sys(`select has_sequence_privilege('anon','public.hl_fills_id_seq','usage') u`))[0].u;
 ok(await seqAnon(),'보강 전: identity 시퀀스에 anon 권한(Supabase 기본값)');
 ok(!(await err(null,"select net.http_post('https://x')")),'보강 전: anon 이 net.http_post 직접 호출 가능(시연)');
 await t.db.exec(H);await t.db.exec(H);ok(true,'보강 SQL 두 번 실행 — 멱등');
 ok(/permission denied/.test(await err(null,'select public.leaky()'))&&/permission denied/.test(await err(U1,'select public.leaky()')),'보강 후: 허용 목록 밖 security definer 회수(anon·authenticated)');
 ok(!(await seqAnon()),'보강 후: 시퀀스 권한 회수');
 ok(/permission denied/.test(await err(null,"select net.http_post('https://x')")),'보강 후: net.* 직접 호출 불가');
 ok((await dump(t,T1,'meta')).ok,'보강 후: backup_dump(anon+토큰) 그대로');
 ok(/invalid collector token/.test(await err(null,'select public.kw_push($1,$2::jsonb)',[newToken(),'{}'])),'보강 후: kw_push 그대로 anon 허용(토큰 검사로 거부)');
 ok(/permission denied/.test(await err(null,"select public.journal_cas('US',2,'{}'::jsonb)")),'보강 후: journal_cas anon 불가');
 ok((await as(U1,"select public.journal_cas('US',2,$1::jsonb) r",[JSON.stringify(payload('US',4))]))[0].r===3,'보강 후: 앱 저장(journal_cas, authenticated) 정상');
 ok((await as(U1,'select public.kw_status() r'))[0].r.registered===true&&(await as(U1,'select public.hl_status() r'))[0].r,'보강 후: kw_status·hl_status 정상');
 ok((await as(U1,'select count(*) n, count(*) filter (where user_id<>auth.uid()) o from public.journal_cloud')).every(r=>r.n==2&&r.o==0),'보강 후: RLS 로 자기 일지만 보임');
 await sys(`create function public.after_harden() returns int language sql as $$ select 3 $$`);
 ok(/permission denied/.test(await err(null,'select public.after_harden()')),'보강 후 새로 만든 함수 = 기본 비공개(기본 권한 변경)');
 const rep=await sys(H.slice(H.indexOf('select kind, obj from (')));
 ok(rep.some(r=>r.kind==='RLS 꺼진 public 테이블'&&r.obj==='unprotected')&&rep.some(r=>r.kind==='search_path 없는 security definer'&&/nopath/.test(r.obj))&&rep.some(r=>r.kind==='OK'),'점검표: RLS 꺼진 표·search_path 없는 함수 보고');
 const anonFns=rep.filter(r=>r.kind.startsWith('anon 실행')).map(r=>r.obj.split('(')[0]).sort();
 ok(anonFns.join()==='backup_dump,kw_heartbeat,kw_push,kw_push_balance,quick_review_push,review_gaps,risk_day_data,risk_push,risk_status','점검표: anon 실행 가능 = 토큰 함수 9개뿐 ('+anonFns.join(',')+')');
 ok(!(await sys(`select relrowsecurity r from pg_class where oid='public.unprotected'::regclass`))[0].r,'모르는 표는 RLS 를 함부로 켜지 않음(보고만)');
 await t.db.exec(UNDO);await t.db.exec(UNDO);
 ok(!(await err(null,'select public.leaky()'))&&(await seqAnon())&&!(await err(null,"select net.http_post('https://x')")),'되돌리기: 보강이 바꾼 권한 원래대로(두 번 실행해도 안전)');
 ok(!(await sys(`select to_regclass('public._harden_2026_11_log') r`))[0].r,'되돌리기: 로그 표 삭제');
 ok((await dump(t,T1,'meta')).ok&&/permission denied/.test(await err(null,'select public.kw_auth($1)',[T1])),'되돌리기 후에도 토큰 함수·내부 함수 권한은 원래 SQL 대로');
 await t.db.exec(H);ok(/permission denied/.test(await err(null,'select public.leaky()')),'다시 보강 가능');
}
{ // 순서 바꿔도 됨: 보강을 먼저 하고 나중에 alert13.sql·기존 SQL 을 다시 실행
 const db=new PGlite();await db.exec(PRE);await db.exec(MOCKS);await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));
 await db.exec(read('security/harden-2026-11.sql'));await db.exec(read('alert13.sql'));await db.exec(read('kiwoom-collector.sql'));await db.exec(read('alert11.sql'));
 const T=newToken();await db.transaction(async tx=>{await tx.exec(`set local role authenticated; select set_config('request.jwt.sub','${U1}',true);`);await tx.query('select public.kw_register_token($1)',[hash(T)]);});
 const r=await db.transaction(async tx=>{await tx.exec('set local role anon');return (await tx.query("select public.backup_dump($1,'meta') r, public.review_gaps($1, current_date) g",[T])).rows[0];});
 ok(r.r.ok&&r.g.ok,'보강 뒤에 alert13.sql·기존 SQL 실행 → 명시 grant 대로 동작(backup_dump·review_gaps)');
}
console.log(passed+' passed');
