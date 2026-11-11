/* SQL test for alert21.sql (fresh_status — 앱 v126 새 출발 기준 시각) · node tests/alert21-sql.pglite.mjs <cloud 폴더>
   (cloud.sql, kiwoom-collector.sql, alert21.sql, security/harden-2026-11.sql)
   설정 v126 칸만 나감(보관함·거래·메모·다른 설정 안 나감) · 다른 사용자 것 안 나감 · 틀린 토큰 거부 · 형식 이상한 칸은 null · 다시 실행 안전 · harden 뒤 다시 실행하면 anon 실행 · 서버 파서와 맞음 */
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
import * as fr from '../src/fresh.mjs';
const C=process.argv[2];if(!C){console.error('usage: node tests/alert21-sql.pglite.mjs <cloud dir>');process.exit(2);}
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
const CUT=Date.parse('2026-11-11T16:39:00Z');
const hl={format:'trade-journal-hyperliquid',currency:'USDC',settings:{limD:2.5,account:1000,v126:{on:true,v:1,epoch:'emvabc123',cutoff:CUT,day:'2026-11-11',at:CUT,eq:9876.54,carry:['auto:x:long','auto:y:short'],market:'HL',secret:'비밀'}},
 trades:[{id:'auto:x:long',name:'SOL',review:'비밀 복기',v126Carry:'emvabc123'}],v126Archive:{epoch:'emvabc123',state:{trades:[{id:'old',review:'보관 비밀'}]}}};
const us={format:'trade-journal-usd',currency:'USD',settings:{account:5000},trades:[]};
const other={format:'trade-journal-hyperliquid',currency:'USDC',settings:{v126:{on:true,epoch:'emvother',cutoff:CUT+1,eq:1}},trades:[]};
const db=new PGlite();await db.exec(PRE);await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));
const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
const T1=newToken(),T2=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
await db.query(`insert into public.journal_cloud(user_id,scope,payload,revision) values($1,'HL',$2::jsonb,3),($1,'US',$3::jsonb,1),($4,'HL',$5::jsonb,1)`,[U1,JSON.stringify(hl),JSON.stringify(us),U2,JSON.stringify(other)]);
const call=t=>as(null,'select public.fresh_status($1) r',[t]).then(x=>x[0].r);
let missing=false;try{await call(T1);}catch(e){missing=/fresh_status/.test(String(e.message));}ok(missing,'alert21.sql 전: 함수 없음(서버는 SUPABASE_ALERT21_SQL_NOT_INSTALLED → 2.16.0처럼)');
await db.exec(read('alert21.sql'));await db.exec(read('alert21.sql'));ok(true,'두 번 실행해도 됨');
const r=await call(T1);
ok(r.ok===true&&r.version===1,'ok·version 1');
ok(JSON.stringify(Object.keys(r.journal).sort())==='["HL","US"]','두 일지');
ok(r.journal.US.v126===null,'미국 주식 일지: 새 출발 없음 = null');
const v=r.journal.HL.v126;
ok(v.on===true&&v.epoch==='emvabc123'&&v.cutoff===CUT&&v.day==='2026-11-11'&&v.eq===9876.54&&v.at===CUT,'v126 값 그대로');
ok(JSON.stringify(v.carry)==='["auto:x:long","auto:y:short"]','이월 id');
ok(!('secret' in v)&&!('market' in v),'v126의 다른 칸 안 나감');
const s=JSON.stringify(r);ok(!/비밀|보관/.test(s)&&!s.includes('v126Archive')&&!s.includes('limD'),'거래·복기·보관함·다른 설정 안 나감');
ok(!s.includes('emvother'),'다른 사용자 것 안 나감');
const r2=await call(T2);ok(r2.journal.HL.v126.epoch==='emvother'&&!('US' in r2.journal),'사용자별');
let rej=false;try{await call(newToken());}catch(e){rej=/invalid collector token/.test(String(e.message));}ok(rej,'틀린 토큰 거부');
// 형식 이상한 칸 → null · on 문자열이면 false
await db.query(`update public.journal_cloud set payload=jsonb_set(payload,'{settings,v126}',$2::jsonb) where user_id=$1 and scope='HL'`,[U1,JSON.stringify({on:'true',epoch:'x'.repeat(60),cutoff:'123',day:'2026/11/11',eq:'9',carry:[1,'a',{b:1}]})]);
const bad=(await call(T1)).journal.HL.v126;ok(bad.on===false&&bad.epoch===null&&bad.cutoff===null&&bad.day===null&&bad.eq===null&&JSON.stringify(bad.carry)==='["a"]','형식 이상한 칸 = null/false');
ok(JSON.stringify(fr.parseFresh({journal:{HL:{v126:bad}}}))==='{}','서버 파서: 꺼진/이상한 값 무시');
await db.query(`update public.journal_cloud set payload=$2::jsonb where user_id=$1 and scope='HL'`,[U1,JSON.stringify(hl)]);
const p=fr.parseFresh(await call(T1));ok(p.HL&&p.HL.epoch==='emvabc123'&&p.HL.cutoff===CUT&&p.HL.eq===9876.54&&p.HL.carry===2&&!p.US,'서버 파서와 맞음');
// 취소된 새 출발(on:false) → 서버는 무시
await db.query(`update public.journal_cloud set payload=jsonb_set(payload,'{settings,v126}',$2::jsonb) where user_id=$1 and scope='HL'`,[U1,JSON.stringify({on:false,undone:'emvabc123',epoch:'uemv1',cutoff:CUT,at:CUT+5})]);
const u=(await call(T1)).journal.HL.v126;ok(u.on===false&&u.undone==='emvabc123','취소 표시');ok(JSON.stringify(fr.parseFresh({journal:{HL:{v126:u}}}))==='{}','취소 = 서버 전체 체결로');
// harden 뒤 다시 실행
await db.exec(read('security/harden-2026-11.sql'));
let hard=false;try{await call(T1);}catch(e){hard=/permission denied/.test(String(e.message));}ok(hard,'harden 뒤: anon 실행 막힘(allow-list 밖)');
await db.exec(read('alert21.sql'));const h2=await call(T1);ok(h2.ok===true,'harden 뒤 alert21.sql 다시 실행 → anon 실행');
console.log(`ALL OK (${passed})`);
