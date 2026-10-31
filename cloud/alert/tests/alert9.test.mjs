// alert9(trade-alert 2.6.0) — 텔레그램 즉시 복기: 청산 감지, 메시지·버튼, 버튼 응답(준수/위반 칩/나중에/뒤로), 저장(quick_review_push), alert9.sql 없을 때, 대화방 제한, 롱폴링.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fromHtml} from '../src/format.mjs';
import {Alerter,readConfig,VERSION} from '../src/alert.mjs';
import * as Q from '../src/quick.mjs';
import {kstWall} from '../src/calendar.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const BOT='123456789:AAH'+'x'.repeat(32),TOKEN='kwc_'+'A'.repeat(43),KEY='sb_publishable_'+'k'.repeat(24),ADDR='0x'+'c'.repeat(40),CHAT='987654321';
const env=(dir,x={})=>({SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:KEY,KW_COLLECTOR_TOKEN:TOKEN,TELEGRAM_BOT_TOKEN:BOT,TELEGRAM_CHAT_ID:CHAT,ALERT_STATE_DIR:dir,DAILY_SUMMARY:'0',...x});
const NOW0=kstWall('2026-10-24',1); // 토 01:00 KST

const F=(tid,time,side,sz,start,o={})=>({coin:'BTC',side,sz:String(sz),px:'60000',startPosition:String(start),feeToken:'USDC',tid,time,closedPnl:'0',fee:'0',hash:'0x'+tid,dir:'x',...o});

test('버전 2.6.0 · QUICK_REVIEW 기본 켜짐, 0이면 끔',()=>{
 assert.equal(VERSION,'2.8.0');
 assert.equal(readConfig(env('/tmp')).quickReview,true);assert.equal(readConfig(env('/tmp',{QUICK_REVIEW:'1'})).quickReview,true);
 assert.equal(readConfig(env('/tmp',{QUICK_REVIEW:'0'})).quickReview,false);assert.equal(readConfig(env('/tmp',{QUICK_REVIEW:'off'})).quickReview,false);
});

test('위반 칩 라벨 = 앱 OPTIONS.violations (index.html과 대조)',async()=>{
 const cands=[path.join(HERE,'../../../TRADE-JOURNAL-CLOUD-20261024-v37/github-pages/index.html')];
 let html=null;for(const c of cands){try{html=await readFile(c,'utf8');break;}catch{}}
 if(!html){assert.deepEqual(Q.VIOLATIONS,['추격','계획 외 진입','과도한 위험 배정','손절 지연','청산 규칙 미준수']);return;}
 const m=/violations:\[([^\]]*)\]/.exec(html);assert.ok(m);assert.deepEqual(JSON.parse('['+m[1].replace(/'/g,'"')+']'),Q.VIOLATIONS);
});

test('detectCloses: 전량 청산·부분 청산·숏·방향 전환·같은 시각 사슬·현물 제외·펀딩 포함',()=>{
 const t=NOW0;
 const fills=[
  F(10,t-5000,'B',1,0,{closedPnl:'0',fee:'1'}),            // 롱 진입 1
  F(11,t-4000,'B',1,1,{closedPnl:'0',fee:'1'}),            // 추가 → 2
  F(12,t-3000,'A',1,2,{closedPnl:'50',fee:'1'}),           // 부분 청산 → 1 (청산 아님)
  F(14,t-2000,'A',0.5,0.5,{closedPnl:'30',fee:'0.5'}),     // 같은 시각, 사슬상 두 번째(0.5→0) — 이게 청산 체결
  F(13,t-2000,'A',0.5,1,{closedPnl:'30',fee:'0.5'}),       // 같은 시각, 사슬상 첫 번째(1→0.5)
  F(20,t-1500,'A',2,0,{coin:'ETH',closedPnl:'0',fee:'2'}), // 숏 진입
  F(21,t-1000,'B',3,-2,{coin:'ETH',closedPnl:'-40',fee:'3'}), // 방향 전환: 숏 2 청산 + 롱 1 진입
  F(22,t-500,'A',1,1,{coin:'ETH',closedPnl:'10',fee:'1'}), // 롱 1 청산
  F(30,t-400,'B',5,0,{coin:'@107'}),F(31,t-300,'A',5,5,{coin:'@107'}), // 현물 제외
 ];
 const funding=[{time:t-3500,delta:{type:'funding',coin:'BTC',usdc:'-2',szi:'2'}},{time:t-900,delta:{type:'funding',coin:'ETH',usdc:'0.5',szi:'1'}}];
 const c=Q.detectCloses(fills,funding);
 assert.deepEqual(c.map(x=>[x.coin,x.direction,x.tid]),[['BTC','long','14'],['ETH','short','21'],['ETH','long','22']]);
 assert.equal(c[0].pnl,-1-1+49+29.5+29.5-2,'BTC: Σ(closedPnl−fee) 구간 전체 + 펀딩');assert.equal(c[0].openTime,t-5000);assert.equal(c[0].fills,5);assert.equal(c[0].partial,false);
 assert.equal(c[1].pnl,-2+(-40-3*2/3),'ETH 숏: 진입 수수료 + 전환 체결은 청산 몫 수수료만');
 assert.equal(c[2].pnl,Math.round((-3*1/3+10-1+0.5)*1e6)/1e6,'ETH 롱(전환으로 시작): 전환 체결의 진입 몫 수수료 + 청산 + 펀딩');assert.equal(c[2].openTime,t-1000);
 const part=Q.detectCloses([F(40,t,'A',1,1,{closedPnl:'5',fee:'0.1'})]);assert.equal(part[0].partial,true,'구간 시작이 범위 밖이면 partial');assert.equal(part[0].openTime,null);
});

test('메시지: 제목 형식 · 버튼 · callback_data ≤ 64바이트 · 위반 칩 · 완료/나중에 화면',()=>{
 const it={tid:'123456789012345',coin:'xyz:INTC',direction:'long',time:NOW0,openTime:NOW0-3600000,pnl:120,r:0.6,rUnit:200,riskPct:1,equity:20000,screen:'ask',sel:[],decision:null,saved:false};
 let v=Q.view(it);
 assert.equal(v.text.split('\n')[0],'📝 xyz:INTC 롱 청산 · +$120.00 (+0.6R) · 복기');
 assert.match(v.text,/청산: 10\/24 01:00 KST · 진입 10\/24 00:00 KST/);assert.match(v.text,/※ R = 기본 위험 1% × 잔고 \$20,000 기준\(1R \$200\.00\)/);
 assert.deepEqual(v.reply_markup.inline_keyboard[0].map(b=>b.text),['규칙 준수','규칙 위반','나중에']);
 it.screen='pick';it.sel=['추격','손절 지연'];v=Q.view(it);
 const flat=v.reply_markup.inline_keyboard.flat();assert.deepEqual(flat.map(b=>b.text),['☑ 추격','☐ 계획 외 진입','☐ 과도한 위험 배정','☑ 손절 지연','☐ 청산 규칙 미준수','← 뒤로','완료']);
 for(const b of flat)assert.ok(Buffer.byteLength(b.callback_data)<=64,b.callback_data);
 assert.match(v.text,/선택: 추격, 손절 지연/);
 it.screen='later';v=Q.view(it);assert.deepEqual(v.reply_markup.inline_keyboard[0].map(b=>b.text),['규칙 준수','규칙 위반']);assert.match(v.text,/⏰ 나중에/);
 it.screen='done';it.decision='violation';it.saved=true;v=Q.view(it);assert.equal(v.text.split('\n')[0],'🚫 xyz:INTC 롱 청산 · +$120.00 (+0.6R)');assert.match(v.text,/규칙 위반으로 기록: 추격, 손절 지연/);assert.equal(v.reply_markup.inline_keyboard.length,0);
 const s=Q.view({...it,pnl:-40.5,r:null,rUnit:null,direction:'short',screen:'ask'});assert.equal(s.text.split('\n')[0],'📝 xyz:INTC 숏 청산 · −$40.50 · 복기');assert.doesNotMatch(s.text,/※ R/);
 assert.deepEqual(Q.payloadItem({...it,decision:'compliant',sel:['추격']}).violations,[],'준수면 위반 항목 없음');
 assert.deepEqual(Q.payloadItem(it),{ref:'hl:123456789012345',market:'hl',symbol:'xyz:INTC',direction:'long',close_key:'123456789012345',close_at:NOW0,pnl:120,r:0.6,decision:'violation',violations:['추격','손절 지연']});
});

// ---- 서비스 통합(가짜 Supabase·텔레그램·HL) ----
function world(){
 const w={now:NOW0,fills:[],alerts:[],qr:'ok',qrPush:[],qrFail:false,tg:[],tgCalls:[],updates:[],pushes:[]};
 w.fetcher=async(url,opts)=>{const body=opts?.body?JSON.parse(opts.body):null;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json'}});
  if(url.endsWith('/rpc/risk_status'))return J({ok:true,version:2,now:w.now,kw:{latest:null,orders:[]},acct_us:[],hl_address:ADDR,journal:{HL:{revision:1,unchanged:false,defaultRisk:1,account:3000}},risk:{state:[],events:[],flows:[]}});
  if(url.endsWith('/rpc/risk_day_data'))return J({ok:true,version:5,kw_days:[],acct:[],hl:{address:ADDR,fills:[],funding:[],days:[]}});
  if(url.endsWith('/rpc/risk_push')){w.pushes.push(body.p_payload);return J({ok:true});}
  if(url.endsWith('/rpc/quick_review_push')){if(w.qr==='missing')return J({code:'PGRST202',message:'Could not find the function public.quick_review_push(p_payload, p_token) in the schema cache'},404);
   if(w.qrFail)return J({message:'x'},503);assert.equal(body.p_token,TOKEN);w.qrPush.push(body.p_payload);return J({ok:true,version:9,stored:body.p_payload.items.length});}
  if(url.includes('api.telegram.org')){const method=url.split('/').pop();w.tgCalls.push({method,body});
   if(method==='getUpdates'){const u=w.updates.splice(0);return J({ok:true,result:u});}
   if(method==='sendMessage'){if(!body.reply_markup){w.alerts.push(fromHtml(body.text));return J({ok:true,result:{message_id:1}});}w.tg.push(body.text);return J({ok:true,result:{message_id:100+w.tg.length}});} // w.tg = 즉시 복기(버튼 있는 메시지)만, w.alerts = 손실 한도 알림
   return J({ok:true,result:true});}
  if(url==='https://api.hyperliquid.xyz/info'){
   switch(body.type){case 'userAbstraction':return J('default');case 'spotClearinghouseState':return J({balances:[{token:0,coin:'USDC',total:'0',hold:'0'}]});
    case 'clearinghouseState':return J({assetPositions:[],marginSummary:{accountValue:'20000'},time:Date.now()});case 'perpDexs':return J([null]);
    case 'userFillsByTime':return J(w.fills.filter(f=>f.time>=body.startTime));case 'userFunding':return J([]);
    case 'userNonFundingLedgerUpdates':return J([]);case 'portfolio':return J([]);}
  }
  return J({message:'not found'},404);};
 return w;
}
const mk=async(w,x={},logs=[])=>{const dir=await mkdtemp(path.join(tmpdir(),'ta9-'));const a=new Alerter(env(dir,x),{fetcher:w.fetcher,now:()=>w.now,log:(l,m)=>logs.push(l+' '+m),sleep:async()=>{}});await a.init();return a;};
const cq=(data,{chat=CHAT,id='q1',msg=101}={})=>({update_id:0,callback_query:{id,data,from:{id:1},message:{message_id:msg,chat:{id:Number(chat)}}}});

test('check(): 설치 후 첫 확인 이후의 HL 청산만 질문 1회 · R = 기본 위험 1% × 잔고 · 판정·저장 흐름 그대로',async()=>{
 const w=world(),logs=[];const a=await mk(w,{},logs);
 w.fills.push(F(1,NOW0-7200000,'B',0.1,0),F(2,NOW0-3600000,'A',0.1,0.1,{closedPnl:'50'})); // 설치 전 청산 → 묻지 않음
 await a.check();assert.equal(w.tg.length,0,'설치 전 청산 묻지 않음');assert.equal(a.state.qr.since,NOW0);
 w.now+=60000;w.fills.push(F(3,w.now-50000,'A',1,0,{closedPnl:'0',fee:'1'}),F(4,w.now-10000,'B',1,-1,{closedPnl:'201',fee:'1'})); // 숏 진입 → 청산 +199
 const r=await a.check();
 assert.equal(w.tg.length,1);assert.equal(w.tg[0].split('\n')[0],'📝 BTC 숏 청산 · +$199.00 (+1.0R) · 복기');
 const send=w.tgCalls.find(c=>c.method==='sendMessage'&&c.body.reply_markup);assert.equal(send.body.chat_id,CHAT);assert.equal(send.body.parse_mode,undefined,'즉시 복기 메시지는 일반 텍스트');
 assert.deepEqual(send.body.reply_markup.inline_keyboard[0].map(b=>b.callback_data),['qr|4|c','qr|4|v','qr|4|l']);
 assert.equal(a.state.qr.items['4'].msgId,101);assert.equal(w.qrPush.length,1,'probe 1회(빈 items)');assert.deepEqual(w.qrPush[0],{items:[]});
 assert.ok(r.statuses.find(s=>s.market==='HL'),'HL 판정은 그대로 나옴');
 w.now+=60000;await a.check();assert.equal(w.tg.length,1,'같은 청산 다시 묻지 않음');
 const saved=JSON.parse(await readFile(path.join(a.cfg.stateDir,'state2.json'),'utf8'));assert.ok(saved.qr.items['4'],'state2.json에 저장');
});

test('버튼: 준수 → 저장·메시지 수정 / 위반 → 칩 토글 → 완료 / 나중에 → 버튼 유지 / 뒤로 / 이미 기록 / 다른 대화방 무시',async()=>{
 const w=world(),logs=[];const a=await mk(w,{},logs);await a.check();
 w.now+=60000;w.fills.push(F(5,w.now-50000,'B',1,0),F(6,w.now-20000,'A',1,1,{closedPnl:'-30',fee:'1'}),F(7,w.now-15000,'B',2,0,{coin:'ETH'}),F(8,w.now-10000,'A',2,2,{coin:'ETH',closedPnl:'12'}));
 await a.check();assert.equal(w.tg.length,2);
 // 다른 대화방
 w.updates.push({...cq('qr|6|c',{chat:'111'}),update_id:50});await a.qr.pollOnce(0);
 assert.equal(w.qrPush.length,1,'다른 대화방 응답은 저장 안 함');assert.equal(a.state.qr.offset,51);
 const ans=w.tgCalls.filter(c=>c.method==='answerCallbackQuery').at(-1);assert.match(ans.body.text,/사용할 수 없습니다/);
 const gu=w.tgCalls.find(c=>c.method==='getUpdates');assert.ok(gu.body.allowed_updates.includes('callback_query')&&gu.body.allowed_updates.includes('message'));assert.equal(gu.body.offset,0);
 // 준수
 w.updates.push({...cq('qr|6|c'),update_id:51});await a.qr.pollOnce(0);
 assert.deepEqual(w.qrPush.at(-1).items,[{ref:'hl:6',market:'hl',symbol:'BTC',direction:'long',close_key:'6',close_at:w.now-20000,pnl:-31,r:-0.15,decision:'compliant',violations:[]}]);
 let ed=w.tgCalls.filter(c=>c.method==='editMessageText').at(-1);assert.equal(ed.body.message_id,101);assert.match(ed.body.text,/^✅ BTC 롱 청산 · −\$31\.00 \(−0\.2R\)\n\n규칙 준수로 기록\n앱에 자동 반영/);assert.equal(ed.body.reply_markup.inline_keyboard.length,0);
 w.updates.push({...cq('qr|6|v'),update_id:52});await a.qr.pollOnce(0);assert.match(w.tgCalls.filter(c=>c.method==='answerCallbackQuery').at(-1).body.text,/이미 기록/);
 // 위반: 나중에 → 위반 → 칩 2개 → 하나 해제 → 뒤로 → 위반 → 완료
 for(const [i,d] of [['53','qr|8|l'],['54','qr|8|v'],['55','qr|8|t3'],['56','qr|8|t0'],['57','qr|8|t3'],['58','qr|8|b']])w.updates.push({...cq(d,{msg:102}),update_id:Number(i)});
 await a.qr.pollOnce(0);
 ed=w.tgCalls.filter(c=>c.method==='editMessageText').at(-1);assert.match(ed.body.text,/⏰ 나중에/,'뒤로 → 나중에 화면');assert.deepEqual(ed.body.reply_markup.inline_keyboard[0].map(b=>b.text),['규칙 준수','규칙 위반']);
 assert.deepEqual(a.state.qr.items['8'].sel,['추격']);
 w.updates.push({...cq('qr|8|v',{msg:102}),update_id:59},{...cq('qr|8|t1',{msg:102}),update_id:60},{...cq('qr|8|d',{msg:102}),update_id:61});await a.qr.pollOnce(0);
 assert.deepEqual(w.qrPush.at(-1).items[0].violations,['추격','계획 외 진입'],'앱 목록 순서로');assert.equal(w.qrPush.at(-1).items[0].decision,'violation');assert.equal(w.qrPush.at(-1).items[0].direction,'long');
 ed=w.tgCalls.filter(c=>c.method==='editMessageText').at(-1);assert.match(ed.body.text,/^🚫 ETH 롱 청산 · \+\$12\.00/);assert.match(ed.body.text,/규칙 위반으로 기록: 추격, 계획 외 진입/);
 w.updates.push({...cq('qr|999|c'),update_id:62});await a.qr.pollOnce(0);assert.match(w.tgCalls.filter(c=>c.method==='answerCallbackQuery').at(-1).body.text,/지난 질문/);
 assert.equal(a.state.qr.offset,63);
});

test('저장 실패 → 메시지에 재시도 표시 → 다음 확인 때 다시 저장하고 메시지 고침',async()=>{
 const w=world();const a=await mk(w);await a.check();
 w.now+=60000;w.fills.push(F(9,w.now-50000,'B',1,0),F(10,w.now-20000,'A',1,1,{closedPnl:'5'}));await a.check();
 w.qrFail=true;w.updates.push({...cq('qr|10|c'),update_id:1});await a.qr.pollOnce(0);
 assert.equal(a.state.qr.items['10'].saved,false);assert.match(w.tgCalls.filter(c=>c.method==='editMessageText').at(-1).body.text,/저장 재시도 중/);
 w.qrFail=false;w.now+=60000;await a.check();
 assert.equal(a.state.qr.items['10'].saved,true);assert.equal(w.qrPush.at(-1).items[0].ref,'hl:10');assert.match(w.tgCalls.filter(c=>c.method==='editMessageText').at(-1).body.text,/앱에 자동 반영/);
});

test('alert9.sql 없음 → 로그 1회, 질문 안 함, 손실 한도 판정·저장은 그대로 / QUICK_REVIEW=0 → 아무것도 안 함',async()=>{
 const w=world(),logs=[];w.qr='missing';const a=await mk(w,{},logs);await a.check();
 for(let i=0;i<3;i++){w.now+=60000;w.fills.push(F(20+i*2,w.now-50000,'B',1,0),F(21+i*2,w.now-20000,'A',1,1));await a.check();}
 assert.equal(w.tg.length,0);assert.equal(logs.filter(l=>/alert9\.sql이 아직 없습니다/.test(l)).length,1,'로그 1회');
 assert.ok(w.pushes.length>=1&&w.pushes.some(p=>p.states?.length),'risk_push(판정 저장) 계속');
 const w2=world();const b=await mk(w2,{QUICK_REVIEW:'0'});assert.equal(b.qr,null);await b.check();w2.now+=60000;w2.fills.push(F(40,w2.now-50000,'B',1,0),F(41,w2.now-20000,'A',1,1));await b.check();
 assert.equal(w2.tg.length,0);assert.equal(w2.qrPush.length,0);assert.equal(w2.tgCalls.filter(c=>c.method==='getUpdates').length,0);
});

test('롱폴링 실패(409) → 경고 1회 후 대기·재시도, 6시간 넘은 청산은 묻지 않음',async()=>{
 const w=world(),logs=[];const a=await mk(w,{},logs);await a.check();
 const real=w.fetcher;let n=0;w.fetcher=async(url,o)=>{if(url.endsWith('/getUpdates')){n++;return new Response(JSON.stringify({ok:false,description:'Conflict: terminated by other getUpdates request'}),{status:409});}return real(url,o);};
 a.tg.fetcher=w.fetcher;let stopAt=3;await a.qr.loop(()=>n>=stopAt);
 assert.equal(logs.filter(l=>/409/.test(l)).length,1);assert.equal(a.qr.pollFails,3);
 a.tg.fetcher=real;w.now+=7*3600000;w.fills.push(F(50,w.now-6.5*3600000,'B',1,0),F(51,w.now-6.2*3600000,'A',1,1));await a.check();assert.equal(w.tg.length,0);
});
