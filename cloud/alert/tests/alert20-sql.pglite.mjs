/* SQL test for alert20.sql (탄창 수집기 hl_sub_tick + mag_status) — 기존 hl-collector.sql 주계정 수집 그대로·중복 없음.
   node tests/alert20-sql.pglite.mjs <cloud 폴더>   (cloud.sql, kiwoom-collector.sql, hl-collector.sql, alert20.sql, security/harden-2026-11.sql)
   pg_cron / pg_net mocked as in alert-sql.pglite.mjs. Supabase 기본 권한(새 객체 anon/authenticated 자동 GRANT)을 흉내 냄. */
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
const C=process.argv[2];if(!C){console.error('usage: node tests/alert20-sql.pglite.mjs <cloud dir>');process.exit(2);}
const read=f=>fs.readFileSync(path.join(C,f),'utf8');const noExt=s=>s.split('\n').filter(l=>!l.includes('-- @extension')).join('\n');
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222';
const MAIN='0xecfe955c268f25c2718b56efcbcdd3f25d9d1460',S1='0x1111111111111111111111111111111111111111',S2='0x2222222222222222222222222222222222222222',S3='0x3333333333333333333333333333333333333333';
const SCALP='0x2b4f2042354fadf45922a6e7593b79adf0beeea9',M2='0x9999999999999999999999999999999999999999';
const PRE=`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values('${U1}'),('${U2}');
create schema net;
create table net.requests(id bigserial primary key,url text,body jsonb,headers jsonb,timeout_milliseconds int,created timestamptz default now());
create table net._http_response(id bigint primary key,status_code int,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz not null default now());
create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.requests(url,body,headers,timeout_milliseconds) values(url,body,headers,timeout_milliseconds) returning id $$;
create schema cron;
create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean not null default true);
create function cron.schedule(job_name text,schedule text,command text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
create publication supabase_realtime;`;
let passed=0;const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exit(1);}passed++;console.log('ok',m);};
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const fill=(tid,time,coin='BTC',extra={})=>({coin,px:'100',sz:'1',side:'B',time,startPosition:'0',dir:'Open Long',closedPnl:'0',hash:'0x'+tid,oid:tid,crossed:true,fee:'0.1',tid,feeToken:'USDC',...extra});
const fund=(time,coin='BTC',usdc='-0.5')=>({time,hash:'0x00',delta:{type:'funding',coin,usdc,szi:'1',fundingRate:'0.0001'}});
async function setup(){const db=new PGlite();await db.exec(PRE);await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));await db.exec(noExt(read('hl-collector.sql')));
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const err=async(user,q,params=[])=>{try{await as(user,q,params);return null;}catch(e){return e.message;}};
 const sys=async(q,p=[])=>(await db.query(q,p)).rows;
 return {db,as,err,sys};}
/** pg_net 응답 흉내: 아직 응답 없는 요청에 body 함수 결과를 200으로 */
async function answer(sys,fn){const reqs=await sys(`select r.id,r.body from net.requests r where not exists(select 1 from net._http_response x where x.id=r.id) order by r.id`);
 for(const r of reqs){const out=fn(r.body);if(out===undefined)continue;await sys(`insert into net._http_response(id,status_code,content) values($1,200,$2)`,[r.id,JSON.stringify(out)]);}return reqs.length;}
const setJournal=(sys,user,settings)=>sys(`insert into public.journal_cloud(user_id,scope,payload,revision) values($1,'HL',$2::jsonb,1) on conflict (user_id,scope) do update set payload=excluded.payload,revision=public.journal_cloud.revision+1`,[user,JSON.stringify({trades:[],settings})]);

// ---- A. 설치·멱등·주계정 수집 그대로 ----
{
 const {db,as,err,sys}=await setup();
 const A=noExt(read('alert20.sql'));await db.exec(A);await db.exec(A);ok(true,'alert20.sql 두 번 실행 — 오류 없음(멱등)');
 const jobs=await sys(`select jobname from cron.job order by jobname`);ok(jobs.map(j=>j.jobname).join()==='hl-collector,hl-sub-collector','cron: 기존 hl-collector + 새 hl-sub-collector (기존 job 그대로)');
 const T1=newToken(),T2=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 await as(U1,'select public.hl_set_address($1)',[MAIN]);await as(U2,'select public.hl_set_address($1)',[M2]);
 // 탄창 설정 없음 → 탄창 요청 없음
 let r=(await sys('select public.hl_sub_tick() r'))[0].r;ok(r.fired===0&&r.list_changes===0,'탄창 설정 없으면 탄창 요청 0');
 // 앱 설정: 1R-1(S1) 탄창 + Scalping(설정에 잘못 넣어도) + 주계정 주소 + 대문자·공백
 await setJournal(sys,U1,{v123Subs:` ${S1.toUpperCase().replace('0X','0x')} , ${SCALP},${MAIN}`,v123Pct:2,v123Since:1793700000000});
 r=(await sys('select public.hl_sub_tick() r'))[0].r;
 let w=await sys(`select user_id,address,source,active from public.hl_sub_watch order by address`);
 ok(w.length===1&&w[0].address===S1&&w[0].source==='app'&&w[0].active===true,'앱 v123Subs → 탄창 S1만(Scalping·주계정 제외, 소문자)');
 ok(r.fired===2,'탄창 요청 2건(체결·펀딩)');
 const bodies=(await sys(`select body from net.requests order by id`)).map(x=>x.body);
 ok(bodies.filter(b=>b.user===S1).map(b=>b.type).sort().join()==='userFillsByTime,userFunding','S1 = userFillsByTime + userFunding');
 ok(!bodies.some(b=>b.user===SCALP),'Scalping 주소로는 요청 안 함');
 // 주계정 수집기도 따로 돌림 → 같은 tid(서로 체결) 체결이 두 주소에 하나씩
 await sys('select public.hl_collect_tick()');
 await answer(sys,b=>b.type==='userFillsByTime'?(b.user===MAIN?[fill(777,1793700001000),fill(1,1793700000000)]:b.user===S1?[fill(777,1793700001000,'BTC',{side:'A',dir:'Open Short'}),fill(2,1793700002000,'ETH')]:[fill(5,1793700000500)]):b.type==='userFunding'?(b.user===S1?[fund(1793703600000)]:[fund(1793703600000),fund(1793703600000,'ETH')]):undefined);
 await sys('select public.hl_sub_tick()');await sys('select public.hl_collect_tick()');
 let cnt=Object.fromEntries((await sys(`select address,count(*)::int n from public.hl_fills group by address`)).map(x=>[x.address,x.n]));
 ok(cnt[MAIN]===2&&cnt[S1]===2&&cnt[M2]===1&&Object.keys(cnt).length===3,'hl_fills: 주계정 2 + 탄창 2 + 다른 사용자 1 (같은 tid 777도 주소별로 1개씩)');
 let fcnt=Object.fromEntries((await sys(`select address,count(*)::int n from public.hl_funding group by address`)).map(x=>[x.address,x.n]));
 ok(fcnt[MAIN]===2&&fcnt[S1]===1,'hl_funding: 주계정 2 + 탄창 1 (같은 시각·코인도 주소별)');
 const mainW=(await sys(`select fills_cursor,last_error from public.hl_watch where user_id=$1`,[U1]))[0];ok(Number(mainW.fills_cursor)===1793700001000&&!mainW.last_error,'주계정 hl_watch 커서 = 주계정 체결만으로');
 const subW=(await sys(`select fills_cursor,funding_cursor,last_ok_at,last_error from public.hl_sub_watch where address=$1`,[S1]))[0];
 ok(Number(subW.fills_cursor)===1793700002000&&Number(subW.funding_cursor)===1793703600000&&subW.last_ok_at&&!subW.last_error,'탄창 커서·마지막 성공');
 // 다시 받아도(겹침 5분) 중복 없음
 await answer(sys,b=>b.type==='userFillsByTime'&&b.user===S1?[fill(777,1793700001000,'BTC',{side:'A',dir:'Open Short'}),fill(2,1793700002000,'ETH'),fill(3,1793700003000,'ETH')]:b.type==='userFillsByTime'?[fill(777,1793700001000),fill(1,1793700000000)]:[]);
 await sys('select public.hl_sub_tick()');await sys('select public.hl_collect_tick()');
 cnt=Object.fromEntries((await sys(`select address,count(*)::int n from public.hl_fills group by address`)).map(x=>[x.address,x.n]));
 ok(cnt[MAIN]===2&&cnt[S1]===3,'겹친 재수집: 새 체결 1건만 추가, 중복 없음');
 const st=(await as(U1,'select public.hl_status() s'))[0].s;ok(Number(st.fills_count)===2&&st.address===MAIN,'앱 hl_status = 주계정 숫자 그대로(탄창 안 섞임)');
 // RLS: 앱은 자기 주계정 + 자기 탄창 행만
 const mine=await as(U1,`select address from public.hl_fills`);ok(mine.length===5,'U1 읽기 = 주계정 2 + 탄창 3');
 const mainOnly=await as(U1,`select id from public.hl_fills where address=$1`,[MAIN]);ok(mainOnly.length===2,'앱의 address=eq.주계정 읽기 = 주계정 2건(예전과 같음)');
 {const u2=await as(U2,`select address from public.hl_fills`);ok(u2.length>0&&u2.every(x=>x.address===M2),'다른 사용자 U2 = 자기 주계정 행만(U1 탄창 행 못 봄)');}
 ok((await as(U1,`select address from public.hl_sub_watch`)).length===1&&(await as(U2,`select address from public.hl_sub_watch`)).length===0,'hl_sub_watch 자기 행만');
 ok(/permission denied/.test(await err(U1,`select * from public.hl_sub_env`)||''),'hl_sub_env 앱 읽기 거부');
 ok(/permission denied/.test(await err(null,`select public.hl_sub_tick()`)||''),'anon 이 수집 tick 직접 호출 불가');
 ok(/permission denied/.test(await err(U1,`insert into public.hl_sub_watch(user_id,address) values($1,$2)`,[U1,S2])||''),'앱 hl_sub_watch insert 거부');

 // ---- mag_status ----
 const mag=(t,env=null,from=null)=>as(null,'select public.mag_status($1,$2,$3) r',[t,env,from]).then(x=>x[0].r);
 let m=await mag(T1);ok(m.ok&&m.version===20&&m.main===MAIN&&m.settings.subs.includes('0x1111')&&Number(m.settings.pct)===2&&Number(m.settings.since)===1793700000000,'mag_status: 버전 20 · 주계정 · 앱 탄창 설정');
 ok(m.wanted[S1]==='app'&&m.watch.length===1&&m.watch[0].active===true&&m.cron_active===true,'mag_status: 지금 탄창 = S1(app) · 수집 상태 · cron 켜짐');
 ok(m.fills===undefined,'p_from 없으면 체결 행 없음');
 m=await mag(T1,null,1793700001500);ok(m.fills.length===2&&m.fills.every(f=>f.address===S1&&f.time>=1793700001500)&&m.funding.length===1&&m.funding[0].usdc==='-0.5','p_from: 탄창 체결·펀딩만(주계정 행 없음)');
 ok(/invalid collector token/.test(await err(null,'select public.mag_status($1)',[newToken()])||''),'모르는 토큰 거부');
 ok((await mag(T1,'x'.repeat(1001))).error==='bad_env','긴 env 거부');
 // .env 목록: 앱 설정이 있으면 앱 우선
 m=await mag(T1,`${S2},${S3},bad`);ok(m.env===`${S2},${S3}`&&m.wanted[S1]==='app'&&!m.wanted[S2],'.env 목록 저장(형식 오류 버림) · 앱 설정 있으면 앱 우선');
 // 앱 설정 비움 → .env 폴백
 await setJournal(sys,U1,{v123Pct:2});await sys('select public.hl_sub_tick()');
 w=await sys(`select address,source,active from public.hl_sub_watch where user_id=$1 order by address`,[U1]);
 ok(w.length===3&&w.find(x=>x.address===S1).active===false&&w.find(x=>x.address===S2).source==='env'&&w.find(x=>x.address===S3).active,'앱 탄창 해제 → S1 비활성(커서 보존) · .env S2·S3 활성');
 ok(Number((await sys(`select fills_cursor from public.hl_sub_watch where address=$1`,[S1]))[0].fills_cursor)===1793700003000,'비활성 S1 커서 보존');
 const pend=await sys(`select address from public.hl_sub_pending where user_id=$1`,[U1]);ok(!pend.some(p=>p.address===S1),'비활성 탄창의 대기 요청 정리');
 // v123Ex 로 .env 주소 제외
 await setJournal(sys,U1,{v123Ex:S3});await sys('select public.hl_sub_tick()');
 w=await sys(`select address,active from public.hl_sub_watch where user_id=$1 and active order by address`,[U1]);ok(w.length===1&&w[0].address===S2,'앱 v123Ex 에 든 주소는 .env 목록이어도 제외');
 // 다시 앱 탄창 S1 → 재활성(커서 이어서), 소스 app
 await setJournal(sys,U1,{v123Subs:S1});await sys('select public.hl_sub_tick()');
 w=await sys(`select address,source,active,fills_cursor from public.hl_sub_watch where user_id=$1 and active`,[U1]);ok(w.length===1&&w[0].address===S1&&w[0].source==='app'&&Number(w[0].fills_cursor)===1793700003000,'다시 고르면 같은 행 재활성 · 커서 이어서');
 const reqS1=(await sys(`select body from net.requests order by id desc limit 6`)).map(x=>x.body).find(b=>b.user===S1&&b.type==='userFillsByTime');
 ok(reqS1&&reqS1.startTime===1793700003000-300000,'재개 요청 startTime = 커서 − 5분');
 // .env 지우기
 m=await mag(T1,'');ok(m.env==='','.env 목록 빈 문자열 = 지움');
 // 5개 제한
 const many=Array.from({length:7},(_,i)=>'0x'+String(i+4).repeat(40).slice(0,40));await setJournal(sys,U1,{v123Subs:many.join(',')});
 await sys('select public.hl_sub_tick()');ok((await sys(`select count(*)::int n from public.hl_sub_watch where user_id=$1 and active`,[U1]))[0].n===5,'탄창 최대 5개');
 // 오류 응답 → 탄창 행만 backoff, 주계정 그대로
 await setJournal(sys,U1,{v123Subs:S1});await sys('select public.hl_sub_tick()');
 const open=await sys(`select request_id from public.hl_sub_pending where address=$1 and kind='fills'`,[S1]);
 if(open.length)await sys(`insert into net._http_response(id,status_code,content) values($1,429,'rate')`,[open[0].request_id]);
 await sys('select public.hl_sub_tick()');
 const e1=(await sys(`select last_error,retry_after from public.hl_sub_watch where address=$1`,[S1]))[0];ok(/429/.test(e1.last_error||'')&&e1.retry_after,'탄창 429 → 그 탄창만 대기(backoff)');
 ok(!(await sys(`select last_error from public.hl_watch where user_id=$1`,[U1]))[0].last_error,'주계정 hl_watch 오류 없음');
 // 주계정 주소 지우면 탄창 행도 지워짐(수집한 행은 남음)
 await as(U1,'select public.hl_clear_address()');ok((await sys(`select count(*)::int n from public.hl_sub_watch where user_id=$1`,[U1]))[0].n===0,'hl_clear_address → 탄창 watch도 삭제(cascade)');
 ok((await sys(`select count(*)::int n from public.hl_fills where address=$1`,[S1]))[0].n===3,'수집한 탄창 체결은 남음');
}

// ---- B. alert20.sql 없이 hl-collector.sql만 = 예전 그대로 / harden 순서 ----
{
 const {db,as,err,sys}=await setup();
 await as(U1,'select public.hl_set_address($1)',[MAIN]);await sys('select public.hl_collect_tick()');
 ok((await sys(`select count(*)::int n from net.requests`))[0].n===2,'alert20 없이: 주계정 요청 2건(예전 그대로)');
 const H=read('security/harden-2026-11.sql'),A=noExt(read('alert20.sql'));
 await db.exec(H);await db.exec(A);
 const anonExec=async()=>(await db.query(`select has_function_privilege('anon','public.mag_status(text, text, bigint)','execute') x`)).rows[0].x;
 ok(await anonExec(),'harden → alert20: anon 이 mag_status 실행 가능(서버 호출 됨)');
 ok(!(await db.query(`select has_function_privilege('anon','public.hl_sub_tick()','execute') x`)).rows[0].x,'hl_sub_tick 은 anon 실행 불가');
 await db.exec(H);ok(!(await anonExec()),'alert20 → harden: mag_status anon 권한 빠짐(시연)');
 await db.exec(A);ok(await anonExec(),'alert20 다시 실행 → 복구');
}
console.log(`\nalert20 SQL: ${passed} passed`);
