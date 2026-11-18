// 2.19.0 (alert22): 매일 복기 알림 일지 빈 칸 = 앱 v132-lukjournal 기준(진입 코멘트 · 끝난 거래 청산 코멘트) · alert22.sql 없으면 예전 기준 · JOURNAL_V132=0
import test from 'node:test';import assert from 'node:assert/strict';
import * as rm from '../src/remind.mjs';import {readConfig} from '../src/alert.mjs';
const ev=(date,price,shares,time='10:00:00')=>({date,time,price,shares,fee:0});
// review_gaps v13 모양(옛 칸은 비어 있음 = 새 거래)
const T=(o={})=>({id:'a',name:'BTC',direction:'long',entries:[ev('2026-11-17',100,1)],fills:[],stop0:null,target:null,planRR:null,rrTp:null,
 entryNote:false,stopNote:false,react:false,tfIn:null,tfOut:null,ecom:null,xcom:null,eOld:false,xOld:false,avoidable:null,feePend:false,initialRisk:null,srvViol:false,...o});
const closed=o=>T({fills:[{...ev('2026-11-17',101,1,'11:00:00')}],...o});
test('설정: JOURNAL_V132 기본 켬 · 0/false/off/끔 = 예전 기준 · readConfig에 실림',()=>{
 assert.equal(rm.journalConfig({}).v132,true);assert.equal(rm.journalConfig({JOURNAL_V132:'1'}).v132,true);
 for(const v of ['0','false','off','끔',' 0 '])assert.equal(rm.journalConfig({JOURNAL_V132:v}).v132,false,v);
 const env={TELEGRAM_BOT_TOKEN:'123456:'+'A'.repeat(35),STATE_DIRECTORY:'/tmp'},o={needSupabase:false,needTelegram:false};
 assert.equal(readConfig(env,o).journal.v132,true);assert.equal(readConfig({...env,JOURNAL_V132:'0'},o).journal.v132,false);});
test('앱 v132Has: 저장된 코멘트 우선 · 저장된 적 없으면 옛 칸 · 빈 글 저장 = 빈 칸',()=>{
 assert.equal(rm.hasComment(T({ecom:true}),'entry'),true);assert.equal(rm.hasComment(T({ecom:false,eOld:true}),'entry'),false); // '' 저장 → 옛 칸 무시
 assert.equal(rm.hasComment(T({ecom:null,eOld:true}),'entry'),true);assert.equal(rm.hasComment(T({ecom:null,eOld:false}),'entry'),false);
 assert.equal(rm.hasComment(T({xcom:null,xOld:true}),'exit'),true);assert.equal(rm.hasComment(T({xcom:false,xOld:true}),'exit'),false);assert.equal(rm.hasComment(T({xcom:true}),'exit'),true);});
test('gapsV132: 진입 코멘트 · 청산 코멘트는 끝난 거래만 · 손익비/가격 반응/TF는 빈 칸 아님 · 수수료 미확정은 안 끝난 거래',()=>{
 assert.deepEqual(rm.gapsV132(T(),true).map(g=>g.k),['ecom']);                       // 보유 중: 진입 코멘트만
 assert.deepEqual(rm.gapsV132(closed(),true).map(g=>g.text),['진입 코멘트','청산 코멘트']);
 assert.deepEqual(rm.gapsV132(closed({ecom:true,xcom:true}),true),[]);                // 옛 칸(근거·스탑·반응·TF·손익비) 비어도 빈 칸 없음
 assert.deepEqual(rm.gapsV132(closed({eOld:true,xOld:true}),true),[]);                // 옛 칸 글 = 채움
 assert.deepEqual(rm.gapsV132(closed({ecom:true,feePend:true}),true),[]);             // API 수수료 미확정 = 앱 done=false
 assert.deepEqual(rm.gapsV132(T({ecom:true,fills:[{...ev('2026-11-17',101,0.5,'11:00:00')}]}),true),[]); // 일부 청산 = 안 끝남
 assert.deepEqual(rm.gapsV132(T({ecom:true,fills:[{...ev('2026-11-17',101,2,'11:00:00')}]}),true),[]);   // 넘친 청산 = 앱 invalid → done 아님
 assert.deepEqual(rm.gapsV132(closed({ecom:true,direction:'short'}),true).map(g=>g.k),['xcom']);
 // 예전 gaps는 그대로(롤백 경로)
 assert.deepEqual(rm.gaps(closed()).map(g=>g.k),['entry','stop','rr','react','tf']);});
test('pick·text: v132 켜면 새 기준 문구 · 끄면 예전 그대로',()=>{
 const J={HL:{from:'2026-11-01',trades:[closed({name:'BTC',ecom:true,xcom:true}),closed({name:'ETH',ecom:true}),T({name:'SOL'}),closed({name:'OLD',eOld:true,xOld:true})]}};
 const r=rm.pick(J,'2026-11-17',{v132:true});assert.deepEqual(r.map(x=>x.name+':'+x.gaps.map(g=>g.k).join('+')),['BTC:','ETH:xcom','SOL:ecom','OLD:']);
 const txt=rm.text(r,'2026-11-17',{v132:true});assert.match(txt,/거래 4건\n일지 빈 칸 2건 · 다 채운 거래 2건/);assert.match(txt,/• HL ETH 롱 — 청산 코멘트/);assert.match(txt,/• HL SOL 롱\(보유 중\) — 진입 코멘트/);
 assert.ok(!/진입 근거|스탑 이유|가격 반응|타임프레임|손익비/.test(txt));
 assert.match(rm.text([r[0]],'2026-11-17',{v132:true}),/✅ 1건 모두 진입 코멘트 · 청산 코멘트\(끝난 거래\) 기록 완료/);
 const old=rm.pick(J,'2026-11-17');assert.ok(old.every(x=>!x.ok));assert.match(rm.text(old,'2026-11-17'),/진입 근거/);});
test('useV132 / hasV132Data: SQL v13 칸이 있어야 · 거래 없으면 판단 불가(true)',()=>{
 const J13={HL:{trades:[T()]}},J12={HL:{trades:[(({ecom,xcom,eOld,xOld,feePend,avoidable,...x})=>x)(T())]}};
 assert.equal(rm.hasV132Data(J13),true);assert.equal(rm.hasV132Data(J12),false);assert.equal(rm.hasV132Data({}),true);
 assert.equal(rm.useV132({v132:true},J13),true);assert.equal(rm.useV132({v132:false},J13),false);assert.equal(rm.useV132({v132:true},J12),false);assert.equal(rm.useV132(undefined,J13),false);});
test('Reminder: v13이면 새 기준 · v12(alert22.sql 없음)면 예전 기준 + WARN 1회 · JOURNAL_V132=0이면 예전 기준(경고 없음) · journal 안 주면 예전(호환)',async()=>{
 const at=d=>Date.parse(`${d}T09:31:00+09:00`);let journal;const rpc={call:async()=>({ok:true,journal})};
 const mk=(jc)=>{const S={sent:{},outbox:[]},logs=[];return {S,logs,R:new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({}),journal:jc,state:()=>S,log:(l,m)=>logs.push(l+' '+m)})};};
 const v13=[closed({name:'NEW',ecom:true,xcom:true}),closed({name:'GAP',ecom:true})];
 const v12=v13.map(t=>(({ecom,xcom,eOld,xOld,feePend,avoidable,...x})=>x)(t));
 {const {R,S,logs}=mk(rm.journalConfig({}));journal={HL:{trades:v13}};
  const m=await R.afterCheck(at('2026-11-18'));assert.match(m,/거래 2건\n일지 빈 칸 1건 · 다 채운 거래 1건/);assert.match(m,/HL GAP 롱 — 청산 코멘트/);assert.ok(!/NEW/.test(m));assert.equal(S.outbox.length,1);
  assert.equal(logs.filter(x=>/alert22\.sql/.test(x)).length,0);
  journal={HL:{trades:v12.map(t=>({...t,fills:t.fills.map(f=>({...f,date:'2026-11-18'}))}))}};const m2=await R.afterCheck(at('2026-11-19'));assert.match(m2,/진입 근거 · 스탑 이유/);
  await R.afterCheck(at('2026-11-20'));assert.equal(logs.filter(x=>/^WARN .*alert22\.sql\(review_gaps v13\)이 없어/.test(x)).length,1);}
 {const {R,logs}=mk(rm.journalConfig({JOURNAL_V132:'0'}));journal={HL:{trades:v13}};const m=await R.afterCheck(at('2026-11-18'));assert.match(m,/일지 빈 칸 2건/);assert.match(m,/진입 근거/);assert.equal(logs.filter(x=>/alert22/.test(x)).length,0);}
 {const S={sent:{},outbox:[]};const R=new rm.Reminder({rpc,token:'kwc_x',cfg:rm.remindConfig({}),state:()=>S,log:()=>{}});journal={HL:{trades:v13}};assert.match(await R.afterCheck(at('2026-11-18')),/진입 근거/);}
 {const {R,S}=mk(rm.journalConfig({}));journal={HL:{trades:[closed({name:'A',ecom:true,xcom:true})]}};const m=await R.afterCheck(at('2026-11-18'));assert.match(m,/✅ 1건 모두 진입 코멘트/);assert.equal(S.outbox.length,1);}});
test('--remind-dry: 기준 표시(앱 v132 · alert22.sql 확인됨 / 없음 / JOURNAL_V132=0) · 새 기준 문구',async()=>{
 const {remindDry}=await import('../src/alert.mjs');
 const env={SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:'sb_publishable_'+'k'.repeat(24),KW_COLLECTOR_TOKEN:'kwc_'+'A'.repeat(43),TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32),SCALP_MIN:'0'};
 const out=[],orig=console.log;const rpc=j=>({call:async()=>({ok:true,journal:j})});
 const v13={HL:{from:'2026-11-01',trades:[closed({name:'GAP',ecom:true})]}},v12={HL:{from:'2026-11-01',trades:[(({ecom,xcom,eOld,xOld,feePend,avoidable,...x})=>x)(closed({name:'GAP',ecom:true}))]}};
 console.log=(...a)=>out.push(a.join(' '));
 try{assert.equal(await remindDry(['--remind-dry','--day','2026-11-17'],env,()=>{},{rpc:rpc(v13)}),0);const a=out.join('\n');out.length=0;
  assert.equal(await remindDry(['--remind-dry','--day','2026-11-17'],env,()=>{},{rpc:rpc(v12)}),0);const b=out.join('\n');out.length=0;
  assert.equal(await remindDry(['--remind-dry','--day','2026-11-17'],{...env,JOURNAL_V132:'0'},()=>{},{rpc:rpc(v13)}),0);const c=out.join('\n');
  console.log=orig;
  assert.match(a,/일지 빈 칸 앱 v132 기준 · alert22\.sql 확인됨/);assert.match(a,/HL GAP 롱 — 청산 코멘트/);
  assert.match(b,/alert22\.sql 없음 → 일지 빈 칸 예전 기준/);assert.match(b,/스탑 이유/);
  assert.match(c,/일지 빈 칸 예전 기준\(JOURNAL_V132=0\)/);assert.match(c,/스탑 이유/);}
 finally{console.log=orig;}});
