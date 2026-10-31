import test from 'node:test';import assert from 'node:assert/strict';
import * as spot from '../src/spot.mjs';
const meta={universe:[{name:'@142',index:5,tokens:[197,0]}]},ctxs=[];ctxs[5]={midPx:'110000',markPx:'109000'};
test('지금 현물 평가',()=>{const r=spot.priceItems([{coin:'USDC',token:0,total:'50'},{coin:'UBTC',token:197,total:'0.1'}],meta,ctxs);assert.equal(r.usd,10900);assert.equal(r.items[0].pair,'@142');assert.equal(r.miss,0);});
test('마감 현물 = (지금 − 경계 뒤 순매수) × 경계 봉 시가',async()=>{
 const now=Date.parse('2026-10-28T02:00:00Z'),calls=[];
 const post=async q=>{calls.push(q.type+(q.req?':'+q.req.interval:''));
  if(q.type==='spotClearinghouseState')return {balances:[{coin:'USDC',token:0,total:'5'},{coin:'UBTC',token:197,total:'0.1'}]};
  if(q.type==='spotMetaAndAssetCtxs')return [meta,ctxs];
  if(q.type==='userFillsByTime')return [{coin:'@142',side:'B',sz:'0.04',time:Date.parse('2026-10-28T01:00:00Z'),feeToken:'UBTC',fee:'0.0001'},{coin:'BTC',side:'B',sz:'1',time:Date.parse('2026-10-28T01:00:00Z')}];
  if(q.type==='candleSnapshot'){const b=q.req.startTime+(q.req.interval==='1m'?60e3:3600e3);return [{t:b-(q.req.interval==='1m'?60e3:3600e3),o:'1'},{t:b,o:q.req.interval==='1m'?'100000':'90000'}];}};
 const sb=new spot.SpotBasis({post,now:()=>now});await sb.current('0xa');
 const m=await sb.closes('0xa',['2026-10-27','2026-09-30','2026-10-28']);
 // 10-27 마감 경계 = 10-28 00:00, 순매수 0.04−0.0001 → q0=0.0601, 1분봉 100000
 assert.equal(m.get('2026-10-27'),6010);
 // 9-30 마감(28일 전) → 1시간봉 90000, q0=0.0601
 assert.equal(m.get('2026-09-30'),5409);
 assert.ok(!m.has('2026-10-28')); // 아직 안 끝난 날
 const n=calls.length;await sb.closes('0xa',['2026-10-27']);assert.equal(calls.length,n); // 캐시
 const acct=spot.withSpot([{market:'hl',day:'2026-10-27',value:'1000'},{market:'us',day:'2026-10-27',value:'7'}],m);
 assert.equal(acct[0].value,7010);assert.equal(acct[1].value,'7');
});
test('가격 없는 토큰 → 마감 현물 안 더함',async()=>{const post=async q=>q.type==='spotClearinghouseState'?{balances:[{coin:'X',token:9,total:'1'}]}:q.type==='spotMetaAndAssetCtxs'?[meta,ctxs]:[];
 const sb=new spot.SpotBasis({post,now:()=>Date.now()});const c=await sb.current('0xb');assert.equal(c.miss,1);const m=await sb.closes('0xb',['2026-10-01']);assert.equal(m.size,0);});
