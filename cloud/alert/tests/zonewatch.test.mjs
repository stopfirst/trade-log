// trade-alert 2.10.0 — 존 터치 알림: 설정, 터치, 같은 존 1회, 재시작(상태 파일), 완화·무효 정리, 관통, 새 존, 명령(/zones), 429 백오프, 봉 캐시(요청량), 전송 실패 재시도, --zones-dry.
//  봉 = tests/fixtures/zones/live-20261101.json(2026-11-01 01:15 KST HL BTC 1H 360개)을 바탕으로 마지막 봉만 바꿔 가며. 텔레그램·HL은 전부 모의.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as W from '../src/zonewatch.mjs';
import * as Z from '../src/zones.mjs';
import {Alerter,readConfig,main} from '../src/alert.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const L=JSON.parse(readFileSync(path.join(here,'fixtures','zones','live-20261101.json'),'utf8'));
const H=3600e3,MIN=60e3;
const BASE=L.hl.BTC.map(r=>({t:Number(r.t),o:+r.o,h:+r.h,l:+r.l,c:+r.c,v:+r.v}));
const T_LAST=BASE[BASE.length-1].t,NOW0=L.fetchedAt; // 마지막 봉(진행 중) 시작 · 스냅샷 시각
const clone=a=>a.map(x=>({...x}));
const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),CHAT='987654321';
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:CHAT,ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',QUICK_REVIEW:'0',...x});

/** 모의 소스: world.rows(가변)를 HL candleSnapshot처럼 돌려줌. 요청 기록. world.fail = 에러 객체면 던짐. */
function world(rows){
 const w={rows,calls:[],fail:null};
 w.sources={hl:async(sym,tf,{start,end,limit})=>{w.calls.push({sym,start,end,limit});if(w.fail)throw w.fail;return clone(w.rows.filter(r=>r.t>=start&&r.t<=end));}};
 return w;
}
function watcher(w,{env:e={},state={},now}={}){
 const cfg=W.zoneConfig({ZONE_ALERT:'1',ZONE_SOURCE:'hl',ZONE_SYMBOLS:'BTC',...e});
 const sent=[],logs=[];let saves=0;const clock={t:now??NOW0};
 const zw=new W.ZoneWatch({cfg,sources:w.sources,now:()=>clock.t,log:(l,m)=>logs.push(l+' '+m),state:()=>state,save:async()=>{saves++;},send:async(t)=>{if(zw.failSend)throw Error('TELEGRAM_NETWORK_ERROR');sent.push(t);}});
 return {zw,cfg,sent,logs,state,clock,get saves(){return saves;}};
}
/** 마지막 봉(진행 중)을 바꾼 봉 목록 */
function withLast(rows,{h,l,c}){const r=clone(rows),x=r[r.length-1];if(h!=null)x.h=Math.max(x.h,h);if(l!=null)x.l=Math.min(x.l,l);if(c!=null){x.c=c;x.h=Math.max(x.h,c);x.l=Math.min(x.l,c);}return r;}

const shownAt=(rows,now)=>{const zc=Z.computeZones(rows,{nowMs:now,tfMs:H,bars:100});const sh=Z.selectShown(zc,rows);return {zc,sh};};
const B0=shownAt(BASE,NOW0);

test('설정: 기본값(꺼짐·BTC,ETH·1h·bbfvg,ob·60초·100봉·auto) · 형식 오류는 readConfig가 알려 줌',()=>{
 const c=W.zoneConfig({});
 assert.equal(c.envOn,false);assert.deepEqual(c.symbols,['BTC','ETH']);assert.equal(c.tf,'1h');assert.equal(c.tfMs,H);assert.deepEqual(c.kinds,['bbfvg','ob']);
 assert.equal(c.checkSec,60);assert.equal(c.bars,100);assert.equal(c.source,'auto');assert.equal(c.commands,true);assert.deepEqual(c.errors,[]);
 assert.equal(W.zoneConfig({ZONE_ALERT:'1'}).envOn,true);assert.equal(W.zoneConfig({ZONE_ALERT:'0'}).envOn,false);
 const bad=W.zoneConfig({ZONE_TF:'2h',ZONE_KINDS:'ob,xx',ZONE_SOURCE:'okx',ZONE_CHECK_SEC:'5',ZONE_SYMBOLS:'BTC,E TH'});
 assert.equal(bad.errors.length,5);
 assert.throws(()=>readConfig(env('/tmp',{ZONE_TF:'2h'})),e=>e.message==='CONFIG_INCOMPLETE'&&e.fields.some(f=>/ZONE_TF/.test(f)));
 assert.equal(readConfig(env('/tmp')).zones.envOn,false);
});

test('기준 봉의 표시 존(BTC 1H, 2026-11-01): BB+FVG 약세 2개 + OB 약세 1개, touchFromT는 존이 만들어진 봉 이후',()=>{
 assert.equal(B0.sh.bbfvg.length,2);assert.ok(B0.sh.ob.length>=1);
 for(const z of B0.sh.bbfvg){const r=Z.zoneRecord('BTC','1h','bbfvg',z,BASE);assert.equal(r.touchFromT,BASE[Math.max(z.created,z.brk)].t);assert.ok(r.t0<r.touchFromT);assert.match(r.id,/^BTC:bbfvg:bear:\d+$/);}
 for(const z of B0.sh.ob){const r=Z.zoneRecord('BTC','1h','ob',z,BASE);assert.equal(r.touchFromT,BASE[z.brk].t);}
});

test('터치 → 알림 1회(짧은 한국어 + flow-chart 링크) · 같은 존은 다시 안 보냄 · 닿지 않으면 없음',async()=>{
 const w=world(clone(BASE)),X=watcher(w);
 let r=await X.zw.tick(NOW0);assert.equal(X.sent.length,0,'처음: 현재가 77,591은 어느 존에도 없음');
 const near=B0.sh.bbfvg.map(z=>z.bottom).sort((a,b)=>a-b)[0]; // 79,802
 w.rows=withLast(BASE,{h:near-50});X.clock.t=NOW0+MIN;r=await X.zw.tick(X.clock.t);assert.equal(X.sent.length,0,'존 50 아래까지만');
 w.rows=withLast(BASE,{h:near+10,c:near-200});X.clock.t=NOW0+2*MIN;r=await X.zw.tick(X.clock.t);
 const bb=X.sent.filter(t=>/BB\+FVG 약세 존 터치/.test(t));assert.equal(bb.length,2,'하단이 같은 BB+FVG 2개 모두 터치');
 const t0=X.sent[0];
 assert.match(t0,/^🎯 BTC 1H BB\+FVG 약세 존 터치\n\n존: 79,802\.0 – 79,(850|132)\.0|^🎯 BTC 1H BB\+FVG 약세 존 터치\n\n존: 79,802\.0 – 80,132\.0/);
 assert.match(t0,/현재가: 79,602\.0/);assert.match(t0,/존 시작 봉: \d\d\/\d\d \d\d:00 KST · Hyperliquid/);assert.match(t0,/https:\/\/stopfirst\.github\.io\/flow-chart\/\?s=BTC&tf=1h$/);
 assert.ok(t0.split('\n').length<=6,'짧게');
 const n=X.sent.length;
 for(let k=3;k<6;k++){X.clock.t=NOW0+k*MIN;await X.zw.tick(X.clock.t);}assert.equal(X.sent.length,n,'같은 존 중복 없음');
 assert.equal(Object.keys(X.state.zones.sent).length,n);
});

test('재시작해도 중복 없음: Alerter 상태 파일(state2.json)에 저장 → 새 Alerter가 읽고 다시 안 보냄',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'zones-'));const rows=withLast(BASE,{c:79820});
 const tg=[];const fetcher=async(url,init)=>{const u=String(url);
  if(u.includes('api.telegram.org')){const b=JSON.parse(init.body);tg.push(b.text);return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:tg.length}})};}
  if(u.includes('api.hyperliquid.xyz')){const q=JSON.parse(init.body).req;return {ok:true,status:200,json:async()=>rows.filter(r=>r.t>=q.startTime&&r.t<=q.endTime).map(r=>({t:r.t,o:String(r.o),h:String(r.h),l:String(r.l),c:String(r.c),v:String(r.v)}))};}
  throw Error('unexpected '+u);};
 const E=env(dir,{ZONE_ALERT:'1',ZONE_SOURCE:'hl',ZONE_SYMBOLS:'BTC',TELEGRAM_HTML:'0'});
 const a=new Alerter(E,{fetcher,now:()=>NOW0,log:()=>{}});await a.init();await a.zones.tick(NOW0);
 const first=tg.length;assert.ok(first>=1,'첫 실행에서 알림(현재가 79,820이 BB+FVG 안)');
 const saved=JSON.parse(await readFile(path.join(dir,'state2.json'),'utf8'));assert.equal(Object.keys(saved.zones.sent).length,first);assert.deepEqual(saved.zones.outbox,[]);
 const b=new Alerter(E,{fetcher,now:()=>NOW0+5*MIN,log:()=>{}});await b.init();await b.zones.tick(NOW0+5*MIN);await b.zones.tick(NOW0+6*MIN);
 assert.equal(tg.length,first,'재시작 뒤 같은 존 다시 안 보냄');
 // 다른 손실 한도 상태는 그대로(존 상태만 추가)
 assert.equal(saved.v,2);assert.ok(saved.engine&&saved.journal);
});

test('완화·무효 정리: 마감된 봉 종가가 존 위로 → 기록 삭제·감시 목록에서 빠짐 · 진행 중 봉 종가만으로는 안 지움',async()=>{
 const w=world(withLast(BASE,{c:79820})),X=watcher(w);
 await X.zw.tick(NOW0);const ids=Object.keys(X.state.zones.sent).filter(id=>id.includes(':bbfvg:'));assert.equal(ids.length,2);
 const top=Math.max(...B0.sh.bbfvg.map(z=>z.top)); // 80,132
 // 진행 중 봉이 존 위에서 거래 중(종가 > 상단) → BB+FVG는 flow-chart처럼 '무효(진행 중 봉)'이지만 기록은 유지
 w.rows=withLast(BASE,{h:top+100,c:top+50});X.clock.t=NOW0+MIN;await X.zw.tick(X.clock.t);
 for(const id of ids)assert.ok(X.state.zones.sent[id],'진행 중 봉 무효화로는 기록 유지 '+id);
 // 그 봉이 존 위에서 마감 + 다음 봉 진행 중 → 정리
 const r2=withLast(BASE,{h:top+100,c:top+50});r2.push({t:T_LAST+H,o:top+50,h:top+80,l:top+20,c:top+60,v:1});
 w.rows=r2;X.clock.t=T_LAST+H+5*MIN;await X.zw.tick(X.clock.t);
 for(const id of ids)assert.equal(X.state.zones.sent[id],undefined,'마감 무효화 → 정리 '+id);
 assert.ok(X.logs.some(l=>/존 정리\(무효화\)/.test(l)));
 for(const id of ids)assert.ok(!(id in X.state.zones.watch['BTC:1h']));
});

test('관통: 1분 사이에 존을 뚫고 종가가 넘어가 차트에서 사라져도, 보이던 존이면 이번 봉으로 한 번 알림',async()=>{
 const w=world(clone(BASE)),X=watcher(w);await X.zw.tick(NOW0);assert.equal(X.sent.length,0);
 const top=Math.max(...B0.sh.bbfvg.map(z=>z.top));
 w.rows=withLast(BASE,{h:top+300,c:top+200});X.clock.t=NOW0+MIN;await X.zw.tick(X.clock.t);
 // 보이던 BB+FVG 2개(하단 79,802) = '넘는 중' 표시로 알림. 대신 새로 가까워진 BB+FVG가 보이기 시작하면 지금 가격이 그 안이라 따로 알림(정상)
 const rng=B0.sh.bbfvg.map(z=>`존: ${W.fmtPx(z.bottom,z.bottom)} – ${W.fmtPx(z.top,z.top)}\n`);
 const gone=X.sent.filter(t=>rng.some(r=>t.includes(r)));assert.equal(gone.length,2);assert.ok(gone.every(t=>/존을 종가로 넘는 중/.test(t)));
 assert.ok(X.sent.filter(t=>!rng.some(r=>t.includes(r))).every(t=>!/넘는 중/.test(t)&&/현재가: 80,332\.0/.test(t)));
});

test('새로 보이기 시작한 존: 지금 가격이 존 안일 때만(지난 꼬리는 안 침) · 처음 실행도 같음',async()=>{
 // 처음 실행인데 진행 중 봉 고가만 존에 닿았다가 내려옴 → 알림 없음
 const w=world(withLast(BASE,{h:79830,c:77600})),X=watcher(w);await X.zw.tick(NOW0);assert.equal(X.sent.length,0);
 // 지금 가격이 존 안 → 알림
 const w2=world(withLast(BASE,{c:79820})),Y=watcher(w2);await Y.zw.tick(NOW0);assert.ok(Y.sent.filter(t=>/BB\+FVG/.test(t)).length>=1);
});

test('종류 필터: ZONE_KINDS=ob면 BB+FVG 알림 없음 · OB 터치는 알림',async()=>{
 const ob=B0.sh.ob[0];const w=world(clone(BASE)),X=watcher(w,{env:{ZONE_KINDS:'ob'}});await X.zw.tick(NOW0);
 w.rows=withLast(BASE,{h:B0.sh.bbfvg[0].top,c:77600});X.clock.t=NOW0+MIN;await X.zw.tick(X.clock.t);assert.equal(X.sent.length,0);
 w.rows=withLast(BASE,{h:ob.bottom+1,c:77600});X.clock.t=NOW0+2*MIN;await X.zw.tick(X.clock.t);
 assert.equal(X.sent.length,1);assert.match(X.sent[0],/OB 약세 존 터치/);
});

test('/zones on|off|status: 끄면 확인 안 함 · 상태 저장 · .env ZONE_ALERT를 바꾸면 .env가 다시 우선',async()=>{
 const w=world(clone(BASE)),state={},X=watcher(w,{env:{ZONE_ALERT:'0'},state});
 assert.equal(X.zw.enabled(),false);assert.deepEqual(await X.zw.tick(NOW0),{skipped:'off'});assert.equal(w.calls.length,0,'꺼져 있으면 봉 요청 없음');
 let rep=await X.zw.command('/zones on');assert.match(rep,/켰습니다/);assert.equal(X.zw.enabled(),true);assert.ok(w.calls.length>=1,'켜면 바로 1회 확인');assert.match(rep,/BTC 77,591\.0/);
 rep=await X.zw.command('/zones status');assert.match(rep,/🟢 존 터치 알림 켜짐 \(텔레그램으로 설정\)/);assert.match(rep,/BB\+FVG 약세 79,802\.0 – /);
 rep=await X.zw.command('/zones@MyBot off');assert.match(rep,/껐습니다/);assert.equal(X.zw.enabled(),false);
 assert.equal(await X.zw.command('/zone on'),null);assert.match(await X.zw.command('/zones blah'),/사용법/);
 // 같은 상태로 .env만 ZONE_ALERT=1로 바뀌면 override 무시(새 .env 우선)
 const Y=watcher(w,{env:{ZONE_ALERT:'1'},state});assert.equal(Y.zw.enabled(),true);
 const Z2=watcher(w,{env:{ZONE_ALERT:'0'},state});assert.equal(Z2.zw.enabled(),false);
});

test('Alerter: TELEGRAM_CHAT_ID 대화방의 /zones만 처리(다른 방·다른 글은 무시), 답장은 텔레그램으로',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'zones-'));const tg=[];
 const fetcher=async(url,init)=>{const u=String(url);if(u.includes('api.telegram.org')){tg.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:1}})};}
  if(u.includes('api.hyperliquid.xyz')){const q=JSON.parse(init.body).req;return {ok:true,status:200,json:async()=>BASE.filter(r=>r.t>=q.startTime&&r.t<=q.endTime)};}throw Error(u);};
 const a=new Alerter(env(dir,{ZONE_SOURCE:'hl',ZONE_SYMBOLS:'BTC',TELEGRAM_HTML:'0'}),{fetcher,now:()=>NOW0,log:()=>{}});await a.init();
 assert.equal(await a.onTgMessage({chat:{id:111},text:'/zones on'}),false);assert.equal(a.zones.enabled(),false);
 assert.equal(await a.onTgMessage({chat:{id:Number(CHAT)},text:'안녕'}),false);
 assert.equal(await a.onTgMessage({chat:{id:Number(CHAT)},text:'/zones on'}),true);assert.equal(a.zones.enabled(),true);
 assert.ok(tg.some(b=>/존 터치 알림을 켰습니다/.test(b.text)&&b.chat_id===CHAT));
 const st=JSON.parse(await readFile(path.join(dir,'state2.json'),'utf8'));assert.equal(st.zones.override.on,true);
});

test('quick.mjs 받기 루프가 message를 onMessage로 넘김(버튼 응답은 그대로)',async()=>{
 const Q=await import('../src/quick.mjs');const S={};const got=[];
 const tg={api:async(m)=>m==='getUpdates'?[{update_id:5,message:{chat:{id:1},text:'/zones status'}},{update_id:6,callback_query:{id:'x',data:'qr|1|c',message:{chat:{id:2}}}}]:true};
 const q=new Q.QuickReview({tg,rpc:null,token:'t',chat:'1',log:()=>{},now:()=>NOW0,state:()=>S,save:async()=>{}});q.onMessage=m=>got.push(m.text);
 await q.pollOnce(0);assert.deepEqual(got,['/zones status']);assert.equal(S.qr.offset,7);
});

test('429 → 백오프(Retry-After 존중) 동안 요청 안 함 → 지나면 다시',async()=>{
 const w=world(clone(BASE)),X=watcher(w);await X.zw.tick(NOW0);const n0=w.calls.length;
 w.fail=Object.assign(Error('ZONE_HL_HTTP_429'),{status:429,retryAfter:'120'});X.clock.t=NOW0+MIN;await X.zw.tick(X.clock.t);
 assert.ok(X.logs.some(l=>/429.*120초 쉼/.test(l)));const n1=w.calls.length;
 w.fail=null;assert.deepEqual(await X.zw.tick(NOW0+2*MIN),{skipped:'backoff'});assert.equal(w.calls.length,n1);
 await X.zw.tick(NOW0+MIN+121e3);assert.equal(w.calls.length,n1+1);assert.equal(X.zw.backoff.n,0);
 // 연속 실패면 1·2·4…분(최대 15분)
 w.fail=Object.assign(Error('ZONE_HL_HTTP_503'),{status:503});let t=NOW0+10*MIN;const waits=[];
 for(let k=0;k<6;k++){await X.zw.tick(t);waits.push(Math.round((X.zw.backoff.until-t)/MIN));t=X.zw.backoff.until;}
 assert.deepEqual(waits,[1,2,4,8,15,15]);assert.ok(n0>=1);
});

test('봉 캐시: 처음 1회 전체(360개) → 그 뒤 1분마다 최근 봉만 · 틈이 생기거나 6시간이 지나면 전체 · 창 = flow-chart와 같은 360개',async()=>{
 const w=world(clone(BASE)),X=watcher(w);await X.zw.tick(NOW0);
 assert.equal(w.calls.length,1);const full=w.calls[0];assert.equal((full.end-full.start)/H>350,true);
 for(let k=1;k<=5;k++){X.clock.t=NOW0+k*MIN;await X.zw.tick(X.clock.t);}
 assert.equal(w.calls.length,6);for(const c of w.calls.slice(1))assert.equal(c.start,T_LAST-H,'최근 2봉만 요청');
 // 다음 봉이 생김(정시 지나서): 증분으로 합치고 창은 360개 유지
 const r=clone(BASE);r.push({t:T_LAST+H,o:77600,h:77650,l:77550,c:77620,v:1});w.rows=r;X.clock.t=T_LAST+H+MIN;
 const got=await X.zw.cache.get('BTC',X.clock.t);assert.equal(got.rows.length,360);assert.equal(got.rows[359].t,T_LAST+H);assert.equal(got.rows[0].t,BASE[1].t);
 // 6시간 뒤 전체
 const before=w.calls.length;await X.zw.cache.get('BTC',NOW0+6*H+MIN);assert.equal(w.calls[before].end-w.calls[before].start>350*H,true);
});

test('텔레그램 전송 실패 → 보냄 기록은 먼저 저장, 다음 확인 때 재전송(1회만) · 30분 지난 건 버림',async()=>{
 const w=world(withLast(BASE,{c:79820})),X=watcher(w);X.zw.failSend=true;await X.zw.tick(NOW0);
 assert.equal(X.sent.length,0);const ob=X.state.zones.outbox.length;assert.ok(ob>=1);assert.ok(Object.keys(X.state.zones.sent).length>=1);assert.ok(X.saves>=1);
 X.zw.failSend=false;await X.zw.tick(NOW0+MIN);assert.equal(X.sent.length,ob);assert.equal(X.state.zones.outbox.length,0);
 await X.zw.tick(NOW0+2*MIN);assert.equal(X.sent.length,ob);
 const w2=world(withLast(BASE,{c:79820})),Y=watcher(w2);Y.zw.failSend=true;await Y.zw.tick(NOW0);Y.zw.failSend=false;await Y.zw.tick(NOW0+31*MIN);assert.equal(Y.sent.length,0);
});

test('동시에 두 번 확인해도(/zones on 직후 + 1분 루프) 중복 전송 없음',async()=>{
 const w=world(withLast(BASE,{c:79820})),X=watcher(w);
 await Promise.all([X.zw.tick(NOW0),X.zw.tick(NOW0)]);const n=X.sent.length;assert.ok(n>=1);
 assert.equal(new Set(X.sent).size,n);
});

test('정리: 계산에서 사라진 존은 24시간 뒤 기록 삭제(창이 밀려 잠깐 사라졌다 돌아오는 경우 대비)',async()=>{
 const state={zones:{sent:{'BTC:ob:bull:1700000000000':{at:NOW0-2*H,seen:NOW0-2*H},'BTC:ob:bull:1700003600000':{at:NOW0-30*H,seen:NOW0-25*H},'ETH:ob:bull:1':{at:0,seen:0}}}};
 const w=world(clone(BASE)),X=watcher(w,{state});await X.zw.tick(NOW0);
 assert.ok(state.zones.sent['BTC:ob:bull:1700000000000']);assert.equal(state.zones.sent['BTC:ob:bull:1700003600000'],undefined);assert.ok(state.zones.sent['ETH:ob:bull:1'],'다른 종목은 그 종목 확인 때만');
});

test('--zones-dry: 보내지도 저장하지도 않고 목록 출력(Supabase·텔레그램 값 없이도)',async()=>{
 const out=await W.dryList(W.zoneConfig({ZONE_SOURCE:'hl',ZONE_SYMBOLS:'BTC'}),{sources:world(clone(BASE)).sources,now:()=>NOW0});
 assert.match(out,/^존 목록 \(보내지 않음\) · 1H · BB\+FVG·OB · 차트 100봉/);assert.match(out,/BTC 현재가 77,591\.0 · Hyperliquid 봉 360개/);
 assert.match(out,/BB\+FVG 약세 79,802\.0 – /);assert.match(out,/OB 약세 /);assert.match(out,/flow-chart\/\?s=BTC&tf=1h/);
 // main --zones-dry: 형식 오류면 2
 const logs=[];const orig=console.log;console.log=l=>logs.push(l);
 try{assert.equal(await main(['--zones-dry'],{ZONE_TF:'2h'}),2);}finally{console.log=orig;}
});
