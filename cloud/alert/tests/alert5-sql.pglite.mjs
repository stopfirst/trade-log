/* SQL test for alert5.sql (손실한도 판정 v1.5, risk_day_data version 5). Needs @electric-sql/pglite resolvable (local node_modules).
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


{
 const {as,fails,sys}=await setup(true);
 const T1=newToken(),T2=newToken();
 await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 const push=(t,s)=>as(null,'select public.kw_push($1,$2::jsonb) r',[t,JSON.stringify(s)]).then(x=>x[0].r);
 ok((await push(T1,snap(kstToday,'-61.25',[['NVDA','-50.25'],['AMD','-11']]))).ok,'키움 스냅샷(오늘) 저장');
 await push(T1,snap(shift(kstToday,-20),'-120',[['OLD','-120']]));
 await push(T1,snap(shift(kstToday,-44),'7',[['OLD44','7']]));
 await push(T1,snap(shift(kstToday,-50),'-999',[['OLD50','-999']]));
 await push(T2,snap(kstToday,'-777',[['ZZZONLY','-777']]));
 await sys(`insert into public.acct_snapshots(user_id,market,day,value,source,detail) values ($1,'hl',$2,1950,'close','{}'),($1,'hl',$3,1800,'close','{}'),($1,'hl',$4,5,'close','{}')`,[U1,shift(utcToday,-1),shift(utcToday,-30),shift(utcToday,-60)]);
 await as(U1,'select public.hl_set_address($1)',[ADDR]);
 await sys(`insert into public.hl_watch(user_id,address) values($1,$2) on conflict(user_id) do update set address=excluded.address`,[U2,ADDR2]);
 const now=Date.now(),u0=Date.parse(utcToday+'T00:00:00Z'),y0=u0-86400000,d5=u0-5*86400000,d40=u0-40*86400000;
 const rows=[[1,now-60000,'BTC','-40','1',addr],[2,y0+1000,'ETH','-10','0.5',addr],[3,d5+1000,'ETH','-500','1',addr],[4,d5+2000,'ETH','100','0.5',addr],
  [5,d5+3000,'@107','-77','1',addr],[6,d5+4000,'PURR/USDC','-66','1',addr],[7,d40,'BTC','-12345','1',addr],[8,now-1000,'SOL','-888','1',ADDR2]];
 for(const [tid,time,coin,pnl,fee,a] of rows)await sys('insert into public.hl_fills(address,tid,time,coin,raw) values($1,$2,$3,$4,$5::jsonb)',[a,tid,time,coin,JSON.stringify(fillRaw(tid,time,coin,pnl,fee))]);
 {const f=fillRaw(9,d5+5000,'ETH','-55','1');f.feeToken='HYPE';await sys('insert into public.hl_fills(address,tid,time,coin,raw) values($1,$2,$3,$4,$5::jsonb)',[addr,9,d5+5000,'ETH',JSON.stringify(f)]);}
 for(const [time,coin,usdc,a] of [[now-3600000,'BTC','-2',addr],[d5+3600000,'BTC','-3.5',addr],[d5+7200000,'ETH','1.25',addr],[d40,'BTC','-50',addr],[now-3600000,'SOL','-9',ADDR2]])
  await sys('insert into public.hl_funding(address,time,coin,raw) values($1,$2,$3,$4::jsonb)',[a,time,coin,JSON.stringify({time,hash:'0xf'+time,delta:{type:'funding',coin,usdc,szi:'1',fundingRate:'0.0001',nSamples:null}})]);
 const call=async t=>(await as(null,'select public.risk_day_data($1) r',[t]))[0].r;
 ok(await fails(null,'select public.risk_day_data($1)',[newToken()]),'모르는 토큰 거부');
 ok(await fails(null,'select public.risk_day_data($1)',['kwc_short']),'형식 틀린 토큰 거부');
 const r=await call(T1);
 ok(r.ok===true&&r.version===5&&r.utc===utcToday&&r.kst===kstToday,'risk_day_data version 5 (anon + 토큰, service_role 불필요)');
 const exp=(()=>{const d=new Date(u0),dow=(d.getUTCDay()+6)%7;const m=utcToday.slice(0,8)+'01',w=shift(utcToday,-dow),k=shift(utcToday,-14);return shift([m,w,k].sort()[0],-1);})();
 ok(r.period_from===exp&&r.hl.days_from===Date.parse(exp+'T00:00:00Z'),'period_from = min(이번 달 1일, 이번 주 월요일, 14일 전) − 1일 (UTC) = '+exp);
 const kd=Object.fromEntries(r.kw_days.map(d=>[d.date,d]));
 ok(kd[kstToday]?.total==='-61.25'&&kd[kstToday].count===2&&kd[shift(kstToday,-20)]?.total==='-120'&&kd[shift(kstToday,-44)]?.total==='7'&&!kd[shift(kstToday,-50)],'키움 일별 실현: 최근 45일(20·44일 전 포함, 50일 전 제외)');
 const hl=r.acct.filter(a=>a.market==='hl');ok(hl.length===2&&hl.some(a=>Number(a.value)===1800)&&!hl.some(a=>Number(a.value)===5),'마감 잔액: 최근 40일');
 ok(r.hl.fills.map(f=>Number(f.tid)).sort().join(',')==='1,2'&&r.hl.funding.length===1,'v3 상세(체결·펀딩 어제 00:00 UTC부터) 그대로');
 const D=Object.fromEntries(r.hl.days.map(d=>[d.day,d])),k5=shift(utcToday,-5);
 ok(D[k5]&&Number(D[k5].fills)===2&&Math.abs(Number(D[k5].trades)-(-501+99.5))<1e-9&&Math.abs(Number(D[k5].fees)-1.5)<1e-9,'HL 날짜별 합계: 무기한·USDC 수수료만(현물 @107·PURR/USDC·HYPE 수수료 제외), Σ(closedPnl−fee)');
 ok(Math.abs(Number(D[k5].funding)-(-2.25))<1e-9&&Number(D[k5].funding_count)===2,'HL 날짜별 펀딩 합계·건수');
 ok(D[utcToday]&&Number(D[utcToday].fills)===1&&Number(D[utcToday].trades)===-41&&Number(D[utcToday].funding)===-2,'오늘 UTC 합계');
 ok(!D[shift(utcToday,-40)]||shift(utcToday,-40)>=exp,'기간 밖(40일 전) 제외');
 ok(!JSON.stringify(r).includes('ZZZONLY')&&!JSON.stringify(r).includes('-888')&&!JSON.stringify(r).includes('-777'),'다른 사용자 데이터 없음');
 ok(await fails(null,'select * from public.hl_fills'),'anon 직접 hl_fills 읽기 거부(기존 RLS 유지)');
 ok((await sys("select prosecdef from pg_proc where proname='risk_day_data'"))[0].prosecdef===true,'security definer');
 ok((await sys("select proconfig from pg_proc where proname='risk_day_data'"))[0].proconfig.some(x=>/search_path=(""|)$/.test(x)),'search_path 고정');
 ok((await sys("select count(*)::int n from pg_proc where proname='risk_day_data'"))[0].n===1,'함수 1개(같은 이름·인자 교체)');
 // risk_push(alert2.sql 그대로)가 v1.5 상태·이벤트를 받는지: clear(basis-realized), 실현 중단 id, status.version·basis
 {const P=p=>as(null,'select public.risk_push($1,$2::jsonb) r',[T1,JSON.stringify(p)]).then(x=>x[0].r);const t=Date.now();
  const w=await P({states:[{market:'us',status:{v:1,version:'2.3.0',rules:'손실한도 판정 v1.5',basis:{day:'realized',period:'realized',label:'손익 = 실현손익'},periodBasis:'realized',stops:[]},engine:{v:1,periodBasis:'realized',rp:{lastKey:'2026-10-20',days:{}}}}],
   events:[{market:'us',ref:'clear:US:week-intraday:2026-10-20@2026-10-20:realized',kind:'clear',rule:'basis-realized',at:t,detail:{stopId:'US:week-intraday:2026-10-20@2026-10-20',basis:'realized'}},
    {market:'us',ref:'US:weekr-intraday:2026-10-21',kind:'stop',rule:'week-intraday',at:t,detail:{label:'주간 실현 −6% 장중 도달'}},{market:'hl',ref:'HL:streakr:2026-10-16',kind:'stop',rule:'streak',at:t,detail:{}}]});
  ok(w.ok&&w.states===1&&w.events===3,'risk_push: v1.5 clear(basis-realized)·실현 중단 id·status.version/basis 저장');
  const st=await sys("select status from public.risk_state where user_id=$1 and market='us'",[U1]);ok(st[0].status.version==='2.3.0'&&st[0].status.basis.period==='realized','risk_state.status.version·basis');
  ok((await as(U1,"select status->>'rules' r from public.risk_state where market='us'"))[0]?.r==='손실한도 판정 v1.5','앱(로그인 사용자)이 RLS로 status.rules 읽기');}
 await sys("update public.kw_collector set window_count=60, window_start=now() where user_id=$1",[U1]);
 ok((await call(T1)).error==='rate_limited','분당 60회 초과 → rate_limited');
 const r2=await call(T2);ok(r2.ok&&r2.hl.address===ADDR2&&r2.hl.days.length===1&&Number(r2.hl.days[0].trades)===-889,'토큰별 사용자 분리(U2)');
}
{
 const {as,db}=await setup(false);const T=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T)]);
 const r=(await as(null,'select public.risk_day_data($1) r',[T]))[0].r;ok(r.ok&&r.version===5&&r.hl===null&&r.acct.length===0&&r.kw_days.length===0,'선택 SQL(hl-collector·balance-snapshot) 없이도 동작');
 await db.exec(read(a3Path));const r3=(await as(null,'select public.risk_day_data($1) r',[T]))[0].r;ok(r3.ok&&r3.version===3,'alert3.sql 다시 실행 → version 3으로 되돌림');
}
console.log(`ALL OK (${passed} checks)`);
