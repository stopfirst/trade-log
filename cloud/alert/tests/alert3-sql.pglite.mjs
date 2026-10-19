/* SQL test for alert3.sql (손실한도 판정 v1.3, risk_day_data). Needs @electric-sql/pglite resolvable (local node_modules).
   node tests/alert3-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <hl-collector.sql> <balance-snapshot.sql> <alert2.sql> <alert3.sql> <fixtures-dir> */
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const [cloudPath,kwPath,hlPath,balPath,a2Path,a3Path,fx]=process.argv.slice(2);
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
 await db.exec(read(a2Path));await db.exec(read(a3Path));await db.exec(read(a3Path)); // 다시 실행해도 안전
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const fails=async(user,q,params=[],re=/permission denied|invalid collector token/)=>{try{await as(user,q,params);return false;}catch(e){return re.test(e.message)?true:(console.error('unexpected',e.message),false);}};
 const sys=async(q,p=[])=>(await db.query(q,p)).rows;
 return {db,as,fails,sys};
}
const snap=(date,total,rows)=>{const s=JSON.parse(JSON.stringify(SNAP));s.orderDate=date;s.asOf=Date.now();s.realized.reportedTotal=total;
 s.realized.rows=rows.map(([sym,net])=>({...SNAP.realized.rows[0],date,symbol:sym,reportedNet:net}));s.orders=s.orders.map(o=>({...o,orderDate:date,key:date+':'+o.key}));return s;};
const fillRaw=(tid,time,coin,closedPnl,fee,dir='Close Long')=>({coin,px:'100',sz:'1',side:'A',time,startPosition:'1',dir,closedPnl,hash:'0x'+tid,oid:tid,crossed:true,fee,tid,feeToken:'USDC'});

{
 const {as,fails,sys}=await setup(true);
 const T1=newToken(),T2=newToken();
 await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 const push=(t,s)=>as(null,'select public.kw_push($1,$2::jsonb) r',[t,JSON.stringify(s)]).then(x=>x[0].r);
 ok((await push(T1,snap(kstToday,'-61.25',[['NVDA','-50.25'],['AMD','-11']]))).ok,'키움 스냅샷(오늘) 저장');
 await push(T1,snap(shift(kstToday,-1),'12.5',[['NVDA','12.5']]));
 await push(T1,snap(shift(kstToday,-20),'-999',[['OLD','-999']]));
 await push(T2,snap(kstToday,'-777',[['ZZZONLY','-777']]));
 await as(null,'select public.kw_push_balance($1,$2::date,$3::numeric,$4::jsonb)',[T1,kstToday,2000,JSON.stringify({account:SNAP.account,etDate:shift(kstToday,-1)})]);
 await sys(`insert into public.acct_snapshots(user_id,market,day,value,source,detail) values ($1,'hl',$2,1950,'close','{}'),($1,'hl',$3,1900,'approx','{}'),($1,'hl',$4,5,'close','{}'),($5,'hl',$2,99999,'close','{}')`,[U1,shift(utcToday,-1),shift(utcToday,-2),shift(utcToday,-30),U2]);
 await as(U1,'select public.hl_set_address($1)',[ADDR]);
 await sys(`insert into public.hl_watch(user_id,address) values($1,$2) on conflict(user_id) do update set address=excluded.address`,[U2,ADDR2]);
 const now=Date.now(),y0=Date.parse(shift(utcToday,-1)+'T00:00:00Z');
 for(const [tid,time,coin,pnl,fee,a] of [[1,now-60000,'BTC','-40','1',addr],[2,y0+1000,'ETH','-10','0.5',addr],[3,y0-1000,'ETH','-500','1',addr],[4,now-1000,'SOL','-888','1',ADDR2]])
  await sys('insert into public.hl_fills(address,tid,time,coin,raw) values($1,$2,$3,$4,$5::jsonb)',[a,tid,time,coin,JSON.stringify(fillRaw(tid,time,coin,pnl,fee))]);
 for(const [time,coin,usdc,a] of [[now-3600000,'BTC','-2',addr],[y0-3600000,'BTC','-50',addr],[now-3600000,'SOL','-9',ADDR2]])
  await sys('insert into public.hl_funding(address,time,coin,raw) values($1,$2,$3,$4::jsonb)',[a,time,coin,JSON.stringify({time,hash:'0xf'+time,delta:{type:'funding',coin,usdc,szi:'1',fundingRate:'0.0001',nSamples:null}})]);

 const call=async t=>(await as(null,'select public.risk_day_data($1) r',[t]))[0].r;
 ok(await fails(null,'select public.risk_day_data($1)',[newToken()]),'모르는 토큰 거부');
 ok(await fails(null,'select public.risk_day_data($1)',['kwc_short']),'형식 틀린 토큰 거부');
 const r=await call(T1);
 ok(r.ok===true&&r.version===3&&r.utc===utcToday&&r.kst===kstToday,'risk_day_data ok (anon + 토큰, service_role 불필요)');
 const kd=Object.fromEntries(r.kw_days.map(d=>[d.date,d]));
 ok(kd[kstToday]?.total==='-61.25'&&kd[kstToday].count===2,'키움 오늘 ust21640 합계·행 수');
 ok(kd[shift(kstToday,-1)]?.total==='12.5'&&!kd[shift(kstToday,-20)],'최근 9일만');
 ok(!JSON.stringify(r).includes('ZZZONLY')&&!JSON.stringify(r).includes('-777')&&!JSON.stringify(r).includes('99999')&&!JSON.stringify(r).includes('-888'),'다른 사용자 데이터 없음');
 const us=r.acct.filter(a=>a.market==='us'),hl=r.acct.filter(a=>a.market==='hl');
 ok(us.length===1&&Number(us[0].value)===2000&&us[0].etDate===shift(kstToday,-1)&&us[0].source==='close'&&us[0].captured_at>0,'US 마감 잔액(etDate·captured_at)');
 ok(hl.length===2&&hl.some(a=>a.source==='approx')&&!hl.some(a=>Number(a.value)===5),'HL 마감(close·approx, 최근 12일)');
 ok(r.hl&&r.hl.address===addr,'HL 주소(소문자)');
 ok(r.hl.fills.map(f=>Number(f.tid)).sort().join(',')==='1,2'&&r.hl.fills.find(f=>Number(f.tid)===1).closedPnl==='-40'&&r.hl.fills[0].feeToken==='USDC'&&r.hl.fills[0].dir==='Close Long','HL 체결: 어제 00:00 UTC 이후만, closedPnl·fee·dir·feeToken');
 ok(r.hl.funding.length===1&&r.hl.funding[0].usdc==='-2'&&r.hl.funding[0].coin==='BTC','HL 펀딩: 어제 00:00 UTC 이후, delta.usdc');
 ok(Number(r.hl.last_fill_time)===now-60000,'마지막 체결 시각');
 // 앱 사용자(로그인)도 함수 실행은 토큰이 있어야만 의미 있음; 직접 테이블 읽기는 RLS 그대로
 ok(await fails(null,'select * from public.hl_fills'),'anon 직접 hl_fills 읽기 거부(기존 RLS 유지)');
 ok(await fails(null,'select * from public.kw_snapshots'),'anon 직접 kw_snapshots 읽기 거부');
 ok((await sys("select prosecdef from pg_proc where proname='risk_day_data'"))[0].prosecdef===true,'security definer');
 ok((await sys("select proconfig from pg_proc where proname='risk_day_data'"))[0].proconfig.some(x=>/search_path=(""|)$/.test(x)),'search_path 고정');
 // 분당 60회 공유 제한
 await sys("update public.kw_collector set window_count=60, window_start=now() where user_id=$1",[U1]);
 ok((await call(T1)).error==='rate_limited','분당 60회 초과 → rate_limited');
 const r2=await call(T2);ok(r2.ok&&r2.hl.address===ADDR2&&r2.hl.fills.length===1&&r2.kw_days.some(d=>d.total==='-777'),'토큰별 사용자 분리(U2)');
}
{
 // hl-collector / balance-snapshot 없이도 동작
 const {as}=await setup(false);const T=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T)]);
 const r=(await as(null,'select public.risk_day_data($1) r',[T]))[0].r;ok(r.ok&&r.hl===null&&r.acct.length===0&&r.kw_days.length===0,'선택 SQL 없이도 risk_day_data 동작');
}
console.log(`ALL OK (${passed} checks)`);
