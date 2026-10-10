// Read-only broker snapshots. Deliberately never returns Execution or Batch.
import {readFile,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const BASE='https://api.kiwoom.com';
const BUNDLED=fileURLToPath(new URL('../../specs/kiwoom-journal-spec.json',import.meta.url));
const IDS=['ust21150','ust21070','ust21640'];
export function checkDate(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('KIWOOM_REVIEW_DATE_INVALID');
 return value;
}
function text(value:unknown,max=120){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');return value.trim();}
function decimal(value:unknown,optional=false){
 if(optional&&(value==null||value===''))return null;
 const raw=text(value,48);if(!/^[+-]?\d+(\.\d{1,12})?$/.test(raw))throw Error('KIWOOM_REVIEW_NUMBER_INVALID');
 const negative=raw.startsWith('-'),parts=raw.replace(/^[+-]/,'').split('.'),whole=parts[0].replace(/^0+(?=\d)/,''),fraction=(parts[1]||'').replace(/0+$/,'');
 return (negative&&/[1-9]/.test(whole+fraction)?'-':'')+whole+(fraction?'.'+fraction:'');
}
function nonnegative(value:unknown,optional=false){const n=decimal(value,optional);if(n?.startsWith('-'))throw Error('KIWOOM_REVIEW_NUMBER_INVALID');return n;}
function clock(value:unknown){if(value==null||value==='')return null;const s=text(value,8);if(!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s))throw Error('KIWOOM_REVIEW_TIME_INVALID');return s;}
function usd(value:unknown){if(value!=='USD')throw Error('KIWOOM_REVIEW_CURRENCY_UNSUPPORTED');return 'USD';}
export function responseRows(data:any,warnings:string[]){
 const canonical=Object.hasOwn(data,'result_list'),typo=Object.hasOwn(data,'result_lsit');
 if(canonical&&typo)throw Error('KIWOOM_REVIEW_AMBIGUOUS_LIST');
 const rows=canonical?data.result_list:typo?data.result_lsit:undefined;
 if(!Array.isArray(rows))throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');
 if(typo)warnings.push('응답 목록 이름이 명세 표와 다르고 예제의 result_lsit 형식입니다.');
 return rows;
}
export function normalizeOrder(row:any,date:string){
 checkDate(date);if(!row||typeof row!=='object'||Array.isArray(row))throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');
 const orderId=text(row.ord_no,32),symbol=text(row.stk_cd,24),side=text(row.slby_tp_nm,8);
 if(!/^\d+$/.test(orderId)||!/[1-9]/.test(orderId)||!symbol||!['매수','매도'].includes(side))throw Error('KIWOOM_REVIEW_ORDER_INVALID');
 const quantity=nonnegative(row.cntr_qty),price=nonnegative(row.cntr_uv,true);
 if(quantity!=='0'&&(price==null||price==='0'))throw Error('KIWOOM_REVIEW_ORDER_INVALID');
 return {key:date+':'+symbol+':'+orderId,orderDate:date,orderId,symbol,side,currency:usd(row.crnc_code),orderQuantity:nonnegative(row.ord_qty),reportedQuantity:quantity,reportedPrice:price,remaining:nonnegative(row.ord_remnq,true),status:text(row.ord_stat_nm||'',40),reportedTime:clock(row.cntr_time),granularity:'order_snapshot',fee:null,executionId:null,executionDate:null,timeZone:null};
}
export function normalizePosition(row:any){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');
 const symbol=text(row.stk_cd,24);if(!symbol)throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');
 return {symbol,currency:usd(row.crnc_code),quantity:nonnegative(row.poss_qty),averagePrice:nonnegative(row.frgn_stk_book_uv,true),currentPrice:nonnegative(row.now_pric,true),reportedValue:decimal(row.evlt_amt,true),reportedPnl:decimal(row.pl_amt,true)};
}
export function validateReviewSpec(payload:any){
 for(const id of IDS.filter(x=>x!=='ust21640')){const api:any=Object.values(payload?.apis||{}).find((v:any)=>v.meta?.['API ID']===id);
  if(api?.meta?.URL!=='/api/us/acnt'||api.meta.Method!=='POST'||!api.meta['메뉴 위치']?.startsWith('미국주식'))throw Error('KIWOOM_REVIEW_SPEC_MISMATCH');
  const res=new Set((api.response?.body||[]).map((f:any)=>f.element)),req=new Set((api.request?.body||[]).map((f:any)=>f.element));
  const needed=id==='ust21150'?['result_list','ord_no','stk_cd','slby_tp_nm','cntr_qty','cntr_uv','ord_qty','ord_remnq','ord_stat_nm','cntr_time','crnc_code']:['result_list','stk_cd','poss_qty','frgn_stk_book_uv','now_pric','evlt_amt','pl_amt','crnc_code','tot_evlt_amt'];
  if(needed.some(f=>!res.has(f))||(id==='ust21150'&&['ord_dt','query_tp','slby_tp'].some(f=>!req.has(f))))throw Error('KIWOOM_REVIEW_SPEC_MISMATCH');
 }
 return {orderApi:'ust21150',positionsApi:'ust21070',executionImport:false,reason:'과거 주문 조회에는 개별 체결번호·체결일자·시간대·수수료 확인이 부족합니다.'};
}

export function validateRealizedSpec(payload:any){
 const api:any=Object.values(payload?.apis||{}).find((v:any)=>v.meta?.['API ID']==='ust21640');
 if(api?.meta?.URL!=='/api/us/acnt'||api.meta.Method!=='POST')throw Error('KIWOOM_REVIEW_SPEC_MISMATCH');
 const res=new Set((api.response?.body||[]).map((x:any)=>x.element)),req=new Set((api.request?.body||[]).map((x:any)=>x.element));
 if(['result_list','crnc_code','stk_cd','cntr_sellq','avg_buy_uv','cntr_sella','pl_amt','cmsn','altx','tot_pl_amt'].some(x=>!res.has(x))||['cntr_dt','fc_krw_tp'].some(x=>!req.has(x)))throw Error('KIWOOM_REVIEW_SPEC_MISMATCH');
}
export function normalizeRealized(rows:any[],date:string,total:unknown){
 const bySymbol=new Map<string,any>();let sum=0n;
 const units=(s:string)=>{const neg=s.startsWith('-'),a=s.replace(/^-/,'').split('.');return (BigInt(a[0])*1000000000000n+BigInt((a[1]||'').padEnd(12,'0')))*(neg?-1n:1n);};
 for(const raw of rows){
  const symbol=text(raw.stk_cd,24),currency=usd(raw.crnc_code),quantity=nonnegative(raw.cntr_sellq),averageBuyPrice=nonnegative(raw.avg_buy_uv,true),averageSellPrice=nonnegative(raw.cntr_sella,true),reportedNet=decimal(raw.pl_amt),commission=nonnegative(raw.cmsn,true),tax=nonnegative(raw.altx,true);
  if(!symbol||bySymbol.has(symbol))throw Error('KIWOOM_JOURNAL_DUPLICATE_SYMBOL');
  const row={date,symbol,currency,quantity,averageBuyPrice,averageSellPrice,reportedNet,commission,tax};bySymbol.set(symbol,row);sum+=units(reportedNet!);
 }
 const totalValue=decimal(total);if(sum!==units(totalValue!))throw Error('KIWOOM_JOURNAL_TOTAL_MISMATCH');
 return {rows:[...bySymbol.values()],reportedTotal:totalValue,currency:'USD',apiId:'ust21640',dateBasis:'broker_query_date'};
}

export class KiwoomJournal {
 env:NodeJS.ProcessEnv; fetcher:typeof fetch; now:()=>number; token='';expiry=0;busy=false;lastRequestAt=0;authenticatedAt:number|null=null;lastError:string|null=null;memory=new Map<string,any>();lastFailure:any=null;activeDate='';activeApi='';
 constructor(env:NodeJS.ProcessEnv,fetcher:typeof fetch=fetch,now=Date.now){this.env=env;this.fetcher=fetcher;this.now=now;}
 account(){return createHash('sha256').update(this.env.KIWOOM_ACCOUNT||'').digest('hex').slice(0,16);}
 status(){return {version:1,available:true,credentialsConfigured:!!(this.env.KIWOOM_APP_KEY&&this.env.KIWOOM_SECRET&&this.env.KIWOOM_ACCOUNT),authenticatedAt:this.authenticatedAt,authenticationFresh:this.authenticatedAt!==null&&this.now()<this.expiry,busy:this.busy,lastError:this.lastError,executionImport:false,journalImport:true};}
 async spec(){let raw;try{raw=await readFile(this.env.KIWOOM_SPEC_PATH||BUNDLED,'utf8');}catch{throw Error('KIWOOM_REVIEW_SPEC_MISSING');}let data;try{data=JSON.parse(raw);}catch{throw Error('KIWOOM_REVIEW_SPEC_MISMATCH');}validateRealizedSpec(data);return {...validateReviewSpec(data),sha256:createHash('sha256').update(raw).digest('hex')};}
 private safeMessage(value:unknown){let msg=typeof value==='string'?value:'';for(const secret of [this.env.KIWOOM_APP_KEY,this.env.KIWOOM_SECRET,this.env.KIWOOM_ACCOUNT,this.token].filter(Boolean) as string[])msg=msg.split(secret).join('[비공개]');return msg.replace(/[\u0000-\u001f]/g,' ').replace(/[A-Za-z0-9_+/=-]{24,}/g,'[비공개]').replace(/\d(?:[ -]?\d){6,}/g,'[번호 비공개]').slice(0,280);}
 private failure(id:string,status:number,data:any){return {date:this.activeDate,apiId:id,httpStatus:status,returnCode:/^-?\d{1,10}$/.test(String(data?.return_code))?String(data.return_code):null,brokerMessage:this.safeMessage(data?.return_msg)};}
 private async request(id:string,body:any,token:string,signal:AbortSignal){
  this.activeApi=id;
  if(!['au10001',...IDS].includes(id))throw Error('KIWOOM_REVIEW_API_DENIED');
  const delay=Math.max(0,300-(Date.now()-this.lastRequestAt));if(delay)await new Promise(r=>setTimeout(r,delay));if(signal.aborted)throw Error('KIWOOM_REVIEW_NETWORK_ERROR');this.lastRequestAt=Date.now();
  let r:Response;try{r=await this.fetcher(BASE+(id==='au10001'?'/oauth2/token':'/api/us/acnt'),{method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer '+token,'api-id':id,'cont-yn':body.nextKey?'Y':'N','next-key':body.nextKey||''}:{})},body:JSON.stringify(body.payload)});}catch{throw Error('KIWOOM_REVIEW_NETWORK_ERROR');}
  if(!r.ok)this.lastFailure=this.failure(id,r.status,null);
  if(r.status===429)throw Error('KIWOOM_REVIEW_RATE_LIMIT');
  if(r.status===401||r.status===403){this.token='';this.expiry=0;throw Error('KIWOOM_REVIEW_AUTH_ERROR');}
  if(!r.ok)throw Error('KIWOOM_REVIEW_UPSTREAM_ERROR');
  const raw=await r.text();if(raw.length>4_000_000)throw Error('KIWOOM_REVIEW_RESPONSE_TOO_LARGE');
  let data;try{data=JSON.parse(raw);}catch{throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');}
  // Exact no-data responses observed on the user's account; never accept code 20 alone.
  const emptyMessage=id==='ust21150'?'[2000](571758:해당계좌의체결내역이없습니다.)':id==='ust21640'?'[2000](571758:조회내역이없습니다.)':null;
  const confirmedEmpty=emptyMessage&&!body.nextKey&&[20,'20'].includes(data?.return_code)&&typeof data?.return_msg==='string'&&data.return_msg.replace(/\s/g,'')===emptyMessage;
  const emptyLists=confirmedEmpty&&['result_list','result_lsit'].every(k=>!Object.hasOwn(data,k)||(Array.isArray(data[k])&&data[k].length===0));
  const emptyTotal=id!=='ust21640'||!Object.hasOwn(data||{},'tot_pl_amt')||data.tot_pl_amt===''||(typeof data.tot_pl_amt==='string'&&/^[+-]?0+(\.0+)?$/.test(data.tot_pl_amt.trim()));
  if(emptyLists&&emptyTotal&&r.headers.get('cont-yn')!=='Y'&&!r.headers.get('next-key')){
   return {data:{return_code:0,result_list:[],...(id==='ust21150'?{confirmedNoOrders:true}:{tot_pl_amt:'0',confirmedNoRealized:true})},headers:r.headers};
  }
  if(!data||typeof data!=='object'||Array.isArray(data)||![0,'0'].includes(data.return_code)){
   this.lastFailure=this.failure(id,r.status,data);
   if(id==='au10001')throw Error('KIWOOM_REVIEW_AUTH_ERROR');
   throw Error('KIWOOM_REVIEW_API_ERROR');
  }
  return {data,headers:r.headers};
 }
 private async authenticate(signal:AbortSignal){
  if(!this.status().credentialsConfigured)throw Error('KIWOOM_NOT_CONFIGURED');
  if(this.token&&this.now()<this.expiry)return this.token;
  const {data}=await this.request('au10001',{payload:{grant_type:'client_credentials',appkey:this.env.KIWOOM_APP_KEY,secretkey:this.env.KIWOOM_SECRET}},'',signal);
  if(typeof data.token!=='string'||!data.token||data.token.length>4096)throw Error('KIWOOM_REVIEW_AUTH_ERROR');
  this.token=data.token;this.expiry=this.now()+30*60000;this.authenticatedAt=this.now();return this.token;
 }
 private async pages(id:string,payload:any,token:string,signal:AbortSignal,warnings:string[]){
  const rows:any[]=[],seen=new Set<string>();let next='',first:any;
  for(let page=0;page<30;page++){
   if(page){await new Promise(r=>setTimeout(r,150));if(signal.aborted)throw Error('KIWOOM_REVIEW_NETWORK_ERROR');}
   const {data,headers}=await this.request(id,{payload,nextKey:next},token,signal);if(!first)first=data;if(data.confirmedNoOrders)warnings.push('선택한 주문일의 체결내역이 없어 주문 목록을 빈 목록으로 저장합니다. 실현손익은 별도로 조회합니다.');if(data.confirmedNoRealized)warnings.push('키움 실현손익 API가 조회내역 없음(20/571758)을 반환했습니다. 해당 날짜의 실현손익 목록은 비어 있으며 합계는 0 USD입니다.');rows.push(...responseRows(data,warnings));
   if(rows.length>10000)throw Error('KIWOOM_REVIEW_RESPONSE_TOO_LARGE');
   const more=headers.get('cont-yn');if(more!==null&&!['Y','N',''].includes(more))throw Error('KIWOOM_REVIEW_SCHEMA_CHANGED');
   if(more!=='Y')return {rows,first};
   next=headers.get('next-key')||'';if(!next||seen.has(next))throw Error('KIWOOM_REVIEW_PAGINATION_STALLED');seen.add(next);
  }throw Error('KIWOOM_REVIEW_PAGINATION_LIMIT');
 }
 private location(date:string){const db=this.env.DATA_PATH||'./data/journal.sqlite';return join(dirname(resolve(db)),'kiwoom-journal',this.account(),checkDate(date)+'.json');}
 async cached(date:string){checkDate(date);if(this.env.DATA_PATH===':memory:')return this.memory.get(date)||null;
  try{const data=JSON.parse(await readFile(this.location(date),'utf8'));if(data.account!==this.account()||data.orderDate!==date||data.version!==1||data.journalVersion!==1||data.executionImport!==false)throw Error();return data;}catch(e:any){if(e.code==='ENOENT')return null;throw Error('KIWOOM_REVIEW_CACHE_INVALID');}
 }
 private async save(date:string,snapshot:any){if(this.env.DATA_PATH===':memory:'){this.memory.set(date,snapshot);return;}
  const dest=this.location(date),temp=dest+'.'+randomBytes(6).toString('hex')+'.tmp';await mkdir(dirname(dest),{recursive:true});
  try{await writeFile(temp,JSON.stringify(snapshot,null,2),{mode:0o600,flag:'wx'});await rename(temp,dest);}finally{await rm(temp,{force:true});}
 }
 async query(date:string){
  checkDate(date);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.now()));
  if(date>today)throw Error('KIWOOM_REVIEW_DATE_INVALID');if(this.busy)throw Error('KIWOOM_REVIEW_BUSY');this.busy=true;this.activeDate=date;this.activeApi='';this.lastFailure=null;
  try{const spec=await this.spec(),signal=AbortSignal.timeout(90000),token=await this.authenticate(signal),warnings=['주문일 기준 조회입니다. 체결시간은 원문이며 시간대·체결일자는 확정하지 않았습니다.','주문 원문은 거래기록에 저장합니다. 달력 손익은 별도의 일별 종목별 실현손익 API 보고값을 사용합니다.','보유잔고는 조회 시점 값이며 선택한 주문일의 과거 잔고가 아닙니다.','연결된 계좌는 App Key에 귀속됩니다. 표시된 종목·수량을 HTS와 대조하세요.'];
   const ordersResult=await this.pages('ust21150',{ord_dt:date.replaceAll('-',''),query_tp:'1',slby_tp:'0'},token,signal,warnings);
   const orders=new Map<string,any>();for(const raw of ordersResult.rows){const row=normalizeOrder(raw,date),old=orders.get(row.key);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw Error('KIWOOM_REVIEW_ORDER_CONFLICT');orders.set(row.key,row);}
   const positionsResult=await this.pages('ust21070',{},token,signal,warnings);
   const positions=positionsResult.rows.map(normalizePosition),keys=new Set<string>();for(const row of positions){if(keys.has(row.symbol))throw Error('KIWOOM_REVIEW_POSITION_CONFLICT');keys.add(row.symbol);}
   const pnlResult=await this.pages('ust21640',{cntr_dt:date.replaceAll('-',''),fc_krw_tp:'0'},token,signal,warnings);
   const realized=normalizeRealized(pnlResult.rows,date,pnlResult.first.tot_pl_amt);
   const currency=usd(positionsResult.first.crnc_code),snapshot={version:1,journalVersion:1,realized,source:'kiwoom',account:this.account(),orderDate:date,asOf:this.now(),executionImport:false,spec,orders:[...orders.values()],positions,summary:{currency,reportedSecuritiesValue:nonnegative(positionsResult.first.tot_evlt_amt,true)},warnings:[...new Set(warnings)]};
   await this.save(date,snapshot);this.lastError=null;return snapshot;
  }catch(e:any){this.lastError=/^(KIWOOM_)[A-Z_]+$/.test(e.message)?e.message:'KIWOOM_REVIEW_STORAGE_ERROR';const err:any=Error(this.lastError);err.diagnostic=this.lastFailure||{date,apiId:this.activeApi||'local_validation',httpStatus:null,returnCode:null,brokerMessage:''};throw err;}finally{this.busy=false;}
 }
}
export const REVIEW_ERRORS:Record<string,string>={
 KIWOOM_JOURNAL_TOTAL_MISMATCH:'일별 종목 손익 합계와 키움 보고 합계가 다릅니다. 이전 매매일지를 유지합니다.',
 KIWOOM_JOURNAL_DUPLICATE_SYMBOL:'일별 손익에 중복 종목이 있어 합산을 중단했습니다.',
 KIWOOM_NOT_CONFIGURED:'서버 .env의 KIWOOM_APP_KEY / KIWOOM_SECRET / KIWOOM_ACCOUNT를 확인하세요.',
 KIWOOM_REVIEW_AUTH_ERROR:'키움 인증 실패: 키·계좌 등록·허용 공인 IP를 확인하세요.',
 KIWOOM_REVIEW_API_ERROR:'키움이 조회를 거절했습니다. 아래 날짜·API·키움 사유를 확인하세요. 권한 오류로 단정하지 않습니다.',
 KIWOOM_REVIEW_NETWORK_ERROR:'키움 요청 시간 초과 또는 연결 실패입니다. 이전 조회값은 유지됩니다.',
 KIWOOM_REVIEW_DATE_INVALID:'유효한 주문일을 선택하세요. 미래 날짜는 조회할 수 없습니다.',
 KIWOOM_REVIEW_SPEC_MISSING:'키움 명세 파일을 찾지 못했습니다. KIWOOM_SPEC_PATH를 확인하세요.',
 KIWOOM_REVIEW_SPEC_MISMATCH:'첨부 명세와 주문·잔고 조회 필드가 다릅니다. 기존 원장은 유지됩니다.',
 KIWOOM_REVIEW_RATE_LIMIT:'키움 요청 한도에 도달했습니다. 잠시 후 다시 조회하세요.',
 KIWOOM_REVIEW_BUSY:'키움 조회가 진행 중입니다.',
 KIWOOM_REVIEW_DEMO:'키움 주문·잔고 조회는 DEMO_MODE=false에서 사용합니다.',
 KIWOOM_REVIEW_SCHEMA_CHANGED:'키움 응답 형식이 예상과 다릅니다. 이전 조회값은 유지됩니다.',
};
