/* SQL test for alert17.sql (방향 전환 기록 flip_alerts + flip_push) + security/harden-2026-11.sql 실행 순서.
   node tests/alert17-sql.pglite.mjs <cloud 폴더>   (cloud.sql, kiwoom-collector.sql, alert17.sql, security/harden-2026-11.sql)
   Supabase 기본 권한(새 테이블·함수를 anon/authenticated 에 자동 GRANT)을 흉내 낸 상태에서 검사. */
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
import * as fl from '../src/flip.mjs';
const C=process.argv[2];if(!C){console.error('usage: node tests/alert17-sql.pglite.mjs <cloud dir>');process.exit(2);}
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
async function setup(){const db=new PGlite();await db.exec(PRE);await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));
 const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
 const err=async(user,q,params=[])=>{try{await as(user,q,params);return null;}catch(e){return e.message;}};
 return {db,as,err};}

// ---- A. 표·함수 ----
{
 const {db,as,err}=await setup();
 await db.exec(read('alert17.sql'));await db.exec(read('alert17.sql'));ok(true,'alert17.sql 두 번 실행 — 오류 없음(멱등)');
 const T1=newToken(),T2=newToken();
 await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
 const push=(t,p)=>as(null,'select public.flip_push($1,$2::jsonb) r',[t,JSON.stringify(p)]).then(x=>x[0].r);
 // 서버가 실제로 만드는 항목(flip.mjs flipItem) — 실제 11-03 kPEPE 체결
 const fills=JSON.parse(fs.readFileSync(new URL('./fixtures/hl-kpepe-20261103.json',import.meta.url),'utf8'));
 const ev=fl.detectFlips(fills)[0];
 const item=fl.flipItem(ev,{order:{orderType:'Limit',tif:'Gtc',origSz:'14476670.0',reduceOnly:false},now:1793711170000});
 let r=await push(T1,{items:[]});ok(r.ok===true&&r.version===17&&r.stored===0,'빈 목록 = 설치 확인(probe) · version 17');
 ok(/invalid collector token/.test(await err(null,'select public.flip_push($1,$2::jsonb)',[newToken(),'{"items":[]}'])),'모르는 토큰 거부');
 r=await push(T1,{items:[item]});ok(r.ok&&r.stored===1,'kPEPE 한 주문 반전 저장(flipItem 그대로)');
 let row=(await as(U1,"select kind,symbol,prev_dir,prev_size,new_dir,new_size,px,oid,tid,reduce_only,reduce_only_source,order_type,orig_sz,to_char(at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') kst from public.flip_alerts"))[0];
 ok(row.kind==='order'&&row.symbol==='kPEPE'&&row.prev_dir==='long'&&Number(row.prev_size)===4456063&&row.new_dir==='short'&&Number(row.new_size)===10020607,'방향·수량');
 ok(row.oid==='593328614662'&&row.tid==='542311978803344'&&row.reduce_only===false&&row.reduce_only_source==='order'&&row.order_type==='Limit'&&Number(row.orig_sz)===14476670,'oid·tid·reduce-only 아님·주문 정보');
 ok(row.kst==='2026-11-03 22:05:13'&&Number(row.px)===0.004874,'시각(KST)·체결가');
 // 크기 갱신(같은 주문 체결이 더 붙음): 주문 정보 없는 항목이 와도 reduce_only·order_type 유지, sent_at 유지
 const {reduce_only,reduce_only_source,order_type,tif,orig_sz,...sizeOnly}=item;
 r=await push(T1,{items:[{...sizeOnly,new_size:10020608,sent_at:1793711999000}]});
 row=(await as(U1,"select new_size,reduce_only,order_type,extract(epoch from sent_at)*1000 s from public.flip_alerts"))[0];
 ok(Number(row.new_size)===10020608&&row.reduce_only===false&&row.order_type==='Limit'&&Number(row.s)===1793711170000,'재전송: 크기만 갱신 · 주문 정보·처음 보낸 시각 유지');
 // 창(window) + HIP-3 dex
 const w={ref:'fl:hl:xyz:TSLA:42',market:'hl',kind:'window',symbol:'xyz:TSLA',dex:'xyz',prev_dir:'long',prev_size:10,new_dir:'short',new_size:5,px:421.5,at:1793711113786,
  oid:'42',tid:'4200',close_oid:'41',close_tid:'4100',close_at:1793710873786,gap_sec:240,reduce_only:null,reduce_only_source:null,order_type:null,tif:null,orig_sz:null,detail:{closeReduceOnly:true},sent_at:1793711120000};
 r=await push(T1,{items:[w]});ok(r.ok,'HIP-3 dex 코인 · 청산 4분 뒤 반대 진입 저장');
 ok((await push(T1,{items:[{...w,kind:'flip'}]})).error==='bad_item','모르는 kind 거부');
 ok((await push(T1,{items:[{...w,ref:'rv:hl:1'}]})).error==='bad_item','fl:hl: 접두어 아닌 ref 거부');
 ok((await push(T1,{items:[{...w,symbol:'BTC; drop'}]})).error==='bad_item','코인 형식 거부');
 ok((await push(T1,{items:[{...w,oid:'12a'}]})).error==='bad_item','oid 숫자 아님 거부');
 ok((await push(T1,{items:[{...w,at:'yesterday'}]})).error==='bad_item','시각 형식 거부');
 ok((await push(T1,{items:[{...w,new_size:-1}]})).error==='bad_number','음수 수량 거부');
 ok((await push(T1,{items:[{...w,new_size:'5'}]})).error==='bad_number','문자열 수량 거부');
 ok((await push(T1,{items:[{...w,detail:{x:'y'.repeat(5000)}}]})).error==='bad_detail','큰 detail 거부');
 ok((await push(T1,{items:'x'})).error==='bad_payload','items 배열 아님 거부');
 ok((await push(T1,{items:Array(51).fill(w)})).error==='bad_payload','51개 초과 거부');
 await push(T2,{items:[{...w,ref:'fl:hl:BTC:7',symbol:'BTC',dex:null,oid:'7'}]});
 ok((await as(U1,'select ref from public.flip_alerts order by ref')).length===2,'U1 = 자기 행 2개만');
 ok((await as(U2,'select ref from public.flip_alerts')).length===1,'U2 = 자기 행 1개만');
 ok(/permission denied/.test(await err(null,'select * from public.flip_alerts')||''),'anon 직접 읽기 거부');
 await as(U1,"update public.flip_alerts set applied_at=now(),applied_result='tagged' where ref='fl:hl:kPEPE:593328614662'");
 ok((await as(U1,"select applied_result from public.flip_alerts where ref='fl:hl:kPEPE:593328614662'"))[0].applied_result==='tagged',"앱이 '주문 실수' 태그 반영 표시(applied_*)");
 ok(/permission denied/.test(await err(U1,"update public.flip_alerts set new_size=1")||''),'앱은 다른 열 못 바꿈(열 권한)');
 ok(/permission denied/.test(await err(U1,"delete from public.flip_alerts")||''),'앱 delete 거부');
 ok(/permission denied|violates/.test(await err(U1,"insert into public.flip_alerts(user_id,ref,kind,symbol,prev_dir,new_dir,at) values($1,'fl:hl:X:1','order','X','long','short',now())",[U1])||''),'앱 insert 거부');
 await push(T1,{items:[{...sizeOnly,new_size:10020609}]});
 ok((await as(U1,"select applied_result from public.flip_alerts where ref='fl:hl:kPEPE:593328614662'"))[0].applied_result==='tagged','서버 재전송이 applied_* 를 지우지 않음');
 ok((await as(U2,"select count(*) n from public.flip_alerts where ref='fl:hl:kPEPE:593328614662'"))[0].n==0,'다른 사용자는 못 봄');
}

// ---- B. harden-2026-11.sql 실행 순서 ----
{
 const {db,as,err}=await setup();const H=read('security/harden-2026-11.sql'),A=read('alert17.sql');
 const anonExec=async()=>(await db.query(`select has_function_privilege('anon','public.flip_push(text, jsonb)','execute') x`)).rows[0].x;
 await db.exec(H);await db.exec(A);
 ok(await anonExec(),'harden → alert17: anon 이 flip_push 실행 가능(서버 호출 됨)');
 const T=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T)]);
 ok((await as(null,'select public.flip_push($1,$2::jsonb) r',[T,'{"items":[]}']))[0].r.ok===true,'harden → alert17: 토큰으로 probe 성공');
 await db.exec(H);
 ok(!(await anonExec()),'alert17 → harden(다시): harden 허용 목록에 없어 anon 실행권 회수됨(기록 막힘) — 그래서 harden 먼저');
 await db.exec(A);
 ok(await anonExec(),'그 뒤 alert17.sql 한 번 더 → 복구');
 ok(!(await db.query(`select has_table_privilege('anon','public.flip_alerts','select') x`)).rows[0].x,'flip_alerts 는 anon 에 안 열림(Supabase 기본 권한이 있어도)');
}
console.log('ALL OK '+passed);
