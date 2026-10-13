/* SQL test for alert2.sql (손실한도 판정 v1.2). Needs @electric-sql/pglite resolvable (NODE_PATH or local node_modules).
   node tests/alert2-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <hl-collector.sql> <balance-snapshot.sql> <alert2.sql> <fixtures-dir> */
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
const snap=(date,orders,cash)=>{const s=JSON.parse(JSON.stringify(SNAP));s.orderDate=date;s.asOf=Date.now();s.realized.rows=s.realized.rows.map(r=>({...r,date}));
 s.orders=orders.map((o,i)=>({...SNAP.orders[0],orderDate:date,key:date+':'+o[0]+':'+i,orderId:String(i),symbol:o[0],side:o[1],reportedQuantity:o[2],reportedPrice:o[3],reportedTime:o[4]}));
 s.summary={currency:'USD',reportedSecuritiesValue:'1234.56',cash:{apiId:'ust21160',currency:'USD',usd:cash,usdBasis:'d2',krwIncluded:false,asOf:s.asOf}};return s;};

{
 const {as,fails,sys}=await setup(true);
 const T1=newToken(),T2=newToken();
 await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 const push=(t,s)=>as(null,'select public.kw_push($1,$2::jsonb) r',[t,JSON.stringify(s)]);
 await push(T1,snap(shift(kstToday,-1),[['NVDA','매수','2','180.5','23:10:00']],'700.00'));
 await push(T1,snap(kstToday,[['NVDA','매도','1','185','00:20:00'],['AMD','매수','0','','01:00:00']],'765.44'));
 await push(T1,snap(shift(kstToday,-20),[['OLD','매수','1','1','22:00:00']],'1.00'));
 await push(T2,snap(kstToday,[['ZZZONLY','매수','9','9','22:00:00']],'9.00'));
 await as(null,'select public.kw_push_balance($1,$2::date,$3::numeric,$4::jsonb)',[T1,kstToday,2000,JSON.stringify({account:SNAP.account,etDate:shift(kstToday,-1)})]);
 await as(U1,'select public.hl_set_address($1)',[ADDR]);
 const cas=(u,scope,rev,p)=>as(u,'select public.journal_cas($1,$2,$3::jsonb) r',[scope,rev,JSON.stringify(p)]);
 await cas(U1,'US',0,{format:'trade-journal-usd',currency:'USD',version:5,trades:[],settings:{account:5000,defaultRisk:0.8,limD:2}});
 await cas(U1,'HL',0,{format:'trade-journal-hyperliquid',currency:'USDC',trades:[],settings:{account:1000,defaultRisk:1.5}});

 const call=async(t,...a)=>(await as(null,`select public.risk_status($1${a.map((_,i)=>',$'+(i+2)).join('')}) r`,[t,...a]))[0].r;
 ok(await fails(null,'select public.risk_status($1)',[newToken()]),'risk_status: 모르는 토큰 거부');
 ok(await fails(null,'select public.risk_push($1,$2::jsonb)',['kwc_short','{}']),'risk_push: 형식 틀린 토큰 거부');
 let r=await call(T1);
 ok(r.ok&&r.version===2,'risk_status ok (anon + 토큰)');
 ok(r.kw.latest.summary.cash.usd==='765.44'||r.kw.latest.summary.cash.usd==='1.00','최근 스냅샷(잔고·예수금)');
 const keys=r.kw.orders.map(o=>o.symbol);
 ok(keys.includes('NVDA')&&keys.includes('AMD')&&!keys.includes('OLD'),'최근 6일 주문만: '+keys.join(','));
 ok(r.kw.orders.find(o=>o.side==='매도').time==='00:20:00'&&r.kw.orders.find(o=>o.side==='매도').qty==='1','주문 시각·수량');
 ok(!JSON.stringify(r).includes('ZZZONLY'),'다른 사용자 데이터 없음');
 ok(r.acct_us.length===1&&Number(r.acct_us[0].value)===2000&&r.acct_us[0].etDate===shift(kstToday,-1),'US 장 마감 잔액(etDate)');
 ok(r.hl_address===ADDR,'HL 주소');
 ok(Number(r.journal.US.defaultRisk)===0.8&&Number(r.journal.HL.defaultRisk)===1.5&&!r.journal.US.unchanged,'앱 기본 위험 %');
 r=await call(T1,r.journal.US.revision,r.journal.HL.revision);
 ok(r.journal.US.unchanged===true&&r.journal.US.defaultRisk===undefined,'리비전 같으면 일지 본문 안 읽음');

 const P=(t,p)=>as(null,'select public.risk_push($1,$2::jsonb) r',[t,JSON.stringify(p)]).then(x=>x[0].r);
 const status={v:1,market:'hl',today:kstToday,stopped:true,stops:[{id:'HL:day:'+kstToday,rule:'day',until:Date.now()+3600000,untilText:'x'}],halfRisk:{active:false}};
 let w=await P(T1,{states:[{market:'hl',status,engine:{v:1,rev:3}}],days:[{market:'hl',day:kstToday,rec:{startEquity:1000}}],
  events:[{market:'hl',ref:'HL:day:'+kstToday,kind:'stop',rule:'day',at:Date.now(),detail:{until:1}},{market:'hl',ref:'HL:viol:hl:777',kind:'violation',rule:'day',at:Date.now(),detail:{symbol:'BTC',tid:777}}],
  flows:[{market:'us',ref:'us-implied:1',at:Date.now()-1000,amount:500,kind:'입금 추정',source:'us-implied'},{market:'hl',ref:'manual:HL:1',at:Date.now(),amount:-50,kind:'출금(수동)',source:'manual',note:'메모'}]});
 ok(w.ok&&w.states===1&&w.days===1&&w.events===2&&w.flows===2,'risk_push 저장');
 w=await P(T1,{events:[{market:'hl',ref:'HL:viol:hl:777',kind:'violation',rule:'day',at:Date.now(),detail:{}}],flows:[{market:'us',ref:'us-implied:1',at:1,amount:1,kind:'x',source:'us-implied'}]});
 ok(w.events===0&&w.flows===0,'같은 ref 중복 무시');
 ok((await P(T1,{events:[{market:'hl',ref:'bad ref!',kind:'stop',at:1}]})).error==='bad_event','이상한 이벤트 거부');
 ok((await P(T1,{flows:[{market:'hl',ref:'abc',at:1,amount:1,kind:'x',source:'hacker'}]})).error==='bad_flow','이상한 입출금 출처 거부');
 ok((await P(T1,{states:[{market:'xx',status:{},engine:{}}]})).error==='bad_state','이상한 시장 거부');
 w=await P(T1,{flow_deletes:['us-implied:1','manual:HL:1']});ok(w.flow_deletes===1,'수동 입출금만 삭제 가능');
 r=await call(T1);
 ok(r.risk.state.length===1&&r.risk.state[0].engine.rev===3,'저장된 판정 상태 되읽기');
 ok(r.risk.events.length===2&&r.risk.flows.length===1&&r.risk.flows[0].ref==='us-implied:1','이벤트 ref·입출금 되읽기');
 // 앱(로그인) = 본인 행만 SELECT, 직접 쓰기 불가
 const mine=await as(U1,'select market,status from public.risk_state');ok(mine.length===1&&mine[0].status.stopped===true,'앱: 본인 중단 상태 읽기');
 ok((await as(U2,'select * from public.risk_state')).length===0&&(await as(U2,'select * from public.risk_events')).length===0,'다른 사용자는 안 보임');
 ok((await as(U1,"select detail from public.risk_events where kind='violation'"))[0].detail.tid===777,'앱: 위반 기록(거래 태그용)');
 ok(await fails(U1,"insert into public.risk_state(user_id,market) values($1,'us')",[U1]),'앱 직접 쓰기 거부');
 ok(await fails(null,'select * from public.risk_events'),'anon 직접 읽기 거부');
 ok(await fails(U1,"update public.risk_events set kind='stop'"),'앱 수정 거부');
 // U2 토큰은 U1 행을 못 건드림
 await P(T2,{events:[{market:'us',ref:'HL:viol:hl:777',kind:'violation',at:Date.now(),detail:{x:1}}]});
 ok((await sys("select count(*)::int n from public.risk_events where ref='HL:viol:hl:777'"))[0].n===2&&(await sys("select detail from public.risk_events where user_id=$1 and ref='HL:viol:hl:777'",[U1]))[0].detail.tid===777,'토큰별 사용자 분리');
 const big='x'.repeat(700000);ok((await P(T1,{states:[{market:'us',status:{big},engine:{}}]})).error==='bad_payload','600KB 초과 거부');
}
{
 // hl-collector / balance-snapshot 없이도 동작
 const {as}=await setup(false);const T=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T)]);
 const r=(await as(null,'select public.risk_status($1) r',[T]))[0].r;ok(r.ok&&r.hl_address===null&&r.acct_us.length===0&&r.kw.latest===null,'선택 SQL 없이도 risk_status 동작');
}
console.log(`ALL OK (${passed} checks)`);
