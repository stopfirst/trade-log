/* SQL test for alert18.sql (review_gaps v12 — 단타 판정 칸) · node tests/alert18-sql.pglite.mjs <cloud 폴더>
   (cloud.sql, kiwoom-collector.sql, alert2.sql(risk_events), alert11.sql, alert18.sql, security/harden-2026-11.sql)
   v11 칸은 그대로 · 새 칸(체결가·수수료·timestamp·1R·펀딩 합·위반 여부·v99Why·v109 숨김·서버 중단 중 진입·설정) · 메모 본문 안 나감 · alert2.sql 없어도 동작 · harden 뒤 anon 실행 유지 · alert11.sql로 되돌리기. */
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
import * as rm from '../src/remind.mjs';import * as sc from '../src/scalp.mjs';
const C=process.argv[2];if(!C){console.error('usage: node tests/alert18-sql.pglite.mjs <cloud dir>');process.exit(2);}
const read=f=>fs.readFileSync(path.join(C,f),'utf8');
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222';
const PRE=`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values('${U1}'),('${U2}');`;
let passed=0;const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exit(1);}passed++;console.log('ok',m);};
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const TS=(d,s)=>Date.parse(d+'T'+s+'Z');
const ev=(id,d,s,px,x={})=>{const ts=TS(d,s);return {id,date:d,time:s+':00',timestamp:ts,shares:2,price:px,fee:0,seq:ts/1000,sourceKey:'hyperliquid:t:'+id,...x};};
const mk=(id,name,d,a,b,p0,p1,x={})=>({schema:5,market:'HL',id,name,direction:'long',date:d,initialRisk:10,process:'unreviewed',violations:[],entryNote:'비밀 근거',stopNote:'',holdNote:'비밀 메모',
 entries:[ev(id+'e',d,a,p0,{fillId:900000+id.length})],fills:[ev(id+'f',d,b,p1)],funding:[],images:[{data:'x'}],chartNotes:[{kind:'note',text:'비밀 차트'}],...x});
const HLT=[mk('L31','BTC','2026-10-31','00:00','00:31',100,99.5),mk('S29','ETH','2026-10-31','01:00','01:29',100,102.5),mk('SBIG','SOL','2026-10-31','01:40','01:50',100,92.5),
 mk('L1','DOGE','2026-10-31','02:10','02:30',100,99),mk('REV','AVAX','2026-10-31','02:35','02:45',100,101.5,{v109Dismiss:['nostop',5,'v99maxloss']}),
 mk('VIOL','ADA','2026-10-30','01:00','01:10',100,100.5,{violations:['추격'],process:'violation'}),
 mk('CV','XLM','2026-10-30','01:20','01:25',100,100.5,{fills:[ev('CVf','2026-10-30','01:25',100.5,{compliance:'violation'})]}),
 mk('FUND','BNB','2026-10-30','04:00','04:20',100,99,{entries:[ev('Fe','2026-10-30','04:00',100,{fee:0.5})],fills:[ev('Ff','2026-10-30','04:20',99,{fee:0.5})],funding:[{id:'fu',date:'2026-10-30',time:'04:10:00',amount:-8},{id:'bad',amount:'x'}],acctAt:300,v99Why:'plan'}),
 mk('SRV','LINK','2026-10-30','06:00','06:10',100,101,{entries:[ev('SRVe','2026-10-30','06:00',100,{fillId:777})]})];
const payload={settings:{v92From:'2026-10-25',v92MinRR:2,v121Min:25,v99Cool:10,v99MaxLoss:4,riskMax:1.5,openMax:5,account:1000},trades:HLT};
const usPayload={settings:{},trades:[{...mk('KW','meta','2026-10-30','13:31','13:50',500,499),market:'US',date:'2026-10-30',sync:{source:'kiwoom'}},{...mk('ET','NVDA','2026-10-30','14:00','14:20',100,101),market:'US'}]};
async function setup({alert2=true}={}){const db=new PGlite();await db.exec(PRE);await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));if(alert2)await db.exec(read('alert2.sql'));
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const T1=newToken(),T2=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 await db.query(`insert into public.journal_cloud(user_id,scope,payload,revision) values($1,'HL',$2::jsonb,1),($1,'US',$3::jsonb,1),($4,'HL',$5::jsonb,1)`,[U1,JSON.stringify(payload),JSON.stringify(usPayload),U2,JSON.stringify({trades:[mk('OTHER','X','2026-10-31','00:00','00:05',1,1)]})]);
 const call=(t,d='2026-10-31')=>as(null,'select public.review_gaps($1,$2::date) r',[t,d]).then(x=>x[0].r);
 return {db,as,call,T1,T2};}

// ---- A. v11 → v12: 예전 칸 그대로, 새 칸 추가 ----
{const {db,call,T1,T2}=await setup();
 await db.exec(read('alert11.sql'));const v11=await call(T1);ok(v11.version===11&&!sc.hasScalpData(v11.journal),'alert11.sql(v11)만 있으면 단타 칸 없음 → 서버는 예전 동작');
 // 서버가 쓴 위반 기록(risk_events): HL tid 777 = SRV 진입 · US kiwoom META 10-30 주문 · US NVDA ET 10-30
 await db.query(`insert into public.risk_events(user_id,market,ref,kind,rule,at,detail) values
  ($1,'hl','hl:viol:a','violation','day',now(),'{"tid":777,"symbol":"LINK"}'),($1,'us','us:viol:b','violation','day',now(),'{"symbol":"META","orderDate":"2026-10-30"}'),
  ($1,'us','us:viol:c','violation','day',now(),$2::jsonb),($1,'hl','hl:stop','stop','day',now(),'{"tid":900003}'),($1,'hl','hl:old','violation','day',now()-interval '200 days','{"tid":900004}')`,
  [U1,JSON.stringify({symbol:'NVDA',t:TS('2026-10-30','18:00')})]);
 await db.exec(read('alert18.sql'));await db.exec(read('alert18.sql'));ok(true,'alert18.sql 두 번 실행 — 멱등');
 const r=await call(T1);ok(r.ok&&r.version===12&&sc.hasScalpData(r.journal),'version 12 · 단타 칸 있음');
 const strip=j=>JSON.stringify(j.HL.trades.map(t=>({id:t.id,name:t.name,entries:t.entries.map(e=>({date:e.date,time:e.time,price:e.price,shares:e.shares,seq:e.seq})),fills:t.fills.map(f=>({date:f.date,time:f.time,shares:f.shares,seq:f.seq})),stop0:t.stop0,target:t.target,planRR:t.planRR,hide:t.hide,rrTp:t.rrTp,entryNote:t.entryNote,stopNote:t.stopNote,react:t.react,tfIn:t.tfIn,tfOut:t.tfOut})));
 ok(strip(r.journal)===strip(v11.journal)&&r.journal.HL.from===v11.journal.HL.from&&r.journal.HL.minRR===v11.journal.HL.minRR,'v11이 주던 칸·값은 그대로');
 const H=r.journal.HL,by=Object.fromEntries(H.trades.map(t=>[t.id,t]));
 ok(H.v121Min===25&&H.v99Cool===10&&H.v99MaxLoss===4&&H.riskMax===1.5&&H.openMax===5&&H.account===1000,'설정 v121Min·v99Cool·v99MaxLoss·riskMax·openMax·account 전달');
 ok(by.FUND.fills[0].price===99&&by.FUND.fills[0].fee===0.5&&by.FUND.entries[0].fee===0.5&&by.FUND.entries[0].timestamp===TS('2026-10-30','04:00')&&Number(by.FUND.funding)===-8&&by.FUND.acctAt===300&&by.FUND.v99Why==='plan','체결가·수수료·timestamp·HL 펀딩 합(숫자 아닌 값 무시)·acctAt·v99Why');
 ok(by.VIOL.viol===true&&by.VIOL.process==='violation'&&by.L31.viol===false&&by.CV.fillViol===true&&by.L31.fillViol===false&&by.L31.initialRisk===10,'위반 여부(라벨은 안 나감)·청산 위반 표시·1R');
 ok(JSON.stringify(by.REV.dismiss)==='["nostop","v99maxloss"]'&&JSON.stringify(by.L31.dismiss)==='[]','v109 숨김 키(문자열만)');
 ok(by.SRV.srvViol===true&&by.L31.srvViol===false&&by.SBIG.srvViol===false,'서버 중단 중 진입: HL tid = 진입 fillId만 · stop 종류·120일 지난 기록은 무시');
 const U=Object.fromEntries(r.journal.US.trades.map(t=>[t.id,t]));ok(U.KW.srvViol===true&&U.ET.srvViol===true&&U.KW.src==='kiwoom'&&U.KW.funding===null,'US: 키움 = 종목|주문일, 그 밖 = 종목|진입 ET 날짜(앱 v21Viol과 같음) · US 펀딩 없음');
 const txt=JSON.stringify(r);ok(!/비밀|추격|images/.test(txt),'메모 본문·위반 라벨·사진·차트 메모는 안 나감');
 ok((await call(T2)).journal.HL.trades.map(t=>t.id).join()==='OTHER','다른 사용자 토큰 = 그 사용자 일지만');
 // 서버 판정과 연결 (앱 설정 v121Min 25 · 쿨다운 10 · 4연패 · 위험 1.5%)
 const m=sc.model(H,true,sc.scopeMin(H,sc.scalpConfig({}))),o={};for(const [t,x] of m)o[t.id]=x;
 ok(o.S29.scalp===false&&o.L1.scalp===true&&o.L1.exc.length===0&&o.SBIG.exc.join()==='−1R 넘긴 손실 (-1.5R)','앱 기준 25분: S29(29분) 스윙 · L1 단타 빠짐 · SBIG −1.5R 예외');
 ok(o.REV.exc.join()==='복수매매 의심','REV: 쿨다운 10분 안(5분) → 복수매매 의심만(4연패 기준 미만)');
 ok(o.VIOL.exc.join()==='규칙 위반'&&o.CV.exc.join()==='규칙 위반'&&o.SRV.exc.join()==='거래 중단 중 진입','저장 위반·청산 위반·서버 중단 중 진입 = 예외');
 ok(o.FUND.R===-1.1&&o.FUND.exc.includes('−1R 넘긴 손실 (-1.1R)')&&o.FUND.exc.includes('포지션 위험 3.33% > 1.5%'),'FUND: 수수료·펀딩 포함 −1.1R + 위험 3.33% > 1.5%(acctAt 300)');
 let ns=0;const rows=rm.pick(r.journal,'2026-10-31',{scalp:sc.scalpConfig({}),onScalp:()=>ns++});ok(ns===1&&rows.map(x=>x.name).join()==='BTC,ETH,SOL,AVAX','pick 10-31: L1만 빠짐(1건)');
 // 되돌리기: alert11.sql 다시 → v11
 await db.exec(read('alert11.sql'));ok((await call(T1)).version===11,'alert11.sql 다시 실행 = v11로 되돌림');
}
// ---- B. alert2.sql(risk_events) 없어도 동작 · harden 뒤 anon 실행 유지 ----
{const {db,as,call,T1}=await setup({alert2:false});await db.exec(read('alert18.sql'));const r=await call(T1);ok(r.version===12&&r.journal.HL.trades.every(t=>t.srvViol===false),'risk_events 없으면 srvViol=false로 동작');
 await db.exec(read('security/harden-2026-11.sql'));ok((await db.query(`select has_function_privilege('anon','public.review_gaps(text, date)','execute') a`)).rows[0].a===true,'harden 뒤에도 anon 실행 가능(허용 목록)');
 await db.exec(read('alert18.sql'));ok((await call(T1)).version===12&&(await db.query(`select has_function_privilege('anon','public.review_gaps(text, date)','execute') a, has_function_privilege('public','public.review_gaps(text, date)','execute') p`)).rows[0].p===false,'harden 뒤 alert18 다시 실행 OK · public 실행권 없음');
 let bad=false;try{await call(newToken());}catch(e){bad=/invalid collector token/.test(e.message);}ok(bad,'모르는 토큰 거부');ok((await call(T1,'2019-01-01')).error==='bad_since','이상한 날짜 거부');}
console.log(passed+' passed');
