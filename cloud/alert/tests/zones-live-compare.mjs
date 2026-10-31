// 수동 실행(CI·node --test 대상 아님): node tests/zones-live-compare.mjs
//  1) 라이브 flow-chart(stopfirst.github.io/flow-chart/js/*.js)가 테스트 원본(fixtures/flow-chart, e99a059)과 같은지
//  2) 지금 실제 공개 API 봉으로 라이브 flow-chart 코드(data.js loadAll)와 trade-alert 모듈이 같은 존을 내는지 (BTC/ETH 1H)
//     소스: Binance 선물(flow-chart 기본, 미국 IP면 451) · Binance 현물 · Hyperliquid — 각각 따로
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as Z from '../src/zones.mjs';
import {CandleCache,makeSources,zoneConfig,fmtPx} from '../src/zonewatch.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const LIVE='https://stopfirst.github.io/flow-chart/js/';
const H=3600e3,now=Date.now();
const src={};
for(const f of ['calc.js','ca.js','data.js','render.js']){
 const r=await fetch(LIVE+f,{cache:'no-store'});const t=await r.text();src[f]=t;
 console.log(`${f}: 라이브 ${r.status} · ${t===readFileSync(path.join(here,'fixtures','flow-chart',f),'utf8')?'테스트 원본과 같음':'⚠️ 테스트 원본과 다름'}`);
}
const kst=ms=>new Date(ms+9*H).toISOString().slice(5,16).replace('T',' ');
const SRC={bnf:'Binance 선물',bns:'Binance 현물',hl:'Hyperliquid'};
for(const sym of ['BTC','ETH']){
 // 실제 봉을 한 번 받아 두고(소스별), 양쪽에 같은 봉을 줌
 for(const s of ['bnf','bns','hl']){
  let rows;try{rows=await makeSources(fetch)[s](sym,'1h',{limit:360,start:Math.floor(now/H)*H-359*H,end:now});}catch(e){console.log(`\n${sym} ${SRC[s]}: 받기 실패 ${e.message}`);continue;}
  const block=new Set(['bnf','bns','hl'].filter(x=>x!==s));
  const resp=(status,body)=>({ok:status<300,status,headers:{get:()=>null},json:async()=>body});
  const fake=async(url,init)=>{const u=String(url);
   const bn=lim=>rows.slice(-lim).map(r=>[r.t,String(r.o),String(r.h),String(r.l),String(r.c),String(r.v),r.t+H-1,String(r.v*r.c),1,String(r.v/2),String(r.v*r.c/2),'0']);
   if(u.includes('fapi.binance.com'))return block.has('bnf')?resp(451,{}):resp(200,bn(+new URL(u).searchParams.get('limit')));
   if(u.includes('binance.vision')||u.includes('api.binance.com'))return block.has('bns')?resp(451,{}):resp(200,bn(+new URL(u).searchParams.get('limit')));
   if(u.includes('hyperliquid')){if(block.has('hl'))return resp(500,{});const q=JSON.parse(init.body).req;return resp(200,rows.filter(r=>r.t>=q.startTime&&r.t<=q.endTime).map(r=>({t:r.t,o:String(r.o),h:String(r.h),l:String(r.l),c:String(r.c),v:String(r.v)})));}
   return resp(404,{});};
  const store=new Map();const ctx={console,setTimeout,clearTimeout,fetch:fake,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};ctx.self=ctx;vm.createContext(ctx);vm.runInContext(`Date.now=()=>${now}`,ctx);
  for(const f of ['calc.js','ca.js','data.js'])vm.runInContext(src[f],ctx);
  const D=await ctx.FCData.loadAll({sym,tf:'1h',bars:100,settings:{},mock:false});
  const lastC=D.candles[D.candles.length-1].c,tAt=i=>D.times[0]+i*D.tfMs;
  const fcOb=[];for(const dir of ['bull','bear']){const z=D.ob.filter(q=>q.dir===dir&&q.end==null).sort((a,b)=>b.i0-a.i0||b.created-a.created)[0];if(z&&z.i0>=0)fcOb.push(z);}
  const fcBb=D.bbfvg.filter(z=>z.end==null).sort((a,b)=>Math.abs(a.mid-lastC)-Math.abs(b.mid-lastC)).slice(0,2);
  const cc=new CandleCache({sources:makeSources(fake),cfg:zoneConfig({ZONE_SOURCE:s==='hl'?'hl':'binance'}),now:()=>now});
  const got=await cc.get(sym,now),full=got.rows,zc=Z.computeZones(full,{nowMs:now,tfMs:H,bars:100}),sh=Z.selectShown(zc,full);
  const k1=[...fcBb.map(z=>`BB+FVG ${z.dir} ${tAt(z.i0)} ${z.bottom}-${z.top}`),...fcOb.map(z=>`OB ${z.dir} ${tAt(z.i0)} ${z.bottom}-${z.top}`)];
  const k2=[...sh.bbfvg.map(z=>`BB+FVG ${z.dir} ${full[z.i0].t} ${z.bottom}-${z.top}`),...sh.ob.map(z=>`OB ${z.dir} ${full[z.i0].t} ${z.bottom}-${z.top}`)];
  console.log(`\n${sym} ${SRC[s]} · 봉 ${full.length}개 · 현재가 ${fmtPx(lastC,lastC)} · flow-chart 소스 표시 '${D.src}' · ${JSON.stringify(k1)===JSON.stringify(k2)?'✅ 존 동일':'❌ 다름'}`);
  for(const z of [...fcBb.map(z=>['BB+FVG',z]),...fcOb.map(z=>['OB',z])])console.log(`  ${z[0]} ${z[1].dir==='bull'?'강세':'약세'} ${fmtPx(z[1].bottom,lastC)} – ${fmtPx(z[1].top,lastC)} · 시작 ${kst(tAt(z[1].i0))} KST`);
  if(JSON.stringify(k1)!==JSON.stringify(k2))console.log('  flow-chart:',k1,'\n  trade-alert:',k2);
 }
}
