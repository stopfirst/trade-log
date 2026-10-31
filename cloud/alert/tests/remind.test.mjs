import test from 'node:test';import assert from 'node:assert/strict';
import * as rm from '../src/remind.mjs';
const ev=(date,price,shares,time='10:00:00')=>({date,time,price,shares});
const T=(o={})=>({id:'a',name:'BTC',direction:'long',entries:[ev('2026-11-02',100,1)],fills:[],stop0:95,target:112,planRR:null,rrTp:null,entryNote:true,stopNote:true,react:true,tfIn:'ltf',tfOut:'ltf',...o});
test('설정 기본값·끄기·시각 형식',()=>{assert.deepEqual(rm.remindConfig({}).at,[9,30]);assert.equal(rm.remindConfig({}).enabled,true);assert.equal(rm.remindConfig({REVIEW_REMIND:'0'}).enabled,false);assert.deepEqual(rm.remindConfig({REVIEW_REMIND_AT:'21:05'}).at,[21,5]);assert.equal(rm.remindConfig({REVIEW_REMIND_AT:'9시'}).at,null);});
test('계획 손익비 = 앱 v79 식(첫 청산 전 평균 진입) · plan0 우선 · R 도구 목표',()=>{
 assert.equal(rm.planRR(T()).toFixed(2),'2.40');
 assert.equal(rm.planRR(T({entries:[ev('2026-11-02',100,1,'10:00:00'),ev('2026-11-02',102,1,'12:00:00')],fills:[{date:'2026-11-02',time:'11:00:00',shares:1}]})).toFixed(2),'2.40'); // 청산 뒤 추가 진입 제외
 assert.equal(rm.planRR(T({entries:[ev('2026-11-02',100,1),ev('2026-11-02',104,1,'11:00:00')]})).toFixed(2),'1.43');
 assert.equal(rm.planRR(T({planRR:3.1})),3.1);assert.equal(rm.planRR(T({target:null,rrTp:110})),2);assert.equal(rm.planRR(T({stop0:null})),null);
 assert.equal(rm.planRR(T({direction:'short',stop0:105,target:90})),2);});
test('빈 칸 5개 = 앱 v92 진입 전 체크',()=>{
 assert.deepEqual(rm.gaps(T()),[]);
 const g=rm.gaps(T({entryNote:false,stopNote:false,stop0:null,react:false,tfIn:null}));assert.deepEqual(g.map(x=>x.k),['entry','stop','rr','react','tf']);
 const b=rm.gaps(T({target:106,tfOut:'4h'}));assert.equal(b.length,2);assert.ok(b.every(x=>x.bad));assert.match(b[0].text,/1:1\.20\(기준 2:1 미달\)/);assert.equal(b[1].text,'LTF 진입인데 HTF 청산');
 assert.deepEqual(rm.gaps(T({tfIn:'4h',tfOut:'ltf'})),[]);assert.deepEqual(rm.gaps(T({target:106}),1.2),[]);});
test('대상: 어제 체결 또는 보유 중 · v92From 이전 제외 · 최소 손익비 설정',()=>{
 const J={HL:{from:'2026-11-01',minRR:3,trades:[T({name:'BTC'}),T({name:'ETH',entries:[ev('2026-11-01',100,1)],fills:[{date:'2026-11-01',shares:1}]}),T({name:'SOL',entries:[ev('2026-10-30',100,1)]}),T({name:'HOLD',entries:[ev('2026-11-01',100,2)],fills:[{date:'2026-11-01',shares:1}]})]},
  US:{trades:[T({name:'META',entryNote:false,entries:[ev('2026-11-02',500,3)],fills:[{date:'2026-11-02',time:'15:00:00',shares:3}],stop0:490,target:530})]}};
 const r=rm.pick(J,'2026-11-02');assert.deepEqual(r.map(x=>x.market+':'+x.name),['HL:BTC','HL:HOLD','US:META']);
 assert.match(r[0].gaps[0].text,/기준 3:1 미달/);assert.equal(r[1].open,true);assert.deepEqual(r[2].gaps.map(g=>g.k),['entry']);
 const txt=rm.text(r,'2026-11-02');assert.match(txt,/^📝 복기 시간 · 11\/02\(월\) 거래 3건\n일지 빈 칸 3건/);assert.match(txt,/• US META 롱 — 진입 근거/);assert.match(txt,/HOLD 롱\(보유 중\)/);assert.match(txt,/복기 탭/);
 assert.match(rm.text([{market:'HL',name:'BTC',direction:'long',gaps:[],ok:true}],'2026-11-02'),/✅ 1건 모두/);});
test('Reminder: 시각 전 안 보냄 · 하루 1번 · 거래 없으면 안 보냄 · alert11.sql 없음 로그 1회',async()=>{
 const S={sent:{},outbox:[]},logs=[];let calls=0,mode='ok';
 const rpc={call:async(n,b)=>{calls++;assert.equal(n,'review_gaps');assert.equal(b.p_since,'2026-11-02');if(mode==='missing')throw Error('SUPABASE_SQL_NOT_INSTALLED');return {ok:true,journal:mode==='none'?{}:{HL:{trades:[T({entryNote:false})]}}};}};
 const R=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({}),state:()=>S,log:(l,m)=>logs.push(m)});
 const at=(hm)=>Date.parse(`2026-11-03T${hm}:00+09:00`);
 assert.equal(await R.afterCheck(at('09:29')),null);assert.equal(calls,0);
 const m=await R.afterCheck(at('09:31'));assert.match(m,/진입 근거/);assert.equal(S.outbox.length,1);assert.ok(S.sent['remind:2026-11-03']);
 assert.equal(await R.afterCheck(at('12:00')),null);assert.equal(calls,1);
 const S2={sent:{},outbox:[]};const R2=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({}),state:()=>S2,log:(l,m)=>logs.push(m)});mode='missing';
 assert.equal(await R2.afterCheck(at('10:00')),null);assert.equal(await R2.afterCheck(at('10:01')),null);assert.equal(logs.filter(x=>/alert11\.sql/.test(x)).length,1);assert.equal(S2.remindMissing,'2026-11-03');
 mode='none';const S3={sent:{},outbox:[]};const R3=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({}),state:()=>S3,log:()=>{}});assert.equal(await R3.afterCheck(at('10:00')),null);assert.equal(S3.outbox.length,0);assert.ok(S3.sent['remind:2026-11-03']);
 const R4=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({REVIEW_REMIND:'0'}),state:()=>({sent:{},outbox:[]}),log:()=>{}});assert.equal(await R4.afterCheck(at('10:00')),null);
 assert.equal(await R.afterCheck(Date.parse('2026-11-03T23:30:00+09:00')),null);});
