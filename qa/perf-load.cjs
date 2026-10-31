/* 첫 로딩 측정(CI 대상 아님, 수동): node qa/perf-load.cjs <사이트폴더(index.html 있는 곳)> <라벨> [반복=3] [width=1440]
   - 로컬 http 서버: GitHub Pages 흉내 (gzip, ETag, Cache-Control: max-age=600 / MODE=expired 이면 max-age=0 → 매번 304 재검증)
   - Chromium 지속 프로필(HTTP 캐시·V8 코드 캐시 살아 있음), CPU 4x 스로틀, 느린 네트워크(RTT 150ms, 1.6Mbps 하향)
   - 시드: 거래 300건을 IndexedDB/localStorage에 저장한 뒤 측정
   - 측정: cold(캐시 비움) → 재방문 1·2·3 (같은 프로필)
     FCP, journalReady(대시보드 renderAll 끝난 시점), DCL, 응답 끝, Performance.getMetrics ScriptDuration/TaskDuration,
     트레이스로 스크립트 컴파일(v8.compile / V8.CompileCode 등)·EvaluateScript 합 */
const pw=require('playwright-core');const fs=require('fs'),path=require('path'),http=require('http'),zlib=require('zlib'),crypto=require('crypto'),os=require('os');
const [,,siteDir,label='x',repArg='3',wArg='1440']=process.argv;const REP=+repArg,WIDTH=+wArg;
const MODE=process.env.MODE||'fresh';const CPU=+(process.env.CPU||4);const NET=process.env.NET||'slow4g';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.json':'application/json'};
const cache={};const log=[];
const srv=http.createServer((q,r)=>{let u=q.url.split('?')[0];if(u.endsWith('/'))u+='index.html';const f=path.join(siteDir,path.basename(u));
 if(!fs.existsSync(f)){log.push('404 '+u);r.writeHead(404);return r.end();}
 if(!cache[f]){const b=fs.readFileSync(f);cache[f]={gz:zlib.gzipSync(b,{level:6}),etag:'W/"'+crypto.createHash('md5').update(b).digest('hex').slice(0,16)+'"',raw:b.length};}
 const c=cache[f];const h={'Content-Type':types[path.extname(f)]||'application/octet-stream','ETag':c.etag,'Cache-Control':MODE==='expired'?'max-age=0':'max-age=600','Vary':'Accept-Encoding'};
 if(q.headers['if-none-match']===c.etag){log.push('304 '+u);r.writeHead(304,h);return r.end();}
 log.push('200 '+u+' '+c.gz.length);h['Content-Encoding']='gzip';h['Content-Length']=c.gz.length;r.writeHead(200,h);r.end(c.gz);}).listen(0);
const init=()=>{const J=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
 window.fetch=async(u)=>J({message:'qa offline'},404);
 let rv;Object.defineProperty(window,'journalReady',{configurable:true,get(){return rv;},set(v){rv=v;if(v&&!window.__readyAt){window.__readyAt=performance.now();requestAnimationFrame(()=>{window.__frameAt=performance.now();setTimeout(()=>{window.__paintAt=performance.now();},0);});}}});};
const seed=async()=>{const now=Date.now(),D=Date.parse(new Date(now-86400000).toISOString().slice(0,10)+'T00:00:00Z');
 const ev=(id,ts,sh,px,fill)=>{const d=new Date(ts).toISOString();return {id,date:d.slice(0,10),time:d.slice(11,19),timestamp:ts,shares:sh,price:px,fee:0.12,seq:ts/1000,...(fill?{fillId:fill,sourceKey:'hyperliquid:abc:'+fill,planKey:'other',planned:'',actual:'',compliance:'unreviewed'}:{})};};
 const mk=(i)=>{const t0=D-i*6*3600e3;return normaliseTrade({schema:5,currency:CURRENCY,market:MARKET,id:'p'+i,at:t0,name:['ETH','BTC','SOL','xyz:INTC'][i%4],direction:i%3?'long':'short',date:new Date(t0).toISOString().slice(0,10),stop:90,stop0:90,initialRisk:100,riskR:1,setup:'미분류',leverage:5,marginMode:'isolated',process:'compliant',review:'메모 '+i,violations:[],entries:[ev('p'+i+'e0',t0,10,100),ev('p'+i+'e1',t0+600e3,5,101)],fills:i<3?[]:[ev('p'+i+'f0',t0+3600e3,15,100+(i%7)-3,'f'+i)],funding:[],images:[]});};
 Object.assign(state.settings,{account:10000,limD:3,limW:6,limM:10});state.trades=Array.from({length:300},(_,i)=>mk(i));await persist();return state.trades.length;};
function top(pr){const self={};const dt={};pr.samples.forEach((id,i)=>{dt[id]=(dt[id]||0)+(pr.timeDeltas[i]||0);});pr.nodes.forEach(n=>{const k=(n.callFrame.functionName||'(anon)')+':'+n.callFrame.lineNumber;self[k]=(self[k]||0)+(dt[n.id]||0)/1000;});return Object.entries(self).filter(e=>!/idle|program|garbage/.test(e[0])).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,v])=>k+' '+v.toFixed(0));}
const sum=(ev,re)=>ev.filter(e=>re.test(e.name)&&e.ph==='X').reduce((a,e)=>a+(e.dur||0),0)/1000;
(async()=>{
 const ud=fs.mkdtempSync(path.join(os.tmpdir(),'perf-'));
 const ctx=await pw.chromium.launchPersistentContext(ud,{executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--font-render-hinting=none'],viewport:{width:WIDTH,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await ctx.addInitScript(init);const URL0='http://127.0.0.1:'+srv.address().port+'/index.html?journal=hyperliquid';
 const page=ctx.pages()[0]||await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
 await page.goto(URL0);await page.waitForFunction(()=>window.journalReady===true,null,{timeout:60000});const n=await page.evaluate(seed);
 const cdp=await ctx.newCDPSession(page);await cdp.send('Performance.enable');
 const runs=[];
 for(let k=0;k<=REP;k++){
  if(k===0){await cdp.send('Network.clearBrowserCache');}
  await page.goto('about:blank');await page.waitForTimeout(300);
  await cdp.send('Network.enable');
  if(NET!=='none')await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6e6/8,uploadThroughput:750e3/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:CPU});
  const tev=[];const onData=d=>tev.push(...d.value);cdp.on('Tracing.dataCollected',onData);
  await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.compile,blink.user_timing,loading',transferMode:'ReportEvents'});
  log.length=0;const m0=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
  if(process.env.PROF){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start');}
  await page.goto(URL0,{waitUntil:'commit'});await page.waitForFunction(()=>window.journalReady===true,null,{timeout:120000,polling:50});
  let prof=null;if(process.env.PROF){prof=top((await cdp.send('Profiler.stop')).profile);}
  await page.waitForTimeout(1500);
  const m1=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
  const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await done;cdp.off('Tracing.dataCollected',onData);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  const pg=await page.evaluate(()=>{const nv=performance.getEntriesByType('navigation')[0];const fcp=(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime;
   const rs=performance.getEntriesByType('resource').filter(r=>/\.js/.test(r.name)).map(r=>({n:r.name.split('/').pop(),t:Math.round(r.responseEnd),sz:r.transferSize}));
   return {resp:Math.round(nv.responseEnd),dcl:Math.round(nv.domContentLoadedEventEnd),load:Math.round(nv.loadEventEnd),fcp:Math.round(fcp),ready:Math.round(window.__readyAt),painted:Math.round(window.__paintAt),frame:Math.round(window.__frameAt),htmlTx:nv.transferSize,rs,dash:!!document.querySelector('#dashboard, [data-page="dashboard"]'),trades:state.trades.length};});
  const compile=sum(tev,/^(v8\.compile|V8\.CompileCode|v8\.parseOnBackground|V8\.ScriptCompiler|v8\.compileModule)$/);
  const cacheHits=tev.filter(e=>/v8\.compile/.test(e.name)&&e.args&&e.args.data&&(e.args.data.cacheConsumeOptions||e.args.data.consumedCacheSize)).map(e=>e.args.data.consumedCacheSize||e.args.data.cacheConsumeOptions);
  const evals=sum(tev,/^EvaluateScript$/);const parseHTML=sum(tev,/^ParseHTML$/);
  const byName={};for(const e of tev){if(e.ph!=='X'||!e.dur)continue;if(!/^(ParseHTML|EvaluateScript|FunctionCall|UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|ParseAuthorStyleSheet|v8\.compile|TimerFire|FireAnimationFrame|EventDispatch|RunMicrotasks|v8\.run|RunTask|HitTest|IntersectionObserverController::computeIntersections|CommitLoad|ResourceReceivedData|v8\.parseOnBackground|V8\.GCScavenger|MinorGC|MajorGC|V8\.GC_MARK_COMPACTOR)$/.test(e.name))continue;byName[e.name]=(byName[e.name]||0)+e.dur/1000;}
  for(const k in byName)byName[k]=Math.round(byName[k]);
  runs.push({byName,run:k===0?'cold':'revisit'+k,...pg,scriptMs:Math.round((m1.ScriptDuration-m0.ScriptDuration)*1000),taskMs:Math.round((m1.TaskDuration-m0.TaskDuration)*1000),compileMs:Math.round(compile),evalScriptMs:Math.round(evals),parseHTMLMs:Math.round(parseHTML),prof,codeCache:cacheHits.slice(0,3),net:log.slice()});
 }
 const med=k=>{const v=runs.filter(r=>r.run!=='cold').map(r=>r[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};const summary={cold:{fcp:runs[0].fcp,ready:runs[0].ready,painted:runs[0].painted,frame:runs[0].frame,resp:runs[0].resp,htmlTx:runs[0].htmlTx},revisitMedian:Object.fromEntries(['resp','dcl','fcp','ready','frame','painted','scriptMs','taskMs','parseHTMLMs','compileMs'].map(k=>[k,med(k)]))};
 console.log(JSON.stringify({summary,label,MODE,CPU,NET,WIDTH,seeded:n,errs,runs},null,1));
 await ctx.close();srv.close();fs.rmSync(ud,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
