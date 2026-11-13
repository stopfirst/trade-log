// 2.18.0 텔레그램 /risk — riskboard --once 출력을 <pre>로 답장
import test from 'node:test';import assert from 'node:assert/strict';
import * as rk from '../src/riskcmd.mjs';
import {Alerter,readConfig,VERSION} from '../src/alert.mjs';
const env={SUPABASE_URL:'https://abcdefgh.supabase.co',SUPABASE_KEY:'sb_publishable_'+'k'.repeat(24),KW_COLLECTOR_TOKEN:'kwc_'+'A'.repeat(43),TELEGRAM_BOT_TOKEN:'123456789:AAH'+'x'.repeat(32),TELEGRAM_CHAT_ID:'987654321',ALERT_STATE_DIR:'/tmp/ta-rk'};
const fakeTg=()=>{const calls=[];return {chat:'987654321',calls,api:async(m,b)=>{calls.push({m,b});return true;},send:async t=>{calls.push({m:'send',b:{text:t}});return true;}};};
test('버전·설정',()=>{
 assert.equal(VERSION,'2.18.0');
 assert.equal(readConfig(env).riskCmd.enabled,true);
 assert.equal(readConfig({...env,RISK_BOARD_CMD:'0'}).riskCmd.enabled,false);
 assert.equal(readConfig(env).riskCmd.script,'/opt/riskboard/src/riskboard.mjs');
});
test('명령 인식',()=>{
 for(const t of ['/risk','/risk@MyBot','/RISK now','/board',' /risk '])assert.ok(rk.isRiskCmd(t),t);
 for(const t of ['/risky','/zones on','risk','/boards'])assert.ok(!rk.isRiskCmd(t),t);
});
test('보드를 <pre>로 답장 · 자식에 비밀값 안 넘김',async()=>{
 const tg=fakeTg();let seen;
 const c=new rk.RiskCmd({cfg:rk.readRiskCmdConfig({}),tg,exists:async()=>true,run:async(f,a,o)=>{seen={f,a,o};return '시장 리스크 보드  🧪 지금 · 🟤 TENSION\nVIX <21>\n';}});
 assert.equal(await c.command('/risk'),true);
 assert.deepEqual(seen.a,['/opt/riskboard/src/riskboard.mjs','--once']);
 assert.deepEqual(Object.keys(seen.o.env).sort(),['PATH','RB_STATE']);
 assert.equal(tg.calls[0].m,'sendMessage');assert.equal(tg.calls[0].b.parse_mode,'HTML');
 assert.equal(tg.calls[0].b.text,'<pre>시장 리스크 보드  🧪 지금 · 🟤 TENSION\nVIX &lt;21&gt;</pre>');
});
test('미설치·실패·꺼짐',async()=>{
 let tg=fakeTg();let c=new rk.RiskCmd({cfg:rk.readRiskCmdConfig({}),tg,exists:async()=>false,run:async()=>{throw Error('x');}});
 await c.command('/risk');assert.match(tg.calls[0].b.text,/설치되어 있지 않습니다/);
 tg=fakeTg();c=new rk.RiskCmd({cfg:rk.readRiskCmdConfig({}),tg,exists:async()=>true,run:async()=>{throw Object.assign(Error('Command failed'),{stderr:'Error: Yahoo ^VIX 502\n'});}});
 await c.command('/risk');assert.match(tg.calls[0].b.text,/만들지 못했습니다.*Yahoo \^VIX 502/);
 tg=fakeTg();c=new rk.RiskCmd({cfg:rk.readRiskCmdConfig({RISK_BOARD_CMD:'0'}),tg,exists:async()=>true,run:async()=>'x'});
 assert.equal(await c.command('/risk'),false);assert.equal(tg.calls.length,0);
});
test('Alerter: 우리 방의 /risk만 · /zones는 그대로',async()=>{
 const a=new Alerter(env,{fetcher:async()=>{throw Error('no network');},log:()=>{}});
 assert.ok(a.riskCmd);const got=[];a.riskCmd.command=async t=>{got.push(t);return true;};
 assert.equal(await a.onTgMessage({chat:{id:111},text:'/risk'}),false);
 assert.equal(await a.onTgMessage({chat:{id:987654321},text:'/risk'}),true);assert.deepEqual(got,['/risk']);
 assert.equal(await a.onTgMessage({chat:{id:987654321},text:'hello'}),false);
});
