// alert18(trade-alert 2.14.0) — 매일 복기 알림 단타 제외. 앱 v121 QA(qa/tests/t121.cjs)와 같은 거래 5건으로 같은 판정인지:
//   L31 31분 −0.1R → 스윙(남음) · S29 29분 +5 → 단타 빠짐 · SBIG 10분 −1.5R → 단타 예외(남음) · L1 20분 −0.2R → 단타 빠짐 · REV L1 손실 5분 뒤 진입 → 복수매매 의심 예외(남음)
//   기준 20분 → S29·L1 스윙 · 35분 → L31도 단타 · 앱 설정 v121Min이 .env보다 우선 · SCALP_MIN=0 = 끔 · 예전 SQL(v11)이면 예전처럼.
import test from 'node:test';import assert from 'node:assert/strict';
import * as rm from '../src/remind.mjs';import * as sc from '../src/scalp.mjs';
const TS=s=>Date.parse('2026-10-31T'+s+':00Z');
const ev=(id,s,px)=>{const ts=TS(s),d=new Date(ts).toISOString();return {date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:2,price:px,fee:0,seq:ts/1000};};
// review_gaps v12(alert18.sql) 모양 그대로
const mk=(id,name,a,b,p0,p1,x={})=>({id,name,market:'HL',direction:'long',date:'2026-10-31',src:'hyperliquid',entries:[ev(id+'e',a,p0)],fills:[ev(id+'f',b,p1)],funding:null,
 stop0:null,target:null,planRR:null,hide:null,initialRisk:10,acctAt:null,process:'unreviewed',v99Why:null,viol:false,fillViol:false,dismiss:[],srvViol:false,rrTp:null,
 entryNote:false,stopNote:false,react:false,tfIn:null,tfOut:null,...x});
const five=()=>[mk('L31','BTC','00:00','00:31',100,99.5),mk('S29','ETH','01:00','01:29',100,102.5),mk('SBIG','SOL','01:40','01:50',100,92.5),mk('L1','DOGE','02:10','02:30',100,99),mk('REV','AVAX','02:35','02:45',100,101.5)];
const J=(trades,set={})=>({HL:{from:'2026-10-25',minRR:2,v121Min:null,v99Cool:null,v99MaxLoss:null,riskMax:null,openMax:null,account:null,...set,trades}});
const byId=(j,min=30,opt)=>{const m=sc.model(j.HL,true,min,opt),o={};for(const [t,r] of m)o[t.id]=r;return o;};
const ENV30=sc.scalpConfig({});

test('설정: SCALP_MIN 빈칸 30 · 0 끔 · 1~1440 정수 · 이상한 값 30(bad) · 앱 v121Min 우선 · .env 0이면 앱 값 있어도 끔',()=>{
 assert.deepEqual([ENV30.min,ENV30.enabled],[30,true]);assert.equal(sc.scalpConfig({SCALP_MIN:'0'}).enabled,false);assert.equal(sc.scalpConfig({SCALP_MIN:'45'}).min,45);
 const b=sc.scalpConfig({SCALP_MIN:'2.5'});assert.equal(b.min,30);assert.ok(b.bad);assert.ok(sc.scalpConfig({SCALP_MIN:'1441'}).bad);
 assert.equal(sc.scopeMin({v121Min:20},ENV30),20);assert.equal(sc.scopeMin({v121Min:null},sc.scalpConfig({SCALP_MIN:'45'})),45);assert.equal(sc.scopeMin({v121Min:20},sc.scalpConfig({SCALP_MIN:'0'})),0);});

test('앱 v121 QA 5건과 같은 판정: 단타 S29·SBIG·L1·REV, 빠짐 S29·L1, 예외 SBIG(−1.5R)·REV(복수매매), L31 스윙',()=>{
 const r=byId(J(five()));
 assert.deepEqual(Object.keys(r).filter(k=>r[k].scalp).sort(),['L1','REV','S29','SBIG']);assert.equal(r.L31.scalp,false);
 assert.deepEqual(Object.keys(r).filter(k=>r[k].scalp&&!r[k].exc.length).sort(),['L1','S29']);
 assert.deepEqual(r.SBIG.exc,['−1R 넘긴 손실 (-1.5R)']);assert.deepEqual(r.REV.exc,['복수매매 의심']);assert.equal(r.REV.revenge,true); // 2.15.0: REV 전 = 손(L31)-이(S29)-손-손 → 연속 2회 → '3연패' 아님
 assert.deepEqual(byId(J(five()),30,{streakMode:'count'}).REV.exc,['복수매매 의심','3연패 후 진입'],'count 모드 = 2.14.0·앱 v121~v123 t121과 글자까지 같음');
 assert.equal(r.SBIG.R,-1.5);assert.equal(r.L31.R,-0.1);assert.equal(r.S29.pnl,5);
 assert.equal(Math.round(r.S29.hold/60000),29);assert.equal(Math.round(r.L31.hold/60000),31);
 const s=Object.values(r).filter(x=>x.scalp);assert.equal(s.reduce((a,x)=>a+x.pnl,0),-9);assert.equal(s.reduce((a,x)=>a+x.hold,0)/s.length/60000,17.25); // 앱 세션 카드 −9.00 · 평균 17분
});
test('경계: 29분 단타 · 30분 정각은 단타 아님(미만) · 31분 스윙 · 기준 20분이면 S29·L1 스윙 · 35분이면 L31도 단타(빠짐)',()=>{
 const e=byId(J([mk('A','X','00:00','00:30',100,101)]));assert.equal(e.A.scalp,false);
 const r20=byId(J(five()),20);assert.deepEqual(Object.keys(r20).filter(k=>r20[k].scalp).sort(),['REV','SBIG']);
 const r35=byId(J(five()),35);assert.equal(r35.L31.scalp,true);assert.deepEqual(r35.L31.exc,[]);});
test('예외: 저장한 위반·청산 위반 표시·서버 중단 중 진입·손익비 미달·위험 초과·−1R(수수료·펀딩 포함) · v109 × 숨긴 복수매매는 빠짐 · 1R 없으면 −1R 판정 못 함',()=>{
 const one=x=>byId(J([mk('A','ETH','01:00','01:10',100,99,x)])).A;
 assert.deepEqual(one({viol:true}).exc,['규칙 위반']);assert.deepEqual(one({process:'violation'}).exc,['규칙 위반']);assert.deepEqual(one({fillViol:true}).exc,['규칙 위반']);
 assert.deepEqual(one({srvViol:true}).exc,['거래 중단 중 진입']);
 assert.deepEqual(one({stop0:99,target:101}).exc,['손익비 미달']); // (101−100)/(100−99)=1 < 2
 assert.deepEqual(one({stop0:99,target:102}).exc,[]); // 2:1 = 기준 이상
 assert.deepEqual(one({acctAt:300}).exc,['포지션 위험 3.33% > 2%']);assert.deepEqual(one({acctAt:1000}).exc,[]);
 assert.deepEqual(one({acctAt:300,dismiss:['risk']}).exc,[]);
 // 손실 −2 + 수수료 0.5×2 + 펀딩 −8 = −11 → −1.1R
 const f=one({entries:[{...ev('e','01:00',100),fee:0.5}],fills:[{...ev('f','01:10',99),fee:0.5}],funding:-8});assert.equal(f.R,-1.1);assert.match(f.exc[0],/−1R 넘긴 손실 \(-1\.1R\)/);
 assert.deepEqual(one({initialRisk:null,fills:[ev('f','01:10',50)]}).exc,[]);
 const t=five(),C={streakMode:'count'};t[4].dismiss=['v99revenge'];let r=byId(J(t),30,C);assert.deepEqual(r.REV.exc,['3연패 후 진입']);assert.deepEqual(byId(J(t)).REV.exc,[],'2.15.0 연속 기준: 복수매매 숨기면 남는 예외 없음');t[4].dismiss=['v99revenge','v99maxloss'];r=byId(J(t),30,C);assert.deepEqual(r.REV.exc,[]);});
test('복수매매·연패 설정: v99Cool 3분이면 5분 뒤 진입은 복수매매 아님 · v99MaxLoss 1이면 같은 날 손실 뒤 진입 = 1연패 후 진입',()=>{
 let r=byId(J(five(),{v99Cool:3}),30,{streakMode:'count'});assert.deepEqual(r.REV.exc,['3연패 후 진입']);r=byId(J(five(),{v99Cool:3,v99MaxLoss:0}),30,{streakMode:'count'});assert.deepEqual(r.REV.exc,[]);
 assert.deepEqual(byId(J(five(),{v99Cool:3})).REV.exc,[],'2.15.0 연속: 손-이-손-손 → 3연패 아님');assert.deepEqual(byId(J(five(),{v99Cool:3,v99MaxLoss:2})).REV.exc,['2연패 후 진입'],'마지막 두 손실(SBIG·L1)은 연속 2');
 r=byId(J(five(),{v99Cool:0,v99MaxLoss:1}));assert.ok(r.REV.exc.includes('1연패 후 진입'));});
test('판정 안 함: 진행 중(청산 안 끝남) · 시각 없는 체결(timestamp도 없음)은 시각 모름 → 판정 안 함(앱 v99Ms와 같음) · 잘못된 체결(가격 없음) 거래',()=>{
 const r=byId(J([mk('OPEN','A','01:00','01:05',100,101,{fills:[{...ev('f','01:05',101),shares:1}]}),mk('BAD','B','01:00','01:05',100,101,{fills:[{...ev('f','01:05',null)}]})]));
 assert.equal(r.OPEN,undefined);assert.equal(r.BAD,undefined);
 const nt=byId(J([mk('NT','C','00:00','00:00',100,101,{entries:[{date:'2026-10-31',time:null,price:100,shares:2,fee:0}],fills:[{date:'2026-10-31',time:'00:20:00',price:101,shares:2,fee:0}]})]));assert.equal(nt.NT,undefined);});
test('미국: 동부 벽시계(서머타임 끝난 11/02) 09:31→09:59 = 28분 단타 · 숏 방향 없음(롱 손익) · 갈아타기 강해 보여서 = 예외',()=>{
 const u=(id,name,d,a,b,p0,p1,x={})=>({...mk(id,name,'00:00','00:01',p0,p1,x),market:'US',entries:[{date:d,time:a,price:p0,shares:10,fee:0,seq:1}],fills:[{date:d,time:b,price:p1,shares:10,fee:0,seq:2}],...x});
 const j={US:{from:'2026-10-25',trades:[u('M','META','2026-11-02','09:31:00','09:59:00',500,499),u('N','NVDA','2026-11-02','10:05:00','10:20:00',100,101,{v99Why:'strong'})]}};
 const m=sc.model(j.US,false,30),o={};for(const [t,r] of m)o[t.id]=r;
 assert.equal(o.M.hold,28*60000);assert.equal(o.M.pnl,-10);assert.deepEqual(o.M.exc,[]);
 assert.equal(sc.evMs({date:'2026-11-02',time:'09:31:00'},false),Date.parse('2026-11-02T14:31:00Z'));assert.equal(sc.evMs({date:'2026-10-30',time:'09:31'},false),Date.parse('2026-10-30T13:31:00Z'));
 assert.ok(o.N.exc.includes('갈아타기 · 강해 보여서'));});

test('pick/text: 단타 2건 제외 한 줄 · 예외 단타는 사유와 함께 남음 · 거래 수는 남은 것만',()=>{
 const rows=[];let ns=0;const r=rm.pick(J(five()),'2026-10-31',{scalp:ENV30,onScalp:()=>ns++});
 assert.deepEqual(r.map(x=>x.name),['BTC','SOL','AVAX']);assert.equal(ns,2);assert.equal(r[0].scalp,undefined);assert.deepEqual(r[1].scalp.exc,['−1R 넘긴 손실 (-1.5R)']);
 const txt=rm.text(r,'2026-10-31',{scalpSkip:ns,scalpMin:30});
 assert.match(txt,/^📝 복기 시간 · 10\/31\(토\) 거래 3건\n단타 2건 제외 · 보유 30분 미만 \(규칙 위반·−1R 넘긴 손실은 남김\)\n일지 빈 칸 3건/);
 assert.match(txt,/HL SOL 롱 — .*\[단타 10분 · 예외: −1R 넘긴 손실 \(-1\.5R\)\]/);assert.match(txt,/HL AVAX 롱 — .*\[단타 10분 · 예외: 복수매매 의심\]/);
 const tc=rm.text(rm.pick(J(five()),'2026-10-31',{scalp:sc.scalpConfig({DAILY_LOSS_STREAK_MODE:'count'})}),'2026-10-31');assert.match(tc,/HL AVAX 롱 — .*\[단타 10분 · 예외: 복수매매 의심, 3연패 후 진입\]/,'DAILY_LOSS_STREAK_MODE=count = 2.14.0 문구');assert.ok(!/ETH|DOGE/.test(txt));
 const t0=rm.text(rm.pick(J(five()),'2026-10-31',{scalp:sc.scalpConfig({SCALP_MIN:'0'})}),'2026-10-31');assert.match(t0,/거래 5건\n일지 빈 칸 5건/);assert.ok(!/단타/.test(t0));});
test('앱 설정 v121Min(20)이 .env 30보다 우선 → S29·L1도 남음 · 숨김(×)이 단타보다 먼저',()=>{
 let ns=0;const r=rm.pick(J(five(),{v121Min:20}),'2026-10-31',{scalp:ENV30,onScalp:()=>ns++});assert.equal(ns,0);assert.equal(r.length,5);
 const t=five();t[1].hide=true;let nh=0;ns=0;const r2=rm.pick(J(t),'2026-10-31',{scalp:ENV30,onHidden:()=>nh++,onScalp:()=>ns++});assert.equal(nh,1);assert.equal(ns,1);assert.equal(r2.length,3);});
test('예전 review_gaps(v11, 체결가·1R 칸 없음)이면 단타 제외 안 함(예전 동작)',()=>{
 const old=five().map(t=>{const o={...t};delete o.initialRisk;delete o.srvViol;return o;});assert.equal(sc.hasScalpData(J(old)),false);assert.equal(sc.hasScalpData(J(five())),true);
 let ns=0;assert.equal(rm.pick(J(old),'2026-10-31',{scalp:ENV30,onScalp:()=>ns++}).length,5);assert.equal(ns,0);});
test('shouldSend: 단타만 있는 날 안 보냄 · 남은 게 빈 칸 없는 예외 단타뿐이면 안 보냄 · 예외 단타에 빈 칸 있거나 스윙 있으면 보냄',()=>{
 const full={entryNote:true,stopNote:true,react:true,tfIn:'4h',stop0:95,target:110};
 const go=tr=>{let ns=0;const r=rm.pick(J(tr),'2026-10-31',{scalp:ENV30,onScalp:()=>ns++});return rm.shouldSend(r,ns);};
 assert.equal(go([mk('S29','ETH','01:00','01:29',100,102.5),mk('L1','DOGE','02:10','02:30',100,99)]),false);
 assert.equal(go([mk('S29','ETH','01:00','01:29',100,102.5),mk('SB','SOL','01:40','01:50',100,92.5,full)]),false);
 assert.equal(go([mk('S29','ETH','01:00','01:29',100,102.5),mk('SB','SOL','01:40','01:50',100,92.5)]),true);
 assert.equal(go([mk('S29','ETH','01:00','01:29',100,102.5),mk('W','BTC','00:00','00:31',100,101,full)]),true); // 스윙 다 채움 → ✅ 보냄(예전과 같음)
 assert.equal(rm.shouldSend([],0),false);assert.equal(rm.shouldSend([{ok:true}],0),true);});
test('Reminder: 단타 제외 메시지 · 단타만 있는 날 안 보냄(로그) · 예전 SQL WARN 1회 · SCALP_MIN=0이면 예전처럼',async()=>{
 const at=(d,hm)=>Date.parse(`${d}T${hm}:00+09:00`);let journal;const rpc={call:async()=>({ok:true,journal})};
 const S={sent:{},outbox:[]},logs=[];const R=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({}),scalp:ENV30,state:()=>S,log:(l,m)=>logs.push(l+' '+m)});
 journal=J(five());const m=await R.afterCheck(at('2026-11-01','09:31'));assert.match(m,/거래 3건\n단타 2건 제외/);assert.ok(logs.some(x=>/거래 3건 · 빈 칸 3건 · 단타 2건 제외/.test(x)));
 journal=J([mk('S29','ETH','01:00','01:29',100,102.5)].map(t=>({...t,entries:t.entries.map(e=>({...e,date:'2026-11-01',timestamp:e.timestamp+864e5})),fills:t.fills.map(e=>({...e,date:'2026-11-01',timestamp:e.timestamp+864e5}))})));
 assert.equal(await R.afterCheck(at('2026-11-02','09:31')),null);assert.equal(S.outbox.length,1);assert.ok(S.sent['remind:2026-11-02']);assert.ok(logs.some(x=>/거래 없음\(단타 1건 제외\) → 안 보냄/.test(x)));
 const old=J(five().map(t=>{const o={...t};delete o.initialRisk;delete o.srvViol;return o;}));
 const S2={sent:{},outbox:[]},l2=[];const R2=new rm.Reminder({rpc:{call:async()=>({ok:true,journal:old})},token:'k',cfg:rm.remindConfig({}),scalp:ENV30,state:()=>S2,log:(l,m)=>l2.push(l+' '+m)});
 assert.match(await R2.afterCheck(at('2026-11-01','09:31')),/거래 5건\n일지 빈 칸 5건/);S2.sent={};await R2.afterCheck(at('2026-11-01','09:40'));assert.equal(l2.filter(x=>/^WARN .*alert18\.sql/.test(x)).length,1);
 const S3={sent:{},outbox:[]},l3=[];const R3=new rm.Reminder({rpc,token:'k',cfg:rm.remindConfig({}),scalp:sc.scalpConfig({SCALP_MIN:'0'}),state:()=>S3,log:(l,m)=>l3.push(l+' '+m)});journal=J(five());
 assert.match(await R3.afterCheck(at('2026-11-01','09:31')),/거래 5건\n일지 빈 칸 5건/);assert.equal(l3.filter(x=>/alert18/.test(x)).length,0);
 const R4=new rm.Reminder({rpc,token:'k',cfg:rm.remindConfig({}),state:()=>({sent:{},outbox:[]}),log:()=>{}});assert.match(await R4.afterCheck(at('2026-11-01','09:31')),/거래 5건/); // scalp 안 넘기면(예전 호출) 끔
});
test('--remind-dry: 미리 보기·뺀 단타 목록, 보내지 않음 · 단타만 있는 날 "보내지 않습니다" · 채팅 ID 없어도 됨',async()=>{
 const {remindDry,VERSION}=await import('../src/alert.mjs');assert.equal(VERSION,'2.15.0');
 const env={SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:'sb_publishable_'+'k'.repeat(24),KW_COLLECTOR_TOKEN:'kwc_'+'A'.repeat(43),TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32)};
 const out=[],orig=console.log;let calls=[];const rpc=j=>({call:async(n,b)=>{calls.push([n,b]);return {ok:true,journal:j};}});
 console.log=(...a)=>out.push(a.join(' '));
 try{assert.equal(await remindDry(['--remind-dry','--day','2026-10-31'],env,()=>{},{rpc:rpc(J(five()))}),0);
  const only=J([mk('S29','ETH','01:00','01:29',100,102.5)]);assert.equal(await remindDry(['--remind-dry','--day','2026-10-31'],env,()=>{},{rpc:rpc(only)}),0);
  assert.equal(await remindDry(['--remind-dry','--day','10/31'],env,()=>{},{rpc:rpc(only)}),2);}
 finally{console.log=orig;}
 const s=out.join('\n');assert.equal(calls[0][0],'review_gaps');assert.equal(calls[0][1].p_since,'2026-10-31');
 assert.match(s,/미리 보기 · 2026-10-31 · 단타 제외 켜짐 · alert18\.sql 확인됨 · 기준 30분/);assert.match(s,/뺀 단타: HL ETH 롱 · 보유 29분 · R 0\.5/);assert.match(s,/뺀 단타: HL DOGE 롱 · 보유 20분/);
 assert.match(s,/남은 단타\(예외\): HL SOL · 10분 · −1R 넘긴 손실/);assert.match(s,/단타 2건 제외/);assert.match(s,/\(보내지 않았습니다\)/);assert.match(s,/이 날은 알림을 보내지 않습니다\(대상 거래 없음\)/);});
test('앱 v122: 한 거래 안 왕복 여러 번이면 가장 긴 왕복 기준(0:00→0:20 + 1:30→1:50 = 20분 단타, 하나라도 40분이면 스윙) · 진입 전 청산·포지션 남음은 판정 안 함',()=>{
 const two=(b2)=>mk('M','X','00:00','00:20',100,101,{entries:[ev('a','00:00',100),ev('b','01:30',100)],fills:[ev('c','00:20',101),ev('d',b2,101)]});
 let r=byId(J([two('01:50')]));assert.equal(r.M.scalp,true);assert.equal(r.M.hold,20*60000);
 r=byId(J([two('02:10')]));assert.equal(r.M.scalp,false);assert.equal(r.M.hold,40*60000);
 assert.equal(sc.segments(two('01:50'),true).length,2);
 assert.equal(sc.holdMs(mk('P','X','00:00','00:10',100,101,{fills:[{...ev('f','00:10',101),shares:1}]}),true),null);});
