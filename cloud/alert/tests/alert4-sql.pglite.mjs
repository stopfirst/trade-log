/* SQL test for alert4 (손실한도 판정 v1.4, 한도 기준일): SQL 변경 없음 — 기존 risk_push가 v1.4 이벤트(clear·risk-start, '@' 붙은 중단 id)와 상태(status.riskStart)를 받는지 확인.
   node tests/alert4-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <hl-collector.sql> <balance-snapshot.sql> <alert2.sql> <fixtures-dir> */
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const [cloudPath,kwPath,hlPath,balPath,alertPath,fx]=process.argv.slice(2);
const read=p=>fs.readFileSync(p,'utf8');const noExt=s=>s.split('\n').filter(l=>!l.includes('-- @extension')).join('\n');
const SNAP=JSON.parse(read(path.join(fx,'kw-snapshot.json')));
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222',ADDR='0xecfe955c268f25c2718b56efcbcdd3f25d9d1460';
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
const kstToday=new Date(Date.now()+9*3600000).toISOString().slice(0,10);const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);

async function setup(full){
 const db=new PGlite();await db.exec(PRE);await db.exec(MOCKS);
 await db.exec(read(cloudPath));await db.exec(read(kwPath));if(full){await db.exec(noExt(read(hlPath)));await db.exec(noExt(read(balPath)));}
 await db.exec(read(alertPath));await db.exec(read(alertPath)); // 다시 실행해도 안전
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const fails=async(user,q,params=[],re=/permission denied|invalid collector token|login required/)=>{try{await as(user,q,params);return false;}catch(e){return re.test(e.message)?true:(console.error('unexpected',e.message),false);}};
 const sys=async(q,p=[])=>(await db.query(q,p)).rows;
 return {db,as,fails,sys};
}
{
 const {as,sys}=await setup(true);const T=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T)]);
 const P=p=>as(null,'select public.risk_push($1,$2::jsonb) r',[T,JSON.stringify(p)]).then(x=>x[0].r);
 const now=Date.now();
 const status={v:1,market:'hl',stopped:false,stops:[],riskStart:{date:'2026-10-20',day:'2026-10-20',at:Date.parse('2026-10-20T00:00:00Z'),atText:'10/20(화) 09:00 KST',before:false,base:{equity:1900,at:1,source:'HL 마감 10/19 UTC',approx:false},cleared:['HL:week-intraday:2026-10-20']},config:{riskStart:'2026-10-20'}};
 let w=await P({states:[{market:'hl',status,engine:{v:1,rev:5,riskStart:{date:'2026-10-20'}}}],events:[
  {market:'hl',ref:'clear:HL:week-intraday:2026-10-20:start:2026-10-20',kind:'clear',rule:'risk-start',at:now,detail:{stopId:'HL:week-intraday:2026-10-20',riskStart:'2026-10-20'}},
  {market:'hl',ref:'HL:dayr:2026-10-20@2026-10-20',kind:'stop',rule:'day',at:now,detail:{until:now+3600000}},
  {market:'us',ref:'US:streak:2026-10-22@2026-10-20',kind:'stop',rule:'streak',at:now,detail:{}}]});
 ok(w.ok&&w.states===1&&w.events===3,'risk_push: clear(risk-start)·@ 중단 id 저장');
 const ev=await as(U1,"select ref,kind,rule from public.risk_events order by ref");
 ok(ev.some(e=>e.kind==='clear'&&e.rule==='risk-start')&&ev.some(e=>e.ref==='HL:dayr:2026-10-20@2026-10-20'),'앱: 기준일 해제 기록·새 중단 읽기');
 const st=await as(U1,"select status->'riskStart'->>'date' d, status->'riskStart'->'base'->>'equity' e from public.risk_state where market='hl'");
 ok(st[0].d==='2026-10-20'&&Number(st[0].e)===1900,'앱: risk_state.status.riskStart 읽기');
 ok((await sys("select count(*)::int n from public.risk_events where length(ref)>40"))[0].n===1,'긴 ref(≤160) 허용');
}
console.log(`ALL OK (${passed} checks)`);
