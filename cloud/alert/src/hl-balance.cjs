'use strict';
// balance-v1: signed decimal strings, read-only /info requests, no journal PnL estimates.
const SCALE=1000000000000000000n;
function dec(value){if(typeof value!=='string'||!/^\-?\d{1,15}(\.\d{1,18})?$/.test(value))throw Error('HL_BALANCE_INVALID_DECIMAL');const sign=value[0]==='-'?-1n:1n,parts=(sign<0n?value.slice(1):value).split('.');return sign*(BigInt(parts[0])*SCALE+BigInt((parts[1]||'').padEnd(18,'0')));}
function str(value){const sign=value<0n?'-':'',v=value<0n?-value:value;return sign+v/SCALE+(v%SCALE?'.'+String(v%SCALE).padStart(18,'0').replace(/0+$/,''):'');}
function summary(data,dex,now){if(!Array.isArray(data?.assetPositions))throw Error('HL_BALANCE_INVALID_PERPS');const amount=str(dec(data.marginSummary?.accountValue));if(!Number.isSafeInteger(data.time)||data.time<=0||data.time>now+60000||now-data.time>300000)throw Error('HL_BALANCE_STALE_UPSTREAM');return {venue:dex?'HIP-3':'Perps',dex,amount,asOf:data.time};}
function spotBalances(data){if(!Array.isArray(data?.balances))throw Error('HL_BALANCE_INVALID_SPOT');const seen=new Set();return data.balances.map(row=>{if(!Number.isSafeInteger(row?.token)||row.token<0||typeof row.coin!=='string'||!/^[A-Za-z0-9_:./-]{1,64}$/.test(row.coin)||seen.has(row.token))throw Error('HL_BALANCE_INVALID_TOKEN');seen.add(row.token);if(row.token===0&&row.coin!=='USDC')throw Error('HL_BALANCE_INVALID_USDC');return {token:row.token,coin:row.coin,total:str(dec(row.total)),hold:str(dec(row.hold))};});}
async function fetchAccountBalance(request,base,account,clock=Date.now){
 const started=clock(),mode=await request({type:'userAbstraction'});if(!['unifiedAccount','portfolioMargin','disabled','default'].includes(mode))throw Error('HL_BALANCE_UNSUPPORTED_MODE');
 const assets=spotBalances(await request({type:'spotClearinghouseState'})),spot=assets.find(a=>a.token===0),spotAmount=spot?.total||'0',components=[],excludedDexs=[],unified=mode==='unifiedAccount'||mode==='portfolioMargin';
 if(unified)components.push({venue:'Unified',dex:null,amount:spotAmount,asOf:started});
 else{
  components.push(summary(base,'',started),{venue:'Spot',dex:null,amount:spotAmount,asOf:started});
  const registry=await request({type:'perpDexs'});if(!Array.isArray(registry)||registry[0]!==null||registry.length>33)throw Error('HL_BALANCE_INVALID_DEX_LIST');
  const names=registry.slice(1).map(d=>d?.name);if(names.some(n=>typeof n!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(n))||new Set(names).size!==names.length)throw Error('HL_BALANCE_INVALID_DEX_LIST');
  let index=0;async function worker(){while(index<names.length){const dex=names[index++],response=await request({type:'metaAndAssetCtxs',dex});if(!Array.isArray(response)||response.length!==2||!Array.isArray(response[1]))throw Error('HL_BALANCE_UNKNOWN_COLLATERAL');const meta=response[0];if(!Array.isArray(meta?.universe)||!Number.isSafeInteger(meta.collateralToken)||meta.collateralToken<0)throw Error('HL_BALANCE_UNKNOWN_COLLATERAL');if(meta.collateralToken!==0){excludedDexs.push({dex,collateralToken:meta.collateralToken});continue;}components.push(summary(await request({type:'clearinghouseState',dex}),dex,clock()));}}
  await Promise.allSettled([worker(),worker()]).then(results=>{for(const r of results)if(r.status==='rejected')throw r.reason;});
 }
 if(await request({type:'userAbstraction'})!==mode)throw Error('HL_BALANCE_MODE_CHANGED');
 components.sort((a,b)=>String(a.dex??a.venue).localeCompare(String(b.dex??b.venue)));
 const nonUsdcAssets=assets.filter(a=>a.token!==0&&dec(a.total)!==0n);
 return {version:1,source:'hyperliquid',account,currency:'USDC',accountMode:mode,equity:str(components.reduce((sum,c)=>sum+dec(c.amount),0n)),asOf:Math.min(...components.map(c=>c.asOf)),fetchedAt:clock(),scope:unified?'통합 USDC 거래잔고':'USDC Spot + 전체 USDC Perps',components,nonUsdcAssets,excludedDexs,fresh:true};
}
module.exports={dec,str,summary,spotBalances,fetchAccountBalance};
