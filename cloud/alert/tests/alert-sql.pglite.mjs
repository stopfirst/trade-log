/* SQL test for alert.sql (alert1). Needs @electric-sql/pglite resolvable from this file's folder.
   node tests/alert-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <hl-collector.sql> <alert.sql> <fixtures-dir>
   pg_cron / pg_net are mocked as in hl-collector.pglite.mjs. */
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import * as core from '../src/core.mjs';
const [cloudPath,kwPath,hlPath,alertPath,fx]=process.argv.slice(2);
const read=p=>fs.readFileSync(p,'utf8');
const hlSql=read(hlPath).split('\n').filter(l=>!l.includes('-- @extension')).join('\n');
const alertSql=read(alertPath);
const FILLS=JSON.parse(read(path.join(fx,'hl-live-fills.json'))),FUND=JSON.parse(read(path.join(fx,'hl-live-funding.json'))),SNAP=JSON.parse(read(path.join(fx,'kw-snapshot.json')));
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222';
const ADDR='0xecfe955c268f25c2718b56efcbcdd3f25d9d1460';
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
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const close=(a,b)=>Math.abs(Number(a)-Number(b))<1e-9;

async function setup(withHL){
 const db=new PGlite();await db.exec(PRE);await db.exec(MOCKS);
 await db.exec(read(cloudPath));await db.exec(read(kwPath));if(withHL)await db.exec(hlSql);
 await db.exec(alertSql);await db.exec(alertSql); // safe to run again
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const fails=async(user,q,params=[],re=/permission denied|invalid collector token|login required/)=>{try{await as(user,q,params);return false;}catch(e){return re.test(e.message)?true:(console.error('unexpected',e.message),false);}};
 const sys=async(q,p=[])=>(await db.query(q,p)).rows;
 return {db,as,fails,sys};
}
const today=new Date().toISOString().slice(0,10);
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const snap=(date,total,rows)=>{const s=JSON.parse(JSON.stringify(SNAP));s.orderDate=date;s.asOf=Date.now();s.realized.rows=rows.map(([symbol,net])=>({...SNAP.realized.rows[0],date,symbol,reportedNet:net}));s.realized.reportedTotal=total;s.orders=[{...SNAP.orders[0],orderDate:date,key:date+':NVDA:1',reportedTime:'22:31:05'},{...SNAP.orders[0],orderDate:date,key:date+':NVDA:2',orderId:'2',reportedTime:'23:40:00'}];s.summary={currency:'USD',reportedSecuritiesValue:'1234.56',cash:{apiId:'ust21160',currency:'USD',usd:'765.44',usdBasis:'d2',krwIncluded:false,asOf:s.asOf}};return s;};
const payloadUS=trades=>({format:'trade-journal-usd',currency:'USD',version:5,trades,settings:{account:50000,limD:1,limW:2,limM:4,defaultRisk:1,analytics:{x:1}},
 sync:{kiwoomBroker:{account:SNAP.account,days:{[shift(today,-3)]:{asOf:1,realized:{reportedTotal:'-5',rows:[{symbol:'AMD',reportedNet:'-5'}]},orders:[]},[shift(today,-200)]:{asOf:1,realized:{reportedTotal:'-1',rows:[]},orders:[]}},holdings:{asOf:1,positions:[],summary:{currency:'USD'}}}}});
const tradeM={id:'m1',name:'TSLA',market:'US',direction:'long',date:shift(today,-2),images:[{id:'p',data:'data:image/png;base64,AAAA'}],review:'비밀 메모',entryNote:'메모',
 entries:[{id:'e1',date:shift(today,-2),time:'10:00',shares:10,price:100,fee:1,note:'x'}],fills:[{id:'f1',date:shift(today,-1),time:'11:00',shares:10,price:90,fee:1,compliance:'violation'}],funding:[]};
const tradeOld={id:'old',name:'OLD',market:'US',direction:'long',date:shift(today,-300),entries:[{id:'e',date:shift(today,-300),shares:1,price:1,fee:0}],fills:[{id:'f',date:shift(today,-299),shares:1,price:2,fee:0}],funding:[]};
const tradeBroker={id:'kj:x:day:'+today+':NVDA',name:'NVDA',market:'US',date:today,entries:[],fills:[],funding:[],sync:{source:'kiwoom',journalKind:'day',broker:{reportedNet:'-9'}}};

// ---------- with hl-collector.sql ----------
{
 const {as,fails,sys}=await setup(true);
 const T1=newToken(),T2=newToken();
 await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 const push=(t,s)=>as(null,'select public.kw_push($1,$2::jsonb) r',[t,JSON.stringify(s)]);
 await push(T1,snap(today,'-300.5',[['NVDA','-300.5']]));await push(T1,snap(shift(today,-1),'20',[['AAPL','30'],['NVDA','-10']]));
 await push(T2,snap(today,'-99999',[['ZZZ','-99999']]));
 // journal
 const cas=(u,scope,rev,p)=>as(u,'select public.journal_cas($1,$2,$3::jsonb) r',[scope,rev,JSON.stringify(p)]);
 ok((await cas(U1,'US',0,payloadUS([tradeM,tradeOld,tradeBroker])))[0].r==1,'U1 US journal saved');
 ok((await cas(U2,'US',0,{...payloadUS([{...tradeM,id:'u2',name:'U2ONLY'}]),settings:{limD:9}}))[0].r==1,'U2 US journal saved');
 const hlTrades=[{id:'h1',name:'BTC',market:'HL',direction:'short',date:shift(today,-1),entries:[{id:'a',date:shift(today,-1),time:'01:00',shares:1,price:100,fee:0}],fills:[{id:'b',date:shift(today,-1),time:'02:00',shares:1,price:90,fee:0}],funding:[]}];
 ok((await cas(U1,'HL',0,{format:'trade-journal-hyperliquid',currency:'USDC',trades:hlTrades,settings:{limD:3,account:1000},sync:{hyperliquid:{account:'hl-acct',accountFunding:{currency:'USDC',unassignedRecords:[{sourceKey:'fk',timestamp:Date.now()-3600000,amount:'-1.5'}]}}}}))[0].r==1,'U1 HL journal saved');
 // HL raw data for U1
 await as(U1,'select public.hl_set_address($1)',[ADDR]);
 for(const f of FILLS)await sys('insert into public.hl_fills(address,tid,time,coin,raw) values($1,$2,$3,$4,$5::jsonb) on conflict do nothing',[ADDR,f.tid,f.time,f.coin,JSON.stringify(f)]);
 for(const f of FUND)await sys('insert into public.hl_funding(address,time,coin,raw) values($1,$2,$3,$4::jsonb) on conflict do nothing',[ADDR,f.time,f.delta.coin,JSON.stringify(f)]);

 // privileges
 ok(await fails(null,'select public.alert_status($1)',[newToken()]),'unknown token rejected');
 ok(await fails(null,'select public.alert_status($1)',['kwc_short']),'malformed token rejected');
 ok(await fails(null,'select public.alert_status($1)',[null]),'null token rejected');
 for(const [fn,args] of [['alert_journal',`'${U1}'::uuid,'US','2026-01-01',null`],['alert_hl',`'${U1}'::uuid,'2026-01-01'`],['alert_event',`'{}'::jsonb`],['alert_events',`'[]'::jsonb`]]){
  ok(await fails(null,`select public.${fn}(${args})`),`anon cannot call internal ${fn}`);
  ok(await fails(U1,`select public.${fn}(${args})`),`authenticated cannot call internal ${fn}`);
 }
 const before=(await sys('select last_seen_at,last_push_at,push_count,last_reject from public.kw_collector where user_id=$1',[U1]))[0];
 const call=async(t,...a)=>(await as(null,`select public.alert_status($1${a.map((_,i)=>',$'+(i+2)).join('')}) r`,[t,...a]))[0].r;
 const r=await call(T1);
 ok(r.ok===true&&r.version===1&&Number(r.now)>0,'anon + token gets ok');
 const fromDate=r.from;ok(fromDate===shift(today,-62),'window starts 62 days ago (UTC)');
 // Kiwoom part
 const days=r.us.kw.days;
 ok(days.length===2&&days[1].date===today&&days[1].total==='-300.5'&&days[0].total==='20','Kiwoom daily totals of U1 only');
 ok(days[0].rows.length===2&&days[0].rows.find(x=>x.symbol==='NVDA').t==='23:40:00','per-symbol rows with last sell time');
 ok(!JSON.stringify(r).includes('99999')&&!JSON.stringify(r).includes('U2ONLY'),'nothing of U2 leaks');
 ok(r.us.kw.latest.summary.cash.usd==='765.44'&&r.us.kw.latest.positions[0].reportedPnl==='14.7','latest summary (cash) and positions');
 // journal part
 const j=r.us.journal;
 ok(j.exists&&j.revision==1&&!j.unchanged,'US journal returned with revision');
 ok(j.settings.limD===1&&j.settings.limW===2&&j.settings.limM===4&&j.settings.account===50000,'loss limits and account basis');
 ok(j.trades.length===1&&j.trades[0].id==='m1','manual trade in window only (old and broker trades excluded)');
 const js=JSON.stringify(j);
 ok(!js.includes('비밀')&&!js.includes('image')&&!js.includes('violation')&&!js.includes('analytics')&&!js.includes('"note"'),'no photos, reviews, notes or other settings');
 ok(j.trades[0].entries[0].fee===1&&j.trades[0].fills[0].price===90,'event numbers kept');
 ok(j.broker_days.length===1&&j.broker_days[0].date===shift(today,-3)&&j.broker_days[0].total==='-5','app-applied broker days in window');
 // HL part
 const hl=r.hl;
 ok(hl.raw.installed===true&&hl.raw.registered===true&&hl.raw.address===ADDR,'HL raw registered');
 const fromMs=Date.parse(fromDate+'T00:00:00Z');const num=/^-?[0-9]{1,15}(\.[0-9]{1,18})?$/;
 const okFill=f=>f.time>=fromMs&&f.feeToken==='USDC'&&num.test(f.closedPnl)&&num.test(f.fee);
 const exp={};for(const f of FILLS.filter(okFill)){const d=new Date(f.time).toISOString().slice(0,10);exp[d]=(exp[d]||0)+Number(f.closedPnl)-Number(f.fee);}
 const got=Object.fromEntries(hl.raw.fills_daily.map(x=>[x.date,x.pnl]));
 ok(Object.keys(exp).length>3&&Object.keys(exp).length===Object.keys(got).length&&Object.keys(exp).every(d=>Math.abs(exp[d]-Number(got[d]))<1e-6),'fills_daily = sum(closedPnl - fee) per UTC date ('+Object.keys(exp).length+' days)');
 const expF={};for(const f of FUND.filter(f=>f.time>=fromMs)){const d=new Date(f.time).toISOString().slice(0,10);expF[d]=(expF[d]||0)+Number(f.delta.usdc);}
 const gotF=Object.fromEntries(hl.raw.funding_daily.map(x=>[x.date,x.amount]));
 ok(Object.keys(expF).length>0&&Object.keys(expF).every(d=>Math.abs(expF[d]-Number(gotF[d]))<1e-9),'funding_daily = sum(delta.usdc) per UTC date');
 ok(hl.raw.skipped_fills===FILLS.filter(f=>f.time>=fromMs&&!okFill(f)).length,'non-USDC fee fills are counted as skipped');
 // reference round trips in JS
 const ref=[];const by={};for(const f of FILLS.filter(f=>okFill(f)&&num.test(f.startPosition)&&num.test(f.sz)&&['A','B'].includes(f.side)).sort((a,b)=>a.time-b.time||a.tid-b.tid)){
  const sp=Number(f.startPosition),ep=sp+(f.side==='B'?1:-1)*Number(f.sz);const g=by[f.coin]||(by[f.coin]={pnl:0,n:0});g.pnl+=Number(f.closedPnl)-Number(f.fee);
  const end=f.startPosition+(f.side==='B'?'+':'-')+f.sz;void end;
  const closes=sp!==0&&(Math.abs(ep)<1e-12||Math.sign(ep)!==Math.sign(sp));
  if(closes){ref.push({coin:f.coin,closed_at:f.time,pnl:g.pnl});by[f.coin]={pnl:0,n:0};}}
 ref.sort((a,b)=>b.closed_at-a.closed_at||a.coin.localeCompare(b.coin));
 const top=ref.slice(0,30);
 ok(hl.raw.closed.length===Math.min(30,ref.length)&&hl.raw.closed.every((c,i)=>c.coin===top[i].coin&&Number(c.closed_at)===top[i].closed_at&&Math.abs(Number(c.pnl)-top[i].pnl)<1e-6),'closed round trips match a JS reference ('+ref.length+' trips)');
 ok(hl.journal.exists&&hl.journal.settings.limD===3&&hl.journal.trades.length===1&&hl.journal.hl_account==='hl-acct'&&hl.journal.account_funding.length===1,'HL journal settings, trades, account funding');
 // the server model built from the real SQL output
 const us=core.buildUS(r,r.us.journal);const sumU=us.ledger.reduce((a,e)=>a+e.usd,0);
 ok(close(sumU,-286.5)&&us.kiwoom&&us.basis===2000&&us.zone==='Asia/Seoul','US model: broker days replace manual records of those dates; basis = Kiwoom securities + USD cash');
 const hm=core.buildHL(r,r.hl.journal,{});const sumH=hm.ledger.reduce((a,e)=>a+e.usd,0);
 const expH=Object.values(exp).reduce((a,b)=>a+b,0)+Object.values(expF).reduce((a,b)=>a+b,0)+10;
 ok(Math.abs(sumH-expH)<1e-6&&hm.useRaw&&hm.basis===1000&&hm.closed.length===31,'HL model: collector fills + funding + manual HL trade, account funding not double counted');
 // revision cache
 const r2=await call(T1,1,1);
 ok(r2.us.journal.unchanged===true&&r2.us.journal.revision==1&&!('trades' in r2.us.journal)&&r2.hl.journal.unchanged===true,'known revision -> only revision returned');
 ok((await call(T1,0,null)).us.journal.trades.length===1,'stale revision -> full journal');
 // no side effects besides the shared rate-limit counter
 const after=(await sys('select last_seen_at,last_push_at,push_count,last_reject from public.kw_collector where user_id=$1',[U1]))[0];
 ok(JSON.stringify(before)===JSON.stringify(after),'collector status (last seen/push/reject) untouched');
 // rate limit: does not write last_reject (the app shows that as a collector error)
 await sys('update public.kw_collector set window_start=now(),window_count=61 where user_id=$1',[U1]);
 const rl=await call(T1);
 ok(rl.ok===false&&rl.error==='rate_limited','rate limited above 60 calls/minute (shared with the collector)');
 ok((await sys('select last_reject from public.kw_collector where user_id=$1',[U1]))[0].last_reject===null,'rate limit does not mark the collector as rejected');
 // revoked token
 await as(U1,'select public.kw_revoke_token()');
 ok(await fails(null,'select public.alert_status($1)',[T1]),'revoked token rejected');
 // U2 sees its own data
 const r3=await call(T2);ok(r3.us.kw.days[0].total==='-99999'&&r3.us.journal.settings.limD===9&&r3.hl.raw.registered===false&&r3.hl.journal.exists===false,'U2 token returns U2 data only');
}
// ---------- without hl-collector.sql ----------
{
 const {as,fails}=await setup(false);
 const T=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T)]);
 const r=(await as(null,'select public.alert_status($1) r',[T]))[0].r;
 ok(r.ok&&r.hl.raw.installed===false&&r.hl.raw.registered===false&&r.us.journal.exists===false&&r.us.kw.days.length===0&&r.us.kw.latest===null,'works without hl-collector.sql and without any data');
 ok(await fails(U1,'select public.alert_hl($1,$2)',[U1,'2026-01-01'],/permission denied|does not exist/),'alert_hl not callable');
}
console.log(`\n${passed} passed`);
