/* alert18 — 서버 단타 판정(scalp.mjs)을 '실제 앱 코드'(cloud/index.html v121)와 같은 데이터로 대조.
   node tests/scalp-app-parity.mjs <저장소 루트>    (CHROME_PATH = chromium-headless-shell, 저장소 루트 node_modules/playwright-core, 이 폴더 node_modules/@electric-sql/pglite)
   1) 앱(qa/lib/pw.cjs 고정 시계 2026-10-31 12:00 KST)에 거래를 넣고 v121Info·v121Skip 결과와 저장 payload(state.settings·trades)를 받음
   2) 그 payload를 PGlite의 alert18.sql review_gaps로 통과시켜 서버 sc.model 판정
   3) 거래마다 단타 여부·빠짐 여부·예외 사유(글자 그대로)·보유 분·R 비교. HL(29/31분, −1.5R, 복수매매, 3연패, 저장 위반, 청산 위반, 손익비 미달, 위험 초과, 펀딩·수수료 −1.1R, v109 숨김, 1R 없음, 진행 중)
      · v122 한 거래 왕복 2번(가장 긴 왕복 20분 = 단타, 40분 = 스윙)
      + 미국(동부 벽시계 29/31분, 같은 날 손절 뒤 갈아타기 '강해 보여서', 복수매매). 서버 중단 중 진입(v21)은 앱이 Supabase를 읽어야 해서 여기선 대조 안 함(alert18-sql 테스트가 SQL 쪽 검사). */
import {createRequire} from 'node:module';import path from 'node:path';import fs from 'node:fs';import http from 'node:http';import {createHash,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';import * as sc from '../src/scalp.mjs';
const ROOT=path.resolve(process.argv[2]||'');if(!fs.existsSync(path.join(ROOT,'cloud/index.html'))){console.error('usage: node tests/scalp-app-parity.mjs <repo root>');process.exit(2);}
const req=createRequire(path.join(ROOT,'package.json'));const {chromium}=req('./qa/lib/pw.cjs');
const html=fs.readFileSync(path.join(ROOT,'cloud/index.html'));const C=f=>fs.readFileSync(path.join(ROOT,'cloud',f),'utf8');
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u,o={})=>{u=String(u&&u.url||u);if(u.startsWith('https://api.hyperliquid.xyz')){let b={};try{b=JSON.parse(o.body||'{}');}catch{}let out;
   switch(b.type){case 'clearinghouseState':out={assetPositions:[],marginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMarginSummary:{accountValue:'1000',totalNtlPos:'0',totalRawUsd:'1000',totalMarginUsed:'0'},crossMaintenanceMarginUsed:'0',withdrawable:'1000',time:Date.now()};break;
    case 'userAbstraction':out='default';break;case 'spotClearinghouseState':out={balances:[{coin:'USDC',token:0,total:'100',hold:'0',entryNtl:'0'}]};break;case 'perpDexs':out=[null];break;
    case 'meta':out={universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]};break;case 'metaAndAssetCtxs':out=[{universe:[{name:'ETH',szDecimals:4,maxLeverage:25}]},[{markPx:'100'}]];break;
    case 'spotMetaAndAssetCtxs':out=[{universe:[],tokens:[{name:'USDC',index:0,szDecimals:8}]},[]];break;default:out=[];}return J(out);}
  return J({message:'not found'},404);};
 class FakeWS{constructor(){this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},30);}send(){}close(){this.readyState=3;}}FakeWS.OPEN=1;window.WebSocket=FakeWS;};
const seedHL=()=>{const ev=(id,d,s,px,x={})=>{const ts=Date.parse(d+'T'+s+':00Z');return {id,date:d,time:s+':00',timestamp:ts,shares:2,price:px,fee:0,seq:ts/1000,sourceKey:'hyperliquid:par:'+id,...x};};
 const mk=(id,name,d,a,b,p0,p1,x={})=>normaliseTrade({schema:5,currency:CURRENCY,market:'HL',id,at:Date.parse(d+'T'+a+':00Z'),name,direction:'long',date:d,stop:null,stop0:null,initialRisk:10,riskR:1,setup:'미분류',leverage:5,marginMode:'cross',process:'unreviewed',review:'',violations:[],
  entries:[ev(id+'e',d,a,p0)],fills:[ev(id+'f',d,b,p1)],funding:[],images:[],sync:{positionStatus:'CLOSED',executionKeys:[],feeComplete:true,exchangePnlComplete:true},...x});
 const D='2026-10-30',E='2026-10-31';state.settings.v92From='2026-10-25';
 state.trades.push(mk('L31','BTC',E,'00:00','00:31',100,99.5),mk('S29','ETH',E,'01:00','01:29',100,102.5),mk('SBIG','SOL',E,'01:40','01:50',100,92.5),mk('L1','DOGE',E,'02:10','02:30',100,99),mk('REV','AVAX',E,'02:35','02:45',100,101.5),
  mk('VIOL','ADA',D,'01:00','01:10',100,100.5,{violations:['추격'],process:'violation'}),
  mk('CV','XLM',D,'01:20','01:25',100,100.5,{fills:[ev('CVf',D,'01:25',100.5,{compliance:'violation'})]}),
  mk('RRB','XRP',D,'02:00','02:10',100,100.5,{stop0:99,stop:99,riskPlan:{target:101,stop:99}}),
  mk('RRO','TRX',D,'02:20','02:30',100,100.5,{stop0:99,stop:99,riskPlan:{target:102,stop:99}}),
  mk('RISK','LINK',D,'03:00','03:10',100,100.5,{acctAt:300}),
  mk('FUND','BNB',D,'04:00','04:20',100,99,{entries:[ev('Fe',D,'04:00',100,{fee:0.5})],fills:[ev('Ff',D,'04:20',99,{fee:0.5})],funding:[{id:'fu1',date:D,time:'04:10:00',amount:-8,sourceKey:'hyperliquid:par:fu1'}]}),
  mk('LOSS2','DOT',D,'05:00','05:05',100,99),mk('DIS','NEAR',D,'05:10','05:15',100,101,{v109Dismiss:['v99revenge']}),mk('REV2','APT',D,'05:20','05:25',100,101),
  mk('NO1R','ETC',D,'06:00','06:10',100,50,{initialRisk:null,riskR:null}),
  mk('OPEN','SUI',D,'07:00','07:05',100,101,{fills:[{...ev('Of',D,'07:05',101),shares:1}],sync:{positionStatus:'OPEN',executionKeys:[]}}),
  mk('SW45','ARB',D,'08:00','08:45',100,99),
  mk('M2','OP',D,'09:00','09:20',100,100.5,{entries:[ev('M2a',D,'09:00',100),ev('M2b',D,'10:30',100)],fills:[ev('M2c',D,'09:20',100.5),ev('M2d',D,'10:50',100.5)]}),
  mk('M40','INJ',D,'11:00','11:20',100,100.5,{entries:[ev('M4a',D,'11:00',100),ev('M4b',D,'12:30',100)],fills:[ev('M4c',D,'11:20',100.5),ev('M4d',D,'13:10',100.5)]}));
 V121.memo=null;renderAll();};
const seedUS=()=>{const ev=(id,d,s,px,x={})=>({id,date:d,time:s+':00',shares:10,price:px,fee:0,seq:Number(s.replace(':','')),...x});
 const mk=(id,name,d,a,b,p0,p1,x={})=>normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id,at:Date.parse(d+'T12:00:00Z'),name,direction:'long',date:d,stop:null,stop0:null,initialRisk:20,riskR:1,setup:'미분류',process:'unreviewed',review:'',violations:[],
  entries:[ev(id+'e',d,a,p0)],fills:[ev(id+'f',d,b,p1)],images:[],...x});
 const D='2026-11-02';state.settings.v92From='2026-10-25';
 state.trades.push(mk('U29','META',D,'09:31','10:00',500,501),mk('U31','AAPL',D,'10:05','10:36',200,199),mk('ULOSS','TSLA',D,'10:40','10:55',300,297),
  mk('USW','NVDA',D,'11:30','11:50',100,101,{v99Why:'strong'}),mk('UREV','AMD',D,'11:00','11:10',100,99.5),mk('UBIG','MSFT',D,'13:00','13:15',400,397));
 V121.memo=null;renderAll();};
const appSide=()=>{const o={};for(const t of state.trades){const i=v121Info(t);o[t.id]={scalp:!!(i&&i.scalp),skip:v121Skip(t),exc:i&&i.scalp?i.exc:[],hold:i?Math.round(i.hold/60000):null,R:i?i.R:null};}
 return {HL,res:o,min:v121Min(),payload:JSON.parse(JSON.stringify({settings:state.settings,trades:state.trades}))};};
const browser=await chromium.launch({args:['--no-sandbox']});const base='http://127.0.0.1:'+srv.address().port+'/';
async function runApp(query,seed){const ctx=await browser.newContext({viewport:{width:1280,height:900},bypassCSP:true,locale:'ko-KR',timezoneId:'Asia/Seoul'});await ctx.addInitScript(init);const A=await ctx.newPage();const errs=[];A.on('pageerror',e=>errs.push(e.message));
 await A.goto(base+query);await A.waitForFunction(()=>window.journalReady===true,null,{timeout:30000});await A.waitForTimeout(600);await A.evaluate(seed);await A.waitForTimeout(200);const r=await A.evaluate(appSide);await ctx.close();r.errs=errs;return r;}
const hl=await runApp('?journal=hyperliquid',seedHL),us=await runApp('?journal=us',seedUS);srv.close(); // browser.close()는 pw.cjs가 프로세스를 끝내므로 맨 끝에서
// 서버: 앱 payload → PGlite alert18.sql review_gaps → sc.model
const U1='11111111-1111-1111-1111-111111111111';const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; insert into auth.users values('${U1}');`);
for(const f of ['cloud.sql','kiwoom-collector.sql','alert2.sql','alert11.sql','alert18.sql'])await db.exec(C(f));
const tok='kwc_'+randomBytes(32).toString('base64url');await db.transaction(async tx=>{await tx.exec(`set local role authenticated; select set_config('request.jwt.sub','${U1}',true);`);await tx.query('select public.kw_register_token($1)',[createHash('sha256').update(tok).digest('hex')]);});
await db.query(`insert into public.journal_cloud(user_id,scope,payload,revision) values($1,'HL',$2::jsonb,1),($1,'US',$3::jsonb,1)`,[U1,JSON.stringify(hl.payload),JSON.stringify(us.payload)]);
const rg=(await db.query('select public.review_gaps($1,$2::date) r',[tok,'2026-11-02'])).rows[0].r;
let fail=0,n=0;const cfg=sc.scalpConfig({});if(hl.HL!==true||us.HL!==false){console.log('FAIL 일지 종류',hl.HL,us.HL);fail++;}
for(const [scope,app,isHL] of [['HL',hl,true],['US',us,false]]){const j=rg.journal[scope],min=sc.scopeMin(j,cfg),m=sc.model(j,isHL,min),srvR={};for(const [t,x] of m)srvR[t.id]=x;
 if(min!==app.min){fail++;console.log('FAIL',scope,'기준 분',min,app.min);}
 for(const [id,a] of Object.entries(app.res)){const s=srvR[id],S={scalp:!!(s&&s.scalp),skip:!!(s&&s.scalp&&!s.exc.length),exc:s&&s.scalp?s.exc:[],hold:s?Math.round(s.hold/60000):null,R:s?s.R:null};n++;
  const same=JSON.stringify(S)===JSON.stringify(a);if(!same)fail++;console.log(same?'ok  ':'FAIL',scope,id.padEnd(6),'app',JSON.stringify(a),same?'':'\n     server '+JSON.stringify(S));}}
if(hl.errs.length||us.errs.length)console.log('page errors',hl.errs,us.errs);
console.log(fail?`FAIL ${fail}/${n}`:`ALL OK ${n}/${n} 거래 — 서버 판정 = 앱 v121·v122`);process.exitCode=fail?1:0;await browser.close();process.exit(fail?1:0);
