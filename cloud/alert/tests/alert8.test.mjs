// alert8(trade-alert 2.5.1) — 텔레그램 메시지 형식: 제목·빈 줄 구조, HTML 이스케이프·굵은 제목, 위반 진입 묶음, 기준일 표기 US/HL, 4096자 분할.
// node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fmt from '../src/format.mjs';
import {Telegram,VERSION} from '../src/alert.mjs';
import * as S from './alert8-scenarios.mjs';

const ROW=/^([^:\n]+: .+|· .+|  · .+|(오늘|주간|월간)  .+|(🟢|🟡|🔴|⛔|⚪) (오늘|주간|월간) .+|      손익 .+|자산 .+|연속 손실 .+|⛔ 중단: .+|✅ 재시작 첫날: .+|※ .+)$/u; // 2.7.1 모양
/** 카드 구조: 첫 줄 제목(이모지로 시작), 둘째 줄 빈 줄, 이후 빈 줄은 연속 금지, 블록 줄은 '라벨: 값'·'· 항목'·사용률 줄·구분 제목·각주 */
function assertCard(text,{heads=false}={}){
 const L=text.split('\n');
 assert.match(L[0],/^(🔔|⚠️|⛔|🔄|✅|🚫|📊) \S/u,'제목: '+L[0]);
 assert.equal(L[1],'','제목 다음 빈 줄: '+JSON.stringify(text));
 for(let i=2;i<L.length;i++){
  if(L[i]===''){assert.notEqual(L[i-1],'','빈 줄 두 번 연속 없음');continue;}
  if(L[i-1]===''&&heads&&/^(🇺🇸 미국주식|🟦 하이퍼리퀴드) · /u.test(L[i]))continue;
  if(L[i-1]===''&&i===L.length-1)continue; // 각주(맨 아래 한 줄 안내)
  if(L[i-1]===''&&L.slice(i).every(x=>x===''||/^(※|주문은|일지에|앱 포지션)/.test(x)))continue;
  assert.match(L[i],ROW,'줄 형식: '+L[i]);
 }
 assert.ok(text.length<=4000);
}

test('버전 2.6.0',()=>{assert.equal(VERSION,'2.8.0');});

test('모든 메시지 종류: 첫 줄 제목 · 빈 줄 · 라벨: 값 (경고 50/80, 중단, 해제 🔄/✅, 연속손실, 위반, 기준일 🔄)',()=>{
 const f=S.hlDayFlow(),p=S.periodFlow(),b=S.beforeStart(),c=S.afterStart();
 const all=[...f.warn50,...f.warn80,...f.stop,...f.viol,...f.restart,...p.warnWeek,...p.stopWeek,...p.streak,...b.u.messages,...b.h.messages,...c.all.u.messages,...c.all.h.messages];
 const kinds=new Set(all.map(m=>m.text.split(' ')[0]));
 for(const k of ['🔔','⚠️','⛔','🔄','✅','🚫'])assert.ok(kinds.has(k),'종류 '+k);
 for(const m of all)assertCard(m.text);
 assert.ok(!all.some(m=>/기준: 손익 = 실현손익/.test(m.text)),'일반 알림엔 긴 기준 설명 없음');
 assert.match(f.warn50[0].text,/^🔔 하이퍼리퀴드 · 하루 한도 51% 사용\n\n오늘 실현: −1\.55% \(−31\.00 USDC\)\n한도: −3% \(−60\.00 USDC\)\n기준: 전일 마감 2,000\.00 USDC\n/);
 assert.match(f.warn80[0].text,/^⚠️ 하이퍼리퀴드 · 하루 한도 81% 사용\n/);
 assert.match(f.restart[0].text,/^✅ 하이퍼리퀴드 · 거래 중단 해제\n\n오늘: 10\/21\(수\) 재시작 첫날\n1회 위험: 0\.5% \(설정 1%의 50%\)\n해제된 중단: 하루 실현 −3%\n\n앱 포지션/);
 assert.match(p.streak[0].text,/^⛔ 하이퍼리퀴드 거래 중단 · 3일 연속 실현 손실일\n\n손실일: 11\/03 UTC −0\.60%, 11\/04 UTC −0\.80%, 11\/05 UTC −0\.55%\n쉬는 날: 다음 1거래일 \(11\/06 UTC\)\n신규 진입 중단: ~ 11\/07\(토\) 09:00 KST까지\n\n주문은 막지 않습니다/);
});

test('장마감 요약: 시장 블록 사이 빈 줄 + 구분 제목, 사용률 줄, 긴 기준 설명·※ 기준일 중복 줄 없음',()=>{
 const a=S.alerter(),b=S.beforeStart(),c=S.afterStart();
 const s1=a.summaryText([b.u.status,b.h.status],b.tSummary);
 assertCard(s1,{heads:true});
 assert.equal(s1,['📊 손실 한도 요약 · 미국 10/23(금) 장마감','',
  '🟦 하이퍼리퀴드 · 10/23(금)','오늘  — 10/26부터','주간  — 10/26부터','월간  — 10/26부터','연속 손실 0/3일 · 중단 없음','한도 적용: 10/26(월) 09:00 KST부터','',
  '🇺🇸 미국주식 · 10/23(금)','오늘  — 10/26부터','주간  — 10/26부터','월간  — 10/26부터','연속 손실 0/3일 · 중단 없음','한도 적용: 10/26(월) 미국 장부터 (KST 10/26 22:30~)'].join('\n'));
 const s2=a.summaryText([c.u.status,c.h.status],c.tSummary);assertCard(s2,{heads:true});
 assert.match(s2,/\n🇺🇸 미국주식 · 10\/27\(화\)\n🟢 오늘 −1\.20% \/ 3% ▰{4}▱{6}\n      손익 [^\n]+\n🟢 주간 −2\.19% \/ 6% ▰{4}▱{6}\n      손익 [^\n]+\n🟢 월간 −2\.19% \/ 10% ▰{2}▱{8}\n      손익 [^\n]+\n연속 손실 1\/3일 · 중단 없음$/);
 assert.match(s2,/^📊[^\n]+\n\n🟦 하이퍼리퀴드[^\n]+\n⛔ 오늘 −3\.10% \/ 3% ▰{10}\n[\s\S]*⛔ 중단: 하루 실현 −3% ~ 10\/28\(수\) 09:00 KST\n\n🇺🇸/);
 for(const s of [s1,s2]){assert.doesNotMatch(s,/기준: 손익|※|한도 기준일/);}
});

test('--test: 같은 스타일 + 긴 기준 설명은 맨 아래 각주 한 번 · 미국 실제 경계 각주',()=>{
 const a=S.alerter(),b=S.beforeStart(),c=S.afterStart();
 const t1=a.testText([b.u.status,b.h.status]);assertCard(t1,{heads:true});
 assert.equal(t1.match(/※ 손익 = 실현손익/g).length,1,'한 번만');
 assert.match(t1,/\n\n※ 손익 = 실현손익[^\n]*\n※ 미국 10\/26 거래일 몫 = 10\/23 16:00 ET\(10\/24\(토\) 05:00 KST\) 이후 체결부터 \(애프터·프리마켓 포함\)$/);
 assert.doesNotMatch(t1,/※ 손실 한도 기준일/,'status.note(기준일 전) 중복 줄 없음');
 assert.equal(b.u.status.note.includes('기준일 10/26 전'),true,'status.note 자체(앱용)는 그대로');
 const t2=a.testText([c.u.status,c.h.status]);assertCard(t2,{heads:true});
 assert.match(t2,/\n⛔ 오늘 −3\.10% \/ 3% ▰{10}\n      손익 −1,850 · 남은 0\.00\n/);
 assert.match(t2,/기준 잔액: 오늘 59,600 /);
});

test('기준일 표기: US = MM/DD(요일) 미국 장부터 (KST 정규장 개장, 서머타임 자동) · HL = 09:00 KST부터 · 계산(경계)은 그대로',()=>{
 const rsU=S.cfgRS('2026-10-26','US').riskStart,rsH=S.cfgRS('2026-10-26','HL').riskStart;
 assert.equal(fmt.applyText('US',rsU.day,rsU.at),'10/26(월) 미국 장부터 (KST 10/26 22:30~)');
 assert.equal(rsU.at,Date.parse('2026-10-23T20:00:00Z'),'실제 경계는 10/23 16:00 ET 그대로');
 const w=S.cfgRS('2026-11-02','US').riskStart;assert.equal(fmt.applyText('US',w.day,w.at),'11/02(월) 미국 장부터 (KST 11/02 23:30~)','서머타임 끝난 뒤 23:30');
 const sat=S.cfgRS('2026-10-24','US').riskStart;assert.equal(sat.day,'2026-10-26');assert.equal(fmt.applyText('US',sat.day,sat.at),'10/26(월) 미국 장부터 (KST 10/26 22:30~)','주말 기준일 → 다음 거래일');
 assert.equal(fmt.applyText('HL',rsH.day,rsH.at),'10/26(월) 09:00 KST부터');
 assert.equal(fmt.usageRow('오늘',{pct:null,missing:'before-start',startDay:'2026-10-26'}),'오늘   — 10/26부터');
 assert.equal(fmt.usageRow('오늘',{pct:-1.2,limit:3,ratio:0.4}),'오늘   −1.20% / 3%  (40%)');
 assert.equal(fmt.usageRow('주간',{pct:0.5,limit:6,ratio:0}),'주간   +0.50% / 6%  (0%)');
 assert.equal(fmt.usageRow('월간',{pct:-2,limit:null}),'월간   −2.00% / 한도 끔');
});

test('중단 중 신규 진입: 같은 종목·방향·60초 이내 체결은 알림 1개로 묶음(총 수량·체결 n건) · 위반 기록은 체결마다 그대로',()=>{
 const f=S.hlDayFlow();
 assert.equal(f.violEvents.length,4,'risk_events violation = 체결 4건(기존 동작)');
 assert.deepEqual(f.violEvents.map(e=>e.detail.tid),[900,901,902,950]);
 assert.equal(f.viol.length,2,'알림 = AERO 묶음 1 + 다른 종목 1');
 assert.equal(f.viol[0].text,["🚫 하이퍼리퀴드 · 거래 중단 중 신규 진입",'','종목: AERO Open Long','체결: 총 수량 510 · 체결 3건 @ 0.79269','시각: 10/20(화) 13:23 KST','사유: 하루 실현 −3%','중단: ~ 10/21(수) 09:00 KST','',"일지에 '규칙 위반'으로 표시합니다."].join('\n'));
 assert.match(f.viol[1].text,/종목: xyz:<TEST>&Co Open Short\n체결: 3 @ 12\.5\n/);
 // 60초 넘게 떨어진 체결·다른 방향·다른 가격 평균
 const R=S.runner(S.HL),t0=S.H('2026-10-20',9,30);R.step(t0,2000,{dr:S.DR('HL',t0,-60,2000)});
 const ft=S.H('2026-10-20',13,0);
 const fills=[{key:'a1',t:ft,symbol:'BTC',entry:true,side:'buy',qty:0.01,price:60000,desc:'Open Long 0.01 @ 60000'},{key:'a2',t:ft+30000,symbol:'BTC',entry:true,side:'buy',qty:0.03,price:60100,desc:'Open Long 0.03 @ 60100'},
  {key:'a3',t:ft+90000,symbol:'BTC',entry:true,side:'buy',qty:0.01,price:60200,desc:'Open Long 0.01 @ 60200'},{key:'a4',t:ft+31000,symbol:'BTC',entry:true,side:'sell',qty:0.02,price:60100,desc:'Open Short 0.02 @ 60100'}];
 const r=R.step(ft+120000,1940,{fills,dr:S.DR('HL',ft+120000,-60,2000)});
 const vm=r.messages.filter(m=>m.text.startsWith('🚫'));assert.equal(r.events.filter(e=>e.kind==='violation').length,4);assert.equal(vm.length,3);
 assert.match(vm[0].text,/종목: BTC Open Long\n체결: 총 수량 0\.04 · 체결 2건 @ 평균 60075\n시각: 10\/20\(화\) 13:00~13:00 KST|종목: BTC Open Long\n체결: 총 수량 0\.04 · 체결 2건 @ 평균 60075\n시각: 10\/20\(화\) 13:00 KST/);
 assert.ok(vm.some(m=>/BTC Open Short\n체결: 0\.02 @ 60100/.test(m.text)));
 assert.ok(vm.some(m=>/BTC Open Long\n체결: 0\.01 @ 60200\n시각: 10\/20\(화\) 13:01 KST/.test(m.text)));
 const again=R.step(ft+180000,1940,{fills,dr:S.DR('HL',ft+180000,-60,2000)});assert.equal(again.messages.filter(m=>m.text.startsWith('🚫')).length,0,'중복 없음');
});

test('HTML: 전부 이스케이프, 첫 줄과 시장 구분 제목만 <b> · Telegram.send는 parse_mode HTML, 400이면 plain으로 다시',async()=>{
 const f=S.hlDayFlow(),txt=f.viol[1].text;
 const h=fmt.toHtml(txt);
 assert.ok(h.startsWith('<b>🚫 하이퍼리퀴드 · 거래 중단 중 신규 진입</b>\n\n'));
 assert.match(h,/종목: xyz:&lt;TEST&gt;&amp;Co Open Short/);assert.equal((h.match(/<b>/g)||[]).length,1);
 assert.equal(fmt.fromHtml(h),txt);
 const a=S.alerter(),c=S.afterStart();const sh=fmt.toHtml(a.summaryText([c.u.status,c.h.status],c.tSummary));
 assert.equal((sh.match(/<b>/g)||[]).length,3,'제목 + 시장 2개');assert.match(sh,/\n<b>🇺🇸 미국주식 · 10\/27\(화\)<\/b>\n/);assert.match(sh,/\n<b>🟦 하이퍼리퀴드 · 10\/27\(화\)<\/b>\n/);assert.ok(sh.indexOf('하이퍼리퀴드')<sh.indexOf('미국주식'),'HL 먼저');
 assert.doesNotMatch(sh.replace(/<\/?b>/g,''),/[<>]/,'태그는 <b>만');
 // 전송: HTML 성공
 const calls=[];let fail=false;
 const fetcher=async(url,o)=>{const b=JSON.parse(o.body);calls.push(b);if(fail&&b.parse_mode)return new Response(JSON.stringify({ok:false,description:"Bad Request: can't parse entities"}),{status:400});return new Response(JSON.stringify({ok:true,result:{}}),{status:200});};
 const tg=new Telegram('1:x','42',fetcher,async()=>{});await tg.send(txt);
 assert.equal(calls.length,1);assert.equal(calls[0].parse_mode,'HTML');assert.equal(calls[0].text,h);
 fail=true;calls.length=0;await tg.send(txt);assert.equal(calls.length,2);assert.equal(calls[1].parse_mode,undefined);assert.equal(calls[1].text,txt,'plain 재전송');
 calls.length=0;const plain=new Telegram('1:x','42',fetcher,async()=>{},{html:false});fail=false;await plain.send(txt);assert.equal(calls[0].parse_mode,undefined,'TELEGRAM_HTML=0');
});

test('4096자 제한: 3800자 넘으면 블록·줄 경계에서 나눠 여러 메시지(제목 (i/n)) · HTML로 바꿔도 각 조각 4096 이하',async()=>{
 const blocks=[];for(let i=0;i<40;i++)blocks.push([`🟦 하이퍼리퀴드 · 블록 ${i}`,...Array.from({length:6},(_,j)=>`항목 ${j}: ${'<&>'.repeat(10)} 값 ${i}-${j}`)]);
 const big=fmt.multi('✅ 긴 메시지 테스트',blocks,['※ 끝']);assert.ok(big.length>8000);
 const parts=fmt.splitText(big);assert.ok(parts.length>=3);
 parts.forEach((p,i)=>{assert.ok(p.length<=fmt.TG_MAX,`조각 ${i} ${p.length}`);assert.ok(p.startsWith(`✅ 긴 메시지 테스트 (${i+1}/${parts.length})`));assert.equal(p.split('\n')[1],'');
  assert.ok(fmt.fromHtml(fmt.toHtml(p)).length<=4096);});
 const joined=parts.map(p=>p.split('\n').slice(2).join('\n')).join('\n\n');for(const b of blocks)assert.ok(joined.includes(b.join('\n')),'블록이 쪼개지지 않음');
 const one='✅ t\n\n'+'가'.repeat(9000);const op=fmt.splitText(one);assert.ok(op.every(p=>p.length<=fmt.TG_MAX));assert.equal(op.map(p=>p.split('\n').slice(2).join('')).join(''),'가'.repeat(9000));
 const calls=[];const tg=new Telegram('1:x','42',async(u,o)=>{calls.push(JSON.parse(o.body));return new Response(JSON.stringify({ok:true,result:{}}),{status:200});},async()=>{});
 await tg.send(big);assert.equal(calls.length,parts.length);assert.ok(calls.every(c=>c.parse_mode==='HTML'&&c.text.startsWith('<b>✅ 긴 메시지 테스트 (')));
});
