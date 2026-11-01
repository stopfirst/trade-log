/* SQL test for alert15.sql (복수매매 기록 revenge_alerts + revenge_push + revenge_data). Needs @electric-sql/pglite resolvable.
   node tests/alert15-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <alert15.sql> */
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
const [cloudPath,kwPath,aPath]=process.argv.slice(2);
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
await db.exec(read(aPath));await db.exec(read(aPath));
ok(true,'alert15.sql 두 번 실행 — 오류 없음(멱등)');
const as=(user,q,params=[])=>db.transaction(async tx=>{await tx.exec(user?`set local role authenticated; select set_config('request.jwt.sub','${user}',true);`:`set local role anon;`);return (await tx.query(q,params)).rows;});
const fails=async(user,q,params=[],re=/permission denied|invalid collector token|violates row-level/)=>{try{await as(user,q,params);return false;}catch(e){return re.test(e.message)?true:(console.error('unexpected',e.message),false);}};
const T1=newToken(),T2=newToken();
await as(U1,'select public.kw_register_token($1)',[hash(T1)]);await as(U2,'select public.kw_register_token($1)',[hash(T2)]);
const push=(t,p)=>as(null,'select public.revenge_push($1,$2::jsonb) r',[t,JSON.stringify(p)]).then(x=>x[0].r);
const item=(o={})=>({ref:'rv:hl:900001',market:'hl',kinds:['cooldown','risk_up'],day:'2026-11-01',symbol:'ETH',direction:'long',entry_key:'900001',entry_date:null,entry_at:1793500000000,
 prev_symbol:'BTC',prev_key:'899999',prev_pnl:-123.45,prev_close_at:1793499640000,minutes:6,detail:{risk:{basis:'notional',now:5000,prev:3000,ratio:1.67}},sent_at:1793500060000,...o});
let r=await push(T1,{items:[],answers:[]});ok(r.ok===true&&r.version===15,'빈 목록 = 설치 확인(probe) · version 15');
ok(await fails(null,'select public.revenge_push($1,$2::jsonb)',[newToken(),'{"items":[]}']),'모르는 토큰 거부');
r=await push(T1,{items:[item()]});ok(r.ok&&r.stored===1,'HL 쿨다운·위험 증가 경고 저장');
r=await push(T1,{items:[item({ref:'rv:us:2026-11-02:NVDA:0001',market:'us',kinds:['switch'],symbol:'NVDA',entry_key:'2026-11-02:NVDA:0001',entry_date:'2026-11-02',prev_symbol:'TSLA',prev_key:'2026-11-02:TSLA:0002'})]});ok(r.ok,'US 갈아타기 저장(키움 주문 키)');
r=await push(T1,{items:[item({ref:'rv:stop:hl:2026-11-01',kinds:['stop_day'],entry_key:null,entry_at:null,minutes:null})]});ok(r.ok,"'오늘은 여기까지' 저장");
ok((await push(T1,{items:[item({kinds:['revenge']})]})).error==='bad_kinds','모르는 종류 거부');
ok((await push(T1,{items:[item({ref:'hl:1'})]})).error==='bad_item','rv: 접두어 아닌 ref 거부');
ok((await push(T1,{items:[item({symbol:'ETH; drop'})]})).error==='bad_item','종목 형식 거부');
ok((await push(T1,{items:[item({entry_at:'yesterday'})]})).error==='bad_item','시각 형식 거부');
ok((await push(T1,{items:[item({detail:{x:'y'.repeat(9000)}})]})).error==='bad_detail','큰 detail 거부');
ok((await push(T1,{items:'x'})).error==='bad_payload','items 배열 아님 거부');
// 버튼 답
r=await push(T1,{answers:[{ref:'rv:us:2026-11-02:NVDA:0001',market:'us',why:'strong',why_label:'강해 보여서',why_at:1793500100000}]});ok(r.ok&&r.answers===1,"버튼 답 '강해 보여서' 저장");
ok((await push(T1,{answers:[{ref:'rv:us:x1',market:'us',why:'bored'}]})).error==='bad_answer','모르는 답 거부');
r=await push(T1,{answers:[{ref:'rv:us:2026-11-03:AMD:0009',market:'us',why:'plan',why_label:'미리 정한 가격'}]});ok(r.ok,'경고 행보다 답이 먼저 와도 저장(최소 행)');
await push(T1,{items:[item({ref:'rv:us:2026-11-03:AMD:0009',market:'us',kinds:['switch'],symbol:'AMD'})]});
let row=(await as(U1,"select why,symbol,kinds from public.revenge_alerts where ref='rv:us:2026-11-03:AMD:0009'"))[0];
ok(row.why==='plan'&&row.symbol==='AMD'&&row.kinds.includes('switch'),'뒤에 온 경고 행이 답(why)을 지우지 않음');
// 다시 보내도 why 유지·kinds 합침
await push(T1,{items:[item({ref:'rv:us:2026-11-02:NVDA:0001',market:'us',kinds:['switch','streak'],symbol:'NVDA'})]});
row=(await as(U1,"select why,kinds from public.revenge_alerts where ref='rv:us:2026-11-02:NVDA:0001'"))[0];
ok(row.why==='strong'&&row.kinds.sort().join(',')==='streak,switch','재전송: why 유지 · kinds 합침');
await push(T2,{items:[item({ref:'rv:hl:777',entry_key:'777'})]});
const mine=await as(U1,'select ref from public.revenge_alerts order by ref');ok(mine.length===4,'U1 = 자기 행 4개만');
ok((await as(U2,'select ref from public.revenge_alerts')).length===1,'U2 = 자기 행 1개만');
ok(await fails(null,'select * from public.revenge_alerts'),'anon 직접 읽기 거부');
await as(U1,"update public.revenge_alerts set applied_at=now(),applied_result='applied' where ref='rv:us:2026-11-02:NVDA:0001'");
ok((await as(U1,"select applied_result from public.revenge_alerts where ref='rv:us:2026-11-02:NVDA:0001'"))[0].applied_result==='applied','앱이 반영 표시(applied_*)');
ok(await fails(U1,"update public.revenge_alerts set why='plan'"),'앱은 why 못 바꿈(열 권한)');
ok(await fails(U1,"delete from public.revenge_alerts"),'앱 delete 거부');
await push(T1,{answers:[{ref:'rv:us:2026-11-02:NVDA:0001',market:'us',why:'plan',why_label:'미리 정한 가격'}]});
ok((await as(U1,"select applied_at from public.revenge_alerts where ref='rv:us:2026-11-02:NVDA:0001'"))[0].applied_at===null,'답이 바뀌면 applied 지움');
// revenge_data
const snap=(date,asOf,orders,realized,positions)=>({version:1,journalVersion:1,source:'kiwoom',account:'0123456789abcdef',orderDate:date,asOf,executionImport:false,orders,positions,
 realized:{rows:realized,reportedTotal:String(realized.reduce((a,x)=>a+Number(x.reportedNet),0)),currency:'USD',apiId:'ust21640',dateBasis:'broker_query_date'},summary:{currency:'USD',reportedSecuritiesValue:'1000'},warnings:[]});
const today=(await db.query("select to_char((now() at time zone 'Asia/Seoul')::date,'YYYY-MM-DD') d")).rows[0].d;
const old=(await db.query("select to_char((now() at time zone 'Asia/Seoul')::date - 20,'YYYY-MM-DD') d")).rows[0].d;
await db.query("insert into public.kw_snapshots(user_id,order_date,account,as_of,snapshot) values($1,$2,'0123456789abcdef',$3,$4::jsonb),($1,$5,'0123456789abcdef',$6,$7::jsonb),($8,$2,'0123456789abcdef',$3,$4::jsonb)",
 [U1,today,Date.now(),JSON.stringify(snap(today,Date.now(),[{key:today+':TSLA:1',orderId:'1',symbol:'TSLA',side:'매도',reportedQuantity:'10',reportedPrice:'200',status:'체결',reportedTime:'23:41:00'}],[{symbol:'TSLA',quantity:'10',averageBuyPrice:'210',averageSellPrice:'200',reportedNet:'-101.5',commission:'1.5',tax:'0'}],[{symbol:'NVDA',quantity:'5',averagePrice:'180'}])),
  old,Date.now()-20*86400000,JSON.stringify(snap(old,Date.now()-20*86400000,[{key:old+':AMD:2',orderId:'2',symbol:'AMD',side:'매수',reportedQuantity:'1',reportedPrice:'100',status:'체결',reportedTime:'22:00:00'}],[],[])),U2]);
const data=(t,d)=>as(null,'select public.revenge_data($1,$2) r',[t,d]).then(x=>x[0].r);
let d=await data(T1,8);
ok(d.ok&&d.version===15&&d.orders.length===1&&d.orders[0].symbol==='TSLA'&&d.orders[0].qty==='10','revenge_data: 최근 8일 주문(risk_status와 같은 모양)');
ok(d.realized.length===1&&d.realized[0].reportedNet==='-101.5'&&d.realized[0].date===today,'revenge_data: 종목별 실현(pl_amt)');
ok(d.positions.length===1&&d.positions[0].averagePrice==='180','revenge_data: 최신 보유(평균단가 포함)');
d=await data(T1,30);ok(d.orders.length===2,'p_days 30 → 20일 전 주문 포함');
d=await data(T1,999);ok(d.days===62,'p_days 상한 62');
ok(await fails(null,'select public.revenge_data($1,8)',[newToken()]),'revenge_data 모르는 토큰 거부');
console.log('ALL OK '+passed);
