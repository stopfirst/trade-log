// node --experimental-strip-types --test tests/*.test.ts   (Node 24: plain `node --test`)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Collector,readConfig,phase,intervalFor,kstDate,materialHash,fullHash,makeLogger,SupabaseRpc} from '../src/collector.ts';

const TOKEN='kwc_'+'A'.repeat(43);
const ENV={SUPABASE_URL:'https://ktndayhrlhrlxtkirrvx.supabase.co',SUPABASE_KEY:'sb_publishable_testtesttesttest1234',KW_COLLECTOR_TOKEN:TOKEN,KIWOOM_APP_KEY:'app-key-secret-1',KIWOOM_SECRET:'kiwoom-secret-2',KIWOOM_ACCOUNT:'5512345678'};
const r=(d:any,h={})=>new Response(JSON.stringify({return_code:0,...d}),{headers:h});
const json=(d:any,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}});
// Thu 2026-10-08 10:00 ET (EDT) = 23:00 KST, regular session.
const SESSION=Date.parse('2026-10-08T14:00:00Z');

function world(){
 const st={price:'205.00',qty:'3',pnl:'-9.4902',kiwoomStatus:200,kiwoomCalls:[] as string[],pushes:[] as any[],heartbeats:[] as any[],supabaseStatus:200,supabaseBody:null as any,headers:[] as any[]};
 const fetcher=(async(url:any,o:any)=>{const u=String(url);
  if(u.startsWith('https://api.kiwoom.com')){const api=o.headers['api-id']||'auth';st.kiwoomCalls.push(api);
   if(st.kiwoomStatus!==200)return new Response('x',{status:st.kiwoomStatus});
   if(api==='auth')return r({token:'oauth-token-xyz'});
   const b=JSON.parse(o.body);
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
 assert.ok(st.kiwoomCalls.every(a=>['auth','ust21150','ust21070','ust21640'].includes(a)),'read-only allowlist only');
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
