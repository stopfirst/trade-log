/* alert6(손실한도 판정 v1.6) SQL 확인 — 새 SQL 없음: alert5.sql risk_day_data(version 5)의 acct 40일이 주·월 시작 직전 마감까지 주는지 + v1.6 분모 계산.
   (원본 헤더) SQL test for alert5.sql (손실한도 판정 v1.5, risk_day_data version 5). Needs @electric-sql/pglite resolvable (local node_modules).
   node tests/alert5-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <hl-collector.sql> <balance-snapshot.sql> <alert2.sql> <alert3.sql> <alert5.sql> <fixtures-dir> */
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const [cloudPath,kwPath,hlPath,balPath,a2Path,a3Path,a5Path,fx]=process.argv.slice(2);
const read=p=>fs.readFileSync(p,'utf8');const noExt=s=>s.split('\n').filter(l=>!l.includes('-- @extension')).join('\n');
const SNAP=JSON.parse(read(path.join(fx,'kw-snapshot.json')));
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222',ADDR='0xEcfe955c268f25c2718b56efcbcdd3f25d9d1460',addr=ADDR.toLowerCase(),ADDR2='0x'+'b'.repeat(40);
const PRE=`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
insert into auth.users values('${U1}'),('${U2}');`;
const MOCKS=`create schema net;
create table net.requests(id bigserial primary key,url text,body jsonb,headers jsonb,timeout_milliseconds int,created timestamptz default now());
create table net._http_response(id bigint primary key,status_code int,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz not null default now());
create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.requests(url,body,headers,timeout_milliseconds) values(url,body,headers,timeout_milliseconds) returning id $$;
create schema cron;
create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean not null default true);
create function cron.schedule(job_name text,schedule text,command text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
create publication supabase_realtime;`;
let passed=0;const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exit(1);}passed++;console.log('ok',m);};
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const kstToday=new Date(Date.now()+9*3600000).toISOString().slice(0,10),utcToday=new Date().toISOString().slice(0,10);
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);

async function setup(full){
 const db=new PGlite();await db.exec(PRE);await db.exec(MOCKS);
 await db.exec(read(cloudPath));await db.exec(read(kwPath));if(full){await db.exec(noExt(read(hlPath)));await db.exec(noExt(read(balPath)));}
 await db.exec(read(a2Path));await db.exec(read(a3Path));await db.exec(read(a5Path));await db.exec(read(a5Path)); // alert3 위에 alert5, 다시 실행해도 안전
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const fails=async(user,q,params=[],re=/permission denied|invalid collector token/)=>{try{await as(user,q,params);return false;}catch(e){return re.test(e.message)?true:(console.error('unexpected',e.message),false);}};
 const sys=async(q,p=[])=>(await db.query(q,p)).rows;
 return {db,as,fails,sys};
}
const snap=(date,total,rows)=>{const s=JSON.parse(JSON.stringify(SNAP));s.orderDate=date;s.asOf=Date.now();s.realized.reportedTotal=total;
 s.realized.rows=rows.map(([sym,net])=>({...SNAP.realized.rows[0],date,symbol:sym,reportedNet:net}));s.orders=s.orders.map(o=>({...o,orderDate:date,key:date+':'+o.key}));return s;};
const fillRaw=(tid,time,coin,closedPnl,fee,dir='Close Long')=>({coin,px:'100',sz:'1',side:'A',time,startPosition:'1',dir,closedPnl,hash:'0x'+tid,oid:tid,crossed:true,fee,tid,feeToken:'USDC'});


import * as day from '../src/day.mjs';
{
 const {as,sys}=await setup(true);const T1=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T1)]);
 // 최악: 31일인 달의 31일 → 달 시작 = 30일 전, 그 직전 마감은 최대 7일 더 앞(37일 전). US 행 day(한국 날짜) = etDate + 1.
 const rows=[[-37,'hl',30000,null],[-41,'hl',99999,null],[-36,'us',61000,-37],[-1,'hl',20000,null]];
 for(const [n,m,v,et] of rows)await sys(`insert into public.acct_snapshots(user_id,market,day,value,source,detail) values ($1,$2,$3,$4,'close',$5::jsonb)`,[U1,m,shift(kstToday,n),v,JSON.stringify(et===null?{}:{etDate:shift(kstToday,et)})]);
 const r=(await as(null,'select public.risk_day_data($1) r',[T1]))[0].r;
 ok(r.ok&&r.version===5,'risk_day_data version 5 (alert5.sql 그대로, alert6.sql 없음)');
 ok(r.acct.some(a=>a.market==='hl'&&Number(a.value)===30000),'acct: 37일 전(달 시작 직전 마감 최악) 포함');
 ok(r.acct.some(a=>a.market==='us'&&a.etDate===shift(kstToday,-37)),'acct: US etDate 37일 전 행 포함(day = 36일 전)');
 ok(!r.acct.some(a=>Number(a.value)===99999),'acct: 41일 전 제외(40일 범위)');
 // day.mjs로 기간 분모: 시작 키 = 36일 전(가상의 달 시작) → 직전 마감 37일 전 30000
 const B={value:5000,mode:'basis',source:'HL BALANCE'},dn=day.dayDenomFor(r.acct,'HL',B);
 const d=dn(shift(kstToday,-36));ok(d.mode==='close'&&d.value===30000,'v1.6 분모: 시작 36일 전 → 직전 마감(37일 전) 30,000');
 const u=day.dayDenomFor(r.acct,'US',B)(shift(kstToday,-36));ok(u.mode==='close'&&u.value===61000&&u.key===shift(kstToday,-37),'US 분모 키 = etDate');
 const f=dn(shift(kstToday,-20));ok(f.mode==='basis','중간에 마감 없음(7일 넘음) → 현재 기준액 폴백');
}
console.log(`ALL OK (${passed} checks)`);
