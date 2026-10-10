// node --experimental-strip-types --test tests/*.test.ts   (Node 24: plain `node --test`)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Collector,readConfig,phase,intervalFor,kstDate,materialHash,fullHash,makeLogger,SupabaseRpc,normalizeCash,validateCashSpec,backfillDates,parseBackfillArgs,runBackfill,BACKFILL_MAX_DAYS} from '../src/collector.ts';

const TOKEN='kwc_'+'A'.repeat(43);
const ENV={SUPABASE_URL:'https://ktndayhrlhrlxtkirrvx.supabase.co',SUPABASE_KEY:'sb_publishable_testtesttesttest1234',KW_COLLECTOR_TOKEN:TOKEN,KIWOOM_APP_KEY:'app-key-secret-1',KIWOOM_SECRET:'kiwoom-secret-2',KIWOOM_ACCOUNT:'5512345678'};
const r=(d:any,h={})=>new Response(JSON.stringify({return_code:0,...d}),{headers:h});
const json=(d:any,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}});
// Thu 2026-10-08 10:00 ET (EDT) = 23:00 KST, regular session.
const SESSION=Date.parse('2026-10-08T14:00:00Z');

function world(){
 const st={price:'205.00',qty:'3',pnl:'-9.4902',cash:'1500.25',cashStatus:200,cashCode:0 as any,rateOnce:new Set<string>(),apiError:new Map<string,number>(),orderDates:[] as string[],kiwoomStatus:200,kiwoomCalls:[] as string[],pushes:[] as any[],heartbeats:[] as any[],supabaseStatus:200,supabaseBody:null as any,headers:[] as any[]};
 const fetcher=(async(url:any,o:any)=>{const u=String(url);
  if(u.startsWith('https://api.kiwoom.com')){const api=o.headers['api-id']||'auth';st.kiwoomCalls.push(api);
   if(st.kiwoomStatus!==200)return new Response('x',{status:st.kiwoomStatus});
   if(api==='auth')return r({token:'oauth-token-xyz'});
   const b=JSON.parse(o.body);
   if(api==='ust21160'){if(st.cashStatus!==200)return new Response('x',{status:st.cashStatus});return new Response(JSON.stringify({return_code:st.cashCode,return_msg:'ok',won_entr:'000000930965946',d0_setl_dt:'20261008',d0_usd_fx_entr:'1700.250',d1_setl_dt:'20261009',d1_usd_fx_entr:st.cash,d2_setl_dt:'20261012',d2_usd_fx_entr:st.cash,d3_setl_dt:'',d3_usd_fx_entr:'',d4_setl_dt:'',d4_usd_fx_entr:''}));}
   if(api==='ust21150'){st.orderDates.push(b.ord_dt);if(st.rateOnce.has(b.ord_dt)){st.rateOnce.delete(b.ord_dt);return new Response(JSON.stringify({return_code:1700,return_msg:'허용된 API 요청 개수를 초과하였습니다.'}));}
    if(st.apiError.has(b.ord_dt))return new Response(JSON.stringify({return_code:st.apiError.get(b.ord_dt),return_msg:'조회 불가'}));
    if(b.ord_dt.endsWith('05'))return new Response(JSON.stringify({return_code:20,return_msg:'[2000](571758:해당계좌의체결내역이없습니다.)'}));}
   if(api==='ust21640'&&b.cntr_dt.endsWith('05'))return new Response(JSON.stringify({return_code:20,return_msg:'[2000](571758:조회내역이없습니다.)'}));
   if(api==='ust21150')return r({result_list:[{ord_no:'000000252',crnc_code:'USD',stk_cd:'NVDA',slby_tp_nm:'매도',ord_qty:'1',cntr_qty:'1',cntr_uv:'201.3147',ord_remnq:'0',ord_stat_nm:'체결',cntr_time:'22:31:05'}]});
   if(api==='ust21070')return r({crnc_code:'USD',tot_evlt_amt:'615.00',result_list:[{stk_cd:'AAPL',crnc_code:'USD',poss_qty:st.qty,frgn_stk_book_uv:'200.10',now_pric:st.price,evlt_amt:'615.00',pl_amt:'14.70'}]});
   if(api==='ust21640')return r({tot_pl_amt:st.pnl,result_list:[{stk_cd:'NVDA',crnc_code:'USD',cntr_sellq:'1',avg_buy_uv:'210.1282',cntr_sella:'201.3147',pl_amt:st.pnl,cmsn:'0.6725',altx:'0.0042'}],_d:b.cntr_dt});
  }
  if(u.startsWith(ENV.SUPABASE_URL+'/rest/v1/rpc/')){st.headers.push(o.headers);const body=JSON.parse(o.body);
   if(st.supabaseStatus!==200)return json(st.supabaseBody||{message:'err'},st.supabaseStatus);
   if(u.endsWith('kw_push')){st.pushes.push(body);return json(st.supabaseBody||{ok:true,stored:true,seq:st.pushes.length});}
   if(u.endsWith('kw_heartbeat')){st.heartbeats.push(body);return json({ok:true});}
  }
  throw Error('unexpected '+u);}) as typeof fetch;
 return {st,fetcher};
}
function make(now:{t:number},envExtra={}){const w=world(),lines:string[]=[];const c=new Collector({...ENV,...envExtra},{fetcher:w.fetcher,now:()=>now.t,log:makeLogger({...ENV},l=>lines.push(l)),sleep:async()=>{}});return {...w,c,lines};}

test('config: refuses service_role / secret keys and requires every field',()=>{
 assert.throws(()=>readConfig({...ENV,SUPABASE_KEY:'sb_secret_abcdefghijklmnop'}),/SECRET_KEY_REFUSED/);
 const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.sig';
 assert.throws(()=>readConfig({...ENV,SUPABASE_KEY:jwt('service_role')}),/SECRET_KEY_REFUSED/);
 assert.equal(readConfig({...ENV,SUPABASE_KEY:jwt('anon')}).supabaseKey,jwt('anon'));
 try{readConfig({...ENV,KW_COLLECTOR_TOKEN:'x',KIWOOM_SECRET:'여기에_붙여넣기',SUPABASE_URL:'http://evil.example'});assert.fail();}catch(e:any){assert.equal(e.message,'CONFIG_INCOMPLETE');assert.deepEqual(e.fields.map((f:string)=>f.split(' ')[0]),['SUPABASE_URL','KW_COLLECTOR_TOKEN','KIWOOM_SECRET']);}
});

test('schedule: US 04:00-20:00 ET weekdays every minute (EDT and EST), else 15 / 30 minutes',()=>{
 assert.equal(phase(Date.parse('2026-10-08T07:59:00Z')),'offhours'); // 03:59 EDT
 assert.equal(phase(Date.parse('2026-10-08T08:00:00Z')),'session');  // 04:00 EDT pre-market
 assert.equal(phase(Date.parse('2026-10-08T23:59:00Z')),'session');  // 19:59 EDT after-hours
 assert.equal(phase(Date.parse('2026-10-09T00:00:00Z')),'offhours'); // 20:00 EDT
 assert.equal(phase(Date.parse('2026-12-08T08:30:00Z')),'offhours'); // 03:30 EST
 assert.equal(phase(Date.parse('2026-12-08T09:00:00Z')),'session');  // 04:00 EST
 assert.equal(phase(Date.parse('2026-10-10T15:00:00Z')),'weekend');  // Saturday
 assert.equal(intervalFor('session'),60000);assert.equal(intervalFor('offhours'),900000);assert.equal(intervalFor('weekend'),1800000);
 assert.equal(intervalFor('session',{KW_SESSION_INTERVAL_SEC:'5'}),60000,'too-fast override ignored');
 assert.equal(kstDate(SESSION),'2026-10-08');assert.equal(kstDate(Date.parse('2026-10-08T16:00:00Z')),'2026-10-09'); // 01:00 KST next day
});

test('pushes the KiwoomJournal snapshot once, then only when something changes',async()=>{
 const now={t:SESSION},{c,st,lines}=make(now);
 await c.tick();
 assert.deepEqual(st.pushes.map(p=>p.p_snapshot.orderDate),['2026-10-07','2026-10-08'],'yesterday and today (Korean dates)');
 const p=st.pushes[0];assert.equal(p.p_token,TOKEN);assert.equal(p.p_snapshot.journalVersion,1);assert.equal(p.p_snapshot.source,'kiwoom');assert.match(p.p_snapshot.account,/^[0-9a-f]{16}$/);
 assert.ok(st.kiwoomCalls.every(a=>['auth','ust21150','ust21070','ust21640','ust21160'].includes(a)),'read-only allowlist only');
 assert.deepEqual(p.p_snapshot.summary.cash,{apiId:'ust21160',currency:'USD',usd:'1500.25',usdBasis:'d2',settleDate:'2026-10-12',usdD0:'1700.25',krw:'930965946',krwIncluded:false,asOf:SESSION},'USD cash after settlement attached to the snapshot');
 assert.equal(st.kiwoomCalls.filter(a=>a==='ust21160').length,1,'cash queried once per round');
 assert.equal(st.headers[0].apikey,ENV.SUPABASE_KEY);assert.equal(st.headers[0].Authorization,undefined,'publishable key not sent as a JWT');
 assert.equal(st.heartbeats.length,1);
 // a minute later: nothing changed -> today queried, no push
 now.t+=60000;await c.tick();assert.equal(st.pushes.length,2);
 assert.equal(st.kiwoomCalls.filter(a=>a==='ust21150').length,3,'only today during the session minute');
 // price moves only -> not pushed until 10 minutes since last push
 st.price='206.00';now.t+=60000;await c.tick();assert.equal(st.pushes.length,2,'price-only change waits');
 now.t+=9*60000;await c.tick();assert.equal(st.pushes.at(-1).p_snapshot.positions[0].currentPrice,'206','price refresh after 10 min');
 // realized PnL changes -> pushed on the next minute
 const n=st.pushes.length;st.pnl='-10.5';now.t+=60000;await c.tick();
 assert.ok(st.pushes.length>n&&st.pushes.at(-1).p_snapshot.realized.reportedTotal==='-10.5','material change pushed immediately');
 // nothing secret in any log line or any Supabase body except the collector token field
 const all=lines.join('\n')+JSON.stringify(st.pushes.map(p=>p.p_snapshot))+JSON.stringify(st.heartbeats.map(h=>h.p_info));
 for(const s of [ENV.KIWOOM_APP_KEY,ENV.KIWOOM_SECRET,ENV.KIWOOM_ACCOUNT,TOKEN,'oauth-token-xyz'])assert.ok(!all.includes(s),'leaked '+s);
 assert.ok(lines.some(l=>/전송 2026-10-08/.test(l)));
});

test('material/full hashes ignore asOf; quantities are material, prices are not',()=>{
 const s:any={account:'a',orderDate:'2026-10-08',asOf:1,orders:[],realized:{rows:[]},positions:[{symbol:'AAPL',quantity:'1',averagePrice:'1',currentPrice:'2'}]};
 const t={...s,asOf:2};assert.equal(materialHash(s),materialHash(t));assert.equal(fullHash(s),fullHash(t));
 const priced={...s,positions:[{...s.positions[0],currentPrice:'3'}]};assert.equal(materialHash(s),materialHash(priced));assert.notEqual(fullHash(s),fullHash(priced));
 assert.notEqual(materialHash(s),materialHash({...s,positions:[{...s.positions[0],quantity:'2'}]}));
});

test('off-hours polls both Korean dates every 15 minutes',async()=>{
 const now={t:Date.parse('2026-10-08T02:00:00Z')}; // Wed 22:00 EDT, 11:00 KST
 const {c,st}=make(now);assert.equal(c.delay(),900000);await c.tick();
 assert.deepEqual(st.pushes.map(p=>p.p_snapshot.orderDate),['2026-10-07','2026-10-08']);
});

test('Kiwoom rate limit and auth errors back off exponentially; recovery resets',async()=>{
 const now={t:SESSION},{c,st,lines}=make(now);
 st.kiwoomStatus=429;await c.tick();assert.equal(c.lastError,'KIWOOM_REVIEW_RATE_LIMIT');assert.equal(c.delay(),120000);
 const calls=st.kiwoomCalls.length;now.t+=60000;assert.deepEqual(await c.tick(),{skipped:true});assert.equal(st.kiwoomCalls.length,calls,'no calls while backing off');
 now.t+=61000;await c.tick();assert.equal(c.failures,2);assert.equal(c.delay(),240000);
 st.kiwoomStatus=401;now.t+=240000;await c.tick();assert.equal(c.lastError,'KIWOOM_REVIEW_AUTH_ERROR');assert.ok(c.delay()>=5*60000);
 st.kiwoomStatus=200;now.t+=60*60000;await c.tick();assert.equal(c.failures,0);assert.equal(c.lastError,null);assert.equal(c.delay(),60000);
 assert.ok(lines.some(l=>/복구됨/.test(l)));assert.equal(st.pushes.length,2);
});

test('Supabase: token rejection backs off, rejected payload is not remembered, 5xx is retried',async()=>{
 const now={t:SESSION},{c,st}=make(now);
 st.supabaseStatus=403;st.supabaseBody={message:'invalid collector token'};await c.tick();
 assert.equal(c.lastError,'SUPABASE_TOKEN_REJECTED');assert.ok(c.delay()>=10*60000);assert.equal(c.memo.size,0);
 st.supabaseStatus=200;st.supabaseBody={ok:false,error:'account_mismatch'};now.t+=11*60000;await c.tick();
 assert.equal(c.lastError,'SUPABASE_REJECTED_account_mismatch');assert.equal(c.memo.size,0,'retry later');
 st.supabaseBody=null;now.t+=20*60000;await c.tick();assert.equal(c.lastError,null);assert.equal(c.memo.size,2);
 // transient 503 twice then OK -> one push succeeds within the same round
 let fails=2;const base=(c.rpc as any).fetcher;(c.rpc as any).fetcher=(async(u:any,o:any)=>{if(String(u).endsWith('kw_push')&&fails-->0)return json({},503);return base(u,o);}) as typeof fetch;
 st.pnl='-1';now.t+=60000;await c.tick();assert.equal(c.lastError,null);assert.equal(st.pushes.at(-1).p_snapshot.realized.reportedTotal,'-1');
});

test('SupabaseRpc sends legacy anon JWT as Authorization too, maps 404 to SQL-not-installed',async()=>{
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.sig';let seen:any;
 const rpc=new SupabaseRpc({supabaseUrl:ENV.SUPABASE_URL,supabaseKey:jwt,token:TOKEN},(async(_u:any,o:any)=>{seen=o.headers;return json({message:'not found'},404);}) as typeof fetch,async()=>{});
 await assert.rejects(rpc.call('kw_push',{}),/SQL_NOT_INSTALLED/);assert.equal(seen.Authorization,'Bearer '+jwt);
});

test('bundled adapter is identical to the PC server adapter',async()=>{
 const a=await readFile(new URL('../src/adapters/kiwoom-journal.ts',import.meta.url),'utf8');
 let b:string|null=null;try{b=await readFile(new URL('../../sync-server/src/adapters/kiwoom-journal.ts',import.meta.url),'utf8');}catch{}
 if(b!==null)assert.equal(a,b);
 const spec=JSON.parse(await readFile(new URL('../specs/kiwoom-journal-spec.json',import.meta.url),'utf8'));
 assert.ok(Object.values<any>(spec.apis).every(x=>!('response_example' in x)&&!('request_example' in x)),'published spec has no example payloads');
});

test('cash: spec fields, furthest settlement column, KRW never added, bad values refused',async()=>{
 const spec=JSON.parse(await readFile(new URL('../specs/kiwoom-journal-spec.json',import.meta.url),'utf8'));
 validateCashSpec(spec);assert.throws(()=>validateCashSpec({apis:{}}),/CASH_SPEC_MISMATCH/);
 const c=normalizeCash({won_entr:'-00000001000',d0_setl_dt:'20260626',d0_usd_fx_entr:'18041599.000',d1_setl_dt:'20260629',d1_usd_fx_entr:'18041404.560',d2_setl_dt:'20260630',d2_usd_fx_entr:'18041404.560',d3_setl_dt:'20260701',d3_usd_fx_entr:'18041404.560',d4_setl_dt:'20260702',d4_usd_fx_entr:'18041404.560'},5);
 assert.deepEqual(c,{apiId:'ust21160',currency:'USD',usd:'18041404.56',usdBasis:'d4',settleDate:'2026-07-02',usdD0:'18041599',krw:'-1000',krwIncluded:false,asOf:5});
 assert.equal(normalizeCash({d0_setl_dt:'20261008',d0_usd_fx_entr:'0012.5'},1).usd,'12.5','only D0 present');
 assert.throws(()=>normalizeCash({d0_usd_fx_entr:'abc'},1),/SCHEMA/);assert.throws(()=>normalizeCash({},1),/SCHEMA/);
});

test('cash failure never blocks the journal push; last good value is reused, then dropped after 6 h',async()=>{
 const now={t:SESSION},{c,st,lines}=make(now);
 st.cashStatus=500;await c.tick();assert.equal(st.pushes.length,2);assert.equal(st.pushes[0].p_snapshot.summary.cash,undefined,'no cash yet');
 assert.ok(lines.some(l=>/예수금\(ust21160\) 조회 실패 KIWOOM_CASH_HTTP_500/.test(l)));assert.equal(c.lastError,null,'journal round still OK');
 st.cashStatus=200;now.t+=60000;await c.tick();assert.equal(st.pushes.at(-1).p_snapshot.summary.cash.usd,'1500.25','cash change is material -> pushed at once');
 st.cashCode=1700;now.t+=60000;await c.tick();assert.equal(c.cash.usd,'1500.25');assert.ok(lines.some(l=>/KIWOOM_CASH_API_ERROR_1700/.test(l)));
 const s:any={account:'a',orderDate:'d',orders:[],realized:{},positions:[],summary:{currency:'USD'}};
 assert.equal(c.withCash(s,await c.fetchCash(now.t+60000)).summary.cash.usd,'1500.25','reused while young');
 assert.equal(await c.fetchCash(now.t+7*3600000),null,'dropped after 6 hours');
 const off=make({t:SESSION},{KW_CASH_DISABLED:'1'});await off.c.tick();assert.ok(!off.st.kiwoomCalls.includes('ust21160'));
});

test('backfill: dates skip Korean Sundays only; arguments are checked against the 400-day Supabase window',()=>{
 assert.deepEqual(backfillDates('2026-10-02','2026-10-06'),['2026-10-02','2026-10-03','2026-10-05','2026-10-06'],'Sat kept, Sun 10-04 skipped');
 assert.equal(backfillDates('2026-10-02','2026-10-06',{includeSundays:true}).length,5);
 assert.throws(()=>backfillDates('2026-10-06','2026-10-02'),/INVERTED/);
 const t=SESSION; // KST 2026-10-08
 assert.deepEqual(parseBackfillArgs(['node','c.ts','--backfill','2026-01-01'],t),{start:'2026-01-01',end:'2026-10-07',includeSundays:false,pushEmpty:false,delayMs:1500});
 assert.equal(parseBackfillArgs(['node','c.ts','--backfill','2026-09-01','2026-09-30','--include-sundays','--delay-ms','3000'],t)!.delayMs,3000);
 assert.equal(parseBackfillArgs(['node','c.ts'],t),null);
 for(const bad of [['--backfill'],['--backfill','2026-13-01'],['--backfill','2026-10-01','2026-10-09'],['--backfill','2026-10-07','2026-10-01'],['--backfill','2025-01-01']])
  assert.throws(()=>parseBackfillArgs(['node','c.ts',...bad],t),(e:any)=>e.message==='BACKFILL_ARGS'&&!!e.detail,bad.join(' '));
 assert.equal(BACKFILL_MAX_DAYS,400);
});

test('backfill: one date at a time, rate limit waits and retries, empty days skipped, failures listed, pushes paced',async()=>{
 const now={t:SESSION},{c,st,lines}=make(now);const waits:number[]=[];
 st.rateOnce.add('20261002');st.apiError.set('20261006',1999);
 const r=await runBackfill(c,{start:'2026-10-01',end:'2026-10-07'},async ms=>{waits.push(ms);now.t+=ms;});
 // 10-04 is a Korean Sunday (skipped); 10-05 has no orders/realized (skipped); 10-06 Kiwoom error 1999 (listed)
 assert.deepEqual(st.pushes.map(p=>p.p_snapshot.orderDate),['2026-10-01','2026-10-02','2026-10-03','2026-10-07']);
 assert.deepEqual(r.failed,[{date:'2026-10-06',code:'KIWOOM_REVIEW_API_ERROR'}]);assert.equal(r.empty,1);assert.equal(r.pushed,4);assert.equal(r.stopped,null);
 assert.ok(waits.includes(60000),'Kiwoom 1700 -> 60 s wait');assert.equal(st.orderDates.filter(d=>d==='20261002').length,2,'retried once');
 assert.ok(st.pushes.every(p=>p.p_snapshot.summary.cash?.usd==='1500.25'),'current USD cash attached');
 assert.ok(st.pushes.every(p=>p.p_snapshot.positions.length===1),'current holdings kept (asOf = backfill time)');
 assert.ok(st.pushes.every((p,i)=>i===0||p.p_snapshot.asOf>st.pushes[i-1].p_snapshot.asOf),'asOf increases');
 assert.ok(lines.some(l=>/\[1\/6\] 2026-10-01 전송/.test(l))&&lines.some(l=>/주문·실현손익 없음 · 건너뜀/.test(l))&&lines.some(l=>/백필 완료 · 전송 4일 · 기록 없음 1일 · 실패 1일 \(2026-10-06 KIWOOM_REVIEW_API_ERROR\)/.test(l)));
 assert.equal(st.heartbeats.length,0,'backfill does not overwrite the service heartbeat');
 const all=lines.join('\n');for(const s of [ENV.KIWOOM_APP_KEY,ENV.KIWOOM_SECRET,ENV.KIWOOM_ACCOUNT,TOKEN,'oauth-token-xyz'])assert.ok(!all.includes(s),'leaked '+s);
});

test('backfill: Supabase rate_limited waits 65 s and retries; token rejection stops the run',async()=>{
 const now={t:SESSION},{c,st}=make(now);const waits:number[]=[];let limited=1;
 const base=(c.rpc as any).fetcher;(c.rpc as any).fetcher=(async(u:any,o:any)=>{if(String(u).endsWith('kw_push')&&limited-->0)return json({ok:false,error:'rate_limited'});return base(u,o);}) as typeof fetch;
 let r=await runBackfill(c,{start:'2026-10-06',end:'2026-10-07',pushEmpty:true},async ms=>{waits.push(ms);now.t+=ms;});
 assert.ok(waits.includes(65000));assert.equal(r.pushed,2);
 st.supabaseStatus=403;st.supabaseBody={message:'invalid collector token'};
 r=await runBackfill(c,{start:'2026-10-01',end:'2026-10-03'},async ms=>{now.t+=ms;});
 assert.equal(r.stopped,'SUPABASE_TOKEN_REJECTED');assert.equal(r.pushed,0);assert.equal(st.orderDates.filter(d=>d==='20261002').length,0,'stopped after the first date');
});
