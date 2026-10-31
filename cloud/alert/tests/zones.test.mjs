// trade-alert 2.10.0 — flow-chart 존 동일성 테스트.
//  tests/fixtures/flow-chart/*.js = stopfirst/flow-chart e99a059의 js/calc.js·ca.js·data.js·render.js 원본 그대로.
//  (1) zones.mjs의 계산 함수 소스가 calc.js와 글자 그대로 같은지
//  (2) flow-chart의 실제 브라우저 경로(data.js loadAll → 모의 fetch로 같은 봉) 결과와 Node 모듈(CandleCache → computeZones → selectShown) 결과가 같은지
//      — 고정 봉(flow-chart 테스트 봉, 2026-11-01 HL·Binance 실데이터 스냅샷) + 무작위 봉 120세트, 차트 봉 수 40·60·100, 진행 중 봉 있음/없음, Binance/HL 경로
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as Z from '../src/zones.mjs';
import {CandleCache,makeSources,zoneConfig} from '../src/zonewatch.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const FCDIR=path.join(here,'fixtures','flow-chart');
const fcSrc=f=>readFileSync(path.join(FCDIR,f),'utf8');
const H=3600e3;

// ---- (1) 소스 동일성 -------------------------------------------------------------------------
test('zones.mjs 계산 함수 = flow-chart calc.js 글자 그대로', ()=>{
 const calc=fcSrc('calc.js'),mine=readFileSync(path.join(here,'..','src','zones.mjs'),'utf8');
 const body=mine.slice(mine.indexOf('// ======================= flow-chart calc.js 그대로'),mine.indexOf('// ===================== /flow-chart calc.js 그대로'));
 const fnSrc=(s,name)=>{const re=new RegExp(`\\n  (function ${name}\\(|let ${name} )`);const m=re.exec(s);assert.ok(m,name+' 없음');const i=m.index+1;
  // 다음 최상위(2칸 들여쓰기) 선언 또는 섹션 주석까지
  const rest=s.slice(i+1);const j=rest.search(/\n  (function |let |\/\* ----------|return \{)/);return s.slice(i,j<0?s.length:i+1+j).trimEnd();};
 for(const name of ['atr','findFVG','OB_MODE','setOBMode','getOBMode','findOB','swings','findOBBaekdo','findOBWide','findBBFVG'])
  assert.equal(fnSrc(body,name),fnSrc(calc,name),name+' 이 calc.js와 다름');
 assert.match(fcSrc('data.js'),/const lastClosed = full\.length - 1 - \(full\.length && full\[full\.length - 1\]\.t \+ T\.ms > now \? 1 : 0\);/);
 assert.match(fcSrc('data.js'),/const WARMUP = 260;/);
});
test('render.js 표시 선택 규칙이 selectShown이 옮긴 그대로인지(원본 줄 확인)', ()=>{
 const r=fcSrc('render.js');
 assert.ok(r.includes("const z = live.filter(q => q.dir === dir).sort((a, b) => b.i0 - a.i0 || b.created - a.created)[0];"));
 assert.ok(r.includes("if (z && z.i0 >= 0 && visOB(z)) obs.push(z);"));
 assert.ok(r.includes(".sort((a, b) => Math.abs(a.mid - lastC) - Math.abs(b.mid - lastC)).slice(0, 2);"));
 assert.ok(r.includes("const lastC = C[n - 1].c"));
});

// ---- (2) 결과 동일성: flow-chart 브라우저 경로 vs Node 모듈 ---------------------------------
/** 봉 목록 → 모의 fetch(Binance 선물·현물·HL candleSnapshot 형식). block: 막을 소스 집합(451). */
function mockFetch(rows,now,{block=new Set()}={}){
 const upto=rows.filter(r=>r.t<=now);
 const bn=lim=>upto.slice(-lim).map(r=>[r.t,String(r.o),String(r.h),String(r.l),String(r.c),String(r.v??1),r.t+H-1,String((r.v??1)*r.c),10,String((r.v??1)/2),String((r.v??1)*r.c/2),'0']);
 const resp=(status,body)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>body});
 return async(url,init)=>{
  const u=String(url);
  if(u.includes('fapi.binance.com')){if(block.has('bnf'))return resp(451,{});return resp(200,bn(+new URL(u).searchParams.get('limit')));}
  if(u.includes('binance.vision')||u.includes('api.binance.com')){if(block.has('bns'))return resp(451,{});return resp(200,bn(+new URL(u).searchParams.get('limit')));}
  if(u.includes('api.hyperliquid.xyz')){if(block.has('hl'))return resp(500,{});const q=JSON.parse(init.body).req;
   return resp(200,upto.filter(r=>r.t>=q.startTime&&r.t<=q.endTime).map(r=>({t:r.t,T:r.t+H-1,s:q.coin,i:q.interval,o:String(r.o),c:String(r.c),h:String(r.h),l:String(r.l),v:String(r.v??1),n:1})));}
  return resp(404,{});
 };
}
/** flow-chart js 원본을 vm에서 실행(calc → ca → data), loadAll 결과 반환 */
async function flowChart(rows,now,{bars,block}){
 const store=new Map();
 const ctx={console,setTimeout,clearTimeout,fetch:mockFetch(rows,now,{block}),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};
 ctx.self=ctx;vm.createContext(ctx);
 vm.runInContext(`Date.now=()=>${now};`,ctx);
 for(const f of ['calc.js','ca.js','data.js'])vm.runInContext(fcSrc(f),ctx,{filename:f});
 const D=await ctx.FCData.loadAll({sym:'BTC',tf:'1h',bars,settings:{caKey:'',caProxy:''},mock:false});
 // render.js 표시 선택(가격 범위 visOB/inR 제외 — selectShown과 같은 범위)
 const lastC=D.candles[D.candles.length-1].c;const live=D.ob.filter(z=>z.end==null);const obs=[];
 for(const dir of ['bull','bear']){const z=live.filter(q=>q.dir===dir).sort((a,b)=>b.i0-a.i0||b.created-a.created)[0];if(z&&z.i0>=0)obs.push(z);}
 const bbs=D.bbfvg.filter(z=>z.end==null).sort((a,b)=>Math.abs(a.mid-lastC)-Math.abs(b.mid-lastC)).slice(0,2);
 const tAt=i=>D.times[0]+i*D.tfMs; // 상대 인덱스(음수 = 워밍업 구간) → 봉 시각
 const key=z=>`${z.dir}|${tAt(z.i0)}|${z.top}|${z.bottom}`;
 return JSON.parse(JSON.stringify({src:D.src,all:{ob:D.ob.map(key).sort(),bbfvg:D.bbfvg.map(key).sort()},shown:{ob:obs.map(key),bbfvg:bbs.map(key)}})); // vm 영역 배열 → 이 영역 배열
}
async function node(rows,now,{bars,block,source='auto'}){
 const cfg=zoneConfig({ZONE_SOURCE:source,ZONE_BARS:String(bars)});
 const cc=new CandleCache({sources:makeSources(mockFetch(rows,now,{block})),cfg,now:()=>now});
 const got=await cc.get('BTC',now);const full=got.rows;
 const zc=Z.computeZones(full,{nowMs:now,tfMs:H,bars}),sh=Z.selectShown(zc,full);
 const key=z=>`${z.dir}|${full[z.i0].t}|${z.top}|${z.bottom}`;
 return {src:got.src,all:{ob:zc.ob.map(key).sort(),bbfvg:zc.bbfvg.map(key).sort()},shown:{ob:sh.ob.map(key),bbfvg:sh.bbfvg.map(key)},n:full.length};
}
const SRCNAME={bnf:'Binance 선물',bns:'Binance 현물',hl:'Hyperliquid'};
async function same(rows,now,opts,label){
 const a=await flowChart(rows,now,opts),b=await node(rows,now,opts);
 assert.equal(SRCNAME[b.src],a.src,label+' 소스');
 assert.deepEqual(b.all,a.all,label+' 전체 존');
 assert.deepEqual(b.shown,a.shown,label+' 표시 존');
 return a;
}
const num=r=>({t:Number(r.t),o:+r.o,h:+r.h,l:+r.l,c:+r.c,v:+(r.v??1)});

test('고정 봉: 2026-11-01 실데이터(HL·Binance 현물 BTC/ETH 1H) — flow-chart와 같은 존', async()=>{
 const L=JSON.parse(readFileSync(path.join(here,'fixtures','zones','live-20261101.json'),'utf8'));
 let shownCount=0;
 for(const s of ['BTC','ETH']){
  const sets={hl:L.hl[s].map(num),bns:L.bns[s].map(k=>num({t:k[0],o:k[1],h:k[2],l:k[3],c:k[4],v:k[5]}))};
  for(const [name,rows] of Object.entries(sets)){
   const now=L.fetchedAt;
   for(const bars of [40,60,100]){
    for(const block of [new Set(),new Set(['bnf','bns'])]){
     const a=await same(rows,now,{bars,block},`${s} ${name} bars=${bars} block=${[...block]}`);shownCount+=a.shown.ob.length+a.shown.bbfvg.length;
    }
    // 진행 중 봉이 없는 시점(정시 직전 마감 직후)
    await same(rows.slice(0,-1),rows[rows.length-1].t,{bars,block:new Set()},`${s} ${name} 마감 시점 bars=${bars}`);
   }
  }
 }
 assert.ok(shownCount>0,'비교한 표시 존이 하나도 없음');
});
test('고정 봉: flow-chart 저장소 테스트 봉(BTC 10/22 · ETH 10/21 1H)', async()=>{
 for(const f of ['btcusdt_spot_1h_20261022.json','ethusdt_spot_1h_20261021.json']){
  const rows=JSON.parse(readFileSync(path.join(here,'fixtures','zones',f),'utf8')).map(num);
  for(const bars of [40]){ // 300봉 = 40 + 워밍업 260
   const last=rows[rows.length-1].t;
   await same(rows,last+30*60e3,{bars,block:new Set()},f+' 진행 중'); // 마지막 봉 진행 중
   await same(rows,last+H,{bars,block:new Set()},f+' 마감');
  }
 }
});
test('무작위 봉 120세트(급등락·도지 섞음) — flow-chart와 같은 존', async()=>{
 let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
 let nonEmpty=0;
 for(let k=0;k<120;k++){
  const bars=[40,60,100][k%3],n=bars+260,now0=Date.UTC(2026,9,31,16)+(k%2?30*60e3:H-1);const T0=Math.floor(now0/H)*H-(n-1)*H;
  let p=k%2?2500:80000;const rows=[];
  for(let i=0;i<n;i++){const vol=(rnd()<0.06?0.03:0.008)*(1+Math.sin(i/(9+k%7)));const o=p,c=o*(1+(rnd()-0.5)*vol+(Math.sin((i+k)/23))*0.002);
   const doji=rnd()<0.05;const cc=doji?o*(1+(rnd()-0.5)*1e-5):c;const h=Math.max(o,cc)*(1+rnd()*0.004),l=Math.min(o,cc)*(1-rnd()*0.004);
   rows.push({t:T0+i*H,o:Math.round(o*100)/100,h:Math.round(h*100)/100,l:Math.round(l*100)/100,c:Math.round(cc*100)/100,v:1});p=cc;}
  const a=await same(rows,now0,{bars,block:k%5===0?new Set(['bnf','bns']):new Set()},'무작위 #'+k);
  if(a.all.ob.length||a.all.bbfvg.length)nonEmpty++;
 }
 assert.ok(nonEmpty>=60,'존이 있는 세트가 너무 적음: '+nonEmpty);
});
test('ZONE_SOURCE=hl: Binance가 돼도 HL 봉만 씀 · auto는 flow-chart 순서(선물 → 현물 → HL)', async()=>{
 const L=JSON.parse(readFileSync(path.join(here,'fixtures','zones','live-20261101.json'),'utf8'));const rows=L.hl.BTC.map(num),now=L.fetchedAt;
 assert.equal((await node(rows,now,{bars:100,block:new Set(),source:'hl'})).src,'hl');
 assert.equal((await node(rows,now,{bars:100,block:new Set()})).src,'bnf');
 assert.equal((await node(rows,now,{bars:100,block:new Set(['bnf'])})).src,'bns');
 assert.equal((await node(rows,now,{bars:100,block:new Set(['bnf','bns'])})).src,'hl');
 const b=await node(rows,now,{bars:100,block:new Set()});assert.equal(b.n,360);
});
