// 2.18.0 텔레그램 /risk — 같은 서버의 riskboard(/opt/riskboard)로 지금 시장 리스크 보드를 만들어 답장.
// riskboard는 같은 봇 토큰을 쓰지만 보내기만 하므로, 메시지 받기(getUpdates)는 trade-alert가 맡고 여기서 대신 응답합니다.
// 자식 프로세스에는 trade-alert의 비밀값(.env)을 넘기지 않습니다(PATH만).
import {execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import {escHtml} from './format.mjs';

const truthy=v=>/^(1|on|true|yes|y)$/i.test(String(v).trim());
export const CMD_RE=/^\/(risk|board)(@[A-Za-z0-9_]+)?(\s|$)/i;
export function readRiskCmdConfig(env){
 const raw=String(env.RISK_BOARD_CMD??'').trim();
 return {enabled:raw===''?true:truthy(raw),script:String(env.RISK_BOARD_SCRIPT||'/opt/riskboard/src/riskboard.mjs').trim(),timeoutMs:90000};
}
export function isRiskCmd(text){return CMD_RE.test(String(text||'').trim());}

export class RiskCmd{
 constructor({cfg,tg,log=()=>{},node=process.execPath,run=null,exists=null,now=Date.now}){
  this.cfg=cfg;this.tg=tg;this.log=log;this.node=node;this.now=now;this.busy=false;this.lastAt=0;
  this.run=run||((file,args,opts)=>new Promise((res,rej)=>execFile(file,args,opts,(e,out,err)=>e?rej(Object.assign(e,{stderr:String(err||'')})):res(String(out||'')))));
  this.exists=exists||(p=>access(p).then(()=>true,()=>false));
 }
 /** 보드 텍스트(성공) 또는 사람이 읽을 오류 문장 */
 async board(){
  if(!(await this.exists(this.cfg.script)))return {ok:false,text:'리스크 보드가 이 서버에 설치되어 있지 않습니다(/opt/riskboard). install-riskboard.sh로 먼저 설치하세요.'};
  try{
   const out=await this.run(this.node,[this.cfg.script,'--once'],{timeout:this.cfg.timeoutMs,maxBuffer:1<<20,env:{PATH:process.env.PATH||'/usr/bin:/bin',RB_STATE:'/var/lib/riskboard/state.json'}});
   const text=out.trim();if(!text)throw Error('빈 출력');return {ok:true,text};
  }catch(e){const why=String(e.stderr||e.message||e).split('\n').map(s=>s.trim()).filter(Boolean).slice(-1)[0]||'알 수 없음';return {ok:false,text:'리스크 보드를 만들지 못했습니다(시세 조회 실패 가능): '+why.slice(0,120)};}
 }
 /** 명령 처리. 처리했으면 true */
 async command(text){
  if(!this.cfg.enabled||!isRiskCmd(text))return false;
  if(this.busy)return true; // 이미 만드는 중 — 중복 요청 무시
  this.busy=true;
  try{
   const b=await this.board();
   if(b.ok)await this.tg.api('sendMessage',{chat_id:this.tg.chat,text:'<pre>'+escHtml(b.text)+'</pre>',parse_mode:'HTML',disable_web_page_preview:true});
   else await this.tg.send(b.text);
   this.lastAt=this.now();
  }catch(e){this.log('WARN','/risk 답장 실패: '+String(e.message||e).slice(0,80));}
  finally{this.busy=false;}
  return true;
 }
}
