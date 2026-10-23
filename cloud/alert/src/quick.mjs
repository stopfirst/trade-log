// trade-alert 2.6.0 (alert9) — 텔레그램 즉시 복기. 손실 한도 판정과 무관(판정 코드·상태를 읽지도 바꾸지도 않음).
//  HL 포지션이 0이 되거나 방향이 바뀌는 체결(= 청산 체결)을 보면 텔레그램에
//   '📝 BTC 롱 청산 · +$120.00 (+0.6R) · 복기' + [규칙 준수] [규칙 위반] [나중에] 버튼을 보냄.
//  [규칙 위반] → 같은 메시지가 위반 항목 칩(= 앱 OPTIONS.violations와 같은 라벨) + [← 뒤로] [완료]로 바뀜.
//  답(준수/위반+항목)은 Supabase quick_review_push(토큰)로 저장(alert9.sql) → 앱 v37이 그 거래에 반영.
//  거래 키: ref = 'hl:<청산 체결 tid>' — 앱 거래의 청산 체결(fills[].fillId)에 같은 tid가 있음(core.cjs project()가 청산 체결을 기존 거래 fills에 기록).
//  버튼 응답 = getUpdates 롱폴링(서비스 안 별도 루프), TELEGRAM_CHAT_ID 대화방에서 온 것만 받음.
//  alert9.sql이 없으면 로그 1회 후 질문하지 않음(손실 한도 알림은 그대로). .env QUICK_REVIEW=0이면 전부 끔.
export const VIOLATIONS=['추격','계획 외 진입','과도한 위험 배정','손절 지연','청산 규칙 미준수']; // = 앱 index.html OPTIONS.violations (v37 스모크가 대조)
export const ALLOWED_UPDATES=['message','channel_post','my_chat_member','callback_query']; // message 계열도 유지 → 서비스를 멈추면 --find-chat 그대로 동작
const MIN=60000,HOUR=3600000,DAY=86400000;
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};
const isPerp=c=>typeof c==='string'&&!c.startsWith('@')&&!c.includes('/');
const EPS=1e-9;

/** 원시 HL 체결(userFillsByTime) → 청산 이벤트. 같은 종목 체결을 (time, tid) 순으로 보고, startPosition ≠ 0이고
 *  체결 뒤 포지션이 0이거나 부호가 바뀌면 청산. pnl = 그 포지션 구간(마지막 0 이후) 체결의 Σ(closedPnl − fee) + 구간 펀딩(있으면).
 *  구간 시작이 조회 범위 밖이면 open=null·partial=true(보이는 체결만 합산). */
export function detectCloses(rawFills,rawFunding=[]){
 const by=new Map();
 for(const f of rawFills||[]){if(!f||!isPerp(f.coin))continue;const t=num(f.time),sz=num(f.sz),st=num(f.startPosition);if(!t||!(sz>0)||st===null||f.tid===undefined||f.tid===null)continue;
  if(!by.has(f.coin))by.set(f.coin,[]);by.get(f.coin).push({f,t,sz,st,signed:(f.side==='B'?1:-1)*sz,tid:String(f.tid)});}
 const out=[];
 for(const [coin,list] of by){
  list.sort((a,b)=>a.t-b.t||(a.tid.length-b.tid.length)||(a.tid<b.tid?-1:a.tid>b.tid?1:0));
  // 같은 시각 체결은 startPosition 사슬 순서로(앱 core.cjs orderExecutionEvents와 같은 생각): 직전 포지션 = st인 것 먼저
  const ordered=[];let pos=null;const near=(a,b)=>Math.abs(a-b)<=EPS*Math.max(1,Math.abs(a),Math.abs(b));
  for(let i=0;i<list.length;){let j=i;while(j<list.length&&list[j].t===list[i].t)j++;const rest=list.slice(i,j);
   while(rest.length){let k=pos===null?-1:rest.findIndex(x=>near(x.st,pos));if(k<0)k=rest.findIndex(x=>!rest.some(o=>o!==x&&near(o.st+o.signed,x.st)));if(k<0)k=0;
    const x=rest.splice(k,1)[0];ordered.push(x);pos=x.st+x.signed;}
   i=j;}
  let seg=[],segStart=null;
  for(const x of ordered){
   const end=x.st+x.signed,scale=Math.max(1,Math.abs(x.st),x.sz),zeroStart=Math.abs(x.st)<=EPS*scale,zeroEnd=Math.abs(end)<=EPS*scale;
   if(zeroStart){seg=[];segStart=x.t;}
   seg.push(x);
   const flip=!zeroStart&&!zeroEnd&&Math.sign(end)!==Math.sign(x.st);
   if(!zeroStart&&(zeroEnd||flip)){
    const direction=x.st>0?'long':'short';
    let pnl=0,fees=0;for(const y of seg){const cp=num(y.f.closedPnl)||0,fee=num(y.f.fee)||0;
     if(y.openPart){const part=1-Math.abs(y.st)/y.sz;pnl-=fee*part;fees+=fee*part;} // 방향 전환 체결의 진입 몫(수수료만)
     else if(y===x&&flip){const part=Math.abs(x.st)/x.sz;pnl+=cp-fee*part;fees+=fee*part;}else{pnl+=cp-fee;fees+=fee;}}
    const from=segStart??seg[0].t;let funding=0;for(const g of rawFunding||[]){const c=g?.delta?.coin,t=num(g?.time),u=num(g?.delta?.usdc);if(c===coin&&t!==null&&u!==null&&t>from&&t<=x.t)funding+=u;}
    out.push({tid:x.tid,coin,direction,time:x.t,openTime:segStart,partial:segStart===null,fills:seg.length,pnl:Math.round((pnl+funding)*1e6)/1e6,fees:Math.round(fees*1e6)/1e6,funding:Math.round(funding*1e6)/1e6,closePx:num(x.f.px)});
    if(flip){seg=[{...x,openPart:true}];segStart=x.t;}else{seg=[];segStart=null;}
   }
  }
 }
 return out.sort((a,b)=>a.time-b.time);
}
const usd=x=>(x>0?'+':x<0?'−':'')+'$'+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const kst=ms=>{const d=new Date(ms+9*HOUR).toISOString();return d.slice(5,7)+'/'+d.slice(8,10)+' '+d.slice(11,16);};
export const DIR_KO={long:'롱',short:'숏'};
export function rText(r){return Number.isFinite(r)?(r>0?'+':r<0?'−':'')+Math.abs(r).toFixed(1)+'R':null;}
export function headLine(it,emoji='📝'){const r=rText(it.r);return `${emoji} ${it.coin} ${DIR_KO[it.direction]} 청산 · ${usd(it.pnl)}${r?' ('+r+')':''}${emoji==='📝'?' · 복기':''}`;}
function detailLines(it){const L=[`청산: ${kst(it.time)} KST${it.openTime?' · 진입 '+kst(it.openTime)+' KST':''}`];if(it.partial)L.push('손익: 조회 범위 안 체결만 합산(앱 값과 다를 수 있음)');return L;}
function rFoot(it){return it.rUnit?`※ R = 기본 위험 ${it.riskPct}% × 잔고 $${Math.round(it.equity).toLocaleString('en-US')} 기준(1R $${it.rUnit.toFixed(2)}) · 앱의 초기 1R과 다를 수 있음`:null;}
/** 메시지 화면(text + inline keyboard). screen: ask | later | pick | done */
export function view(it){
 const id=it.tid,kb=[];let rows;
 if(it.screen==='pick'){
  rows=[headLine(it),'','위반한 항목을 고른 뒤 [완료]를 누르세요.',it.sel.length?'선택: '+it.sel.join(', '):'선택: 없음'];
  VIOLATIONS.forEach((v,i)=>{const on=it.sel.includes(v);const b={text:(on?'☑ ':'☐ ')+v,callback_data:`qr|${id}|t${i}`};if(i%2===0)kb.push([b]);else kb[kb.length-1].push(b);});
  kb.push([{text:'← 뒤로',callback_data:`qr|${id}|b`},{text:'완료',callback_data:`qr|${id}|d`}]);
 }else if(it.screen==='done'){
  const v=it.decision==='violation';
  rows=[headLine(it,v?'🚫':'✅'),'',v?'규칙 위반으로 기록'+(it.sel.length?': '+it.sel.join(', '):' (항목 없음)'):'규칙 준수로 기록',
   it.saved?'앱에 자동 반영됩니다 (앱에서 이미 복기한 거래는 앱 기록 유지).':'저장 재시도 중 — 서버가 다음 확인 때 다시 저장합니다.'];
 }else{
  rows=[headLine(it),'',...detailLines(it),it.screen==='later'?'⏰ 나중에 — 앱 복기 대기열에 남아 있습니다. 여기서 눌러도 됩니다.':'결과와 별개로, 계획을 지켰나요?'];
  kb.push([{text:'규칙 준수',callback_data:`qr|${id}|c`},{text:'규칙 위반',callback_data:`qr|${id}|v`}]);
  if(it.screen!=='later')kb[0].push({text:'나중에',callback_data:`qr|${id}|l`});
 }
 const foot=rFoot(it);if(foot&&it.screen!=='pick')rows.push('',foot);
 return {text:rows.join('\n'),reply_markup:{inline_keyboard:kb}};
}
export function payloadItem(it){return {ref:'hl:'+it.tid,market:'hl',symbol:it.coin,direction:it.direction,close_key:it.tid,close_at:it.time,pnl:Number.isFinite(it.pnl)?Math.round(it.pnl*100)/100:null,r:Number.isFinite(it.r)?Math.round(it.r*100)/100:null,decision:it.decision,violations:it.decision==='violation'?[...it.sel]:[]};}

export function qrConfig(env){const v=String(env.QUICK_REVIEW??'').trim().toLowerCase();return {enabled:!v||['1','true','yes','on','켬'].includes(v),maxAgeMs:6*HOUR};}

export class QuickReview{
 /** deps: {tg (Telegram), rpc (SupabaseRpc), token, chat, log, now, state:()=>S, save:()=>Promise, sleep} */
 constructor(d){Object.assign(this,{maxAgeMs:6*HOUR,sleep:ms=>new Promise(r=>setTimeout(r,ms))},d);this.sql='unknown';this.sqlAt=0;this.pollFails=0;this.warned={};}
 get S(){const S=this.state();if(!S.qr||typeof S.qr!=='object')S.qr={since:this.now(),offset:0,items:{}};S.qr.items=S.qr.items||{};return S.qr;}
 warnOnce(k,msg){if(this.warned[k])return;this.warned[k]=1;this.log('WARN',msg);}
 async probe(){
  const t=this.now();if(this.sql==='ok'||(this.sql==='missing'&&t-this.sqlAt<HOUR))return this.sql==='ok';
  try{await this.rpc.call('quick_review_push',{p_token:this.token,p_payload:{items:[]}});if(this.sql!=='ok')this.log('INFO','alert9.sql 확인 → 청산 때 텔레그램으로 복기를 묻습니다.');this.sql='ok';}
  catch(e){const c=String(e.message||e);if(/ALERT9_SQL_NOT_INSTALLED/.test(c)){this.sql='missing';this.warnOnce('sql','alert9.sql이 아직 없습니다 → 텔레그램 즉시 복기는 쉬고 손실 한도 알림만 보냅니다. Supabase SQL Editor에서 alert9.sql을 실행하세요.');}
   else this.log('WARN','즉시 복기 저장소 확인 실패(다음 청산 때 다시): '+c.slice(0,80));}
  this.sqlAt=t;return this.sql==='ok';
 }
 /** check() 끝에서 호출. h = {rawFills, rawFunding, equity, defaultRisk}. 판정에는 관여하지 않음. */
 async afterCheck(h,t=this.now()){
  const Q=this.S;
  for(const [k,it] of Object.entries(Q.items))if(t-(it.time||0)>14*DAY)delete Q.items[k];
  await this.flush();
  if(!h)return 0;
  const fresh=detectCloses(h.rawFills,h.rawFunding).filter(c=>c.time>=Q.since&&t-c.time<=this.maxAgeMs&&!Q.items[c.tid]);
  if(!fresh.length)return 0;
  if(!(await this.probe()))return 0;
  let n=0;const eq=Number(h.equity),rp=Number(h.defaultRisk);
  for(const c of fresh){
   const rUnit=eq>0&&rp>0?eq*rp/100:null;
   const it={...c,r:rUnit?c.pnl/rUnit:null,rUnit,riskPct:rp>0?rp:null,equity:eq>0?eq:null,screen:'ask',sel:[],decision:null,saved:false,askedAt:t};
   try{const m=await this.tg.api('sendMessage',{chat_id:this.chat,...view(it),disable_web_page_preview:true});it.msgId=m?.message_id??null;Q.items[c.tid]=it;n++;
    this.log('INFO',`즉시 복기 질문: ${c.coin} ${DIR_KO[c.direction]} 청산 tid ${c.tid}`);}
   catch(e){this.log('ERROR','즉시 복기 질문 전송 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));break;}
  }
  if(n)await this.save();
  return n;
 }
 /** 저장 못 한 답 다시 */
 async flush(){
  const pend=Object.values(this.S.items).filter(it=>it.decision&&!it.saved);if(!pend.length)return;
  try{await this.rpc.call('quick_review_push',{p_token:this.token,p_payload:{items:pend.map(payloadItem)}});for(const it of pend){it.saved=true;await this.edit(it);}await this.save();}
  catch(e){this.log('WARN','즉시 복기 답 저장 재시도 실패: '+String(e.message||e).slice(0,80));}
 }
 async edit(it){if(it.msgId==null)return;try{await this.tg.api('editMessageText',{chat_id:this.chat,message_id:it.msgId,...view(it),disable_web_page_preview:true});}
  catch(e){if(!/not modified/i.test(String(e.message||e)))this.log('WARN','즉시 복기 메시지 수정 실패: '+String(e.message||e).slice(0,80));}}
 async answer(cq,text){try{await this.tg.api('answerCallbackQuery',{callback_query_id:cq.id,...(text?{text}:{})});}catch{}}
 /** callback_query 하나 처리 */
 async handle(cq){
  const chat=String(cq?.message?.chat?.id??'');
  if(chat!==String(this.chat)){this.warnOnce('chat:'+chat,'다른 대화방의 버튼 응답은 무시합니다(TELEGRAM_CHAT_ID만 받음).');await this.answer(cq,'이 대화방에서는 사용할 수 없습니다');return 'ignored';}
  const m=/^qr\|(\d{1,24})\|(c|v|l|b|d|t[0-9])$/.exec(String(cq.data||''));const it=m&&this.S.items[m[1]];
  if(!it){await this.answer(cq,'지난 질문입니다 — 앱에서 복기하세요');return 'unknown';}
  if(it.screen==='done'){await this.answer(cq,'이미 기록했습니다');return 'done';}
  if(cq.message?.message_id!=null)it.msgId=cq.message.message_id;
  const a=m[2];let toast=null;
  if(a==='c'||a==='d'){
   it.decision=a==='c'?'compliant':'violation';if(a==='c')it.sel=[];it.screen='done';
   try{await this.rpc.call('quick_review_push',{p_token:this.token,p_payload:{items:[payloadItem(it)]}});it.saved=true;toast='기록했습니다';}
   catch(e){it.saved=false;toast='저장 재시도 예정';this.log('WARN','즉시 복기 답 저장 실패(다음 확인 때 다시): '+String(e.message||e).slice(0,80));}
  }else if(a==='v'){it.screen='pick';}
  else if(a==='b'){it.screen=it.laterAt?'later':'ask';}
  else if(a==='l'){it.screen='later';it.laterAt=this.now();toast='나중에 — 앱 대기열에 남김';}
  else{const v=VIOLATIONS[Number(a.slice(1))];if(v){it.sel=it.sel.includes(v)?it.sel.filter(x=>x!==v):VIOLATIONS.filter(x=>x===v||it.sel.includes(x));}}
  await this.answer(cq,toast);await this.edit(it);await this.save();
  return a;
 }
 /** getUpdates 한 번(롱폴링). 호출 측이 반복. */
 async pollOnce(timeoutSec=25){
  const Q=this.S;
  const ups=await this.tg.api('getUpdates',{offset:Q.offset||0,timeout:timeoutSec,allowed_updates:ALLOWED_UPDATES},(timeoutSec+15)*1000);
  let n=0;for(const u of Array.isArray(ups)?ups:[]){if(Number.isSafeInteger(u?.update_id))Q.offset=Math.max(Q.offset||0,u.update_id+1);if(u?.callback_query){try{await this.handle(u.callback_query);}catch(e){this.log('WARN','버튼 응답 처리 실패: '+String(e.message||e).slice(0,80));}n++;}}
  if(Array.isArray(ups)&&ups.length)await this.save();
  return n;
 }
 async loop(stop=()=>false){
  while(!stop()){
   try{await this.pollOnce();if(this.pollFails)this.log('INFO','텔레그램 버튼 응답 받기 복구');this.pollFails=0;}
   catch(e){this.pollFails++;const c=String(e.message||e);
    if(c==='TELEGRAM_WEBHOOK_ACTIVE')this.warnOnce('409','텔레그램 버튼 응답을 받지 못함(409: 다른 getUpdates/웹훅 사용 중). --find-chat을 실행 중이면 끝난 뒤 자동 복구됩니다.');
    else if(this.pollFails<=3||this.pollFails%20===0)this.log('WARN',`텔레그램 버튼 응답 받기 실패(${this.pollFails}): `+c.slice(0,80));
    await this.sleep(Math.min(5*MIN,5000*2**Math.min(this.pollFails-1,6)));}
  }
 }
}
