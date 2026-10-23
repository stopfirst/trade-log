/* SQL test for alert9.sql (텔레그램 즉시 복기 quick_reviews + quick_review_push). Needs @electric-sql/pglite resolvable.
   node tests/alert9-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <alert9.sql> */
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
const [cloudPath,kwPath,a9Path]=process.argv.slice(2);
const read=p=>fs.readFileSync(p,'utf8');
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222';
const PRE=`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
insert into auth.users values('${U1}'),('${U2}');`;
let passed=0;const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exit(1);}passed++;console.log('ok',m);};
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const db=new PGlite();await db.exec(PRE);await db.exec(read(cloudPath));await db.exec(read(kwPath));
await db.exec(read(a9Path));await db.exec(read(a9Path)); // 두 번 실행해도 안전(멱등)
ok(true,'alert9.sql 두 번 실행 — 오류 없음(멱등)');
const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
const fails=async(user,q,params=[],re=/permission denied|invalid collector token|violates row-level/)=>{try{await as(user,q,params);return false;}catch(e){return re.test(e.message)?true:(console.error('unexpected',e.message),false);}};
const T1=newToken(),T2=newToken();
await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
const push=(t,p)=>as(null,'select public.quick_review_push($1,$2::jsonb) r',[t,JSON.stringify(p)]).then(x=>x[0].r);
const item=(o={})=>({ref:'hl:900001',market:'hl',symbol:'BTC',direction:'long',close_key:'900001',close_at:1792760000000,pnl:120.5,r:0.6,decision:'compliant',violations:[],...o});
ok((await push(T1,{items:[]})).ok===true&&(await push(T1,{items:[]})).version===9,'빈 items = 설치 확인(probe) · version 9 (anon + 토큰, service_role 불필요)');
ok(await fails(null,'select public.quick_review_push($1,$2::jsonb)',[newToken(),'{"items":[]}']),'모르는 토큰 거부');
ok(await fails(null,'select public.quick_review_push($1,$2::jsonb)',['kwc_short','{"items":[]}']),'형식 틀린 토큰 거부');
let r=await push(T1,{items:[item()]});ok(r.ok&&r.stored===1,'준수 답 저장');
r=await push(T1,{items:[item({ref:'hl:900002',close_key:'900002',symbol:'xyz:INTC',direction:'short',decision:'violation',violations:['추격','손절 지연'],pnl:-40,r:null})]});ok(r.ok,'위반 답 저장(HIP-3 종목, R 없음)');
ok((await push(T1,{items:[item({decision:'later'})]})).error==='bad_item','decision later/기타 거부');
ok((await push(T1,{items:[item({ref:'us:1',market:'hl'})]})).error==='bad_item','ref 접두어와 market 불일치 거부');
ok((await push(T1,{items:[item({symbol:'BTC; drop'})]})).error==='bad_item','종목 형식 거부');
ok((await push(T1,{items:[item({decision:'violation',violations:['x'.repeat(41)]})]})).error==='bad_violations','긴 위반 라벨 거부');
ok((await push(T1,{items:[item({pnl:'12'})]})).error==='bad_item','pnl 문자열 거부');
ok((await push(T1,{items:'x'})).error==='bad_payload','items 배열 아님 거부');
await push(T2,{items:[item({ref:'hl:777',close_key:'777',symbol:'SOL'})]});
// RLS: 앱 사용자는 자기 행만 읽음
const mine=await as(U1,'select ref,decision,violations,pnl,applied_at from public.quick_reviews order by ref');
ok(mine.length===2&&mine[0].ref==='hl:900001'&&mine[1].violations.join(',')==='추격,손절 지연'&&Number(mine[0].pnl)===120.5,'U1 = 자기 행 2개만(위반 항목 순서 유지)');
ok((await as(U2,'select ref from public.quick_reviews')).length===1,'U2 = 자기 행 1개만');
ok(await fails(null,'select * from public.quick_reviews'),'anon 직접 읽기 거부');
// 앱: applied_at·applied_result만 바꿀 수 있음
await as(U1,"update public.quick_reviews set applied_at=now(),applied_result='applied' where ref='hl:900001'");
ok((await as(U1,"select applied_result from public.quick_reviews where ref='hl:900001'"))[0].applied_result==='applied','앱이 반영 표시(applied_at·applied_result)');
ok(await fails(U1,"update public.quick_reviews set decision='violation' where ref='hl:900001'"),'앱은 decision 못 바꿈(열 권한)');
await as(U1,"update public.quick_reviews set applied_result='kept' where ref='hl:777'");
ok((await as(U2,"select applied_result from public.quick_reviews"))[0].applied_result===null,'다른 사용자 행은 못 바꿈(RLS)');
ok(await fails(U1,"insert into public.quick_reviews(user_id,ref,market,symbol,direction,close_key,close_at,decision) values('"+U1+"','hl:1','hl','BTC','long','1',now(),'compliant')"),'앱 직접 insert 거부');
ok(await fails(U1,"delete from public.quick_reviews"),'앱 delete 거부');
// 같은 ref 다시: 같은 답이면 applied 유지, 다른 답이면 applied 지움
await push(T1,{items:[item()]});ok((await as(U1,"select applied_result from public.quick_reviews where ref='hl:900001'"))[0].applied_result==='applied','같은 답 재전송 → 반영 표시 유지');
await push(T1,{items:[item({decision:'violation',violations:['추격']})]});
const ch=(await as(U1,"select decision,violations,applied_at from public.quick_reviews where ref='hl:900001'"))[0];
ok(ch.decision==='violation'&&ch.violations[0]==='추격'&&ch.applied_at===null,'답이 바뀌면 덮어쓰고 applied 지움(앱이 다시 확인)');
await push(T1,{items:[item({decision:'compliant',violations:['추격']})]});
ok((await as(U1,"select violations from public.quick_reviews where ref='hl:900001'"))[0].violations.length===0,'준수면 위반 항목 비움');
console.log('ALL OK '+passed);
