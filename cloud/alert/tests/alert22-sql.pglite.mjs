/* SQL test for alert22.sql (review_gaps v13 — 앱 v132 일지 빈 칸 칸) · node tests/alert22-sql.pglite.mjs <cloud 폴더>
   (cloud.sql, kiwoom-collector.sql, alert2.sql, alert11.sql, alert18.sql, alert22.sql, security/harden-2026-11.sql)
   v12 칸은 그대로 · 새 칸(ecom·xcom·eOld·xOld·avoidable·feePend)은 예/아니오만(글 본문 안 나감) · 멱등 · harden 뒤 anon 실행 유지 · alert18.sql로 되돌리기
   · 앱 대조: cloud/index.html의 실제 v132Has(v132 블록 그대로 꺼내 실행)와 서버 hasComment가 거래마다 같은지(진입·청산 각각). */
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createHash,randomBytes} from 'node:crypto';
import * as rm from '../src/remind.mjs';import * as sc from '../src/scalp.mjs';
const C=process.argv[2];if(!C){console.error('usage: node tests/alert22-sql.pglite.mjs <cloud dir>');process.exit(2);}
const read=f=>fs.readFileSync(path.join(C,f),'utf8');
const U1='11111111-1111-1111-1111-111111111111';
const PRE=`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values('${U1}');`;
let passed=0;const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exit(1);}passed++;console.log('ok',m);};
const newToken=()=>'kwc_'+randomBytes(32).toString('base64url');const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
// ---- 앱 v132 판정 함수 그대로 꺼내기(cloud/index.html) ----
const html=read('index.html');const a=html.indexOf("const V132_EOLD=");const b=html.indexOf("function v132Has(");ok(a>0&&b>a,'앱 index.html에 v132 블록 있음');
const src=html.slice(a,html.indexOf('\n',b));const want=['const V132_EOLD','const V132_XOLD','const V132_F','function v132Txt','function v132Old','function v132Saved','function v132Shown','function v132Has'];
const pieces=src.split('\n').filter(l=>want.some(w=>l.startsWith(w)));ok(pieces.length===want.length,'앱 v132 함수 8개 꺼냄');
const ctx={};vm.createContext(ctx);vm.runInContext(pieces.join('\n')+'\nthis.v132Has=v132Has;',ctx);const appHas=ctx.v132Has;
ok(appHas({entryComment:'a'},'entryComment')===true&&appHas({entryComment:'',entryNote:'x'},'entryComment')===false&&appHas({entryNote:'x'},'entryComment')===true,'앱 함수 동작 확인');
// ---- 거래 모음: 코멘트·옛 칸 조합 + 공백·줄바꿈·숫자·null 같은 이상한 값 ----
const ev=(id,d,s,px,x={})=>({id,date:d,time:s+':00',timestamp:Date.parse(d+'T'+s+'Z'),shares:1,price:px,fee:0,seq:1,...x});
let n=0;const mk=(x={},open=false)=>{const id='T'+(++n);return {schema:5,market:'HL',id,name:'C'+n,direction:'long',date:'2026-11-17',initialRisk:10,process:'unreviewed',violations:[],
 entries:[ev(id+'e','2026-11-17','01:00',100)],fills:open?[]:[ev(id+'f','2026-11-17','03:00',101)],funding:[],images:[{data:'x'}],...x};};
const V=[undefined,null,'','   ','\n\t ','글 비밀',' 비밀 ',5,true,{a:'비밀'}];
const T=[];
for(const ec of V)for(const old of [undefined,'','비밀 근거'])T.push(mk({entryComment:ec,stopNote:old}));
for(const xc of V)for(const old of [undefined,'  ','비밀 청산'])T.push(mk({exitComment:xc,review:old,entryComment:'x'}));
T.push(mk({entryNote:'비밀'},true),mk({holdNote:'비밀'}),mk({exitNote:'\n비밀'}),mk({postEval:'비밀'}),mk({entryNote:3}));
for(const av of [true,false,null,'예',1])T.push(mk({avoidable:av,entryComment:'x',exitComment:'y'}));
for(const sy of [undefined,null,{source:'hyperliquid',feeComplete:true},{source:'hyperliquid',feeComplete:false},{source:'hyperliquid'},{feeComplete:1},{feeComplete:0},{feeComplete:''},{feeComplete:'y'},'str','',0,1,true,false,[]])
 T.push(mk({sync:sy,entryComment:'x'}));
const syncCases=T.slice(-16);
const payload={settings:{v92From:'2026-11-01',v121Min:30},trades:T};
const db=new PGlite();await db.exec(PRE);await db.exec(read('cloud.sql'));await db.exec(read('kiwoom-collector.sql'));await db.exec(read('alert2.sql'));
const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
const T1=newToken();await as(U1,'select public.kw_register_token($1)',[hash(T1)]);
await db.query(`insert into public.journal_cloud(user_id,scope,payload,revision) values($1,'HL',$2::jsonb,1)`,[U1,JSON.stringify(payload)]);
const call=(d='2026-11-17')=>as(null,'select public.review_gaps($1,$2::date) r',[T1,d]).then(x=>x[0].r);
await db.exec(read('alert11.sql'));await db.exec(read('alert18.sql'));const v12=await call();ok(v12.version===12&&!rm.hasV132Data(v12.journal),'alert18.sql(v12)만 있으면 v132 칸 없음 → 서버는 예전 기준');
await db.exec(read('alert22.sql'));await db.exec(read('alert22.sql'));ok(true,'alert22.sql 두 번 실행 — 멱등');
const r=await call();ok(r.ok&&r.version===13&&rm.hasV132Data(r.journal),'version 13 · v132 칸 있음');
// v12 칸 그대로
const drop=t=>{const {ecom,xcom,eOld,xOld,avoidable,feePend,...x}=t;return x;};
ok(JSON.stringify(r.journal.HL.trades.map(drop))===JSON.stringify(v12.journal.HL.trades)&&JSON.stringify({...r.journal.HL,trades:0})===JSON.stringify({...v12.journal.HL,trades:0}),'v12가 주던 칸·값·설정은 그대로');
ok(!/비밀|images/.test(JSON.stringify(r)),'코멘트·옛 칸 글·사진은 안 나감(예/아니오만)');
const by=Object.fromEntries(r.journal.HL.trades.map(t=>[t.id,t]));
// 앱 대조: 진입·청산 코멘트 있음 여부
let cmp=0,bad=[];for(const t of T){const s=by[t.id];for(const [k,f] of [['entry','entryComment'],['exit','exitComment']]){cmp++;const app=appHas(t,f),srv=rm.hasComment(s,k);if(app!==srv)bad.push(`${t.id} ${f}=${JSON.stringify(t[f])} old=${JSON.stringify([t.entryNote,t.stopNote,t.holdNote,t.exitNote,t.postEval,t.review])} app=${app} srv=${srv}`);}}
if(bad.length)console.error(bad.join('\n'));ok(!bad.length,`앱 v132Has와 서버 hasComment 일치 ${cmp}/${cmp}`);
// avoidable · feePend(앱 calcTrade: t.sync&&!t.sync.feeComplete)
ok(T.filter(t=>'avoidable' in t).map(t=>by[t.id].avoidable).join()==='true,false,,,','avoidable: 예/아니오만, 나머지 null');
const jsPend=t=>!!(t.sync&&!t.sync.feeComplete);const pb=syncCases.filter(t=>by[t.id].feePend!==jsPend(t));
if(pb.length)console.error(pb.map(t=>JSON.stringify(t.sync)+' srv='+by[t.id].feePend).join('\n'));ok(!pb.length,`feePend = 앱 t.sync&&!t.sync.feeComplete (${syncCases.length}가지)`);
// 판정 연결: 수수료 미확정이면 청산 코멘트 빈 칸 아님 · 보유 중이면 청산 코멘트 빈 칸 아님
const g=t=>rm.gapsV132(by[t.id],true).map(x=>x.k).join('+');
ok(g(syncCases[3])===''&&g(syncCases[2])==='xcom'&&g(T.find(t=>t.entryNote==='비밀'&&!t.fills.length))==='','수수료 미확정·보유 중 = 청산 코멘트 안 물음 · 확정 끝난 거래 = 물음');
const rows=rm.pick(r.journal,'2026-11-17',{v132:true});ok(rows.length===T.length&&rows.every(x=>x.gaps.every(gg=>['ecom','xcom'].includes(gg.k))),'pick(v132): 빈 칸은 진입/청산 코멘트만');
// harden 뒤 anon 실행 유지 · 되돌리기
await db.exec(read('security/harden-2026-11.sql'));await db.exec(read('alert22.sql'));
ok((await db.query(`select has_function_privilege('anon','public.review_gaps(text, date)','execute') a, has_function_privilege('public','public.review_gaps(text, date)','execute') p`)).rows.map(x=>x.a===true&&x.p===false)[0],'harden 뒤 alert22 다시 실행 OK · anon 실행 · public 실행권 없음');
ok((await call()).version===13,'harden 뒤 v13');
await db.exec(read('alert18.sql'));ok((await call()).version===12,'alert18.sql 다시 실행 = v12로 되돌림');
let badTok=false;try{await as(null,'select public.review_gaps($1,$2::date) r',[newToken(),'2026-11-17']);}catch(e){badTok=/invalid collector token/.test(e.message);}ok(badTok,'모르는 토큰 거부');
console.log(passed+' passed');
